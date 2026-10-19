"use strict";
/* Fixtures for scripts/deployed-app-alert.js.

   The deployed-app issue is the only thing a person sees when the six-hourly browser
   check goes red, so it has to carry the check's own verdict: whether the app was
   asleep or awake, and what a visitor actually got. It must also distinguish a red run
   that judged the app from one that never looked — a browser that would not install is
   not a sleeping app, and a notification that says so sends someone to the wrong fix.

   The two verdicts below are real ones, produced by scripts/verify-streamlit-deployed.mjs
   against the live app on 2026-10-17: the pass with `--expect-version 80` (what the
   deployment served), the fail with the repository's release 81.
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const alert = path.join(root, "scripts/deployed-app-alert.js");
const { buildBody, buildComment, buildClosedComment, outputs, readReport, stateOf } = require(alert);

let checks = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks++;
}
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}

const APP_URL = "https://life-insurance-health-class-predictor.streamlit.app/";
const RUN = "https://github.com/richardparslow-commits/HealthClassEstimator/actions/runs/9";
const HEAD = "0123456789abcdef0123456789abcdef01234567";

const PASSED = {
  ok: true,
  problems: [],
  lines: [
    "State  : awake on arrival",
    "URL    : " + APP_URL,
    'Frame  : 247858 bytes at about:srcdoc (the wrapper\'s frame), release "80", acknowledgment gate and product select present',
  ],
};

const FAILED = {
  ok: false,
  problems: [
    'the frame runs release "80", this repository is release "81" — the deployment is serving a different build',
  ],
  lines: PASSED.lines,
};

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "deployed-app-alert-"));
process.on("exit", () => fs.rmSync(scratch, { recursive: true, force: true }));

function reportFile(payload, name) {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, typeof payload === "string" ? payload : JSON.stringify(payload, null, 2) + "\n");
  return file;
}

function context(overrides = {}) {
  return {
    owner: "richardparslow-commits",
    runUrl: RUN,
    commit: "0123456",
    event: "schedule",
    result: "failure",
    outcome: "fail",
    state: "awake on arrival",
    problems: FAILED.problems,
    appUrl: APP_URL,
    ...overrides,
  };
}

function runCli(args, env) {
  try {
    return {
      status: 0,
      out: execFileSync(process.execPath, [alert, ...args], {
        encoding: "utf8",
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (error) {
    return { status: error.status ?? 1, out: String(error.stdout || ""), err: String(error.stderr || "") };
  }
}

// 1. The three states. A cancelled or skipped run never looked at the app, so it must
//    not open an issue about what it saw or close one about what it did not.
equal(stateOf("success"), "passing", "a green job passes");
for (const result of ["failure", "timed_out", "action_required"])
  equal(stateOf(result), "failing", "a red job (" + result + ") is failing");
for (const result of ["cancelled", "skipped", "", undefined])
  equal(stateOf(result), "unknown", "a run that never finished (" + JSON.stringify(result) + ") is unknown");

// 2. The check's report is the verdict, read as JSON rather than parsed from prose.
const pass = readReport(reportFile(PASSED, "pass.json"));
equal(pass.outcome, "pass", "a passing report is a pass");
equal(pass.state, "awake on arrival", "the state line is reduced to the state");
equal(pass.problems.length, 0, "a passing report has no problems");

const fail = readReport(reportFile(FAILED, "fail.json"));
equal(fail.outcome, "fail", "a failing report is a failure");
equal(fail.state, "awake on arrival", "and still carries the state it observed");
equal(fail.problems.length, 1, "and the problem it found");
ok(/the frame runs release "80", this repository is release "81"/.test(fail.problems[0]), "naming both releases");

// 3. A report that is absent, malformed, or not a verdict is "unknown" with a reason —
//    never an empty list of problems, which would read as agreement.
const absent = readReport(path.join(scratch, "nothing.json"));
equal(absent.outcome, "unknown", "a missing report is unknown");
ok(/no report/.test(absent.reason), "and says no report was written");
const notJson = readReport(reportFile("streamlit-deployed: boom", "broken.json"));
equal(notJson.outcome, "unknown", "a report that is not JSON is unknown");
ok(/not JSON/.test(notJson.reason), "and says so");
const notVerdict = readReport(reportFile({ problems: [] }, "shape.json"));
equal(notVerdict.outcome, "unknown", "JSON without a verdict is unknown");
ok(/not a verdict/.test(notVerdict.reason), "and says what it is not");

// 4. The job outputs the alert reads: single lines where they can be, a delimiter form
//    where a value has newlines (more than one problem), and a delimiter that cannot
//    occur inside the value.
const passOut = outputs(pass);
equal(passOut, "outcome=pass\nstate=awake on arrival\nproblems=", "a passing report is three plain lines");
const twoProblems = { ...FAILED, problems: [FAILED.problems[0], "no estimator frame after 6000 ms"] };
const multi = outputs({ outcome: "fail", state: "awake on arrival", problems: twoProblems.problems });
ok(/^problems<<__PROBLEMS__$/m.test(multi), "several problems use the delimiter form");
ok(/__PROBLEMS__\nthe frame runs release/.test(multi), "and are written one per line");
equal((multi.match(/__PROBLEMS__/g) || []).length, 2, "the opening and closing delimiters are both written");
const collides = outputs({
  outcome: "fail",
  state: "",
  problems: ["a line containing __PROBLEMS__", "another"],
});
ok(!/^problems<<__PROBLEMS__$/m.test(collides), "a delimiter that occurs in the value is not used");
ok(/^problems<<__PROBLEMS___$/m.test(collides), "the next free delimiter is chosen instead");

// 5. The issue body. It names the app from the declaration, the run, the commit, the
//    trigger, the state and every finding — and it says both ways out.
const declaration = JSON.parse(fs.readFileSync(path.join(root, "consumers", "streamlit.json"), "utf8"));
const body = buildBody(context());
ok(body.startsWith("@richardparslow-commits — "), "the body addresses the owner");
ok(body.includes("- App: " + declaration.deployedUrl), "the app is the one the declaration names, not a typed URL");
ok(body.includes("- Run: " + RUN), "the run is linked");
ok(body.includes("- Commit checked: 0123456"), "the short commit is named");
ok(body.includes("- Trigger: schedule"), "the trigger is named");
ok(body.includes("- Job result: failure"), "the job result is named");
ok(body.includes("- App state: awake on arrival"), "the state the check saw is named");
ok(body.includes('  - the frame runs release "80", this repository is release "81"'), "the finding is quoted, not summarised");
ok(/six-hourly check loaded the deployed app in a browser/.test(body), "the body says what was done");
ok(/a visitor is not getting the tool, is getting a different build, or has no visible way forward/.test(body), "and what it means");
ok(/A sleep screen is not this failure/.test(body), "the sleeping case is distinguished from this one");
ok(/Wake it in the Streamlit Cloud dashboard/.test(body), "the sleeping fix is given");
ok(/`app_embedded\.html` and `app_embedded\.manifest\.json` are copied and committed/.test(body), "the republish is described while the token is unset");
ok(/Never edit a deployed copy to match/.test(body), "and editing a copy is forbidden");
ok(/height=2400/.test(body), "a below-the-fold finding names the embedder's frame height as the fix");
ok(/closes automatically/.test(body), "the issue says how it closes");

// 6. A red job that never judged the app is not a claim about the app. This is the
//    difference between a sleeping deployment and a browser that would not install.
const unjudged = buildBody(context({ outcome: "unknown", problems: [], state: "" }));
ok(/ended without a verdict/.test(unjudged), "an unjudged run says there was no verdict");
ok(/not evidence that the app is broken or behind/.test(unjudged), "and refuses to claim the app is wrong");
ok(/read the run's log/.test(unjudged), "and sends the reader to what stopped the check");
ok(/Nothing has to be republished/.test(unjudged), "and says not to republish on this evidence");
ok(!/Finding\(s\)/.test(unjudged), "it lists no findings it did not find");
ok(unjudged.includes("- App: " + declaration.deployedUrl), "it still names the app the check is about");

// 6b. A passing verdict in a red job is neither of those: the check judged the app and
//     it was fine, and something after it ended the job. Saying "the app is wrong" or
//     "nothing was judged" would both be untrue.
const passedButRed = buildBody(context({ outcome: "pass", problems: [] }));
ok(/judged the deployed app and passed, but the job itself failed/.test(passedButRed), "a passed check in a red job says so");
ok(/Verdict: a browser gets this release's bytes from the deployed app/.test(passedButRed), "and carries the verdict it reached");
ok(/not evidence that the app is behind or broken/.test(passedButRed), "and refuses to blame the app");
ok(/Nothing has to be republished/.test(passedButRed), "and says not to publish on it");
ok(!/Finding\(s\)/.test(passedButRed), "and lists no finding");

// 7. A later comment adds that run's evidence; the close names what was found.
const comment = buildComment(context());
ok(/still failing/i.test(comment), "the comment says it is still failing");
ok(comment.includes(RUN) && comment.includes("0123456"), "and records the run it came from");
ok(comment.includes("- App state: awake on arrival"), "and the state this run saw");
ok(comment.includes('the frame runs release "80"'), "and the finding this run produced");
const unjudgedComment = buildComment(context({ outcome: "unknown", problems: [] }));
ok(/still no verdict/.test(unjudgedComment), "an unjudged run does not pretend to have found a fault");
const passedComment = buildComment(context({ outcome: "pass", problems: [] }));
ok(/the check passed, and the job failed after it/.test(passedComment), "a passed-check comment says that");
ok(/No finding about the app/.test(passedComment), "and adds no finding");
const closed = buildClosedComment(context({ outcome: "pass", result: "success" }));
ok(closed.includes(RUN) && closed.includes("0123456"), "the close names the run and commit");
ok(/serves this repository's release again/.test(closed), "and what passing proves");
ok(/state: awake on arrival/.test(closed), "and the state it arrived in");
ok(/Closing\./.test(closed), "and reads as a close");

// 8. The command line the workflow uses.
const env = {
  OWNER: "richardparslow-commits",
  RUN_URL: RUN,
  HEAD_SHA: HEAD,
  EVENT: "schedule",
  RESULT: "failure",
  OUTCOME: "fail",
  STATE: "awake on arrival",
  PROBLEMS: FAILED.problems.join("\n"),
  REPORT_FILE: reportFile(FAILED, "cli.json"),
};
equal(runCli(["--state"], env).out.trim(), "failing", "--state prints the job's state");
equal(runCli(["--state"], { RESULT: "cancelled" }).out.trim(), "unknown", "--state prints unknown for a cancelled run");
ok(/^outcome=fail$/m.test(runCli(["--outputs"], env).out), "--outputs prints the outcome");
ok(/^problems=the frame runs/m.test(runCli(["--outputs"], env).out), "--outputs prints the finding");
ok(runCli(["--body"], env).out.includes('  - the frame runs release "80"'), "--body prints the issue body");
ok(/still failing/i.test(runCli(["--comment"], env).out), "--comment prints the follow-up");
ok(/Closing\./.test(runCli(["--closed-comment"], env).out), "--closed-comment prints the close");
equal(runCli(["--nonsense"], env).status, 2, "an unknown mode is a usage error, not an empty issue");
equal(runCli(["--body", "extra"], env).status, 2, "stray arguments are a usage error");

// 9. The wiring. The deployed job has to write the verdict it judged, the alert has to
//    run after it whatever it decided, and the text has to come from this script.
const workflow = fs.readFileSync(path.join(root, ".github/workflows/streamlit-deployed.yml"), "utf8");
const alertJob = workflow.slice(workflow.indexOf("  alert:"));
ok(workflow.includes("  alert:"), "the workflow has an alert job");
ok(/needs: \[deployed\]/.test(alertJob), "it runs after the check");
ok(/if: \$\{\{ always\(\) \}\}/.test(alertJob), "and runs even when the check failed — the case it exists for");
ok(/issues: write/.test(alertJob), "it may write issues");
ok(/group: deployed-app-alert/.test(alertJob), "its runs are serialised so two cannot race on one issue");
ok(/RESULT: \$\{\{ needs\.deployed\.result \}\}/.test(alertJob), "it receives the job result");
ok(/OUTCOME: \$\{\{ needs\.deployed\.outputs\.outcome \}\}/.test(alertJob), "and the check's outcome");
ok(/STATE: \$\{\{ needs\.deployed\.outputs\.state \}\}/.test(alertJob), "and the state it observed");
ok(/PROBLEMS: \$\{\{ needs\.deployed\.outputs\.problems \}\}/.test(alertJob), "and the problems it found");
ok(/node scripts\/deployed-app-alert\.js --state/.test(alertJob), "the state comes from the script that writes the text");
ok(/node scripts\/deployed-app-alert\.js --body/.test(alertJob), "the body comes from the script");
ok(/node scripts\/deployed-app-alert\.js --comment/.test(alertJob), "the comment comes from the script");
ok(/node scripts\/deployed-app-alert\.js --closed-comment/.test(alertJob), "the close comes from the script");
ok(!/cat > "\$body" <<BODY/.test(alertJob), "no inline heredoc builds the body");
const deployedJob = workflow.slice(0, workflow.indexOf("  alert:"));
ok(/problems: \$\{\{ steps\.report\.outputs\.problems \}\}/.test(deployedJob), "the check job exposes the problems it found");
ok(/outcome: \$\{\{ steps\.report\.outputs\.outcome \}\}/.test(deployedJob), "and the outcome");
ok(/--json-out deployed\.json/.test(deployedJob), "the check writes the report the alert reads");
ok(/node scripts\/deployed-app-alert\.js --outputs/.test(deployedJob), "and reduces it with the script rather than in shell");
ok(/if: \$\{\{ always\(\) \}\}/.test(deployedJob), "the report is recorded even when the check failed");

console.log("Passed " + checks + " deployed-app alert assertions.");
