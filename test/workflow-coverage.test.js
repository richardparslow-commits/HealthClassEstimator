"use strict";
/* Fixtures for scripts/check-workflow-coverage.js.

   The guard exists because the gate quietly stopped covering the branch that ships:
   audit-checks.yml ran on `pull_request` and on pushes to every branch except main,
   which was correct while main changes arrived as pull requests (the last merged one
   was on 2026-10-10) and wrong every day since, when they arrived as pushes. No run
   after that date exists, so twelve suites — parity, the drift alert, the workflow
   guards, the canary decision, the interpreter pin, the publish read-back, and the
   browser suite that was invoked by nothing at all — could not fail before a release.

   These fixtures are the guard's own cases, each a shape that must not pass: the
   branch filter that caused this, a schedule-only invocation, a comment that names a
   command, a longer script name that contains a shorter one, a fixture no script
   runs, and a repository with nothing to check. Then the real repository is checked
   through the module, and the workflows are read to confirm the suites are wired.

   Needs only node and git-free filesystem work; the browser suite it checks is run
   by audit-checks.yml, not here.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "check-workflow-coverage.js");
const { auditCoverage, runsOnPushToMain } = require(script);
let checks = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks++;
}
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hce-workflow-coverage-"));

// A small repository to shape: two suites, so a case can cover one and leave the
// other unreachable.
function makeRepo(name, { workflows, scripts, files = [] }) {
  const dir = path.join(scratch, name);
  fs.mkdirSync(path.join(dir, "workflows"), { recursive: true });
  fs.mkdirSync(path.join(dir, "test"), { recursive: true });
  for (const [file, text] of Object.entries(workflows)) fs.writeFileSync(path.join(dir, "workflows", file), text);
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, scripts }, null, 2) + "\n");
  for (const file of ["alpha", "beta"]) {
    const command = scripts["test:" + file] || scripts.test || "";
    if (command.includes("test/" + file + ".test.js")) fs.writeFileSync(path.join(dir, "test", file + ".test.js"), '"use strict";\n');
  }
  for (const file of files) fs.writeFileSync(path.join(dir, "test", file + ".test.js"), '"use strict";\n');
  return dir;
}

function run(dir) {
  const result = spawnSync(process.execPath, [script, "--dir", path.join(dir, "workflows"), "--package", path.join(dir, "package.json")], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

const SUITES = { test: "node test/alpha.test.js", "test:beta": "node test/beta.test.js" };

/* --- a suite covered on main passes -------------------------------------- */

const covered = makeRepo("covered", {
  workflows: {
    "ci.yml": ["on:", "  push:", "  pull_request:", "jobs:", "  verify:", "    steps:", "      - run: npm test"].join("\n") + "\n",
    "nightly.yml": ["on:", "  schedule:", "    - cron: \"0 3 * * *\"", "jobs:", "  nightly:", "    steps:", "      - run: npm run test:beta"].join("\n") + "\n",
  },
  scripts: SUITES,
  files: ["beta"],
});
// `npm test` covers alpha and the nightly covers beta, but the nightly is scheduled;
// beta must therefore be reported, which is the whole point of reading triggers.
const scheduledOnly = run(covered);
equal(scheduledOnly.status, 1, "a suite run only by a scheduled workflow does not count as covered");
ok(/test:beta {2}\(npm run test:beta\)/.test(scheduledOnly.out), "the failure names the suite that cannot run");
ok(/nightly\.yml {2}\(not on main\)/.test(scheduledOnly.out), "and shows the workflow that runs it but not on main");

fs.writeFileSync(
  path.join(covered, "workflows", "nightly.yml"),
  ["on:", "  push:", "  schedule:", "    - cron: \"0 3 * * *\"", "jobs:", "  nightly:", "    steps:", "      - run: npm run test:beta"].join("\n") + "\n"
);
const nowCovered = run(covered);
equal(nowCovered.status, 0, "adding a push trigger to the workflow that runs it makes it covered: " + nowCovered.err);
ok(/test:beta\s+← nightly\.yml/.test(nowCovered.out), "the pass names which workflow runs each suite");
ok(/test\s+← ci\.yml/.test(nowCovered.out), "and does so per suite");

/* --- the branch filter that caused this ---------------------------------- */

const excluded = makeRepo("excluded", {
  workflows: {
    "ci.yml": ["on:", "  pull_request:", "  push:", "    branches-ignore: [main]", "jobs:", "  verify:", "    steps:", "      - run: npm test", "      - run: npm run test:beta"].join("\n") + "\n",
  },
  scripts: SUITES,
  files: ["beta"],
});
const excludedRun = run(excluded);
equal(excludedRun.status, 1, "a workflow that excludes main does not cover anything");
ok(/test {2}\(npm run test\)/.test(excludedRun.out) && /test:beta {2}/.test(excludedRun.out), "both suites are named: " + excludedRun.out);
ok(/ci\.yml {2}\(not on main\)/.test(excludedRun.out), "and the workflow is reported as not running on main");
ok(/cannot run when main changes/.test(excludedRun.out), "the verdict says what the consequence is");

// The same file with the filter removed covers both, so the failure is about the
// trigger and not about how the workflow was read.
fs.writeFileSync(
  path.join(excluded, "workflows", "ci.yml"),
  ["on:", "  pull_request:", "  push:", "jobs:", "  verify:", "    steps:", "      - run: npm test", "      - run: npm run test:beta"].join("\n") + "\n"
);
equal(run(excluded).status, 0, "removing the branch filter is the fix");

/* --- a comment is not a run --------------------------------------------- */

const commented = makeRepo("commented", {
  workflows: {
    "ci.yml": ["on:", "  push:", "jobs:", "  verify:", "    steps:", "      # npm run test:beta is covered by the nightly", "      - run: npm test"].join("\n") + "\n",
  },
  scripts: SUITES,
  files: ["beta"],
});
const commentedRun = run(commented);
equal(commentedRun.status, 1, "a command named only in a comment does not count as a run");
ok(/test:beta/.test(commentedRun.out), "and the suite it named is reported as uncovered");

/* --- a longer script name is a different suite --------------------------- */

const prefix = makeRepo("prefix", {
  workflows: {
    "ci.yml": ["on:", "  push:", "jobs:", "  verify:", "    steps:", "      - run: npm test", "      - run: npm run test:beta-extras"].join("\n") + "\n",
  },
  scripts: SUITES,
  files: ["beta"],
});
const prefixRun = run(prefix);
equal(prefixRun.status, 1, "npm run test:beta-extras does not cover test:beta");
ok(/test:beta {2}/.test(prefixRun.out), "the suite is still reported as uncovered");

/* --- a fixture no script runs -------------------------------------------- */

const orphan = makeRepo("orphan", {
  workflows: {
    "ci.yml": ["on:", "  push:", "jobs:", "  verify:", "    steps:", "      - run: npm test"].join("\n") + "\n",
  },
  scripts: SUITES,
  files: ["beta"],
});
fs.writeFileSync(path.join(orphan, "test", "orphan.test.js"), "\"use strict\";\n");
const orphanRun = run(orphan);
equal(orphanRun.status, 1, "a test file no script runs fails the check");
ok(/test\/orphan\.test\.js {2}— no test\* script runs it/.test(orphanRun.out), "the failure names the file and why");

/* --- nothing to check ---------------------------------------------------- */

const empty = path.join(scratch, "empty");
fs.mkdirSync(path.join(empty, "workflows"), { recursive: true });
fs.mkdirSync(path.join(empty, "test"), { recursive: true });
fs.writeFileSync(path.join(empty, "package.json"), JSON.stringify({ name: "empty", scripts: SUITES }, null, 2) + "\n");
const noWorkflows = run(empty);
equal(noWorkflows.status, 1, "a directory with no workflows fails rather than passing");
ok(/No workflow files found/.test(noWorkflows.err), "and says why that is a failure");

const noSuites = path.join(scratch, "no-suites");
fs.mkdirSync(path.join(noSuites, "workflows"), { recursive: true });
fs.mkdirSync(path.join(noSuites, "test"), { recursive: true });
fs.writeFileSync(path.join(noSuites, "workflows", "ci.yml"), ["on:", "  push:", "jobs:", "  verify:", "    steps:", "      - run: echo hi"].join("\n") + "\n");
fs.writeFileSync(path.join(noSuites, "package.json"), JSON.stringify({ name: "no-suites", scripts: { build: "node scripts/build.js" } }, null, 2) + "\n");
const noScripts = run(noSuites);
equal(noScripts.status, 1, "a repository with no suites fails rather than passing");
ok(/No test\* scripts/.test(noScripts.err), "and says that a scan of nothing is not a pass");

/* --- an exception has to be a decision ----------------------------------- */

assert.throws(
  () => auditCoverage({ dir: path.join(covered, "workflows"), packagePath: path.join(covered, "package.json"), exceptions: { "test:beta": "  " }, testDir: path.join(covered, "test") }),
  /has no reason/,
  "an exception without a reason is refused"
);
checks++;
assert.throws(
  () => auditCoverage({ dir: path.join(covered, "workflows"), packagePath: path.join(covered, "package.json"), exceptions: { "test:gamma": "does not exist" }, testDir: path.join(covered, "test") }),
  /names no suite/,
  "an exception for a suite that does not exist is refused"
);
checks++;

const excepted = auditCoverage({
  dir: path.join(commented, "workflows"),
  packagePath: path.join(commented, "package.json"),
  exceptions: { "test:beta": "needs a browser download, run by hand" },
  testDir: path.join(commented, "test"),
});
equal(excepted.uncovered.length, 0, "a written exception clears the suite");
ok(excepted.covered.some((entry) => entry.exception === "needs a browser download, run by hand"), "and is carried into the report");

/* --- trigger reading ----------------------------------------------------- */

const trigger = (on) => runsOnPushToMain("name: x\n" + on + "jobs:\n  a:\n    steps:\n");
ok(trigger("on:\n  push:\n"), "a bare push trigger covers main");
ok(trigger("on:\n  push:\n    branches: [main]\n"), "branches: [main] covers main");
ok(trigger("on:\n  push:\n    branches:\n      - main\n"), "and so does the block form");
ok(trigger("on:\n  push: { branches: [main] }\n"), "and the inline mapping");
equal(trigger("on:\n  push:\n    branches: [release]\n"), false, "a push scoped to another branch does not cover main");
equal(trigger("on:\n  push:\n    branches-ignore: [main]\n"), false, "excluding main does not cover it");
equal(trigger("on:\n  push:\n    branches: [main]\n  pull_request:\n    branches: [release]\n"), true, "another trigger's branch filter is not read as the push's");
equal(trigger("on:\n  pull_request:\n"), false, "pull_request alone does not cover a push to main");
equal(trigger("on:\n  schedule:\n    - cron: \"0 0 * * *\"\n"), false, "a schedule does not cover main");
equal(runsOnPushToMain("name: x\njobs:\n"), false, "a workflow with no on: block does not cover main");

/* --- this repository ------------------------------------------------------ */

const real = auditCoverage({
  dir: path.join(root, ".github", "workflows"),
  packagePath: path.join(root, "package.json"),
  testDir: path.join(root, "test"),
});
equal(real.uncovered.length, 0, "every suite in this repository is run by a workflow on a push to main: " + real.uncovered.map((entry) => entry.suite.name).join(", "));
equal(real.unreferenced.length, 0, "and every fixture in test/ is run by one of those suites: " + real.unreferenced.join(", "));
ok(
  real.covered.some((entry) => entry.suite.name === "test:parity" && entry.by.includes("audit-checks.yml")),
  "the audit suite covers parity on main — the regression this guard was written for"
);
ok(
  real.covered.some((entry) => entry.suite.name === "test:ui" && entry.by.includes("audit-checks.yml")),
  "and the browser suite, which no workflow ran at all before"
);
ok(real.mainWorkflows.some((workflow) => workflow.name === "deploy-streamlit.yml"), "the release workflow is recognised as running on main");

const audit = fs.readFileSync(path.join(root, ".github", "workflows", "audit-checks.yml"), "utf8");
ok(!/branches-ignore: \[main\]/.test(audit), "audit-checks.yml no longer excludes main");
ok(/^  push:$/m.test(audit), "it runs on pushes to every branch, main included");
ok(/npm run test:coverage/.test(audit), "and CI runs the coverage guard's fixtures");
ok(/npm run check:workflow-coverage/.test(audit) || /node scripts\/check-workflow-coverage\.js/.test(audit), "and reports the coverage it found");

const browser = audit.slice(audit.indexOf("  browser:"));
ok(/^  browser:/m.test(audit), "the browser suite has its own job so its runtime cannot hide the other results");
// Every offline suite runs in the job that has no browser to download: a step placed
// after a job's installer only runs when the installer worked, so the suite would
// report nothing on the day a download failed. One run had the read-back in there.
ok(
  audit.indexOf("      - name: Verify the publish read-back") < audit.indexOf("  browser:"),
  "the offline publish read-back runs in the verify job, not after the browser job's installer"
);
ok(
  (browser.match(/^      - name: /gm) || []).length === 3,
  "and the browser job holds only the installer, the build and the browser suite: " + (browser.match(/^      - name: .*$/gm) || []).join(" | ")
);
ok(/npm install --no-save playwright/.test(browser), "which installs playwright without adding it to the project's dependencies");
ok(/npx playwright install --with-deps chromium/.test(browser), "and the browser it drives");
ok(browser.indexOf("npm run build") < browser.indexOf("npm run test:ui"), "and builds dist/app.html before the suite that visits it");
ok(/npm run test:ui/.test(browser), "then runs the interview flows");

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
equal(pkg.scripts["test:coverage"], "node test/workflow-coverage.test.js", "the fixtures are wired into npm scripts");
equal(pkg.scripts["check:workflow-coverage"], "node scripts/check-workflow-coverage.js", "and the guard can be run by hand");

fs.rmSync(scratch, { recursive: true, force: true });
console.log("Passed " + checks + " workflow-coverage assertions.");
