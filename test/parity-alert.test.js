"use strict";
/* Fixtures for scripts/parity-alert.js.

   The drift issue is the only thing a person sees when a scheduled parity run goes
   red, so it has to carry the answer the comparison itself produces: which
   deployment was judged. These cases prove the message names the commit each job
   read, says plainly when a job read none, and never presents a skipped or
   cancelled job as a deployment that failed to match.
*/
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const alert = path.join(root, "scripts/parity-alert.js");
const { buildBody, buildComment, buildClosedComment, deployments, notGreen } = require(alert);

let checks = 0;
function equal(actual, expected, label) { assert.equal(actual, expected, label); checks++; }
function ok(actual, label) { assert.ok(actual, label); checks++; }

const RUN = "https://github.com/richardparslow-commits/HealthClassEstimator/actions/runs/1";
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const WEBSITE = "richardparslow-commits/life-policy-light";
const SITE_SHA = "37d743eb0d732d737d31e4487f480e9c07c7c068";
const APP = "richardparslow-commits/health_app.py";
const APP_SHA = "abcdef1234567890abcdef1234567890abcdef12";
const green = {
  website: { result: "success", outputs: { repo: WEBSITE, commit: SITE_SHA } },
  streamlit: { result: "success", outputs: { repo: APP, commit: APP_SHA } },
  "streamlit-runtime": { result: "success", outputs: { repo: APP, commit: APP_SHA } },
};
const context = (results) => ({ results, owner: "richardparslow-commits", runUrl: RUN, headSha: HEAD, event: "schedule" });

// 1. Every job green: nothing is failing, and the close names the deployments it
//    checked — a close that names them is the record that the suspect was the one read.
equal(notGreen(green).length, 0, "a green run has no failing jobs");
const closed = buildClosedComment(context(green));
ok(closed.includes(RUN), "the close links the run");
ok(closed.includes("Every consumer matches the build again"), "the close says what happened");
ok(closed.includes(WEBSITE + "@37d743e"), "the close names the website deployment");
ok(closed.includes(APP + "@abcdef1"), "the close names the Streamlit deployment");
equal((closed.match(/abcdef1\b/g) || []).length, 2, "both Streamlit jobs are named, not just one");
ok(closed.trim().endsWith("Closing."), "the close reads as a close");
for (const j of deployments(green)) equal(j.state, "judged", "a green run reports every job as judged: " + j.id);

// 2. A red run names the deployment it judged, the run, the build and the trigger.
const websiteFailed = { ...green, website: { result: "failure", outputs: { repo: WEBSITE, commit: SITE_SHA } } };
const body = buildBody(context(websiteFailed));
ok(body.startsWith("@richardparslow-commits — "), "the issue addresses the owner");
ok(body.includes("- Failing job(s): Live website"), "the failing job is named the way the workflow labels it");
ok(!body.includes("- Failing job(s): Live website, Streamlit"), "a passing job is not listed as failing");
ok(body.includes("- Run: " + RUN), "the run is linked");
ok(body.includes("- Build commit: " + HEAD), "the build commit is named");
ok(body.includes("- Trigger: schedule"), "the trigger is named");
ok(body.includes("\n- Deployment judged:\n"), "the deployment list is a top-level item, not an indented child of the build line");
ok(body.includes("  - Live website: " + WEBSITE + "@37d743e"), "the failing job's deployment is named by commit");
ok(body.includes("  - Streamlit artifact: " + APP + "@abcdef1"), "the passing jobs' deployments are reported too");
ok(!body.includes(SITE_SHA), "the short commit is used, as in the check's own verdict");
equal(deployments(websiteFailed).find((d) => d.id === "website").state, "judged", "a failed job that read a commit still reports it");

// 3. The state a run URL cannot express: the job never judged a deployment (a failed
//    build, a page that does not state which build it is, a run that never got that
//    far). It must not invent one, and it must not read as "the copy is behind" — the
//    fix is the read, not a republish.
const unread = { ...green, website: { result: "failure", outputs: {} } };
const unreadBody = buildBody(context(unread));
ok(unreadBody.includes("  - Live website: no deployment read — the job ended before it judged one"), "an unread deployment is said to be unread");
ok(/a failed build, a run that never got that far, or a page that does not state the build it is/.test(unreadBody), "the likely causes of an unread deployment are given");
ok(!/@/.test(unreadBody.split("- Deployment judged:")[1].split("\n  - Streamlit")[0]), "no commit is invented for the unread job");
equal(deployments(unread).find((d) => d.id === "website").state, "unread", "the unread state is distinct from a judged one");

// 4. A skipped or cancelled job never had the chance to read one; saying it "failed
//    before judging" would send someone looking for a build problem that is not there.
const skipped = { ...green, streamlit: { result: "skipped", outputs: {} } };
const skippedBody = buildBody(context(skipped));
ok(skippedBody.includes("  - Streamlit artifact: the job did not run"), "a skipped job is reported as not run");
ok(skippedBody.includes("- Failing job(s): Streamlit artifact"), "a skipped job still counts as not green");
ok(!/Streamlit artifact: no deployment read/.test(skippedBody), "a skipped job is not described as a failed read");
const cancelled = { ...green, "streamlit-runtime": { result: "cancelled", outputs: {} } };
ok(buildBody(context(cancelled)).includes("  - Streamlit runtime: cancelled before it finished"), "a cancelled job says so");
const cancelledWithCommit = { ...green, "streamlit-runtime": { result: "cancelled", outputs: { repo: APP, commit: APP_SHA } } };
ok(buildBody(context(cancelledWithCommit)).includes("  - Streamlit runtime: " + APP + "@abcdef1 (cancelled before it finished)"), "a cancelled job that read a commit still names it, and says it was stopped");

// 5. A job added to `needs` later is reported under its own id rather than silently
//    dropped from the notification — the failure mode this text exists to avoid.
const extra = { ...green, "new-consumer": { result: "failure", outputs: { repo: "o/r", commit: "fedcba9876543210" } } };
ok(buildBody(context(extra)).includes("  - new-consumer: o/r@fedcba9"), "an unknown job is reported by id");
equal(notGreen(extra).includes("new-consumer"), true, "an unknown failing job counts as not green");

// 6. The still-failing comment names what this run judged, so a second red run adds
//    evidence rather than a bare timestamp.
const comment = buildComment(context(websiteFailed));
ok(comment.includes("Still failing: Live website"), "the comment says which job is still red");
ok(comment.includes("Deployments judged: Live website " + WEBSITE + "@37d743e"), "the comment names the deployment");
ok(comment.includes("(build " + HEAD + ", trigger schedule)"), "the comment records the run it came from");

// 7. The guidance that makes the issue actionable survives, and no longer tells
//    anyone to republish the site from a tool that does not produce it.
ok(body.includes("Never edit a copy to match"), "the issue still forbids editing the copy");
ok(body.includes("names a cache rather than a component"), "the cache paragraph is kept");
ok(body.includes("declared adaptations"), "the adaptations paragraph is kept");
ok(body.includes("consumers/website.json"), "the adaptations paragraph names the file that has to move with an anchor");
ok(!/from Lovable/.test(body), "the issue no longer names a publisher that is not how the page is built");

// 8. The wiring: each comparison job has to expose what it judged, and the alert has
//    to be generated by this script rather than by an inline heredoc that no fixture
//    could reach.
const workflow = fs.readFileSync(path.join(root, ".github/workflows/consumer-parity.yml"), "utf8");
for (const job of ["website", "streamlit", "streamlit-runtime"])
  ok(new RegExp("\\b" + job + ":\\n(?:.*\\n)*?    outputs:\\n      repo: \\$\\{\\{ steps\\.deployed\\.outputs\\.repo \\}\\}\\n      commit: \\$\\{\\{ steps\\.deployed\\.outputs\\.commit \\}\\}").test(workflow),
    "the " + job + " job exposes the deployment it read");
equal((workflow.match(/id: deployed\n/g) || []).length, 3, "each comparison job's fetch step is the one that sets them");
equal((workflow.match(/echo "commit=\$commit" >> "\$GITHUB_OUTPUT"/g) || []).length, 3, "each job writes the commit it checked out");
ok(/echo "repo=\$REPO" >> "\$GITHUB_OUTPUT"/.test(workflow), "the repository is written beside it");
ok(/node scripts\/parity-alert\.js --not-green/.test(workflow), "the alert decides what is green with the same rule as the text");
ok(/node scripts\/parity-alert\.js --body > "\$body"/.test(workflow), "the issue body comes from the script");
ok(/node scripts\/parity-alert\.js --comment/.test(workflow), "the follow-up comment comes from the script");
ok(/node scripts\/parity-alert\.js --closed-comment/.test(workflow), "the closing comment comes from the script");
ok(!/cat > "\$body" <<BODY/.test(workflow), "no inline heredoc builds the body any more");
ok(/if \[ "\$failed" != "none" \]/.test(workflow), "only \"none\" closes the issue");
ok(/name: Check out HealthClassEstimator/.test(workflow.slice(workflow.indexOf("  alert:"))), "the alert job checks out the script it runs");
ok(/name: Set up Node/.test(workflow.slice(workflow.indexOf("  alert:"))), "and pins the Node it runs it with");

// 9. The command line the workflow uses: env in, text out, and a loud failure on
//    input that is not the `needs` context.
function runCli(args, env) {
  try {
    return { status: 0, out: execFileSync(process.execPath, [alert, ...args], { encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { status: error.status ?? 1, out: String(error.stdout || ""), err: String(error.stderr || "") };
  }
}
const env = { RESULTS: JSON.stringify(websiteFailed), OWNER: "richardparslow-commits", RUN_URL: RUN, HEAD_SHA: HEAD, EVENT: "schedule" };
equal(runCli(["--not-green"], env).out, "Live website", "--not-green prints the failing jobs");
equal(runCli(["--not-green"], { RESULTS: JSON.stringify(green) }).out, "none", "--not-green prints none for a green run");
ok(runCli(["--deployments"], env).out.includes("  - Live website: " + WEBSITE + "@37d743e"), "--deployments prints the list the run summary shows");
ok(runCli(["--body"], env).out.includes("- Deployment judged:"), "--body prints the issue body");
ok(runCli(["--closed-comment"], { RESULTS: JSON.stringify(green) }).out.includes("Closing."), "--closed-comment prints the close");
const malformed = runCli(["--body"], { RESULTS: "not json" });
equal(malformed.status, 1, "input that is not the needs context fails");
ok(/RESULTS is not the JSON of the `needs` context/.test(malformed.err), "the failure says what was wrong");
equal(runCli(["--nonsense"], env).status, 1, "an unknown mode fails rather than printing an empty issue");

console.log("Passed " + checks + " parity-alert assertions.");
