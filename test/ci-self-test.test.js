"use strict";
/* The self-test that proves the workflows in Actions, held to a `gh` that answers the
   way the API does.

   `scripts/ci-self-test.mjs` is the only check in this repository whose subject is
   GitHub's own execution: it dispatches the release (verify-only) and audit workflows,
   waits for them, and holds each run's step-level record to what the conditions claim.
   Nothing local can exercise the API, so this file plays it: a fake `gh` that answers
   `workflow run`, `run list` and `run view` from a scenario, records every call, and
   makes the run appear only after it was dispatched — the same ordering the real API
   has. The assertions are on the receipt and the calls: which run was chosen, which
   commit, which step concluded what.

   The cases that matter are the ones where a dispatch looks successful and the run says
   otherwise: a verify-only release whose push step ran (it published), a read-back that
   was skipped, an audit step that failed, a run that never finished, a dispatch that was
   rejected, and a deploy already in flight that a new dispatch would cancel.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts/ci-self-test.mjs");
let checks = 0;
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

const SHA_RELEASE = "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091";
const SHA_AUDIT = "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091";

const RELEASE_STEPS = [
  ["Set up job", "success"],
  ["Check out HealthClassEstimator", "success"],
  ["Set up Node.js", "success"],
  ["Build the artifact and the judged copy", "success"],
  ["Sync the artifact and its manifest into streamlit repo", "success"],
  ["Verify the pair the way the deployed app does", "success"],
  ["Read back what the deployed repository now holds", "success"],
  ["Fail when no push credential is configured (main)", "skipped"],
  ["Prove the push credential works before anything is built", "success"],
  ["Explain the skipped push on a non-main ref", "skipped"],
  ["Commit and push (triggers Streamlit Cloud redeploy)", "skipped"],
  ["Summarise what this run published", "success"],
  ["Complete job", "success"],
];
const AUDIT_STEPS = [
  ["Set up job", "success"],
  ["Run actions/checkout@v4", "success"],
  ["Source-derived underwriting checks", "success"],
  ["Build standalone distribution", "success"],
  ["Verify the workflow conditions decide the run shapes they claim", "success"],
  ["Verify every suite runs when main changes", "success"],
  ["Complete job", "success"],
];

const stepsOf = (pairs) => pairs.map(([name, conclusion], number) => ({ name, conclusion, number, status: "completed" }));

function run({ id, workflow, conclusion = "success", headSha = SHA_RELEASE, steps = RELEASE_STEPS, createdAt = "2020-01-01T00:00:00Z", status = "completed" }) {
  // `createdAt` matters only for pre-existing runs; the fake replaces it for the runs a
  // dispatch creates, so a fixture cannot encode a time the command has already passed.
  return {
    databaseId: id,
    createdAt,
    headSha,
    url: "https://github.com/richardparslow-commits/HealthClassEstimator/actions/runs/" + id,
    status,
    conclusion: status === "completed" ? conclusion : null,
    event: "workflow_dispatch",
    headBranch: "main",
    jobs: [
      {
        name: workflow === "deploy-streamlit.yml" ? "deploy" : "verify",
        status: status === "completed" ? "completed" : "in_progress",
        conclusion: status === "completed" ? conclusion : null,
        steps: stepsOf(steps),
      },
    ],
  };
}

const HAPPY = {
  existing: {
    "deploy-streamlit.yml": [run({ id: 100, workflow: "deploy-streamlit.yml" })],
    "audit-checks.yml": [run({ id: 99, workflow: "audit-checks.yml", steps: AUDIT_STEPS })],
  },
  newRuns: {
    "deploy-streamlit.yml": [
      run({ id: 111, workflow: "deploy-streamlit.yml", createdAt: "2026-10-17T18:00:00Z" }),
    ],
    "audit-checks.yml": [
      run({ id: 222, workflow: "audit-checks.yml", headSha: SHA_AUDIT, steps: AUDIT_STEPS, createdAt: "2026-10-17T17:59:00Z" }),
    ],
  },
};

const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs");
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_CALLS, JSON.stringify(argv) + "\\n");
const scenario = JSON.parse(fs.readFileSync(process.env.FAKE_GH_SCENARIO, "utf8"));
if (argv[0] === "--version") { console.log("gh version 2.40.0 (fake)"); process.exit(0); }
function flag(name) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; }
const calls = fs.readFileSync(process.env.FAKE_GH_CALLS, "utf8").split("\\n").filter(Boolean).map((line) => JSON.parse(line));
const dispatched = new Set(calls.filter((c) => c[0] === "workflow" && c[1] === "run").map((c) => c[2]));
function runsFor(file) {
  const existing = (scenario.existing || {})[file] || [];
  // A dispatched run is created now, not at a timestamp written into the fixture: the
  // command filters runs by the time it dispatched, so a fixed date is a test that
  // passes only until the wall clock walks past it. This is what CI found.
  const fresh = dispatched.has(file)
    ? ((scenario.newRuns || {})[file] || []).map((r) => ({ ...r, createdAt: new Date().toISOString() }))
    : [];
  return existing.concat(fresh);
}
if (argv[0] === "workflow" && argv[1] === "run") {
  const file = argv[2];
  const failure = (scenario.dispatchFailures || {})[file];
  if (failure) { console.error(failure); process.exit(1); }
  console.log("created workflow_dispatch event for " + file);
  process.exit(0);
}
if (argv[0] === "run" && argv[1] === "list") {
  const file = flag("--workflow");
  const runs = runsFor(file).map((r) => ({ databaseId: r.databaseId, createdAt: r.createdAt, headSha: r.headSha, url: r.url, status: r.status, conclusion: r.conclusion, event: r.event, headBranch: r.headBranch }));
  console.log(JSON.stringify(runs));
  process.exit(0);
}
if (argv[0] === "run" && argv[1] === "view") {
  const id = Number(argv[2]);
  const files = Object.keys(scenario.existing || {}).concat(Object.keys(scenario.newRuns || {}));
  const all = files.reduce((acc, file) => acc.concat(runsFor(file)), []);
  const found = all.find((r) => r.databaseId === id);
  if (!found) { console.error("fake gh: no run " + id); process.exit(1); }
  const view = JSON.parse(JSON.stringify(found));
  if (scenario.neverCompletes) {
    view.status = "in_progress";
    view.conclusion = null;
    view.jobs = view.jobs.map((job) => ({ ...job, status: "in_progress", conclusion: null, steps: job.steps.map((step) => ({ ...step, status: "in_progress", conclusion: null })) }));
  }
  console.log(JSON.stringify(view));
  process.exit(0);
}
console.error("fake gh: unexpected " + JSON.stringify(argv));
process.exit(1);
`;

function scenarioWith(overrides = {}) {
  return {
    existing: JSON.parse(JSON.stringify(HAPPY.existing)),
    newRuns: JSON.parse(JSON.stringify(HAPPY.newRuns)),
    ...overrides,
  };
}

function fixture(scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-self-test-"));
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin);
  const ghPath = path.join(bin, "gh");
  fs.writeFileSync(ghPath, FAKE_GH);
  fs.chmodSync(ghPath, 0o755);
  const scenarioPath = path.join(dir, "scenario.json");
  fs.writeFileSync(scenarioPath, JSON.stringify(scenario));
  const calls = path.join(dir, "calls.log");
  fs.writeFileSync(calls, "");
  return {
    dir,
    bin,
    calls,
    receipt: path.join(dir, "receipt.json"),
    markdown: path.join(dir, "receipt.md"),
    env: (extra = {}) => ({
      ...process.env,
      PATH: bin + ":" + (process.env.PATH ?? ""),
      FAKE_GH_SCENARIO: scenarioPath,
      FAKE_GH_CALLS: calls,
      GH_TOKEN: "fake-token",
      ...extra,
    }),
  };
}

function invoke(fx, args = [], env = {}) {
  const base = ["--repo", "richardparslow-commits/HealthClassEstimator", "--ref", "main", "--receipt", fx.receipt, "--markdown", fx.markdown, "--timeout-seconds", "0", "--poll-seconds", "0"];
  return spawnSync(process.execPath, [script, ...base, ...args], { env: fx.env(env), encoding: "utf8" });
}

function callsOf(fx) {
  return fs
    .readFileSync(fx.calls, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function receiptOf(fx) {
  return JSON.parse(fs.readFileSync(fx.receipt, "utf8"));
}

/* --- the happy path -------------------------------------------------------- */

{
  const fx = fixture(scenarioWith());
  const result = invoke(fx);
  equal(result.status, 0, "both runs completed with the asserted steps: " + result.stdout + result.stderr);
  ok(/PASS/.test(result.stdout), "the command says what it proved");

  const calls = callsOf(fx);
  const dispatched = calls.filter((call) => call[0] === "workflow" && call[1] === "run");
  equal(dispatched.length, 2, "exactly two workflows were dispatched");
  equal(dispatched[0][2], "deploy-streamlit.yml", "the release is dispatched first, while no deploy can have started since the guard");
  equal(
    dispatched[0].slice(-2),
    ["-f", "verify_published=true"],
    "verify-only, so the dispatch cannot publish",
  );
  equal(dispatched[1][2], "audit-checks.yml", "then the audit suite");
  ok(!dispatched[1].includes("-f"), "with no input, so it runs its ordinary push shape");
  ok(
    dispatched.every((call) => call.includes("--repo") && call.includes("richardparslow-commits/HealthClassEstimator")),
    "both dispatches name the repository explicitly",
  );

  const receipt = receiptOf(fx);
  equal(receipt.ok, true, "the receipt records success");
  equal(receipt.repo, "richardparslow-commits/HealthClassEstimator", "the receipt names the repository");
  equal(receipt.ref, "main", "and the ref");
  equal(receipt.runs.release.runId, 111, "the release run chosen is the one created by this dispatch, not the older run 100");
  equal(receipt.runs.audit.runId, 222, "so is the audit run, not run 99");
  equal(receipt.runs.release.url, "https://github.com/richardparslow-commits/HealthClassEstimator/actions/runs/111", "the URL is recorded");
  equal(receipt.runs.release.headSha, SHA_RELEASE, "with the commit the release judged");
  equal(receipt.runs.audit.headSha, SHA_AUDIT, "and the commit the audit judged");
  equal(receipt.runs.release.workflow, "deploy-streamlit.yml", "the workflow file is named");
  equal(receipt.runs.release.event, "workflow_dispatch", "and the event that started it");
  equal(receipt.runs.release.steps["Check out HealthClassEstimator"], "success", "the release's checkout is recorded as having run");
  equal(receipt.runs.release.steps["Read back what the deployed repository now holds"], "success", "and its read-back");
  equal(receipt.runs.release.steps["Commit and push (triggers Streamlit Cloud redeploy)"], "skipped", "and the push as skipped");
  equal(receipt.runs.audit.steps["Verify the workflow conditions decide the run shapes they claim"], "success", "the audit's condition evaluation ran");
  equal(receipt.runs.audit.steps["Verify every suite runs when main changes"], "success", "and its coverage guard");
  equal(receipt.problems, [], "with nothing to report");
  equal(receipt.dispatchErrors, {}, "and no dispatch error");

  const markdown = fs.readFileSync(fx.markdown, "utf8");
  ok(/### CI self-test — PASS/.test(markdown), "the summary says it passed");
  ok(markdown.includes("#111") && markdown.includes("#222"), "and names both run IDs");
  ok(/verify-only: push skipped/.test(markdown), "and states that the release published nothing");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the shapes that must fail --------------------------------------------- */

{
  // A verify-only dispatch whose push step ran: the run published. This is the case the
  // release dispatch's own condition exists to prevent, so it must be loud.
  const scenario = scenarioWith();
  scenario.newRuns["deploy-streamlit.yml"][0].jobs[0].steps = stepsOf(
    RELEASE_STEPS.map(([name, conclusion]) =>
      name.startsWith("Commit and push") ? [name, "success"] : [name, conclusion],
    ),
  );
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 1, "a verify-only run that pushed fails the self-test");
  ok(/Commit and push \(triggers Streamlit Cloud redeploy\)/.test(result.stdout), "naming the step: " + result.stdout);
  ok(/may have gone live/.test(result.stdout), "and saying what that means");
  equal(receiptOf(fx).ok, false, "the receipt records the failure");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // The read-back ran and failed because the deployed copy is not this build. That is a
  // red release run, but the machinery did what it was asked: the condition ran the
  // step, so the self-test passes and reports the deployment as a warning — the
  // deployment checks own that verdict.
  const scenario = scenarioWith();
  scenario.newRuns["deploy-streamlit.yml"][0].conclusion = "failure";
  scenario.newRuns["deploy-streamlit.yml"][0].jobs[0].conclusion = "failure";
  scenario.newRuns["deploy-streamlit.yml"][0].jobs[0].steps = stepsOf(
    RELEASE_STEPS.map(([name, conclusion]) =>
      name === "Read back what the deployed repository now holds" ? [name, "failure"] : [name, conclusion],
    ),
  );
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 0, "a read-back that ran and judged the deployment does not fail the self-test: " + result.stdout);
  const receipt = receiptOf(fx);
  equal(receipt.runs.release.readback, "failure", "the receipt records what the read-back concluded");
  equal(receipt.runs.release.deployment, "does not match this build", "and what that means for the deployment");
  ok(receipt.warnings.some((warning) => /read-back judged the deployment/.test(warning)), "with a warning naming it: " + JSON.stringify(receipt.warnings));
  ok(/deployment does not match this build/.test(fs.readFileSync(fx.markdown, "utf8")), "and the summary says so");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // The read-back skipped: the run may be green, but the condition never ran the step.
  const scenario = scenarioWith();
  scenario.newRuns["deploy-streamlit.yml"][0].jobs[0].steps = stepsOf(
    RELEASE_STEPS.map(([name, conclusion]) =>
      name === "Read back what the deployed repository now holds" ? [name, "skipped"] : [name, conclusion],
    ),
  );
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 1, "a skipped read-back fails the self-test");
  ok(/was "skipped", so the condition never ran it/.test(result.stdout), "naming the skipped step: " + result.stdout);
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // The run failed somewhere the assertions do not explain: that is a machinery failure,
  // not a deployment verdict, and must not be waved through as one.
  const scenario = scenarioWith();
  scenario.newRuns["deploy-streamlit.yml"][0].conclusion = "failure";
  scenario.newRuns["deploy-streamlit.yml"][0].jobs[0].conclusion = "failure";
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 1, "a red release run whose read-back passed fails the self-test");
  ok(/concluded "failure"/.test(result.stdout), "saying the run failed: " + result.stdout);
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // A step the audit run does not report at all: renamed or removed, not run.
  const scenario = scenarioWith();
  scenario.newRuns["audit-checks.yml"][0].jobs[0].steps = stepsOf(AUDIT_STEPS);
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 0, "the baseline audit shape passes before it is changed");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // An audit step that failed: the suite ran and something in it did not.
  const scenario = scenarioWith();
  scenario.newRuns["audit-checks.yml"][0].jobs[0].steps = stepsOf(
    AUDIT_STEPS.map(([name, conclusion]) =>
      name === "Verify the workflow conditions decide the run shapes they claim" ? [name, "failure"] : [name, conclusion],
    ),
  );
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 1, "a failed audit step fails the self-test");
  ok(/Verify the workflow conditions decide the run shapes they claim/.test(result.stdout), "naming the step that failed");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // A renamed condition step: absence is a failure, not silence.
  const scenario = scenarioWith();
  scenario.newRuns["audit-checks.yml"][0].jobs[0].steps = stepsOf(
    AUDIT_STEPS.map(([name, conclusion]) =>
      name === "Verify the workflow conditions decide the run shapes they claim" ? ["Verify the workflow conditions", conclusion] : [name, conclusion],
    ),
  );
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 1, "a renamed audit step fails the self-test");
  ok(/reports no step named/.test(result.stdout), "saying the step is missing: " + result.stdout);
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // A run that never finishes: the receipt still names it, because that is the record an
  // operator needs to go and look.
  const fx = fixture(scenarioWith({ neverCompletes: true }));
  const result = invoke(fx);
  equal(result.status, 1, "an unfinished run fails the self-test");
  const receipt = receiptOf(fx);
  equal(receipt.ok, false, "the receipt records the failure");
  equal(receipt.runs.release.runId, 111, "and still names the release run");
  equal(receipt.runs.release.status, "in_progress", "with the status it was left in");
  ok(receipt.problems.some((problem) => /did not finish within 0 seconds/.test(problem)), "and says it never finished: " + JSON.stringify(receipt.problems));
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // A rejected dispatch: the other run is still read back, and the error is recorded.
  const fx = fixture(scenarioWith({ dispatchFailures: { "audit-checks.yml": "workflow not found on this ref" } }));
  const result = invoke(fx);
  equal(result.status, 1, "a rejected dispatch fails the self-test");
  const receipt = receiptOf(fx);
  ok(/workflow not found on this ref/.test(receipt.dispatchErrors.audit ?? ""), "the receipt records the audit dispatch error");
  equal(receipt.runs.release.runId, 111, "while the run that did start is still recorded");
  ok(/could not dispatch audit-checks.yml/.test(result.stdout), "and the verdict says which dispatch failed");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // A deploy already in flight: dispatching would cancel it, so nothing is dispatched.
  const scenario = scenarioWith();
  scenario.existing["deploy-streamlit.yml"] = [
    run({ id: 100, workflow: "deploy-streamlit.yml" }),
    { ...run({ id: 101, workflow: "deploy-streamlit.yml" }), status: "in_progress", conclusion: null, createdAt: "2026-10-17T17:00:00Z" },
  ];
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 1, "an in-flight deploy stops the self-test");
  ok(/would cancel it/.test(result.stderr), "saying why it will not dispatch: " + result.stderr);
  equal(callsOf(fx).filter((call) => call[0] === "workflow" && call[1] === "run").length, 0, "and dispatching nothing");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  // A push landing between the dispatches: the two runs judged different commits, so no
  // single commit is proven.
  const scenario = scenarioWith();
  scenario.newRuns["audit-checks.yml"][0].headSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const fx = fixture(scenario);
  const result = invoke(fx);
  equal(result.status, 1, "two runs on different commits fail the self-test");
  ok(/judged different commits/.test(result.stdout), "naming both: " + result.stdout);
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the interface itself --------------------------------------------------- */

{
  // gh absent: a dispatch that could not happen is a failure, never a quiet pass.
  const fx = fixture(scenarioWith());
  const empty = path.join(fx.dir, "empty-bin");
  fs.mkdirSync(empty);
  const result = invoke(fx, [], { PATH: empty });
  equal(result.status, 1, "no gh is a failure");
  ok(/gh is not on PATH/.test(result.stderr), "saying what is missing: " + result.stderr);
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

{
  const fx = fixture(scenarioWith());
  const noRepo = spawnSync(process.execPath, [script, "--ref", "main"], { env: fx.env(), encoding: "utf8" });
  equal(noRepo.status, 2, "a missing --repo is a usage error");
  ok(/--repo owner\/name is required/.test(noRepo.stderr), "with the fix: " + noRepo.stderr);

  const shaRef = spawnSync(process.execPath, [script, "--repo", "o/r", "--ref", SHA_RELEASE], { env: fx.env(), encoding: "utf8" });
  equal(shaRef.status, 2, "a SHA ref is refused: its run cannot be identified by branch");
  ok(/Dispatch the branch that holds it/.test(shaRef.stderr), "with the fix: " + shaRef.stderr);
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

console.log("Passed " + checks + " ci-self-test assertions.");
