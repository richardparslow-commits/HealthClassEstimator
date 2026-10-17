#!/usr/bin/env node
/* Fail when a workflow reads a repository file over raw.githubusercontent.com.

   Both consumer-parity jobs used to read the deployed copy that way, and the CDN
   keeps serving the previous commit for minutes after a push (measured: ~3 minutes
   on 2026-10-16). A run dispatched just after a deploy therefore judged the release
   before it, and because the artifact and its manifest were two separate requests
   they could come from two different commits — a combination that never shipped,
   which reads as "edited outside the build" and sends someone to republish a copy
   that was already correct. Both jobs now fetch one commit with git and print the
   commit they read (commit ae6ab00), and the live website read is cache-proof in
   scripts/check-consumer-parity.js.

   This is the guard that keeps that from coming back. It fails on a CDN read
   anywhere in a workflow — a `run:` line, an `env:` value, a `uses:` reference —
   rather than trying to decide which URLs name a deployed copy: the CDN is stale
   for every repository it serves, and a guard that has to classify URLs is one
   someone can argue past.

   Prose is not a fetch. A comment line is skipped, shell comments inside a `run:`
   block included, so a workflow (and this file) can still explain the bug it was
   fixed from — that explanation is the reason the shape is recognisable.

   What to do instead, and the reason to print the commit:

     git init --quiet deployed
     git -C deployed remote add origin https://github.com/<owner>/<repo>.git
     git -C deployed fetch --quiet --depth 1 origin <ref>   # branch, tag or full SHA
     git -C deployed checkout --quiet --detach FETCH_HEAD
     git -C deployed rev-parse HEAD                          # name what was read

   Usage:  node scripts/check-workflow-fetches.js              # .github/workflows
           node scripts/check-workflow-fetches.js --dir <dir>  # any directory
   Exit status: 0 when no workflow reads from the CDN; 1 otherwise, or 1 when there
   are no workflow files to check at all — a scan of nothing passes for the wrong
   reason.
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// raw.github.com is the legacy hostname for the same CDN; matching both keeps this
// guard working if a URL is copied from an older run log. Domains are
// case-insensitive, so the match is too.
const CDN = /raw\.githubusercontent\.com|raw\.github\.com/i;
const WORKFLOW = /\.ya?ml$/i;

function parseArgs(argv) {
  const args = { dir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") args.dir = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error("Unknown argument: " + a);
  }
  // `--dir` without a value is a mistake, and treating it as "scan the default"
  // would quietly check something other than what was asked for.
  if (args.dir === undefined) throw new Error("--dir needs a directory");
  return args;
}

// Every line of every workflow, minus the ones that cannot fetch anything.
function findCdnReads(dir) {
  const files = fs.readdirSync(dir).filter((name) => WORKFLOW.test(name)).sort();
  const findings = [];
  for (const name of files) {
    const file = path.join(dir, name);
    fs.readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, index) => {
        const text = line.trim();
        if (!text || text.startsWith("#")) return;
        if (!CDN.test(text)) return;
        findings.push({ file, line: index + 1, text: text.replace(/\s+/g, " ").slice(0, 200) });
      });
  }
  return { files, findings };
}

function report(result, dir) {
  if (!result.files.length) {
    throw new Error("No workflow files found in " + dir + " — a check that scans nothing passes for the wrong reason.");
  }
  if (!result.findings.length) {
    console.log("Passed: " + result.files.length + " workflow file(s) read no repository file over raw.githubusercontent.com.");
    return 0;
  }
  for (const finding of result.findings) {
    // Relative inside the repository, absolute outside it: a fixture in a temp
    // directory should not be reported as a chain of "../".
    const relative = path.relative(process.cwd(), finding.file);
    console.log("  " + (relative.startsWith("..") ? finding.file : relative) + ":" + finding.line + "  " + finding.text);
  }
  console.log("");
  console.log("FAIL — a workflow reads a repository file over raw.githubusercontent.com.");
  console.log("       That CDN keeps serving the previous commit for minutes after a push (measured");
  console.log("       ~3 minutes on 2026-10-16), so a run shortly after a deploy compares the release");
  console.log("       before it. Two files read separately can even come from two different commits,");
  console.log("       which is reported as \"edited outside the build\" for a copy that is correct.");
  console.log("       Fetch one commit with git instead, and print the commit that was read:");
  console.log("         git init --quiet deployed");
  console.log("         git -C deployed remote add origin https://github.com/<owner>/<repo>.git");
  console.log("         git -C deployed fetch --quiet --depth 1 origin <ref>");
  console.log("         git -C deployed checkout --quiet --detach FETCH_HEAD");
  console.log("       A comment naming the CDN is not a fetch, so keep the explanation and drop the URL.");
  return 1;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/, "").trim());
    return 0;
  }
  const dir = args.dir ? path.resolve(process.cwd(), args.dir) : path.join(ROOT, ".github", "workflows");
  if (!fs.existsSync(dir)) throw new Error("No workflow directory at " + dir);
  return report(findCdnReads(dir), dir);
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error("workflow-fetch-check: " + error.message);
    process.exitCode = 1;
  }
}

module.exports = { findCdnReads, CDN };
