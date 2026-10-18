"use strict";
/* The daily publish-credential check, and the issue it files.

   The release refuses in seconds when its credential is missing or refused (see
   `test/publish-preflight.test.js`), which closes the case where a release is what finds
   out. It does not close the other one: a key revoked, rotated or replaced with a
   read-only one between releases is invisible until a release needs it, and that can be a
   quiet stretch. `.github/workflows/streamlit-credential.yml` asks the same question every
   day on the same script — `scripts/verify-push-credential.sh` — and keeps one labelled
   issue open while the answer is no.

   Two things can be wrong here and only one of them is visible in a YAML diff: whether the
   check asks the right question, and whether the issue that tells somebody about it is
   ever opened. So this suite runs both — the script against a real bare repository and
   against a `git` that answers the way GitHub does, and the alert step's shell against a
   `gh` that records every call — and holds the decision and the prose to the refusals they
   exist for. Needs no network and no Chromium: bash, node, git and this repository.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readStep } = require("../scripts/workflow-step.js");
const alert = require("../scripts/credential-alert.js");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, ".github/workflows/streamlit-credential.yml");
const checkScript = path.join(root, "scripts", "verify-push-credential.sh");
const DEPLOYED_REPO = "richardparslow-commits/health_app.py";
let checks = 0;
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

/* --- the decision --------------------------------------------------------- */

// The job's result and the check's verdict are different facts, and the issue exists to
// report the second. A job that passed while the check said no is a wiring fault; hiding
// it would make the one useless outcome silent.
equal(alert.stateOf("success", true), "passing", "a green job whose check passed is passing");
equal(alert.stateOf("success", false), "failing", "a green job whose check still refused is reported, not swallowed");
equal(alert.stateOf("failure"), "failing", "a red job is failing");
equal(alert.stateOf("timed_out"), "failing", "and so is one that timed out");
equal(alert.stateOf("cancelled"), "unknown", "a cancelled run asked nothing, so it reports nothing");
equal(alert.stateOf("skipped"), "unknown", "and neither does a skipped one");
equal(alert.stateOf(""), "unknown", "nor a run with no result at all");

/* --- the text ------------------------------------------------------------- */

const base = {
  owner: "richardparslow-commits",
  repo: DEPLOYED_REPO,
  runUrl: "https://github.com/example/actions/runs/1",
  commit: "b776490",
  event: "schedule",
  result: "failure",
};

const readOnly = alert.buildBody({
  ...base,
  ok: false,
  code: "read-only",
  detail: "is marked read-only on that repository, so it can read the deployed copy and never update it",
  error: "ERROR: The key you are authenticating with has been marked as read only.",
});
ok(/the daily credential check could not push to richardparslow-commits\/health_app\.py/.test(readOnly), "the body names the repository that cannot be pushed to");
ok(/is marked read-only on that repository/.test(readOnly), "and quotes the refusal the check reported, not just that the run was red: " + readOnly.slice(0, 200));
ok(/ERROR: The key you are authenticating with has been marked as read only\./.test(readOnly), "including GitHub's own line");
ok(/--dry-run/.test(readOnly), "it says the check pushes nothing, so a red run cannot mean something was published");
ok(/deploy-streamlit\.yml` refuses before it builds/.test(readOnly), "and what the release does with the same answer");
ok(/gh repo deploy-key add <key>\.pub -R richardparslow-commits\/health_app\.py --allow-write/.test(readOnly), "the fix names the command that adds a read/write key");
ok(/gh repo deploy-key list -R richardparslow-commits\/health_app\.py/.test(readOnly), "and the one that says whether the current key is still there and still read/write");
ok(/STREAMLIT_DEPLOY_KEY/.test(readOnly) && /STREAMLIT_PUSH_TOKEN/.test(readOnly), "naming both ways to give it one");
ok(/closes on the first run of the check that passes/.test(readOnly), "and that it closes itself");

const noVerdict = alert.buildBody({ ...base, ok: null, code: "", detail: "", error: "", result: "cancelled" });
ok(/ended without a verdict/.test(noVerdict), "a run that asked nothing says so");
ok(!/could not push to/.test(noVerdict), "instead of claiming the credential is broken: " + noVerdict.slice(0, 160));
ok(/Nothing was asked, so nothing was learned/.test(noVerdict), "and says what that means");

const wiring = alert.buildBody({ ...base, ok: false, code: "refused", detail: "was refused by the server", error: "", result: "success" });
ok(/wiring fault in the workflow as much as a credential one/.test(wiring), "a green job with a refused check is reported as both");

const missing = alert.buildBody({
  ...base,
  ok: false,
  code: "missing",
  detail: "is not configured: neither STREAMLIT_DEPLOY_KEY nor STREAMLIT_PUSH_TOKEN is set",
  error: "no credential is configured at all",
});
ok(/is not configured: neither STREAMLIT_DEPLOY_KEY nor STREAMLIT_PUSH_TOKEN is set/.test(missing), "no credential at all is reported as its own refusal, because its fix is not a rotation");

const comment = alert.buildComment({ ...base, ok: false, detail: "is marked read-only on that repository", error: "" });
ok(/still failing/.test(comment), "a second red run comments rather than opening another issue");
ok(/runs\/1/.test(comment) && /read-only/.test(comment), "and says which run and what it found");

const closed = alert.buildClosedComment({ ...base, ok: true, detail: `can push to ${DEPLOYED_REPO}`, result: "success" });
ok(/Passing again/.test(closed) && /can push to richardparslow-commits\/health_app\.py again/.test(closed), "the close names the fact that changed");

/* --- the outputs the alert job consumes ----------------------------------- */

{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "credential-outputs-"));
  const report = path.join(dir, "credential.json");
  fs.writeFileSync(
    report,
    JSON.stringify({
      ok: false,
      code: "read-only",
      detail: "is marked read-only on that repository",
      error: "ERROR: The key you are authenticating with has been marked as read only.\nrefusing",
    }) + "\n",
  );
  const run = spawnSync(process.execPath, [path.join(root, "scripts/credential-alert.js"), "--outputs"], {
    encoding: "utf8",
    env: { ...process.env, REPORT_FILE: report, RESULT: "failure" },
  });
  equal(run.status, 0, "the outputs mode succeeds: " + run.stderr);
  ok(/^code=read-only$/m.test(run.stdout), "the refusal code is passed as a job output");
  ok(/^detail=is marked read-only on that repository$/m.test(run.stdout), "with the sentence the issue reads");
  ok(/^error<<__ERROR__$/m.test(run.stdout) && /\n__ERROR__$/m.test(run.stdout.trimEnd()), "and a multi-line value uses the delimiter form GitHub requires");

  const state = spawnSync(process.execPath, [path.join(root, "scripts/credential-alert.js"), "--state"], {
    encoding: "utf8",
    env: { ...process.env, REPORT_FILE: report, RESULT: "success" },
  });
  equal(state.stdout.trim(), "failing", "a job that passed while the report says the credential cannot push is failing");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* --- the check script, run for real --------------------------------------- */

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });
function mustGit(args, cwd) {
  const run = git(args, cwd);
  if (run.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + run.stderr);
  return run.stdout.trim();
}

// A bare repository playing the deployed one, and a checkout to push from. Both remote
// forms the script can build are rewritten to it, so nothing reaches the network and a
// success is a real `git push --dry-run` against a real remote.
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "credential-check-"));
  const bare = path.join(dir, "deployed.git");
  const seed = path.join(dir, "seed");
  mustGit(["init", "-b", "main", "--bare", bare], dir);
  mustGit(["clone", "--quiet", bare, seed], dir);
  fs.writeFileSync(path.join(seed, "README.md"), "# deployed\n");
  mustGit(["add", "-A"], seed);
  mustGit(["-c", "user.name=seed", "-c", "user.email=seed@example.invalid", "commit", "-m", "initial"], seed);
  mustGit(["push", "origin", "main"], seed);
  const gitconfig = path.join(dir, "gitconfig");
  fs.writeFileSync(
    gitconfig,
    '[url "file://' + bare + '"]\n' +
      "\tinsteadOf = git@github.com:" + DEPLOYED_REPO + ".git\n" +
      "\tinsteadOf = https://github.com/" + DEPLOYED_REPO + ".git\n",
  );
  const report = path.join(dir, "credential.json");
  return { dir, bare, gitconfig, report, from: seed };
}

// The checkout the dry-run push starts from: a real clone with a HEAD, which is what the
// workflow's `actions/checkout` provides (it passes `.`, this fixture passes the clone).
function runCheck(fx, { env = {}, args = [fx.from] } = {}) {
  const run = spawnSync("bash", [checkScript, ...args], {
    cwd: fx.dir,
    encoding: "utf8",
    env: {
      ...process.env,
      DEPLOYED_REPO,
      STREAMLIT_DEPLOY_KEY: "",
      STREAMLIT_PUSH_TOKEN: "",
      RUNNER_TEMP: fx.dir,
      GIT_CONFIG_GLOBAL: fx.gitconfig,
      GIT_CONFIG_NOSYSTEM: "1",
      CREDENTIAL_JSON: fx.report,
      ...env,
    },
  });
  const report = fs.existsSync(fx.report) ? JSON.parse(fs.readFileSync(fx.report, "utf8")) : null;
  return { ...run, report };
}

{
  const fx = fixture();
  const before = mustGit(["for-each-ref", "--format=%(refname)"], fx.bare);
  const passed = runCheck(fx, { env: { STREAMLIT_DEPLOY_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----\nfixture\n-----END OPENSSH PRIVATE KEY-----" } });
  equal(passed.status, 0, "a credential the remote accepts passes: " + passed.stderr);
  ok(/authorised a dry-run push and received nothing/.test(passed.stdout), "and says what the server did");
  equal(passed.report && passed.report.ok, true, "the machine-readable verdict says so too");
  equal(mustGit(["for-each-ref", "--format=%(refname)"], fx.bare), before, "and no ref was created: a green check cannot have published anything");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  const fx = fixture();
  const none = runCheck(fx);
  equal(none.status, 1, "no credential at all fails the check");
  ok(/::error::The push credential is not configured/.test(none.stdout), "with an error that says so: " + none.stdout.trim());
  equal(none.report && none.report.code, "missing", "the report carries its own code, so the issue can name the fix that is not a rotation");
  ok(/no credential is configured at all/.test(none.report.error), "and the reason there was no server answer");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

// A refusal answers like GitHub's receive-pack: a read-only key is a server answer no
// local remote can produce, so the shim produces it, and records its argv so the dry run
// is a fact about the call rather than about the script's text.
{
  const fx = fixture();
  const bin = path.join(fx.dir, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(
    path.join(bin, "git"),
    "#!/bin/sh\n" +
      'printf "%s\\n" "$@" > "' + path.join(fx.dir, "git-argv.txt") + '"\n' +
      "printf '%s\\n' 'ERROR: The key you are authenticating with has been marked as read only.' >&2\n" +
      "printf '%s\\n' 'fatal: Could not read from remote repository.' >&2\n" +
      "exit 128\n",
    { mode: 0o755 },
  );
  const refused = runCheck(fx, { env: { STREAMLIT_DEPLOY_KEY: "KEY", PATH: bin + path.delimiter + process.env.PATH } });
  equal(refused.status, 1, "a read-only key fails the check");
  ok(/marked read-only on that repository/.test(refused.stdout), "naming the refusal for what it is");
  equal(refused.report && refused.report.code, "read-only", "the report's code is the one the issue is filed on");
  ok(/^ERROR: The key you are authenticating with has been marked as read only\.$/m.test(refused.report.error), "with GitHub's line, and not the git summary around it: " + JSON.stringify(refused.report.error));
  const argv = fs.readFileSync(path.join(fx.dir, "git-argv.txt"), "utf8");
  ok(/^--dry-run$/m.test(argv), "the check asked for a dry run");
  ok(/^HEAD:refs\/heads\/preflight-credential-check$/m.test(argv), "of a scratch ref");
  ok(!refused.stdout.includes("KEY\n"), "and the credential is not printed");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

// A check that cannot run must not report a pass.
{
  const fx = fixture();
  const noRepo = runCheck(fx, { env: { DEPLOYED_REPO: "", STREAMLIT_DEPLOY_KEY: "KEY" } });
  equal(noRepo.status, 2, "no deployed repository named is a usage error, not a pass");
  ok(/DEPLOYED_REPO is not set/.test(noRepo.stderr), "saying which variable is missing");
  const noDir = runCheck(fx, { args: [path.join(fx.dir, "nowhere")], env: { STREAMLIT_DEPLOY_KEY: "KEY" } });
  equal(noDir.status, 2, "a missing checkout to push from is a usage error");
  ok(/no repository at .*nowhere/.test(noDir.stderr), "naming it");
  const extra = runCheck(fx, { args: [fx.from, "and-more"], env: { STREAMLIT_DEPLOY_KEY: "KEY" } });
  equal(extra.status, 2, "extra arguments are refused rather than ignored");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the alert step, executed --------------------------------------------- */

const step = readStep(workflowPath, "alert", "Open, update or close the tracking issue");

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

function drive({ result, openIssues = [], code = "", detail = "", error = "" }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "credential-alert-step-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"), GH, { mode: 0o755 });
  const log = path.join(dir, "gh.log");
  fs.writeFileSync(log, "");
  const run = spawnSync("bash", ["-c", step.script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: bin + path.delimiter + (process.env.PATH || ""),
      TMPDIR: dir,
      GH_LOG: log,
      GH_LIST_ISSUES: openIssues.join("\n"),
      GH_TOKEN: "test-token",
      REPO: "richardparslow-commits/HealthClassEstimator",
      OWNER: "richardparslow-commits",
      RUN_URL: "https://github.com/example/actions/runs/1",
      HEAD_SHA: "b7764906c78da306248e7faffd21f669c26d669c",
      EVENT: "schedule",
      DEPLOYED_REPO,
      RESULT: result,
      CODE: code,
      DETAIL: detail,
      ERROR: error,
      REPORT_FILE: "",
    },
  });
  return { run, calls: parseCalls(fs.readFileSync(log, "utf8")), dir };
}

function finding(calls, verb) {
  return calls.filter((call) => call[0] + " " + call[1] === verb);
}

{
  const { run, calls, dir } = drive({
    result: "failure",
    code: "read-only",
    detail: "is marked read-only on that repository, so it can read the deployed copy and never update it",
    error: "ERROR: The key you are authenticating with has been marked as read only.",
  });
  equal(run.status, 0, "a red check opens an issue: " + run.stderr);
  const created = finding(calls, "issue create");
  equal(created.length, 1, "exactly one issue is created");
  const args = created[0];
  ok(args.includes("publish-credential"), "under the label the workflow keeps");
  const title = args[args.indexOf("--title") + 1];
  equal(title, "Publish credential: the release cannot push", "with the title a person scans for");
  ok(args.includes("--body-file"), "and a body written to a file rather than passed as an argument");
  ok(
    finding(calls, "label create").some((call) => call.includes("publish-credential")),
    "the label exists before the issue is filed",
  );
  ok(!finding(calls, "issue close").length, "nothing is closed on a red run");
  ok(!finding(calls, "issue comment").length, "and nothing is commented on: there was no issue to comment on");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const { run, calls, dir } = drive({ result: "failure", openIssues: [7] });
  equal(run.status, 0, "a red check with an issue already open succeeds: " + run.stderr);
  equal(finding(calls, "issue create").length, 0, "no second issue is filed");
  const comments = finding(calls, "issue comment");
  equal(comments.length, 1, "the open one is commented on");
  ok(comments[0].includes("7"), "the issue it was told about");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const { run, calls, dir } = drive({
    result: "success",
    openIssues: [7, 9],
    detail: `can push to ${DEPLOYED_REPO}`,
  });
  equal(run.status, 0, "a green check succeeds: " + run.stderr);
  equal(finding(calls, "issue create").length, 0, "and files nothing");
  const closed = finding(calls, "issue close");
  equal(closed.length, 2, "every open issue under the label is closed, not just the first");
  ok(closed.some((call) => call.includes("7")) && closed.some((call) => call.includes("9")), "the ones that were open");
  ok(finding(calls, "issue comment").length >= 2, "each with a comment saying why");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const { run, calls, dir } = drive({ result: "success" });
  equal(run.status, 0, "a green check with nothing open succeeds: " + run.stderr);
  equal(
    calls.map((call) => call[0] + " " + call[1]).sort().join(", "),
    "issue list, label create",
    "and touches no issue: it creates the label and looks for an open one, nothing else: " + JSON.stringify(calls),
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const { run, calls, dir } = drive({ result: "cancelled" });
  equal(run.status, 0, "a cancelled run succeeds and changes nothing: " + run.stderr);
  equal(calls.length, 0, "making no gh calls at all: the run never asked, so it cannot report: " + JSON.stringify(calls));
  fs.rmSync(dir, { recursive: true, force: true });
}

/* --- the workflow that runs them ----------------------------------------- */

const workflow = fs.readFileSync(workflowPath, "utf8");

// The check is the same script the release runs. A second implementation is how the two
// would come to disagree about what a read-only key means, and the release's own gate is
// the one that has to hold.
ok(/bash scripts\/verify-push-credential\.sh \./.test(workflow), "the check runs the script the release runs, from this checkout");
ok(
  /bash scripts\/verify-push-credential\.sh streamlit-app/.test(fs.readFileSync(path.join(root, ".github/workflows/deploy-streamlit.yml"), "utf8")),
  "and the release's preflight is that same script",
);
ok(/CREDENTIAL_JSON: credential\.json/.test(workflow), "the check asks for the machine-readable verdict");
ok(/if: \$\{\{ always\(\) \}\}/.test(workflow), "the report and the summary run even when the check failed");
ok(/issues: write/.test(workflow), "the alert job may write issues");
ok(/needs: \[credential\]/.test(workflow), "the alert reports on the check's result");
ok(/^\s+- cron: "40 9 \* \* \*"$/m.test(workflow), "the check runs daily");
ok(/^\s+workflow_dispatch:$/m.test(workflow), "and can be asked for by hand");

// One schedule per minute of the day: two workflows that fire at the same moment queue
// behind one another, and the parity workflow's comment already counted on the others
// being clear of it.
{
  const crons = [];
  for (const file of fs.readdirSync(path.join(root, ".github/workflows"))) {
    const text = fs.readFileSync(path.join(root, ".github/workflows", file), "utf8");
    for (const match of text.matchAll(/cron:\s*"([^"]+)"/g)) crons.push({ file, cron: match[1] });
  }
  const mine = crons.filter((entry) => entry.file === "streamlit-credential.yml");
  equal(mine.length, 1, "this workflow declares exactly one schedule");
  const clashes = crons.filter(
    (entry) => entry.file !== "streamlit-credential.yml" && entry.cron.split(" ").slice(1).join(" ") === mine[0].cron.split(" ").slice(1).join(" "),
  );
  equal(clashes.map((entry) => entry.file), [], "and its minute and hour are clear of every other schedule");
  ok(mine[0].cron.split(" ")[1] !== "0", "off the hour, so it does not queue behind everything else");
}

/* --- the alert's own words, in the issue it files ------------------------- */

{
  // The body a real refusal produces, over the whole path the issue travels: the report
  // file the check writes, the outputs the job reduces it to, and the text the step files.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "credential-body-"));
  const report = path.join(dir, "credential.json");
  fs.writeFileSync(
    report,
    JSON.stringify({ ok: false, code: "not-a-key", detail: "is not a usable private key, so the secret's value looks pasted incompletely", error: "Load key: invalid format" }) + "\n",
  );
  const outputs = spawnSync(process.execPath, [path.join(root, "scripts/credential-alert.js"), "--outputs"], {
    encoding: "utf8",
    env: { ...process.env, REPORT_FILE: report, RESULT: "failure" },
  }).stdout;
  const value = (name) => {
    const line = outputs.split("\n").find((entry) => entry.startsWith(name + "="));
    return line ? line.slice(name.length + 1) : "";
  };
  const text = alert.buildBody({
    ...base,
    ok: false,
    code: value("code"),
    detail: value("detail"),
    error: value("error"),
  });
  ok(/not a usable private key/.test(text), "a value that is not a key is reported as that, which is a paste problem rather than a revocation");
  ok(/Load key: invalid format/.test(text), "with the server's line");
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log("Passed " + checks + " credential-health assertions.");
