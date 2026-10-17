#!/usr/bin/env node
/* Fail when a suite this repository ships is not run by a workflow that runs on a
   push to main.

   What it caught, and why the check exists rather than a comment: `.github/workflows/
   audit-checks.yml` was scoped to `pull_request` and `push: branches-ignore: [main]`,
   which was right while main changes arrived as pull requests — the last merged one
   was on 2026-10-10. Since then every commit reached main directly, so the suite that
   verifies the release machinery (parity, the drift alert, the workflow guards, the
   canary decision, the interpreter pin, the publish read-back) ran nowhere on main:
   `gh run list --workflow=audit-checks.yml` shows no run after 2026-10-10, while
   `deploy-streamlit.yml` — the only main-triggered workflow — runs four of the twelve
   suites, and `test/ui.test.js`, the browser suite that exercises the interview as an
   applicant does, was invoked by nothing at all.

   The rule is deliberately about reachability, not about any one workflow: every
   `test*` script in package.json must be invoked by a workflow that a push to main
   would run, every file in test/ must be referenced by one of those scripts, and a
   suite that is genuinely unreachable must be listed in EXCEPTIONS with a reason.
   An exception has to be written down; a branch filter that quietly removes the
   coverage does not count as one.

   A comment is not a run. Comment lines are skipped — this file and the workflows
   are full of prose naming the commands — so an explanation of a suite cannot be
   mistaken for an invocation of it.

   Usage:  node scripts/check-workflow-coverage.js                     # this repository
           node scripts/check-workflow-coverage.js --dir <dir> --package <package.json>
                                          # any directory, for fixtures
   Exit status: 0 when every suite is reachable from a push to main; 1 otherwise,
   including when there is nothing to check — a scan of nothing passes for the wrong
   reason, and so does a package.json with no suites in it.
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const WORKFLOW = /\.ya?ml$/i;

// Suites that cannot be run by a push to main, each with the reason. Empty on
// purpose: every suite here is cheap and offline, so the honest answer is "wire it".
const EXCEPTIONS = {};

/* --- reading the triggers -------------------------------------------------- */

// The `on:` block, as raw lines. Workflows are read textually like the fetch guard
// reads them: the questions here are "is there a push trigger" and "which branches
// does it cover", both of which are answered by the shape of a few lines, and a
// parser would have to be taught every input form this repository uses.
function onBlock(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (start < 0) return null;
  const block = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() && !/^\s/.test(line)) break; // next top-level key
    block.push(line);
  }
  return block;
}

function branchList(lines, key) {
  const at = lines.findIndex((line) => new RegExp("^\\s+" + key + ":").test(line));
  if (at < 0) return null;
  const inline = lines[at].match(/\[(.*)\]/);
  if (inline) return inline[1].split(",").map((part) => part.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  const items = [];
  for (let i = at + 1; i < lines.length; i++) {
    const match = lines[i].match(/^\s*-\s*(.+?)\s*$/);
    if (!match) break;
    items.push(match[1].replace(/^['"]|['"]$/g, ""));
  }
  return items;
}

// Just the `push:` entry of that block, as text: its own lines, or its inline mapping
// flattened so `push: { branches: [main] }` and the block form read the same.
function pushScopeText(block) {
  const at = block.findIndex((line) => /^\s{2}push\s*:/.test(line));
  if (at < 0) return null;
  const inline = block[at].replace(/^\s{2}push\s*:\s*/, "").trim();
  if (inline) return inline.replace(/[{}]/g, "\n");
  let end = block.length;
  for (let i = at + 1; i < block.length; i++) {
    if (/^\s{2}\S/.test(block[i])) {
      end = i;
      break;
    }
  }
  return block.slice(at + 1, end).join("\n").replace(/[{}]/g, "\n");
}

// A push trigger with no branch filter covers main; `branches:` covers it only when
// main is named; `branches-ignore:` covers it unless main is excluded. A missing
// `on:` block, a schedule-only workflow and a dispatch-only one are all "no".
function runsOnPushToMain(text) {
  const block = onBlock(text);
  if (!block) return false;
  const scope = pushScopeText(block);
  if (scope === null) return false;
  const lines = scope.split("\n");
  const include = branchList(lines, "branches");
  const ignore = branchList(lines, "branches-ignore");
  const coversMain = (name) => name === "main" || name === "master" || /^\*+$/.test(name);
  if (ignore && ignore.some(coversMain)) return false;
  if (include && !include.some(coversMain)) return false;
  return true;
}

function readWorkflows(dir) {
  const files = fs.readdirSync(dir).filter((name) => WORKFLOW.test(name)).sort();
  return files.map((name) => {
    const file = path.join(dir, name);
    const text = fs.readFileSync(file, "utf8");
    return { file, name, text, runsOnMain: runsOnPushToMain(text) };
  });
}

/* --- reading the suites ---------------------------------------------------- */

// The local files a script runs: `node test/parity.test.js`, `node scripts/x.js`.
function localTargets(command) {
  return (command.match(/(?:^|\s)((?:test|scripts)\/[\w.-]+\.(?:js|mjs|cjs|py))/g) || []).map((token) => token.trim());
}

function readSuites(packagePath) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch (error) {
    throw new Error("Could not read " + packagePath + ": " + error.message);
  }
  const scripts = pkg.scripts || {};
  return Object.keys(scripts)
    .filter((name) => /^test(:|$)/.test(name))
    .sort()
    .map((name) => ({ name, command: scripts[name], files: localTargets(scripts[name]) }));
}

// Comment lines cannot run anything, and this repository's workflows are full of
// prose that names these commands.
const isComment = (line) => line.trim().startsWith("#");

// A workflow runs a suite when it invokes the script — `npm test`, `npm run test:x` —
// or when it runs one of the files that script runs. The trailing guard keeps
// `npm run test:build` from counting as `npm run test:builder`.
function runsSuite(workflow, suite) {
  const lines = workflow.text.split(/\r?\n/).filter((line) => !isComment(line));
  const script = suite.name === "test" ? /(^|[^\w-])npm (run )?test(?![\w:-])/ : null;
  if (script && lines.some((line) => script.test(line))) return true;
  const named = new RegExp("npm run " + suite.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w:-])");
  if (lines.some((line) => named.test(line))) return true;
  return suite.files.some((file) => lines.some((line) => new RegExp("(?:^|[^\\w./-])" + file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\w-])").test(line)));
}

/* --- the verdict ----------------------------------------------------------- */

function auditCoverage({ dir, packagePath, exceptions = EXCEPTIONS, testDir }) {
  const workflows = readWorkflows(dir);
  if (!workflows.length) {
    throw new Error("No workflow files found in " + dir + " — a coverage check that scans nothing passes for the wrong reason.");
  }
  const suites = readSuites(packagePath);
  if (!suites.length) {
    throw new Error("No test* scripts in " + packagePath + " — a repository with no suites would pass this check without running anything.");
  }
  for (const [name, reason] of Object.entries(exceptions)) {
    if (!suites.some((suite) => suite.name === name)) throw new Error("The exception for " + name + " names no suite in " + packagePath + ".");
    if (typeof reason !== "string" || !reason.trim()) throw new Error("The exception for " + name + " has no reason — an unwritten exception is how the coverage went missing.");

  }
  const mainWorkflows = workflows.filter((workflow) => workflow.runsOnMain);
  const covered = [];
  const uncovered = [];
  for (const suite of suites) {
    const exception = exceptions[suite.name] || null;
    const by = mainWorkflows.filter((workflow) => runsSuite(workflow, suite)).map((workflow) => workflow.name);
    // A written exception clears the suite even though nothing on main runs it —
    // that is what an exception is for — but it has to be a written one, which is
    // the case the fixtures check with an empty reason.
    ((by.length || exception) ? covered : uncovered).push({ suite, by, exception });
  }

  // A fixture nothing runs is a suite in an unlit room: it can only fail for
  // whoever remembers to type its name.
  const known = new Set(suites.flatMap((suite) => suite.files));
  const unreferenced = fs.existsSync(testDir)
    ? fs.readdirSync(testDir).filter((name) => /\.(test|fixture)\.(js|mjs|cjs|py)$/.test(name)).map((name) => "test/" + name).filter((file) => !known.has(file)).sort()
    : [];

  return { workflows, mainWorkflows, suites, covered, uncovered, unreferenced };
}

function report(result, dir) {
  if (result.uncovered.length || result.unreferenced.length) {
    for (const { suite } of result.uncovered) {
      console.log("  " + suite.name + "  (npm run " + suite.name + ")  — no workflow on a push to main runs it");
    }
    for (const file of result.unreferenced) console.log("  " + file + "  — no test* script runs it");
    console.log("");
    console.log("FAIL — " + (result.uncovered.length + result.unreferenced.length) + " suite(s) cannot run when main changes.");
    console.log("       " + result.workflows.length + " workflow file(s) in " + path.relative(process.cwd(), dir) + ", " + result.mainWorkflows.length + " triggered by a push to main:");
    for (const workflow of result.workflows) {
      console.log("         " + workflow.name + (workflow.runsOnMain ? "  (push to main)" : "  (not on main)"));
    }
    console.log("       A suite that no main run executes is green in a log nobody writes: wire it into");
    console.log("       a workflow that runs on main (or name it in EXCEPTIONS in this script, with the");
    console.log("       reason it cannot be — an exception has to be written down).");
    return 1;
  }
  console.log("Passed: " + result.suites.length + " suite(s) run by a workflow on a push to main.");
  const width = Math.max(...result.covered.map((entry) => entry.suite.name.length));
  for (const entry of result.covered) {
    const runs = entry.exception ? "excepted: " + entry.exception : "← " + entry.by.join(", ");
    console.log("        " + entry.suite.name.padEnd(width) + "  " + runs);
  }
  return 0;
}

function parseArgs(argv) {
  const args = { dir: null, packagePath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--package") args.packagePath = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error("Unknown argument: " + a);
  }
  if (args.dir === undefined) throw new Error("--dir needs a directory");
  if (args.packagePath === undefined) throw new Error("--package needs a file");
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/, "").trim());
    return 0;
  }
  const dir = args.dir ? path.resolve(process.cwd(), args.dir) : path.join(ROOT, ".github", "workflows");
  const packagePath = args.packagePath ? path.resolve(process.cwd(), args.packagePath) : path.join(ROOT, "package.json");
  if (!fs.existsSync(dir)) throw new Error("No workflow directory at " + dir);
  return report(auditCoverage({ dir, packagePath, testDir: path.join(path.dirname(packagePath), "test") }), dir);
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error("workflow-coverage: " + error.message);
    process.exitCode = 1;
  }
}

module.exports = { auditCoverage, runsOnPushToMain, readSuites, EXCEPTIONS };
