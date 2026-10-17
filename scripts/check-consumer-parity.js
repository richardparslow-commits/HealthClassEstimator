#!/usr/bin/env node
/* Guard the single-source-of-truth rule for the built estimator.

   The tool has two consumers, and both hold a *copy* of the build:
     - the website embeds dist/app.html inside an iframe (srcDoc), and
     - richardparslow-commits/health_app.py receives a copy from the release job.

   A copy can be edited where it lands, and nothing used to notice. Release 78
   shipped a Mutual of Omaha amount screen (moo_tle_amount_conflict) plus its
   M-TLE-HIGHLIGHT source record that existed only inside the website's copy, so
   rebuilding from this repository would have deleted that screen silently.

   This script compares a consumer against the build and sorts the difference:

     - rules / state / engine carry underwriting behaviour. A difference is a
       FAILURE: the repository no longer reproduces what an applicant sees.
     - app / styles / markup are presentational. A difference is reported as a
       warning, because a consumer may legitimately adapt its embed (a
       narrow CSP, same-origin contact links, an accessibility shim), but it is
       never hidden — an edit made only in a copy still needs to come back here.
     - --expect-identical removes that tolerance entirely: the Streamlit
       deployment receives the build output copied verbatim, so for it anything
       but byte identity means the file it serves is not the reviewed build.

   Usage:
     node scripts/check-consumer-parity.js                      # the live tool page
     node scripts/check-consumer-parity.js --consumer <path>    # a local file
     node scripts/check-consumer-parity.js --build <path>       # alternate build
     node scripts/check-consumer-parity.js --expect-identical   # fail unless byte-identical
     node scripts/check-consumer-parity.js --json

   <path> may be the built HTML, the website's route file that holds the embed as
   a JavaScript string literal (including the adapters that file splices into it at
   render time), or any file containing the embedded document.

   Exit status: 0 when the underwriting components match; 1 otherwise, or 1 when
   the consumer could not be read at all.
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONSUMER = "https://lifeinsurancebrokeradvocate.com/tools/health-class-predictor";

// Markers mirror the inlining order in scripts/build-embedded.js, so a component
// is located the same way in the build and in any consumer of it.
const COMPONENTS = [
  { id: "rules", marker: "const PRODUCT_RULES =", critical: true },
  { id: "state", marker: "const InterviewState =", critical: true },
  { id: "engine", marker: "const Engine =", critical: true },
  { id: "app", marker: "const App =", critical: false },
];

function parseArgs(argv) {
  const args = { consumer: DEFAULT_CONSUMER, build: path.join("dist", "app.html"), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--consumer") args.consumer = argv[++i];
    else if (a === "--build") args.build = argv[++i];
    else if (a === "--expect-identical") args.expectIdentical = true;
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error("Unknown argument: " + a);
  }
  return args;
}

/* --- reading a consumer ---------------------------------------------------- */

const ENTITIES = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&", nbsp: " ", "#39": "'", "#x27": "'", "#x2f": "/" };

// Anything unrecognised is left alone rather than thrown on: an entity this list
// does not know is not a reason to stop comparing a consumer.
function unescapeHtml(source) {
  return source.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(ENTITIES, name)) return ENTITIES[name];
    if (name[0] !== "#") return match;
    const hex = name[1] === "x" || name[1] === "X";
    const code = parseInt(hex ? name.slice(2) : name.slice(1), hex ? 16 : 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

// The embed reaches the served page as an iframe srcDoc attribute (React renders
// the prop name as `srcDoc`), so the document arrives entity-escaped with its real
// newlines intact. Once escaped, a `"` cannot appear inside the value, so the
// attribute ends at the next `"` and no full HTML parser is needed.
function extractSrcdocs(page) {
  const found = [];
  const re = /srcdoc="([^"]*)"/gi;
  let m;
  while ((m = re.exec(page))) found.push(unescapeHtml(m[1]));
  return found;
}

// The website keeps the embed as a single-quoted JavaScript string literal.
function extractStringLiteral(source, anchor) {
  const at = source.indexOf(anchor);
  if (at < 0) return null;
  let i = source.indexOf("'", at);
  if (i < 0) return null;
  let out = "";
  for (i++; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      const next = source[i + 1];
      out += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : next;
      i++;
      continue;
    }
    if (ch === "'") break;
    out += ch;
  }
  return out;
}

// The website does not serve the literal as-is: its route file splices its own
// adapters in at render time —
//   srcDoc={ESTIMATOR_HTML.replace("</body>", ADAPTER_A + ADAPTER_B + "</body>")}
// — so the literal alone is not the delivered document. Rebuilding the composition
// here keeps those adapters from reading as drift, and keeps the comparison pointed
// at what an applicant actually runs. `replace` with a string argument swaps only
// the first occurrence, which is what indexOf/slice reproduces.
function extractComposedDocument(source) {
  const literal = extractStringLiteral(source, "const ESTIMATOR_HTML =");
  const call = source.match(/ESTIMATOR_HTML\.replace\(\s*"<\/body>"\s*,\s*([^)]+)\)/);
  if (!literal || !call) return null;
  const adapters = (call[1].match(/[A-Za-z_$][\w$]*/g) ?? []).map((name) => extractTemplateBody(source, name)).filter((body) => body !== null);
  const at = literal.indexOf("</body>");
  if (at < 0 || !adapters.length) return null;
  return literal.slice(0, at) + adapters.join("") + literal.slice(at);
}

// const NAME = `...`;  — the shape the route file uses for its embed adapters.
function extractTemplateBody(source, name) {
  const match = new RegExp("const\\s+" + name + "\\s*=\\s*`").exec(source);
  if (!match) return null;
  let out = "";
  for (let i = match.index + match[0].length; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      const next = source[i + 1];
      out += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : next;
      i++;
      continue;
    }
    if (ch === "`") return out;
    out += ch;
  }
  return null;
}

// Every component must be locatable, not merely one marker seen: a file holding the
// embed as an escaped string literal also contains the markers, but no script block.
const holdsWholeEstimator = (html) => COMPONENTS.every((c) => componentBodies(html)[c.id] !== null);

// Candidate order matters: the srcDoc of the rendered frame is what an applicant
// actually runs, so it is preferred over a serialized copy of the same string
// elsewhere on the page (React's flight payload escapes it differently, and a
// component read from there would look like drift).
function pickConsumerDocument(raw, origin) {
  const literal = extractStringLiteral(raw, "const ESTIMATOR_HTML =");
  const composed = extractComposedDocument(raw);
  const candidates = extractSrcdocs(raw).map((html) => ({ html, how: "iframe srcDoc in " + origin }));
  if (composed) candidates.push({ html: composed, how: "ESTIMATOR_HTML plus the adapter constants spliced into its srcDoc in " + origin });
  if (literal) candidates.push({ html: literal, how: "ESTIMATOR_HTML string literal in " + origin });
  candidates.push({ html: raw, how: "embedded document" });
  const chosen = candidates.find((c) => holdsWholeEstimator(c.html));
  if (chosen) return chosen;
  throw new Error("No embedded estimator found in " + origin + " (every one of the four script markers must be present in a script block).");
}

async function readConsumer(target) {
  if (/^https?:\/\//i.test(target)) {
    const response = await fetch(target, { headers: { "user-agent": "health-class-estimator-parity-check" } });
    if (!response.ok) throw new Error("HTTP " + response.status + " " + response.statusText + " from " + target);
    return pickConsumerDocument(await response.text(), target);
  }
  const file = path.resolve(process.cwd(), target);
  return pickConsumerDocument(fs.readFileSync(file, "utf8"), file);
}

/* --- comparing a document ------------------------------------------------- */

const scriptBlocks = (html) => [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
const styleBlocks = (html) => [...html.matchAll(/<style>\n([\s\S]*?)\n<\/style>/g)].map((m) => m[1]);

function componentBodies(html) {
  const blocks = scriptBlocks(html);
  const bodies = {};
  for (const c of COMPONENTS) bodies[c.id] = blocks.find((b) => b.includes(c.marker)) ?? null;
  return bodies;
}

// Markup is compared with the embed adaptations folded out: a consumer's own CSP,
// its same-origin contact links and any injected adapter script or style must not
// read as drift, while a removed or added page element still does.
function normaliseMarkup(html) {
  const markers = COMPONENTS.map((c) => c.marker);
  return html
    .replace(/<script>\n[\s\S]*?\n<\/script>/g, (block) => (markers.some((mk) => block.includes(mk)) ? "<script></script>" : ""))
    .replace(/<style>\n[\s\S]*?\n<\/style>/g, (block, offset) => (offset === html.indexOf("<style>") ? "<style></style>" : ""))
    .split("\n")
    .filter((line) => !/http-equiv="Content-Security-Policy"/.test(line))
    .map((line) => line.replace(/<a\b[^>]*href="[^"]*\/contact"[^>]*>/g, '<a data-contact-link>'))
    .map((line) => line.trim())
    .filter((line) => line.length)
    .join("\n");
}

// Token overlap, used only to tell a rewritten line from a new one.
const tokens = (line) => new Set(line.match(/[A-Za-z0-9_$]+/g) ?? []);
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

function firstDifference(a, b) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i++;
  const context = (s) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60));
  return { at: i, left: context(a), right: context(b) };
}

function compareComponent(id, consumerText, buildText) {
  if (consumerText === null || buildText === null) {
    return { id, state: "missing", detail: "absent from " + (consumerText === null ? "the consumer" : "the build") };
  }
  // Trailing whitespace carries no meaning in JS source, and a copy pasted into
  // another file routinely loses the final newline. Folding it keeps that
  // packaging artifact from reading as drift, while still being reported.
  const trimEnd = (s) => s.replace(/\s+$/, "");
  if (trimEnd(consumerText) === trimEnd(buildText)) {
    return consumerText === buildText
      ? { id, state: "identical" }
      : { id, state: "identical", detail: "identical apart from " + (buildText.length - trimEnd(buildText).length) + " trailing whitespace character(s) in the build" };
  }
  const a = consumerText.split("\n");
  const b = buildText.split("\n");
  const consumerOnly = a.filter((line) => line.trim() && !b.includes(line));
  const buildOnly = b.filter((line) => line.trim() && !a.includes(line));
  // A line the copy rewrote appears in both lists. Counting those as missing logic
  // would tell a maintainer to port a fix backwards, so match each consumer-only
  // line against the build-only lines: a near match is that line's earlier version,
  // and only an unmatched line is something this repository cannot reproduce — the
  // ISSUE-001 case, where the copy carried a whole rule that no branch had.
  const newLogic = consumerOnly.filter((line) => !buildOnly.some((other) => similarity(line, other) >= 0.6));
  const rewritten = consumerOnly.length - newLogic.length;
  const result = {
    id,
    state: "differs",
    detail: consumerOnly.length + " line(s) only in the consumer, " + buildOnly.length + " only in the build; lengths " + consumerText.length + " vs " + buildText.length,
    consumerOnly: consumerOnly.slice(0, 5).map((l) => l.trim().slice(0, 160)),
    buildOnly: buildOnly.slice(0, 5).map((l) => l.trim().slice(0, 160)),
    newLogic: newLogic.length,
    rewritten,
    first: firstDifference(consumerText, buildText),
  };
  if (newLogic.length) result.direction = newLogic.length + " consumer-only line(s) are not in this build — check whether the copy invented them";
  else if (rewritten) result.direction = "the copy holds earlier versions of " + rewritten + " line(s) that this build has since rewritten — republish, do not port";
  else result.direction = "the copy is behind the build — regenerate it; nothing needs porting";
  return result;
}

/* --- reporting ------------------------------------------------------------ */

function report(results, meta) {
  const critical = results.filter((r) => r.critical && r.state !== "identical");
  const presentational = results.filter((r) => !r.critical && r.state !== "identical");
  // --expect-identical is for the Streamlit artifact, which is this build copied
  // verbatim; there a presentational difference is a failure too.
  const byteMismatch = meta.expectIdentical && !meta.documentIdentical;
  const ok = critical.length === 0 && !byteMismatch;
  if (meta.json) {
    console.log(JSON.stringify({ consumer: meta.consumer, build: meta.build, how: meta.how, expectIdentical: meta.expectIdentical, documentIdentical: meta.documentIdentical, results, ok }, null, 2));
    return ok;
  }
  console.log("Consumer : " + meta.consumer);
  console.log("           (" + meta.how + ")");
  console.log("Build    : " + meta.build);
  console.log("");
  for (const r of results) {
    const verdict = r.state === "identical" ? "identical" : r.state === "differs" ? "DIFFERS" : "MISSING";
    console.log("  " + (r.critical ? "underwriting " : "presentation ") + r.id.padEnd(10) + verdict + (r.detail ? "  — " + r.detail : ""));
    if (r.direction) console.log("      " + r.direction);
    for (const line of r.consumerOnly ?? []) console.log("      consumer only: " + line);
    for (const line of r.buildOnly ?? []) console.log("      build only   : " + line);
    if (r.first) console.log("      first difference at char " + r.first.at + "\n        consumer " + r.first.left + "\n        build    " + r.first.right);
  }
  console.log("");
  if (critical.length) {
    console.log("FAIL — this consumer and the build disagree on underwriting logic.");
    for (const r of critical) if (r.direction) console.log("       " + r.id + ": " + r.direction);
    if (critical.some((r) => r.newLogic)) {
      console.log("       Port each unmatched consumer-only line above into js/rules.js, js/state.js or");
      console.log("       js/engine.js with a test, and treat it as logic this repository did not know");
      console.log("       about. A line the copy rewrote is that line's earlier version here, so check the");
      console.log("       build-only side before porting anything back.");
    }
    console.log("       Then regenerate the consumer from the new build, and never edit its copy to");
    console.log("       match: that is how ISSUE-001 happened.");
  } else if (byteMismatch) {
    console.log("FAIL — this comparison requires the consumer to be byte-identical to the build.");
    console.log("       Underwriting logic matches, but the documents differ; regenerate this consumer");
    console.log("       from the build rather than adapting it. Nothing may be adapted here.");
  } else if (presentational.length) {
    console.log("PASS — underwriting logic matches the build.");
    console.log("       " + presentational.length + " presentational difference(s) above. Bring anything you want to keep back into");
    console.log("       this repository, and regenerate the copy rather than hand-editing it.");
  } else if (!meta.documentIdentical) {
    console.log("PASS — every component matches the build once this consumer's own embed adaptations are");
    console.log("       folded out; the delivered document differs only by its CSP, its embed links and its adapters.");
  } else if (results.some((r) => r.state === "identical" && r.detail)) {
    console.log("PASS — every component matches the build; only trailing whitespace differs.");
  } else {
    console.log("PASS — this consumer is byte-identical to the build.");
  }
  return ok;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/, "").trim());
    return 0;
  }
  const buildPath = path.resolve(ROOT, args.build);
  if (!fs.existsSync(buildPath)) throw new Error("Build not found at " + buildPath + " — run: npm run build");
  const build = fs.readFileSync(buildPath, "utf8");
  if (!holdsWholeEstimator(build)) throw new Error("Build at " + buildPath + " does not contain all four components — rebuild it with: npm run build");
  const consumer = await readConsumer(args.consumer);

  const consumerBodies = componentBodies(consumer.html);
  const buildBodies = componentBodies(build);
  const results = COMPONENTS.map((c) => Object.assign(compareComponent(c.id, consumerBodies[c.id], buildBodies[c.id]), { critical: c.critical }));
  results.push(Object.assign(compareComponent("styles", styleBlocks(consumer.html)[0] ?? null, styleBlocks(build)[0] ?? null), { critical: false }));
  results.push(Object.assign(compareComponent("markup", normaliseMarkup(consumer.html), normaliseMarkup(build)), { critical: false }));

  return report(results, {
    consumer: args.consumer,
    build: path.relative(ROOT, buildPath),
    how: consumer.how,
    json: args.json,
    documentIdentical: consumer.html === build,
    expectIdentical: args.expectIdentical,
  });
}

main()
  .then((ok) => { process.exitCode = ok ? 0 : 1; })
  .catch((error) => { console.error("consumer-parity: " + error.message); process.exitCode = 1; });
