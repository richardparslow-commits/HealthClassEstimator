#!/usr/bin/env node
/* Decide whether a green Streamlit canary means the deployed ceiling should move.

   The canary in .github/workflows/streamlit-canary.yml installs the newest
   Streamlit from PyPI, deliberately ignoring the ceiling in the deployed
   repository's requirements.txt, and runs the live check against the pair
   Streamlit Cloud is serving. A pass is the only evidence that a release the
   ceiling currently excludes can run the deployed wrapper — but until the
   ceiling moves, that evidence changes nothing: Streamlit Cloud keeps installing
   inside the old range, and the next person to lift the ceiling does it from
   memory of a run nobody can find.

   So a green canary that passes *above* the ceiling now produces a review rather
   than a note in a log. This script decides that, and says what the new pin is:

     * the installed release is inside the deployed pin — nothing to do, because
       the ceiling already admits it;
     * the installed release is above the ceiling — raise the ceiling to the next
       major above the release that was proved, so `<2` becomes `<3` for a proved
       2.0.0. The floor does not move: widening the *bottom* of the range is a
       different decision, about the oldest release still supported;
     * a prerelease, an exact `==` pin, a pin with no upper bound, a pin that does
       not name streamlit, or a release below the floor — each is reported with
       its own reason rather than forcing a pin into a shape it does not have.

   Only a stable channel may propose: a release candidate can differ from the
   release it becomes, so a ceiling raised on one would promise more than was
   proved. The workflow leaves the decision to this script either way; `--json`
   is what it reads.

   One place decides. `verify-streamlit-live.py` prints the same relation in
   words for a human reading a log, but no step branches on that sentence: the
   summary line the canary publishes and the pull request this script describes
   both come from here.

   Usage:
     node scripts/streamlit-ceiling.js --requirements <requirements.txt> --installed 2.0.0
     node scripts/streamlit-ceiling.js ... --json               # machine-readable
     node scripts/streamlit-ceiling.js ... --apply              # rewrite the file
     node scripts/streamlit-ceiling.js ... --body pr.md \
       --run-url <url> --deployed-sha <sha>                    # write the PR body

   Exit status: 0 when a decision was reached (whether or not a lift is needed),
   1 when the arguments or the requirements file cannot be read. A run that needs
   a lift and cannot describe one is not a silent success: `--apply` leaves the
   file untouched and the caller sees `needed: false` with the reason.
*/
"use strict";

const fs = require("fs");
const path = require("path");

/* --- versions ------------------------------------------------------------- */

// PEP 440 releases are dotted integers, optionally followed by a prerelease
// (`2.0.0rc1`, `2.0.0-beta.1`). Only the parts that matter to a ceiling are
// parsed: the numeric release for ordering, and whether this is a prerelease at
// all, because a prerelease must not move a ceiling.
function parseVersion(text) {
  const match = /^v?(\d+(?:\.\d+)*)(?:[-._]?([0-9A-Za-z][0-9A-Za-z.-]*))?$/.exec(String(text).trim());
  if (!match) return null;
  return {
    release: match[1].split(".").map(Number),
    prerelease: match[2] ? match[2] : null,
  };
}

function compareReleases(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function compareVersions(left, right) {
  const a = typeof left === "string" ? parseVersion(left) : left;
  const b = typeof right === "string" ? parseVersion(right) : right;
  if (!a || !b) throw new Error("cannot compare versions " + left + " and " + right);
  const byRelease = compareReleases(a.release, b.release);
  if (byRelease) return byRelease;
  // Equal releases: a prerelease sorts before the release it precedes.
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) {
    if (a.prerelease === b.prerelease) return 0;
    return a.prerelease < b.prerelease ? -1 : 1;
  }
  return 0;
}

/* --- the requirement line ------------------------------------------------- */

// `streamlit>=1.66,<2`, `streamlit >= 1.66, < 2`, `streamlit[cli]==1.66 ;
// python_version >= "3.11"` and a trailing `# note` are all the same line to
// this parser: a name, an optional extras list, a specifier and an optional
// comment. The comment is kept because rewriting a file must not delete it.
const REQUIREMENT = /^(\s*)(streamlit)\s*(\[[^\]]*\])?\s*([<>=!~][^;#]*)?(\s*;[^#]*)?(\s*#.*)?$/i;

function parseRequirement(raw) {
  const match = REQUIREMENT.exec(raw);
  if (!match) return null;
  const [, indent, name, extras = "", spec = "", marker = "", comment = ""] = match;
  const specText = spec.trim();
  const clauses = parseSpecifier(specText);
  return {
    raw,
    indent,
    name,
    extras,
    spec: specText,
    marker: marker.trim(),
    comment: comment.trim(),
    clauses,
    // Where the specifier sits inside the raw line, so a rewrite can replace one
    // clause and leave every other byte of the file alone.
    specAt: specText ? raw.indexOf(specText, indent.length + name.length) : -1,
  };
}

// A comma-separated PEP 440 specifier set. Unparseable clauses return null, and
// the caller reports that instead of guessing at a pin it does not understand.
function parseSpecifier(text) {
  if (!text) return [];
  const clauses = [];
  for (const piece of text.split(",")) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const match = /^(===|==|!=|>=|<=|~=|>|<)\s*(\S+)$/.exec(trimmed);
    if (!match) return null;
    const version = parseVersion(match[2]);
    if (!version) return null;
    clauses.push({ op: match[1], version, text: trimmed });
  }
  return clauses;
}

// `~=1.66` is `>=1.66,<2`; `~=1.66.0` is `>=1.66.0,<1.67`. The compatible
// release operator is expanded rather than ignored, because a pin written that
// way has a ceiling even though the line never says `<`.
function expandCompatible(clause) {
  const release = clause.version.release;
  if (release.length < 2) return null;
  const upper = release.slice(0, -1);
  upper[upper.length - 1] += 1;
  return { op: "<", version: { release: upper, prerelease: null } };
}

function clausesOf(requirement) {
  if (!requirement.clauses) return null;
  const expanded = [];
  for (const clause of requirement.clauses) {
    if (clause.op === "~=") {
      const compatible = expandCompatible(clause);
      if (!compatible) return null;
      // The ceiling is real but implicit, so the clause it came from is kept: a
      // rewrite has to replace `~=1.66.0`, not a `text` the line never contains.
      expanded.push({ op: ">=", version: clause.version, text: clause.text }, { ...compatible, source: clause });
      continue;
    }
    expanded.push(clause);
  }
  return expanded;
}

// Does `version` satisfy every clause? Written out rather than pulled from a
// package: the deploy path needs nothing installed to answer this, and the
// operators a requirements.txt uses are a small closed set.
function contains(clauses, version) {
  const candidate = typeof version === "string" ? parseVersion(version) : version;
  for (const clause of clauses) {
    const order = compareVersions(candidate, clause.version);
    switch (clause.op) {
      case "===":
      case "==":
        if (order !== 0) return false;
        break;
      case "!=":
        if (order === 0) return false;
        break;
      case ">=":
        if (order < 0) return false;
        break;
      case ">":
        if (order <= 0) return false;
        break;
      case "<=":
        if (order > 0) return false;
        break;
      case "<":
        if (order >= 0) return false;
        break;
      default:
        return false;
    }
  }
  return true;
}

function ceilingClause(clauses) {
  return clauses.find((clause) => clause.op === "<" || clause.op === "<=") ?? null;
}

function floorClause(clauses) {
  return clauses.find((clause) => clause.op === ">=" || clause.op === ">") ?? null;
}

/* --- the decision --------------------------------------------------------- */

function findRequirement(text) {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const parsed = parseRequirement(lines[index].replace(/\r$/, ""));
    if (parsed) return { ...parsed, index };
  }
  return null;
}

function decide(text, installed) {
  const version = parseVersion(installed);
  const base = { needed: false, installed: String(installed).trim(), line: null, from: null, to: null, reason: "" };
  if (!version) return { ...base, reason: "the installed version " + JSON.stringify(installed) + " is not a version this script can read" };

  const requirement = findRequirement(text);
  if (!requirement) {
    return { ...base, reason: "the requirements file does not name streamlit, so it has no ceiling to raise" };
  }
  const line = { index: requirement.index, raw: requirement.raw, from: requirement.raw.trim() };
  if (!requirement.clauses) {
    return { ...base, ...line, reason: "the streamlit requirement (" + JSON.stringify(requirement.spec) + ") is not a specifier this script can read" };
  }
  const clauses = clausesOf(requirement);
  if (!clauses) {
    return { ...base, ...line, reason: "the streamlit requirement (" + JSON.stringify(requirement.spec) + ") is not a specifier this script can read" };
  }
  if (requirement.clauses.some((clause) => clause.op === "===" || clause.op === "==")) {
    return { ...base, ...line, reason: "the deployed pin names an exact release, so admitting a newer one is a policy decision rather than a ceiling lift" };
  }
  const ceiling = ceilingClause(clauses);
  if (!ceiling) {
    return { ...base, ...line, reason: "the deployed pin has no upper bound, so there is no ceiling to raise" };
  }
  const floor = floorClause(clauses);
  if (floor && compareVersions(version, floor.version) < 0 && floor.op === ">=") {
    return { ...base, ...line, reason: "the installed release is below the deployed floor, which no ceiling change would admit" };
  }
  if (version.prerelease) {
    return { ...base, ...line, reason: "the installed release " + String(installed).trim() + " is a prerelease, and a release candidate is not what a ceiling should promise" };
  }
  if (contains(clauses, version)) {
    return { ...base, ...line, reason: "the installed release is inside the deployed pin (" + requirement.spec + "), so the canary is early warning rather than an argument to move it" };
  }
  if (compareVersions(version, ceiling.version) < 0) {
    // Not inside, not above the ceiling: something else excluded it, which is a
    // pin this script should not rewrite.
    return { ...base, ...line, reason: "the installed release is excluded by " + ceiling.text + " in a way a ceiling lift would not fix" };
  }

  const raised = "<" + (version.release[0] + 1);
  // `~=1.66.0` is written as a floor with an implied ceiling, so widening it
  // spells the ceiling out instead of leaving a `~=` that no longer bounds it.
  const source = ceiling.source ?? ceiling;
  const replacement = source.op === "~=" ? ">=" + source.text.slice(2) + "," + raised : raised;
  const toSpec = requirement.spec.replace(source.text, replacement);
  const to = (requirement.raw.slice(0, requirement.specAt) + toSpec + requirement.raw.slice(requirement.specAt + requirement.spec.length)).trim();
  return {
    needed: true,
    installed: String(installed).trim(),
    line,
    from: line.from,
    to,
    toSpec,
    ceiling: { from: source.text, to: replacement },
    reason: "the canary proved " + String(installed).trim() + ", which " + source.text + " excludes",
  };
}

// Rewrite only the streamlit line's specifier; every other byte, including the
// line ending, is preserved, so the diff in a review is the ceiling and nothing
// else.
function applyDecision(text, decision) {
  if (!decision.needed) return text;
  const lines = text.split("\n");
  const raw = lines[decision.line.index];
  const parsed = parseRequirement(raw.replace(/\r$/, ""));
  if (!parsed || parsed.specAt < 0) return text;
  // parsed.spec is trimmed, so its length is exactly the text to replace; the
  // line ending and any trailing comment are outside it and stay untouched.
  lines[decision.line.index] =
    raw.slice(0, parsed.specAt) + decision.toSpec + raw.slice(parsed.specAt + parsed.spec.length);
  return lines.join("\n");
}

/* --- the review ----------------------------------------------------------- */

function pullRequestBody(decision, meta = {}) {
  const run = meta.runUrl ?? "(the canary run that justified this)";
  const sha = meta.deployedSha ? " at `" + meta.deployedSha + "`" : "";
  const repo = meta.deployedRepo ?? "the deployed repository";
  return [
    "## Raise the Streamlit ceiling to admit " + decision.installed,
    "",
    "The daily Streamlit canary installed **" + decision.installed + "** and ran `scripts/verify-streamlit-live.py` against the pair " + repo + " serves" + sha + " — the wrapper, the artifact and its manifest, through Streamlit's real runtime. Every case behaved as the contract requires, so the ceiling that currently excludes that release can move.",
    "",
    "| | |",
    "| --- | --- |",
    "| Deployed pin | `" + decision.from + "` |",
    "| Canary proved | `" + decision.installed + "` |",
    "| Proposed | `" + decision.to + "` |",
    "",
    "Canary run: " + run,
    "",
    "Only the ceiling moves, to the next major above the release that was proved, so `" + decision.ceiling.from + "` becomes `" + decision.ceiling.to + "`. The floor stays where it is: which releases are still supported is a separate decision from which ones are allowed.",
    "",
    "Why a pull request rather than a push: the ceiling decides which Streamlit releases reach the live app, and the canary can only speak for the release it installed. Review is the step that turns one green run into a range.",
    "",
    "If this is wrong, close it. The canary re-tests the newest release every day and files an issue when the app stops working, so a ceiling that proves too wide is reported rather than discovered by an applicant.",
  ].join("\n");
}

function pullRequestTitle(decision) {
  return "Raise the Streamlit ceiling for Streamlit " + decision.installed;
}

/* --- the command ---------------------------------------------------------- */

function parseArgs(argv) {
  const args = {
    requirements: null,
    installed: null,
    json: false,
    apply: false,
    body: null,
    runUrl: null,
    deployedSha: null,
    deployedRepo: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    switch (value) {
      case "--requirements":
        args.requirements = argv[++i];
        break;
      case "--installed":
        args.installed = argv[++i];
        break;
      case "--body":
        args.body = argv[++i];
        break;
      case "--run-url":
        args.runUrl = argv[++i];
        break;
      case "--deployed-sha":
        args.deployedSha = argv[++i];
        break;
      case "--deployed-repo":
        args.deployedRepo = argv[++i];
        break;
      case "--json":
        args.json = true;
        break;
      case "--apply":
        args.apply = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error("Unknown argument: " + value);
    }
  }
  if (!args.help && (!args.requirements || !args.installed)) {
    throw new Error("--requirements <file> and --installed <version> are both required");
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/, "").trim());
    return 0;
  }
  const file = path.resolve(process.cwd(), args.requirements);
  const text = fs.readFileSync(file, "utf8");
  const decision = decide(text, args.installed);

  if (args.apply) {
    if (decision.needed) fs.writeFileSync(file, applyDecision(text, decision));
    const line = decision.needed
      ? "Raised " + decision.from + " to " + decision.to
      : "Left " + file + " unchanged: " + decision.reason;
    // With --json, stdout is the machine-readable decision and nothing else: a
    // caller redirecting it into a file must not get a sentence in front of the
    // JSON it is about to parse.
    if (args.json) console.error(line);
    else console.log(line);
  }

  if (args.body) {
    const body = decision.needed
      ? pullRequestBody(decision, {
          runUrl: args.runUrl,
          deployedSha: args.deployedSha,
          deployedRepo: args.deployedRepo,
        })
      : "";
    fs.writeFileSync(path.resolve(process.cwd(), args.body), body);
  }

  if (args.json) {
    console.log(
      JSON.stringify({
        needed: decision.needed,
        installed: decision.installed,
        from: decision.from,
        to: decision.to,
        ceiling: decision.ceiling ?? null,
        reason: decision.reason,
        title: decision.needed ? pullRequestTitle(decision) : "",
      }),
    );
  } else if (!args.apply) {
    console.log("Requirement: " + (decision.from ?? "(no streamlit line)"));
    console.log("Installed  : " + decision.installed);
    console.log("Ceiling    : " + (decision.ceiling ? decision.ceiling.from + " -> " + decision.ceiling.to : "not raised"));
    console.log("Verdict    : " + decision.reason);
    if (decision.needed) console.log("Proposed   : " + decision.to);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error("streamlit-ceiling: " + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  parseVersion,
  compareVersions,
  parseSpecifier,
  parseRequirement,
  contains,
  decide,
  applyDecision,
  pullRequestBody,
  pullRequestTitle,
};
