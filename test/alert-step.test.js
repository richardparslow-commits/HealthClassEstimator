"use strict";
/* The alert job's shell step, executed rather than read.

   `test/deployed-app-alert.test.js` holds the decision (scripts/deployed-app-alert.js)
   and the *text* of the workflow that calls it: it greps for `--body`, for `if [ "$failed"
   != "none" ]`, for the job checking out the script it runs. None of that is a shell that
   ran. The step is the last hop between a red six-hourly check and a person, and on
   2026-10-17 the deployed app was red — release 80 against this repository's 82 — so
   "the issue is opened" has to be something this repository has seen happen, not
   something a regex believes.

   So this suite finds the step in the workflow, takes its `env:` and its `run: |` block
   verbatim, and executes that shell with a `gh` on PATH that records every call and
   answers with what GitHub would. What is asserted is the calls: which subcommands, with
   which issue numbers, which label, and what the body file contained when it was handed
   to `gh issue create`. A step that stops calling `gh`, calls it with an empty variable,
   forgets the label, or creates a second issue while one is open fails here — on a
   branch, before the run that needed it.

   Needs no Chromium and no network: bash, node, and this repository.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, ".github/workflows/streamlit-deployed.yml");
let checks = 0;
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

/* --- reading the step out of the workflow ---------------------------------- */

// The reader is shared with the release harness (`test/publish-step.test.js`) so the two
// files cannot disagree about how a step is read. It throws on anything it does not
// understand — a renamed job or step, a `run:` that stopped being a block scalar — rather
// than returning an empty string that would execute nothing.
const { readStep } = require("../scripts/workflow-step.js");

// The step as the workflow runs it. `env:` values are `${{ … }}` expressions, which are
// GitHub's to resolve; this suite supplies the values the job would, so the keys are
// what matters here — and a key the script needs but the step no longer passes fails the
// assertions below rather than reading as an empty string.
const alert = readStep(workflowPath, "alert", "Open, update or close the tracking issue");

/* --- a gh that records what it was asked to do ----------------------------- */

// Each subcommand answers with what GitHub would for the step to continue: `label
// create --force` succeeds, `issue list --json number --jq` prints the numbers, `issue
// create` prints the URL it would have returned. Everything is appended to $GH_LOG as
// one block per call, so an argument containing newlines cannot be confused for a call.
const GH = `#!/usr/bin/env bash
set -euo pipefail
{
  echo "ARGS"
  for arg in "$@"; do printf '%s\\n' "$arg"; done
  echo "END"
} >> "$GH_LOG"
case "$1 $2" in
  "label create") exit 0 ;;
  "issue list") printf '%s' "\${GH_LIST_ISSUES:-}" | sed '/^$/d'; printf '\\n'; exit 0 ;;
  "issue create") echo "https://github.com/example/issues/42"; exit 0 ;;
  "issue comment") exit 0 ;;
  "issue close") exit 0 ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`;

function parseCalls(text) {
  const calls = [];
  let current = null;
  for (const line of text.split("\n")) {
    if (line === "ARGS") current = [];
    else if (line === "END" && current) {
      calls.push(current);
      current = null;
    } else if (current) current.push(line);
  }
  return calls;
}

// One run of the step, in this repository, with the values the alert job would set.
function drive({ result, openIssues = [], problems = "", state = "", outcome = "", event = "schedule" }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alert-step-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"), GH, { mode: 0o755 });
  const log = path.join(dir, "gh.log");
  fs.writeFileSync(log, "");
  const run = spawnSync("bash", ["-c", alert.script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: bin + path.delimiter + (process.env.PATH || ""),
      // The step writes the issue body with `mktemp`; pointing TMPDIR at this run's
      // directory means the file is read below and then removed with it, instead of
      // leaving one behind in /tmp per run.
      TMPDIR: dir,
      GH_LOG: log,
      GH_LIST_ISSUES: openIssues.join("\n"),
      GH_TOKEN: "test-token",
      REPO: "richardparslow-commits/HealthClassEstimator",
      OWNER: "richardparslow-commits",
      RUN_URL: "https://github.com/richardparslow-commits/HealthClassEstimator/actions/runs/9",
      HEAD_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      EVENT: event,
      RESULT: result,
      OUTCOME: outcome,
      STATE: state,
      PROBLEMS: problems,
    },
  });
  const calls = parseCalls(fs.readFileSync(log, "utf8"));
  // The body file the step writes for `gh issue create` is read before the run directory
  // goes away: the file's contents are what a person reads, and the argument only names
  // it. A step that passed the body inline would have no file to capture, which the
  // assertions treat as a failure rather than as nothing to check.
  const bodies = calls
    .map((args) => argOf(args, "--body-file"))
    .filter(Boolean)
    .map((file) => ({ file, text: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null }));
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: run.status, out: run.stdout, err: run.stderr, calls, bodies };
}

const subcommands = (calls) => calls.map((args) => args.slice(0, 2).join(" "));

// Every variable the step passes has an observable effect in the issue or the comment,
// except the ones the shell uses (`REPO`, `GH_TOKEN`, `OUTCOME`'s sibling `RESULT` served
// by the state rule). Asserting them through the output is what makes the interface
// proven rather than listed: a step that stopped passing HEAD_SHA would still call `gh`
// correctly and produce an issue with no commit in it.
function names(text, ...needles) {
  for (const needle of needles) ok(text.includes(needle), "the text names " + JSON.stringify(needle) + ": " + text.slice(0, 120));
}
const argOf = (call, flag) => {
  const at = call.indexOf(flag);
  return at < 0 ? null : call[at + 1];
};
const declaredUrl = JSON.parse(fs.readFileSync(path.join(root, "consumers", "streamlit.json"), "utf8")).deployedUrl;
const PROBLEM = 'the frame runs release "80", this repository is release "82" — the deployment is serving a different build';

/* --- the cases ------------------------------------------------------------- */

// The extraction is the harness: assert it found a step that does the work, so a renamed
// step or a changed workflow cannot make this suite pass by executing nothing.
ok(alert.script.length > 400, "the alert step was found and has a shell to run");
ok(alert.script.includes("gh issue create"), "the step it extracted is the one that opens the issue");
ok(alert.script.includes("deployed-app-alert.js --state"), "and the one that asks the script for the verdict");
ok(alert.script.includes("set -euo pipefail"), "the step still fails on an unset variable (set -u) and on a broken pipe");
// Comments are stripped first: the step explains this bug in a comment that quotes the
// pipeline, and the check is about the shell, not the prose.
const executable = alert.script.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
ok(!/\|\s*head\b/.test(executable), "and does not pipe into head, which dies of SIGPIPE under pipefail (the 2026-10-17 alert bug)");
// The interface, read from the code rather than remembered. A hand-written list of
// variables is the same mistake one level up: it says what this file believes the script
// needs, so a new read added to the script — `env("TIER")` for a tiered message, say —
// would leave the workflow feeding it nothing and this suite green. The set below is
// every name the script reads, and the step has to pass all of them.
const scriptSource = fs.readFileSync(path.join(root, "scripts", "deployed-app-alert.js"), "utf8");
const reads = [
  ...scriptSource.matchAll(/\benv\(\s*"([A-Z0-9_]+)"/g),
  ...scriptSource.matchAll(/\bprocess\.env\.([A-Z0-9_]+)/g),
].map((match) => match[1]);
ok(new Set(reads).size >= 8, "the script's environment reads were found: " + new Set(reads).size);
const passed = Object.keys(alert.env);
const missing = [...new Set(reads)].filter((name) => !passed.includes(name)).sort();

// `REPORT_FILE` is read by `--outputs`, which the deployed job runs to reduce the
// check's report before this job — not by any mode the alert step calls. That is a claim
// about the code, so it is exercised rather than asserted: `--outputs` with a report
// named reads it, and the state it prints is the report's.
const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "alert-step-report-"));
const reportFile = path.join(reportDir, "deployed.json");
fs.writeFileSync(
  reportFile,
  JSON.stringify({ ok: false, lines: ["State  : asleep on arrival — woken by this check in 900 ms"], problems: ["a problem"] }),
);
const reduced = spawnSync(process.execPath, ["scripts/deployed-app-alert.js", "--outputs"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, REPORT_FILE: reportFile },
});
ok(reduced.status === 0 && /state=asleep on arrival/.test(reduced.stdout), "--outputs is the mode that reads REPORT_FILE: " + reduced.stderr);
const withoutReport = spawnSync(process.execPath, ["scripts/deployed-app-alert.js", "--outputs"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, REPORT_FILE: "" },
});
ok(/outcome=unknown/.test(withoutReport.stdout), "and an unnamed report is not read as agreement");
fs.rmSync(reportDir, { recursive: true, force: true });
equal(missing, ["REPORT_FILE"], "every other variable the script reads is passed by the step — a new one is reported by name here");

// The other direction: a variable the step passes that neither the script reads nor the
// shell expands is dead weight that reads as configuration — a rename that half-happened.
// GH_TOKEN is the one the step passes for `gh` itself, not for the script.
for (const key of passed) {
  if (key === "GH_TOKEN") continue;
  ok(
    reads.includes(key) || alert.script.includes("$" + key) || alert.script.includes("${" + key + "}"),
    "the step's " + key + " is read by the script or expanded by the step's shell",
  );
}

// And the values, which the harness cannot infer because it supplies its own: the four
// outputs the issue quotes have to come from the check's report. A copy-paste that wired
// STATE to `outputs.outcome` would pass every assertion below this line without it.
for (const [key, expression] of [
  ["RESULT", "${{ needs.deployed.result }}"],
  ["OUTCOME", "${{ needs.deployed.outputs.outcome }}"],
  ["STATE", "${{ needs.deployed.outputs.state }}"],
  ["PROBLEMS", "${{ needs.deployed.outputs.problems }}"],
])
  equal(alert.env[key], expression, "the step reads " + key + " from the thing that produces it");

// Red, nothing open: one issue, labelled, whose body names the app and the problem the
// check reported — the shape that is about to happen, because the deployed app is red.
const created = drive({ result: "failure", outcome: "fail", state: "awake on arrival", problems: PROBLEM });
equal(created.status, 0, "a red run with no open issue succeeds: " + created.err);
equal(subcommands(created.calls), ["label create", "issue list", "issue create"], "and labels, looks, then creates exactly one issue");
const create = created.calls[2];
equal(argOf(create, "--label"), "deployed-app-drift", "the issue carries the label the next run looks for");
equal(argOf(create, "--title"), "Deployed app: a browser does not get this release", "and the title that says what is wrong");
const bodyFile = argOf(create, "--body-file");
ok(bodyFile && !create.includes("--body"), "the body arrives as a file, not an argument that a newline could truncate");
const body = created.bodies[0] ? created.bodies[0].text : null;
ok(body && body.length > 200, "and the file it names has the issue body in it");
ok(body && body.includes(declaredUrl), "which names the app the check loaded: " + declaredUrl);
ok(body && body.includes('release "80"'), "and quotes the problem the check reported");
// OWNER, RUN_URL, HEAD_SHA, EVENT and STATE, each seen where a reader sees it.
if (body)
  names(body, "@richardparslow-commits", "- Run: https://github.com/richardparslow-commits/HealthClassEstimator/actions/runs/9", "- Commit checked: 37d743e", "- Trigger: schedule", "- App state: awake on arrival");
else ok(false, "the issue body was captured");
ok(created.out.includes("Deployed app: failing"), "and the run says what it judged: " + created.out.trim());

// Red, an issue already open: comment on it, never file a second one.
const commented = drive({ result: "failure", outcome: "fail", state: "awake on arrival", problems: PROBLEM, openIssues: [7] });
equal(commented.status, 0, "a red run with an open issue succeeds: " + commented.err);
equal(subcommands(commented.calls), ["label create", "issue list", "issue comment"], "and comments instead of creating");
equal(commented.calls[2][2], "7", "on the issue that is open");
ok(commented.calls[2].join("\n").includes("awake on arrival"), "quoting the state the check saw: " + commented.calls[2].join(" ").slice(0, 300));

// Two open issues (an old duplicate): the failing run reports on the first and files no
// third, so a duplicate cannot multiply on every six-hourly run.
const twoOpen = drive({ result: "failure", outcome: "fail", state: "awake on arrival", problems: PROBLEM, openIssues: [7, 9] });
equal(subcommands(twoOpen.calls), ["label create", "issue list", "issue comment"], "two open issues still produce one comment");
equal(twoOpen.calls[2][2], "7", "on the oldest, not both");

// Green with issues open: comment on and close every one, because a closed issue that
// still carries the label would be reopened as a new one on the next red run.
const closed = drive({ result: "success", outcome: "pass", state: "awake on arrival", openIssues: [7, 9] });
equal(closed.status, 0, "a green run with open issues succeeds: " + closed.err);
equal(subcommands(closed.calls), ["label create", "issue list", "issue comment", "issue close", "issue comment", "issue close"], "and comments on and closes each of them");
equal(closed.calls.filter((call) => call.slice(0, 2).join(" ") === "issue close").map((call) => call[2]), ["7", "9"], "closing both issues, not only the first");
ok(closed.calls.filter((call) => call.slice(0, 2).join(" ") === "issue comment").every((call) => call.join("\n").includes("Closing")),
   "each closing comment says it is closing");

// Green with nothing open: no issue traffic at all. The label is still ensured, which is
// idempotent and keeps the next red run's `issue list` working.
const quiet = drive({ result: "success", outcome: "pass", state: "awake on arrival" });
equal(quiet.status, 0, "a green run with nothing open succeeds");
equal(subcommands(quiet.calls), ["label create", "issue list"], "and neither creates, comments nor closes anything");

// A run that never looked — cancelled, skipped, or failed after the check passed — says
// so and touches nothing: "not published yet" and "the run was cancelled" have different
// fixes, and inventing an issue for either sends someone after the wrong one.
for (const result of ["cancelled", "skipped"]) {
  const untouched = drive({ result, openIssues: [7] });
  equal(untouched.status, 0, "a " + result + " run succeeds and reports nothing");
  equal(untouched.calls, [], "a " + result + " run makes no gh calls at all");
  ok(/left as it is/.test(untouched.out), "and says the issue was left alone: " + untouched.out.trim());
}

// The job's own failure with no report: the step still opens an issue, and the body must
// say the app was not judged rather than claiming it is broken.
const unjudged = drive({ result: "failure", outcome: "unknown", state: "", problems: "" });
equal(subcommands(unjudged.calls), ["label create", "issue list", "issue create"], "a failed job that judged nothing still opens one issue");
const unjudgedBody = unjudged.bodies[0] ? unjudged.bodies[0].text : "";
ok(/did not judge the app|without a verdict/.test(unjudgedBody), "and its body says the app was not judged: " + unjudgedBody.slice(0, 160));
ok(!/does not get this repository's release/.test(unjudgedBody), "without claiming the app is broken");

// OUTCOME, the fourth output: a job that failed after the check passed says exactly that
// and asks for no republish, which is a different issue from a red app.
const passedJobFailed = drive({ result: "failure", outcome: "pass", state: "awake on arrival", problems: "" });
const passedBody = passedJobFailed.bodies[0] ? passedJobFailed.bodies[0].text : "";
ok(/passed, but the job itself failed/.test(passedBody), "a check that passed inside a failed job says so: " + passedBody.slice(0, 160));
ok(/Nothing has to be republished/.test(passedBody), "and does not send anyone to republish");

console.log("Passed " + checks + " alert-step assertions.");
