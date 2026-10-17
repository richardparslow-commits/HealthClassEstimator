"use strict";
/* What a release run says it published, executed rather than read.

   `test/publish-step.test.js` runs the gates and the push. What it does not run is the
   part that decides what the run *claims*: the read-back invocation (which commit it
   expects, against which remote, and whether a failure stops the step), the token gates
   that make a tokenless run on main fail instead of looking shipped, and the run summary
   that a person reads as "published" or "not published". On 2026-10-17 the shape that
   matters was real: a release can be green and the deployment still serve the previous
   build, and the only thing that says otherwise is this text.

   So each of those steps is executed here, with its own shell, against a local bare
   repository playing the deployed one and a `python3` that records the runtime check it
   was asked to run. The read-back script, git and the byte comparison are real; only the
   runtime verifier is stubbed at its boundary, because it is fixture-tested separately
   (`npm run test:published`, `verify-streamlit-runtime.py`) and this step's job is to
   invoke it on the right directory and fail when it fails.

   The last case runs them as one run rather than one at a time: the sync step, the push
   step, the read-back step and the summary step, in that order, in one workdir — so the
   commit the run claims is the commit its own push created, not one a fixture agreed to
   call pushed. `test/publish-step.test.js` runs the sync and push; running the claim steps
   after them is what closes the seam between "we pushed" and "we verified what is live".

   NB: GitHub runs a step with `bash -e`, so a failing command aborts the step. The runner
   here passes `-e` for that reason; a step whose failure only "fails" because the last
   command happened to fail is a step that leaks a claim on a bad day.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readStep } = require("../scripts/workflow-step.js");
const { evaluate, render } = require("../scripts/workflow-condition.js");

const root = path.resolve(__dirname, "..");
const workflow = path.join(root, ".github/workflows/deploy-streamlit.yml");
let checks = 0;
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

const readback = readStep(workflow, "deploy", "Read back what the deployed repository now holds");
const sync = readStep(workflow, "deploy", "Sync the artifact and its manifest into streamlit repo");
const gate = readStep(workflow, "deploy", "Fail when the deploy token is not configured (main)");
const warning = readStep(workflow, "deploy", "Explain the skipped push on a non-main ref");
const push = readStep(workflow, "deploy", "Commit and push (triggers Streamlit Cloud redeploy)");
const summary = readStep(workflow, "deploy", "Summarise what this run published");

/* --- git, without touching the machine's config ---------------------------- */

function git(args, cwd) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}
function mustGit(args, cwd) {
  const run = git(args, cwd);
  if (run.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + run.stderr);
  return run.stdout.trim();
}

/* --- the artifact, built here rather than assumed -------------------------- */

const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "publish-claim-build-"));
function buildFile(args) {
  const run = spawnSync("node", args, { cwd: root, encoding: "utf8" });
  if (run.status !== 0) throw new Error("node " + args.join(" ") + " failed: " + run.stderr);
}
const ARTIFACT = path.join(BUILD, "app_embedded.html");
const MANIFEST = path.join(BUILD, "app_embedded.manifest.json");
buildFile(["scripts/build-embedded.js", ARTIFACT]);
buildFile(["scripts/write-artifact-manifest.js", ARTIFACT]);
ok(fs.existsSync(MANIFEST), "the manifest writer put a manifest beside the artifact it describes");

const deployedRepo = "richardparslow-commits/health_app.py";
const deployedUrl = "https://github.com/" + deployedRepo + ".git";

// One workdir: `deployed.git` is origin, `streamlit-app` is the clone the step reads its
// pushed commit from, `dist/app.html` is the build the read-back compares against, and
// `scripts/` is the repository's own scripts (symlinked, so the shell under test is the
// one this checkout ships, including the manifest checker it calls).
// `seeded` decides whether origin starts holding the pair. The read-back cases below only
// need something live to compare against, so they seed it; the chain case needs the sync
// and push steps to create the commit, so it starts from the deployed repository as it
// really is — wrapper, requirements, README, no artifact.
function fixture({ seeded = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-claim-"));
  const bare = path.join(dir, "deployed.git");
  const seed = path.join(dir, "seed");
  mustGit(["init", "-b", "main", "--bare", bare], dir);
  mustGit(["clone", bare, seed], dir);
  fs.writeFileSync(
    path.join(seed, "health_app.py"),
    'import streamlit as st\nst.iframe("app_embedded.html", height=2400)\n',
  );
  fs.writeFileSync(path.join(seed, "requirements.txt"), "streamlit>=1.66,<2\n");
  fs.writeFileSync(path.join(seed, "README.md"), "# deployed\n");
  if (seeded) {
    fs.copyFileSync(ARTIFACT, path.join(seed, "app_embedded.html"));
    fs.copyFileSync(MANIFEST, path.join(seed, "app_embedded.manifest.json"));
  }
  mustGit(["add", "-A"], seed);
  mustGit(
    ["-c", "user.name=seed", "-c", "user.email=seed@example.invalid", "commit", "-m", "published pair"],
    seed,
  );
  mustGit(["push", "origin", "main"], seed);

  // The clone the push step would have left behind: its HEAD is the commit a token run
  // expects origin to hold.
  mustGit(["clone", bare, path.join(dir, "streamlit-app")], dir);
  fs.mkdirSync(path.join(dir, "dist"));
  fs.copyFileSync(ARTIFACT, path.join(dir, "dist", "app.html"));
  // `release:artifact` leaves the pair beside the workspace, which is where the sync step
  // copies it from — in every case, seeded or not.
  fs.copyFileSync(ARTIFACT, path.join(dir, "app_embedded.html"));
  fs.copyFileSync(MANIFEST, path.join(dir, "app_embedded.manifest.json"));

  // The repository's scripts, copied rather than symlinked: the read-back resolves its
  // own root from `dirname $0/..`, and `cd` through a symlinked `scripts/..` lands back in
  // this checkout, which would have it judge this repository's `published/` instead of the
  // fixture's. A copy keeps the step hermetic and is the same bytes the workflow runs.
  fs.cpSync(path.join(root, "scripts"), path.join(dir, "scripts"), { recursive: true });

  // `python3` at the boundary: it records the runtime check it was asked to run and
  // exits with the status the case wants. The verifier itself is fixture-tested
  // elsewhere; what is under test here is the invocation and the failure it must cause.
  fs.mkdirSync(path.join(dir, "bin"));
  fs.writeFileSync(
    path.join(dir, "bin", "python3"),
    '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$STUB_PYTHON_LOG"\nexit "${STUB_PYTHON_STATUS:-0}"\n',
  );
  fs.chmodSync(path.join(dir, "bin", "python3"), 0o755);

  // The remote the step builds is https://github.com/owner/repo.git. Rewriting it is
  // git's own mechanism, in a config file inside the fixture, not the user's.
  fs.writeFileSync(
    path.join(dir, "gitconfig"),
    '[url "file://' + bare + '"]\n\tinsteadOf = ' + deployedUrl + "\n",
  );

  return { dir, bare, log: path.join(dir, "python3.log") };
}

// GitHub renders `${{ … }}` into a step's shell before bash ever sees it, and this uses
// the same parser and evaluator as the `if:` conditions rather than a second expression
// implementation. `strict` refuses an expression absent from the context, so a step that
// gains one has to be given a value here instead of quietly rendering an empty string —
// and a stray `${{` fails rather than reaching bash as a syntax error that would look
// like a step failure.
function renderStep(step, context) {
  return render(step.script, context, {}, { strict: true });
}

// The step's shell, run the way GitHub runs it (`bash -e`), with the job's env.
function run(step, fixture_, extraEnv = {}, context = {}) {
  const script = renderStep(step, context);
  const env = {
    ...process.env,
    PATH: path.join(fixture_.dir, "bin") + ":" + process.env.PATH,
    GIT_CONFIG_GLOBAL: path.join(fixture_.dir, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "harness",
    GIT_AUTHOR_EMAIL: "harness@example.invalid",
    GIT_COMMITTER_NAME: "harness",
    GIT_COMMITTER_EMAIL: "harness@example.invalid",
    STUB_PYTHON_LOG: fixture_.log,
    DEPLOYED_REPO: deployedRepo,
    ...extraEnv,
  };
  for (const [name, value] of Object.entries(extraEnv)) if (value === undefined) delete env[name];
  return spawnSync("bash", ["-e", "-c", script], {
    cwd: fixture_.dir,
    encoding: "utf8",
    env,
  });
}

// The read-back's evidence: the commit it named, the output it produced, and the marker it
// leaves only when both of its checks finished. Cleared between runs, because a marker
// left by an earlier passing run would make a later failing one look verified.
function clearEvidence(fixture_) {
  for (const name of ["published-commit.txt", "published.txt", "published-ok.txt"]) {
    fs.rmSync(path.join(fixture_.dir, name), { force: true });
  }
  fs.rmSync(fixture_.log, { force: true });
}
const evidence = (fixture_, name) => path.join(fixture_.dir, name);

function pythonCalls(fixture_) {
  try {
    return fs
      .readFileSync(fixture_.log, "utf8")
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* --- the wiring the shell runs inside ------------------------------------- */

// The conditions are not executed by running the shell — GitHub evaluates them before
// it — so they are evaluated here with `scripts/workflow-condition.js`, in the shapes a
// run can take, against the job's own variables. A text match is what this replaces: it
// passes a condition that names a variable the job never sets, puts `&&` where `||` was
// meant, or negates the wrong half. The evaluator's own semantics are held to GitHub's
// documentation in `test/workflow-condition.test.js`.
function wouldRun(step, { token = "", verify = "false", ref = "refs/heads/main" } = {}, state = {}) {
  return evaluate(
    step.condition,
    { env: { STREAMLIT_PUSH_TOKEN: token, VERIFY_PUBLISHED: verify }, github: { ref } },
    state,
  );
}

ok(wouldRun(readback, { token: "token" }), "the read-back runs on a push with the token");
ok(wouldRun(readback, { verify: "true" }), "and on a verify-only dispatch, which pushes nothing");
ok(!wouldRun(readback, {}), "but not on a tokenless push, where origin holds nothing this run built");

ok(wouldRun(gate, {}), "a tokenless push on main fails the gate: the run is not live");
ok(!wouldRun(gate, { verify: "true" }), "a verify-only dispatch passes it, because no push was asked for");
ok(!wouldRun(gate, { ref: "refs/heads/feature" }), "and a non-main ref is warned about instead of failed");

ok(wouldRun(warning, { ref: "refs/heads/feature" }), "a tokenless push on another ref is explained");
ok(!wouldRun(warning, { token: "token", ref: "refs/heads/feature" }), "a push that had a token is not warned about");
ok(!wouldRun(warning, {}), "nor is a tokenless main push, which fails rather than warns");
ok(
  !wouldRun(warning, { verify: "true", ref: "refs/heads/feature" }),
  "and neither is a verify-only dispatch: it asked for no push, and the summary says so",
);

// The push is the only step that changes the deployment, and `verify_published` promises
// it does not run. A token in the repository must not turn a verification into a
// publish: the self-test dispatches this shape and asserts the step was skipped.
ok(wouldRun(push, { token: "token" }), "a token push publishes");
ok(!wouldRun(push, {}), "a tokenless run publishes nothing");
ok(!wouldRun(push, { token: "token", verify: "true" }), "and neither does a verify-only dispatch that has a token");

ok(wouldRun(summary, {}, { success: false }), "the summary is written even when a step above failed");
ok("DEPLOYED_REPO" in readback.env, "the read-back's remote is the step's own variable");
ok("SOURCE_SHA" in summary.env, "and the summary's expected commit message is the run's source commit");

const workflowText = fs.readFileSync(workflow, "utf8");
const preamble = workflowText.slice(0, workflowText.indexOf("jobs:"));
const jobEnv = workflowText.slice(workflowText.indexOf("  deploy:"));
const event = (name, inputs = {}) => ({ github: { event_name: name, ref: "refs/heads/main" }, inputs });

ok(/STREAMLIT_PUSH_TOKEN:\s*\$\{\{\s*secrets\.STREAMLIT_PUSH_TOKEN\s*\}\}/.test(jobEnv), "the token is mapped from the secret at job level");

// The job's `VERIFY_PUBLISHED` is what every condition below reads, so it is rendered in
// the three events rather than pattern-matched: the schedule has to decide it on its own,
// and a push has to leave it unset. A regex on `inputs.verify_published` passed while the
// schedule silently read nothing.
const verifyEnv = /VERIFY_PUBLISHED:\s*(\$\{\{[^}]*\}\})/.exec(jobEnv);
ok(verifyEnv, "the read-back decision is mapped where the conditions read it");
equal(render(verifyEnv[1], event("schedule")), "true", "a scheduled run decides verification for itself");
equal(render(verifyEnv[1], event("push")), "", "a push leaves it unset");
equal(render(verifyEnv[1], event("workflow_dispatch", { verify_published: true })), "true", "a verify dispatch still asks for it");
equal(render(verifyEnv[1], event("workflow_dispatch", { verify_published: false })), "false", "and an ordinary dispatch does not");

ok(/^\s*schedule:\s*$/m.test(preamble), "the workflow is scheduled, so drift is caught without a push");
ok(/cron:\s*"20 7 \* \* \*"/.test(preamble), "daily, at an off-the-hour time clear of the other schedules");

// A scheduled verification and a deploying push must not cancel each other. The group is
// the only expression that encodes that, so it is rendered too.
const group = /^\s*group:\s*(\S.*)$/m.exec(preamble);
ok(group, "the workflow declares a concurrency group");
equal(render(group[1], event("schedule")), "deploy-streamlit-verify", "a scheduled verification gets its own group");
equal(render(group[1], event("workflow_dispatch", { verify_published: true })), "deploy-streamlit-verify", "as does a verify dispatch");
equal(render(group[1], event("push")), "deploy-streamlit-deploy", "while a push deploys in the deploy group");
equal(render(group[1], event("workflow_dispatch", { verify_published: false })), "deploy-streamlit-deploy", "and an ordinary dispatch with it, so a schedule cannot cancel a deploy");

/* --- the read-back: what it expects and what a failure does ---------------- */

{
  const fx = fixture();
  const head = mustGit(["rev-parse", "main"], fx.bare);
  const pushed = mustGit(["rev-parse", "HEAD"], path.join(fx.dir, "streamlit-app"));
  equal(pushed, head, "the fixture starts with origin holding the commit the push step left");

  const run1 = run(readback, fx, { STREAMLIT_PUSH_TOKEN: "token" });
  equal(run1.status, 0, "the read-back passes against the pair origin holds: " + run1.stderr);
  ok(/PASS — the pair origin holds is the build this repository produced/.test(run1.stdout), "and says what it compared");
  const commitOut = path.join(fx.dir, "published-commit.txt");
  ok(fs.existsSync(commitOut), "the read-back writes the verified commit for the summary to name");
  equal(fs.readFileSync(commitOut, "utf8").trim(), head, "and it is the commit it verified");
  equal(
    pythonCalls(fx),
    ["scripts/verify-streamlit-runtime.py published"],
    "then runs the deployed pair through the runtime verifier on the read-back checkout",
  );
  // The expected commit is the one `streamlit-app` was left at — not `github.sha` and not
  // whatever origin happens to hold: a run must judge the commit it pushed.
  ok(run1.stdout.includes("Commit: " + head), "naming the commit it verified: " + run1.stdout.slice(-80));

  // Someone else moved main after this run pushed: the step must fail, must not go on to
  // "verify" a copy it did not expect, and must not leave the marker that would let a
  // summary call it published — while still naming the commit origin holds, which is the
  // only way the reader learns which build superseded this run.
  const other = path.join(fx.dir, "other");
  mustGit(["clone", fx.bare, other], fx.dir);
  fs.writeFileSync(path.join(other, "README.md"), "moved\n");
  mustGit(["add", "-A"], other);
  mustGit(["-c", "user.name=other", "-c", "user.email=other@example.invalid", "commit", "-m", "superseded"], other);
  mustGit(["push", "origin", "main"], other);
  const moved = mustGit(["rev-parse", "main"], fx.bare);
  ok(fs.existsSync(evidence(fx, "published-ok.txt")), "a completed read-back leaves the marker the summary reads");
  clearEvidence(fx);

  const run2 = run(readback, fx, { STREAMLIT_PUSH_TOKEN: "token" });
  ok(run2.status !== 0, "a branch head that is not the pushed commit fails the read-back");
  ok(run2.stdout.includes("origin's main is " + moved + ", not " + pushed), "naming both commits: " + run2.stdout.slice(0, 200));
  ok(/Nothing was compared/.test(run2.stdout), "and saying that nothing was compared, so the copy was never verified");
  equal(
    fs.readFileSync(path.join(fx.dir, "published-commit.txt"), "utf8").trim(),
    moved,
    "it writes the commit origin holds instead of the one it pushed, so the summary names what is live",
  );
  ok(!fs.existsSync(evidence(fx, "published-ok.txt")), "and leaves no completed-verification marker, so nothing can call it published");
  equal(pythonCalls(fx), [], "and the runtime verifier is never asked to bless a copy this run did not push");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // A verify-only dispatch: no token, so there is no pushed commit to expect — origin's
  // current main is the subject, which is how a hand-synced copy is judged from CI.
  const fx = fixture();
  const head = mustGit(["rev-parse", "main"], fx.bare);
  const verify = run(readback, fx, { STREAMLIT_PUSH_TOKEN: undefined, VERIFY_PUBLISHED: "true" });
  equal(verify.status, 0, "a verify-only read-back passes against a matching pair: " + verify.stderr);
  const commitOut = path.join(fx.dir, "published-commit.txt");
  ok(fs.existsSync(commitOut), "a verify-only read-back writes the commit it verified");
  equal(fs.readFileSync(commitOut, "utf8").trim(), head, "and names the commit origin holds");
  equal(pythonCalls(fx), ["scripts/verify-streamlit-runtime.py published"], "with the runtime check run on it");

  // ...and the same holds when a token is configured: expecting the commit `streamlit-app`
  // was staged at is a push-run decision. A verify-only run with a token that required it
  // would report "the branch moved" as "the deployment is not this build" whenever someone
  // synced by hand while it ran — which is precisely the drift it is scheduled to find.
  const other = path.join(fx.dir, "other");
  mustGit(["clone", fx.bare, other], fx.dir);
  fs.writeFileSync(path.join(other, "README.md"), "synced by hand\n");
  mustGit(["add", "-A"], other);
  mustGit(["-c", "user.name=other", "-c", "user.email=other@example.invalid", "commit", "-m", "hand sync"], other);
  mustGit(["push", "origin", "main"], other);
  const synced = mustGit(["rev-parse", "main"], fx.bare);
  ok(fs.existsSync(evidence(fx, "published-ok.txt")), "the verify-only read-back leaves the marker too");
  clearEvidence(fx);

  const tokenised = run(readback, fx, { STREAMLIT_PUSH_TOKEN: "token", VERIFY_PUBLISHED: "true" });
  equal(tokenised.status, 0, "a verify-only run with a token judges what origin holds now: " + tokenised.stderr);
  equal(fs.readFileSync(commitOut, "utf8").trim(), synced, "and names the commit it read back, not the staged one");
  ok(!tokenised.stdout.includes("not " + head), "without calling the hand sync a build mismatch: " + tokenised.stdout.slice(0, 200));
  equal(pythonCalls(fx), ["scripts/verify-streamlit-runtime.py published"], "and the runtime check still runs on it");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // One run, end to end: the steps that publish and the steps that claim the publish,
  // executed in order in the same workdir. Every other case here hands the read-back a
  // fixture that already looks pushed; this one makes the push happen, then asks the
  // read-back to verify it, so the claim is about this run's own commit. A push step that
  // committed the wrong tree, or a read-back that expected `github.sha` instead of the
  // clone, would pass the separate cases and fail here.
  const fx = fixture({ seeded: false });
  const source = "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091";
  const deployed = path.join(fx.dir, "streamlit-app");

  const synced = run(sync, fx);
  equal(synced.status, 0, "the sync step stages the pair: " + synced.stderr);
  ok(
    fs.existsSync(path.join(deployed, "app_embedded.html")) &&
      fs.existsSync(path.join(deployed, "app_embedded.manifest.json")),
    "the pair the checks judged is in the deployed checkout, manifest beside it",
  );

  const published = run(push, fx, { STREAMLIT_PUSH_TOKEN: "token", SOURCE_SHA: source });
  equal(published.status, 0, "the push step publishes: " + published.stderr);
  const pushed = mustGit(["rev-parse", "HEAD"], deployed);
  equal(mustGit(["rev-parse", "main"], fx.bare), pushed, "and origin holds the commit it created");
  equal(
    mustGit(["log", "-1", "--format=%s", "main"], fx.bare),
    "Sync from HealthClassEstimator " + source.slice(0, 7),
    "under a commit message that names the source commit",
  );
  const deployedBytes = fs.readFileSync(path.join(deployed, "app_embedded.html"), "utf8");
  equal(deployedBytes, fs.readFileSync(path.join(fx.dir, "dist", "app.html"), "utf8"), "and publishes the pair that ships, byte for byte");

  const verified = run(readback, fx, { STREAMLIT_PUSH_TOKEN: "token" });
  equal(verified.status, 0, "the read-back verifies the commit in the same run: " + verified.stderr);
  const named = fs.readFileSync(path.join(fx.dir, "published-commit.txt"), "utf8").trim();
  equal(named, pushed, "the commit the run claims is the commit its own push created");
  ok(verified.stdout.includes("Commit: " + pushed), "naming it in the read-back's verdict: " + verified.stdout.slice(-80));
  equal(pythonCalls(fx), ["scripts/verify-streamlit-runtime.py published"], "with the runtime check run on the copy origin now holds");

  const out = path.join(fx.dir, "summary.md");
  const summarised = run(summary, fx, {
    STREAMLIT_PUSH_TOKEN: "token",
    SOURCE_SHA: source,
    GITHUB_STEP_SUMMARY: out,
  });
  equal(summarised.status, 0, "the summary step runs");
  const text = fs.readFileSync(out, "utf8");
  ok(/### Published/.test(text), "and the run says it published");
  ok(text.includes("Deployed commit: `" + pushed + "`"), "naming the commit the read-back verified: " + text.slice(0, 200));
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // Origin holds something else: the read-back fails before the runtime verifier, and the
  // step fails with it under `bash -e`.
  const fx = fixture();
  fs.appendFileSync(path.join(fx.dir, "dist", "app.html"), "\n");
  const mismatch = run(readback, fx, { STREAMLIT_PUSH_TOKEN: "token" });
  ok(mismatch.status !== 0, "a published artifact that is not this build fails the read-back");
  ok(/the published artifact is not the build this repository produced/.test(mismatch.stdout), "naming the two hashes: " + mismatch.stdout.slice(0, 220));
  equal(
    fs.readFileSync(path.join(fx.dir, "published-commit.txt"), "utf8").trim(),
    mustGit(["rev-parse", "main"], fx.bare),
    "the commit it read is written even though the build was refused, so the refusal names what was served",
  );
  ok(!fs.existsSync(evidence(fx, "published-ok.txt")), "but with no marker a summary cannot describe it as verified");
  equal(pythonCalls(fx), [], "and the runtime verifier is not run on an unverified copy");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // The read-back passes and the deployed runtime refuses the pair: the step must fail,
  // and the read-back output must still be on disk for the summary that follows.
  const fx = fixture();
  const failed = run(readback, fx, { STREAMLIT_PUSH_TOKEN: "token", STUB_PYTHON_STATUS: "1" });
  ok(failed.status !== 0, "a deployed runtime that refuses the pair fails the step");
  ok(/PASS — the pair origin holds is the build this repository produced/.test(fs.readFileSync(path.join(fx.dir, "published.txt"), "utf8")), "the read-back's verdict is still kept for the summary");
  // The commit file exists at this point — it is written before the runtime check — which
  // is why the summary reads the marker instead. A run whose last check failed must not be
  // describable as published on the strength of the file it wrote earlier.
  ok(fs.existsSync(evidence(fx, "published-commit.txt")), "the commit file exists even though the run failed");
  ok(!fs.existsSync(evidence(fx, "published-ok.txt")), "but the completed-verification marker does not");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the token gates ------------------------------------------------------ */

{
  const fx = fixture();
  const main = run(gate, fx, { STREAMLIT_PUSH_TOKEN: undefined, VERIFY_PUBLISHED: undefined });
  equal(main.status, 1, "a push to main without the token fails instead of looking shipped");
  ok(/::error::STREAMLIT_PUSH_TOKEN is not set/.test(main.stdout), "with an error naming the missing token");
  ok(/was NOT updated and this release is not live/.test(main.stdout), "and saying the deployment was not updated");

  // The warning's text names the ref, which is a GitHub expression in the shell. Rendered
  // the way GitHub renders it — and asserted, so a wrong context there is caught.
  const other = run(
    warning,
    fx,
    { STREAMLIT_PUSH_TOKEN: undefined, VERIFY_PUBLISHED: undefined },
    { github: { ref: "refs/heads/feature" } },
  );
  equal(other.status, 0, "a non-main run without the token does not fail the branch: " + other.stderr);
  ok(/::warning::STREAMLIT_PUSH_TOKEN is not set/.test(other.stdout), "but warns that nothing was pushed");
  ok(/this run is on refs\/heads\/feature/.test(other.stdout), "naming the ref it is about: " + other.stdout.trim());
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the summary a person reads ------------------------------------------- */

{
  const sha = "642f75f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  const log = "PASS — the pair origin holds is the build this repository produced.\nCommit: " + sha + "\n";

  // Published: a commit read back and a read-back that finished. Both are the evidence;
  // the commit file alone is written before the runtime check, so it cannot stand for the
  // whole step.
  {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.dir, "published-commit.txt"), sha + "\n");
    fs.writeFileSync(path.join(fx.dir, "published.txt"), log);
    fs.writeFileSync(path.join(fx.dir, "published-ok.txt"), "the read-back verified origin at 2026-10-17T12:00:00Z\n");
    const out = path.join(fx.dir, "summary.md");
    const runSummary = run(summary, fx, {
      STREAMLIT_PUSH_TOKEN: "token",
      SOURCE_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      GITHUB_STEP_SUMMARY: out,
    });
    equal(runSummary.status, 0, "the summary step succeeds");
    const text = fs.readFileSync(out, "utf8");
    ok(/### Published/.test(text), "it says the run published");
    ok(text.includes("Deployed commit: `" + sha + "`"), "naming the commit that was read back");
    ok(/compared byte for byte/.test(text), "and what that claim rests on");
    ok(text.includes("PASS — the pair origin holds is the build this repository produced."), "with the read-back's own verdict quoted");
    fs.rmSync(fx.dir, { recursive: true, force: true });
  }

  // A commit came back but the read-back did not finish — the runtime verifier refused
  // the pair after the commit file was written. The summary must not call that published.
  {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.dir, "published-commit.txt"), sha + "\n");
    fs.writeFileSync(
      path.join(fx.dir, "published.txt"),
      log + "FAIL — the deployed runtime refused the published pair\n",
    );
    const out = path.join(fx.dir, "summary.md");
    run(summary, fx, {
      STREAMLIT_PUSH_TOKEN: "token",
      SOURCE_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      GITHUB_STEP_SUMMARY: out,
    });
    const text = fs.readFileSync(out, "utf8");
    ok(/### Pushed, not verified/.test(text), "a push whose read-back did not finish is not called published");
    ok(!/### Published/.test(text), "and the heading a reader scans for is absent");
    ok(text.includes("origin holds commit `" + sha + "`"), "it still names the commit origin holds, so the reader can go and look: " + text.slice(0, 220));
    ok(/did not finish its checks/.test(text), "and says the verification did not finish");
    fs.rmSync(fx.dir, { recursive: true, force: true });
  }

  // A push reported success but nothing came back: the summary must say it cannot name
  // what is live, never invent a commit.
  {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.dir, "published.txt"), "");
    const out = path.join(fx.dir, "summary.md");
    run(summary, fx, {
      STREAMLIT_PUSH_TOKEN: "token",
      SOURCE_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      GITHUB_STEP_SUMMARY: out,
    });
    const text = fs.readFileSync(out, "utf8");
    ok(/### Pushed, not verified/.test(text), "it does not head the section \"Published\": a push it could not read back is not a publish this run can vouch for: " + text.slice(0, 160));
    ok(!/### Published/.test(text), "so the one word a reader scans for is not there");
    ok(/The push reported success but no commit was read back/.test(text), "it says the commit is unknown");
    ok(/cannot name or vouch for what is live/.test(text), "and that the run cannot vouch for what is live");
    ok(!/Deployed commit: `/.test(text), "and names no commit it did not read");
    fs.rmSync(fx.dir, { recursive: true, force: true });
  }

  // Verify-only: pushed nothing, judged origin's main. Run twice — without a token,
  // and with one configured — because the decision belongs to the dispatch, not to
  // whether a secret happens to exist. The second shape is what the CI self-test
  // dispatches; before the push step carried the same clause it published.
  for (const token of [undefined, "token"]) {
    const fx = fixture();
    fs.writeFileSync(path.join(fx.dir, "published-commit.txt"), sha + "\n");
    fs.writeFileSync(path.join(fx.dir, "published.txt"), log);
    fs.writeFileSync(path.join(fx.dir, "published-ok.txt"), "the read-back verified origin\n");
    const out = path.join(fx.dir, "summary.md");
    run(summary, fx, {
      STREAMLIT_PUSH_TOKEN: token,
      VERIFY_PUBLISHED: "true",
      SOURCE_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      GITHUB_STEP_SUMMARY: out,
    });
    const where = token ? "even with a token configured" : "without a token";
    const text = fs.readFileSync(out, "utf8");
    ok(/### Verified, not published/.test(text), "it says the run verified a copy it did not publish (" + where + ")");
    ok(/confirmed it is this build/.test(text), "because the read-back left the marker that says so (" + where + ")");
    ok(text.includes("Deployed commit: `" + sha + "`"), "naming the deployed commit it read back, so the reader does not open the log to learn which build was judged (" + where + "): " + text.slice(0, 240));
    ok(/nothing was pushed/.test(text), "explaining why there is no deployed commit (" + where + "): " + text.slice(0, 160));
    ok(!/### Published/.test(text), "and does not claim a publish (" + where + ")");
    ok(!/No deploy token was configured/.test(text), "nor blames a missing token for a decision the dispatch made (" + where + ")");
    fs.rmSync(fx.dir, { recursive: true, force: true });
  }

  // Verify-only, read-back failed: the shape the daily schedule takes against a stale
  // deployment. The summary used to say "Verified, not published" and that it had judged
  // the deployment, directly above this FAIL — a claim derived from the dispatch rather
  // than from anything the run did.
  {
    const fx = fixture();
    // The read-back names the commit before its own checks fail, which is the state a
    // stale deployment leaves: origin holds a build, and it is not this one.
    fs.writeFileSync(path.join(fx.dir, "published-commit.txt"), sha + "\n");
    fs.writeFileSync(
      path.join(fx.dir, "published.txt"),
      "FAIL — the published artifact is not the build this repository produced: origin 238132 bytes, build 245183 bytes\n",
    );
    const out = path.join(fx.dir, "summary.md");
    run(summary, fx, {
      STREAMLIT_PUSH_TOKEN: undefined,
      VERIFY_PUBLISHED: "true",
      SOURCE_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      GITHUB_STEP_SUMMARY: out,
    });
    const text = fs.readFileSync(out, "utf8");
    ok(/### Not verified/.test(text), "a failed read-back is not reported as verified: " + text.slice(0, 160));
    ok(!/### Verified/.test(text), "the word the run cannot support is absent");
    ok(!/judged it against this build/.test(text), "nor the sentence that claimed it had compared the deployment");
    ok(/nothing was pushed/.test(text), "it still says the run published nothing");
    ok(/cannot say the deployment matches/.test(text), "and that it cannot vouch for the deployment");
    ok(text.includes("Deployed commit: `" + sha + "`"), "naming the commit the read-back saw, which is the build the failed checks ran against: " + text.slice(0, 240));
    ok(/not a build this run verified/.test(text), "while saying plainly that it is not vouched for");
    ok(/FAIL — the published artifact is not the build this repository produced/.test(text), "and quoting what the read-back did find");
    fs.rmSync(fx.dir, { recursive: true, force: true });
  }

  // Verify-only where the read-back never wrote a line: no output, no marker. "Nothing was
  // compared" must not become "verified" either.
  {
    const fx = fixture();
    const out = path.join(fx.dir, "summary.md");
    run(summary, fx, {
      STREAMLIT_PUSH_TOKEN: undefined,
      VERIFY_PUBLISHED: "true",
      SOURCE_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      GITHUB_STEP_SUMMARY: out,
    });
    const text = fs.readFileSync(out, "utf8");
    ok(/### Not verified/.test(text), "a run with no read-back output is not verified");
    ok(/The read-back produced no output/.test(text), "and says the read-back produced no verdict: " + text.slice(0, 200));
    ok(!/Deployed commit: `/.test(text), "and names no commit: nothing was read back to name");
    fs.rmSync(fx.dir, { recursive: true, force: true });
  }

  // Tokenless run that pushed nothing: the summary must say so, and name the commit
  // message the deployed repository should carry.
  {
    const fx = fixture();
    const out = path.join(fx.dir, "summary.md");
    run(summary, fx, {
      STREAMLIT_PUSH_TOKEN: undefined,
      VERIFY_PUBLISHED: undefined,
      SOURCE_SHA: "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091",
      GITHUB_STEP_SUMMARY: out,
    });
    const text = fs.readFileSync(out, "utf8");
    ok(/### Not published/.test(text), "it says nothing was published");
    ok(/No deploy token was configured, so nothing was pushed/.test(text), "and why");
    ok(/Sync from HealthClassEstimator 37d743e/.test(text), "and what the deployed commit should be called: " + text.slice(-120));
    ok(!/### Published/.test(text), "without claiming a publish it did not make");
    fs.rmSync(fx.dir, { recursive: true, force: true });
  }
}

fs.rmSync(BUILD, { recursive: true, force: true });
console.log("Passed " + checks + " publish-claim assertions.");
