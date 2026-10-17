#!/usr/bin/env node
/* Prove the release and audit workflows once in Actions, and record what ran.

   Why this exists. Every other check in this repository stops at the near side of
   GitHub: the suites execute a step's shell, `workflow-condition.js` decides an `if:`
   from the documented semantics, and the publish harnesses play the deployed repository
   with a local bare remote. What none of them can do is ask GitHub what it actually
   did — whether its expression language agreed with the model, whether actions/checkout
   produced the tree the step expected, or which commit a run judged. That gap has been
   written into every "not verified" clause since A29: the workflow has not run in
   Actions.

   So this dispatches the two workflows that matter and holds them to their own record:
   `deploy-streamlit.yml` with `verify_published=true` (builds, stages, reads the
   deployed copy back, and is forbidden to push) and `audit-checks.yml` (the whole
   offline suite, including the evaluator that models these conditions). It then reads
   each run back from the API and asserts the step-level outcome: the checkout step
   ran, the read-back ran, the token gate and the push were skipped, the summary was
   written, and the audit's verify job completed with no skipped or failed step. The
   run IDs, URLs, head commit and those conclusions are written to a receipt — the
   record the request is about — and the command fails when any of them disagrees.

   That last part is the point. A dispatch that merely starts runs answers "did the
   button work"; this answers "did GitHub evaluate the condition the way the model says,
   and did the step that reads the deployment actually read it". A verify-only dispatch
   whose push step ran is reported as what it is: the run published.

   Safety. Dispatching a workflow in the same concurrency group cancels the one already
   running, and `deploy-streamlit.yml` uses `cancel-in-progress: true`; so this refuses
   to dispatch while a deploy is in progress rather than cancelling somebody's release.
   The release dispatch is always verify-only, and the push step's own condition now
   carries the dispatch clause that makes that true even when a token is configured.

   Usage:
     node scripts/ci-self-test.mjs --repo <owner/name> [--ref <branch>]
                                   [--receipt <file>] [--markdown <file>]
                                   [--timeout-seconds <n>] [--poll-seconds <n>]

   Requires `gh` on PATH and GH_TOKEN with Actions write (the workflow passes the job's
   GITHUB_TOKEN). Exit status: 0 when both runs completed and every asserted step
   matched; 1 when a run failed, timed out, or disagreed with the expectation (the
   receipt still records what was seen); 2 on a usage error.
*/
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

/* --- what the two runs have to show --------------------------------------- */

const RELEASE = {
  label: "release",
  workflow: "deploy-streamlit.yml",
  job: "deploy",
  inputs: ["-f", "verify_published=true"],
  // The five decisions the release makes on a verify-only dispatch. A name here that
  // the run does not report is a failure, not a silence. The read-back is `ran`, not
  // `success`: this command proves that GitHub evaluated the condition and executed the
  // step, while whether the deployed copy matches this build is the deployment checks'
  // verdict, not the self-test's. A read-back that is skipped is still a failure — that
  // is the condition being wrong, which is what this command exists to catch.
  steps: {
    "Check out HealthClassEstimator": "success",
    "Read back what the deployed repository now holds": "ran",
    "Fail when the deploy token is not configured (main)": "skipped",
    "Explain the skipped push on a non-main ref": "skipped",
    "Commit and push (triggers Streamlit Cloud redeploy)": "skipped",
    "Summarise what this run published": "success",
  },
};

const AUDIT = {
  label: "audit",
  workflow: "audit-checks.yml",
  job: "verify",
  inputs: [],
  // The audit job has no conditional steps: everything in it is expected to run. The
  // two named below are the ones this change added and depends on, so a rename or a
  // skip is reported by name rather than as a count.
  required: [
    "Source-derived underwriting checks",
    "Verify the workflow conditions decide the run shapes they claim",
    "Verify every suite runs when main changes",
  ],
};

const ACTIVE = new Set(["in_progress", "queued", "requested", "waiting", "pending"]);

/* --- the command line ------------------------------------------------------ */

function valueFor(argv, i, flag) {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("ERROR: " + flag + " needs a value.");
    process.exit(2);
  }
  return value;
}

function parseArgs(argv) {
  const args = { ref: "main", receipt: "ci-self-test-receipt.json", timeoutSeconds: 2700, pollSeconds: 5 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--repo") { args.repo = valueFor(argv, i, "--repo"); i++; }
    else if (a === "--ref") { args.ref = valueFor(argv, i, "--ref"); i++; }
    else if (a === "--receipt") { args.receipt = valueFor(argv, i, "--receipt"); i++; }
    else if (a === "--markdown") { args.markdown = valueFor(argv, i, "--markdown"); i++; }
    else if (a === "--timeout-seconds") { args.timeoutSeconds = Number(valueFor(argv, i, "--timeout-seconds")); i++; }
    else if (a === "--poll-seconds") { args.pollSeconds = Number(valueFor(argv, i, "--poll-seconds")); i++; }
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      console.error("ERROR: unknown argument " + a);
      process.exit(2);
    }
  }
  if (args.help) return args;
  if (!args.repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repo)) {
    console.error("ERROR: --repo owner/name is required (the repository whose workflows this proves).");
    process.exit(2);
  }
  if (!args.ref || args.ref.startsWith("--")) {
    console.error("ERROR: --ref needs a branch name.");
    process.exit(2);
  }
  // A SHA cannot be dispatched usefully: GitHub records the run's branch as the ref and
  // the run list is filtered by branch, so the run this command started would not be
  // found — and "could not find a run" must never be reported as a pass.
  if (/^[0-9a-f]{40}$/i.test(args.ref)) {
    console.error("ERROR: --ref is a commit SHA. Dispatch the branch that holds it: a dispatch on a SHA reports the branch, so this check could not identify the run it started.");
    process.exit(2);
  }
  if (!Number.isFinite(args.timeoutSeconds) || args.timeoutSeconds < 0) {
    console.error("ERROR: --timeout-seconds needs a number (0 waits for no poll beyond the first).");
    process.exit(2);
  }
  if (!Number.isFinite(args.pollSeconds) || args.pollSeconds < 0) {
    console.error("ERROR: --poll-seconds needs a number (0 is allowed for fixtures).");
    process.exit(2);
  }
  if (!args.receipt) {
    console.error("ERROR: --receipt needs a path.");
    process.exit(2);
  }
  return args;
}

/* --- gh, as the only interface to Actions ---------------------------------- */

let repo = "";

function gh(args) {
  const run = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (run.error) {
    if (run.error.code === "ENOENT") {
      throw new Error("gh is not on PATH; install the GitHub CLI (https://cli.github.com) and authenticate it, or run this from the self-test workflow, which uses the job's GITHUB_TOKEN.");
    }
    throw new Error("could not run gh: " + run.error.message);
  }
  if (run.status !== 0) {
    const detail = (run.stderr || run.stdout || "").trim().split("\n").slice(-4).join(" ");
    throw new Error("gh " + args[0] + " " + (args[1] ?? "") + " failed (exit " + run.status + "): " + detail);
  }
  return run.stdout;
}

function json(args, what) {
  const text = gh(args);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("gh returned something that is not JSON for " + what + ": " + text.slice(0, 200));
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* --- dispatch, discovery, waiting ----------------------------------------- */

async function assertNoDeployInFlight() {
  // A dispatch into the same concurrency group cancels the run already in it. Refusing
  // is the only safe answer: a self-test must not abort a release somebody else started.
  const runs = json(
    ["run", "list", "--repo", repo, "--workflow", RELEASE.workflow, "--limit", "30", "--json", "databaseId,status,url,headBranch"],
    "the deploy run list",
  );
  const active = runs.filter((run) => ACTIVE.has(run.status));
  if (active.length) {
    const named = active.map((run) => "#" + run.databaseId + " (" + run.status + " on " + run.headBranch + ")" + (run.url ? " " + run.url : "")).join(", ");
    throw new Error(
      "a deploy is already running: " + named + ". Dispatching now would cancel it, because deploy-streamlit.yml runs with cancel-in-progress. Re-run the self-test when it finishes.",
    );
  }
}

function existingRunIds(spec) {
  const runs = json(
    ["run", "list", "--repo", repo, "--workflow", spec.workflow, "--branch", ref, "--limit", "50", "--json", "databaseId"],
    "the existing " + spec.label + " runs",
  );
  return new Set(runs.map((run) => run.databaseId));
}

async function discover(spec, known, dispatchedAt, timeoutSeconds, pollSeconds) {
  const attempts = Math.max(1, Math.min(60, Math.ceil((timeoutSeconds * 1000) / Math.max(pollSeconds * 1000, 250))));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const runs = json(
      [
        "run", "list", "--repo", repo, "--workflow", spec.workflow, "--branch", ref,
        "--event", "workflow_dispatch", "--limit", "50",
        "--json", "databaseId,createdAt,headSha,url,status,conclusion,event",
      ],
      "the " + spec.label + " run list",
    );
    const fresh = runs
      .filter((run) => !known.has(run.databaseId) && run.event === "workflow_dispatch" && String(run.createdAt) >= dispatchedAt)
      .sort((a, b) => a.databaseId - b.databaseId);
    if (fresh.length) return { run: fresh[0], ignored: fresh.slice(1).map((run) => run.databaseId) };
    if (attempt + 1 < attempts) await sleep(Math.max(pollSeconds * 1000, 10));
  }
  throw new Error(
    "no new workflow_dispatch run for " + spec.workflow + " on " + ref + " appeared within " +
      Math.max(1, Math.round(timeoutSeconds / 60)) + " minutes; the dispatch may have been rejected, or the run list lags. Check `gh run list --workflow " + spec.workflow + "`.",
  );
}

async function waitFor(runId, timeoutSeconds, pollSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = null;
  for (;;) {
    last = json(
      ["run", "view", String(runId), "--repo", repo, "--json", "databaseId,status,conclusion,url,headSha,event,jobs"],
      "run #" + runId,
    );
    if (last.status === "completed") return last;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return last;
    await sleep(Math.min(Math.max(pollSeconds * 1000, 10), remaining));
  }
}

/* --- what GitHub says ran -------------------------------------------------- */

function stepConclusions(run, jobName) {
  const job = (run.jobs ?? []).find((one) => one.name === jobName);
  if (!job) return null;
  const steps = {};
  for (const step of job.steps ?? []) steps[step.name] = step.conclusion;
  return steps;
}

function judgeRelease(run, problems) {
  const steps = stepConclusions(run, RELEASE.job);
  if (!steps) {
    problems.push("the release run reports no `" + RELEASE.job + "` job, so which steps ran cannot be read");
    return {};
  }
  for (const [name, expected] of Object.entries(RELEASE.steps)) {
    if (!(name in steps)) {
      problems.push("the release run reports no step named `" + name + "`");
    } else if (expected === "ran") {
      // Ran means GitHub decided the condition was true and started the step. Its
      // conclusion is the deployment's state, which the receipt records separately.
      if (steps[name] === "skipped" || steps[name] === null || steps[name] === undefined) {
        problems.push("the release step `" + name + "` was " + JSON.stringify(steps[name]) + ", so the condition never ran it");
      }
    } else if (steps[name] !== expected) {
      const detail =
        name.startsWith("Commit and push") && steps[name] !== "skipped"
          ? " — a verify-only dispatch must publish nothing; this is the step that would have pushed, so the release may have gone live"
          : "";
      problems.push("the release step `" + name + "` concluded " + JSON.stringify(steps[name]) + ", expected " + JSON.stringify(expected) + detail);
    }
  }
  if (run.event !== "workflow_dispatch") problems.push("the release run's event is " + JSON.stringify(run.event) + ", not workflow_dispatch");
  return steps;
}

function judgeAudit(run, problems) {
  const steps = stepConclusions(run, AUDIT.job);
  if (!steps) {
    problems.push("the audit run reports no `" + AUDIT.job + "` job, so which steps ran cannot be read");
    return {};
  }
  for (const [name, conclusion] of Object.entries(steps)) {
    if (conclusion !== "success") problems.push("the audit step `" + name + "` concluded " + JSON.stringify(conclusion) + ", expected \"success\"");
  }
  for (const name of AUDIT.required) {
    if (!(name in steps)) problems.push("the audit run reports no step named `" + name + "` (was it renamed or skipped?)");
  }
  if (run.event !== "workflow_dispatch") problems.push("the audit run's event is " + JSON.stringify(run.event) + ", not workflow_dispatch");
  return steps;
}

/* --- the receipt ----------------------------------------------------------- */

function receipt({ dispatchedAt, selfTestRunId, runs, problems, warnings, dispatchErrors }) {
  return {
    ok: problems.length === 0,
    repo,
    ref,
    selfTestRunId: selfTestRunId ?? null,
    dispatchedAt,
    finishedAt: new Date().toISOString(),
    runs,
    dispatchErrors,
    problems,
    warnings,
  };
}

function markdownOf(result) {
  const lines = [];
  lines.push("### CI self-test — " + (result.ok ? "PASS" : "FAIL"));
  lines.push("");
  lines.push("Repository: `" + result.repo + "` at `" + result.ref + "`" + (result.selfTestRunId ? " (self-test run " + result.selfTestRunId + ")" : ""));
  for (const label of ["release", "audit"]) {
    const run = result.runs[label];
    if (!run) {
      lines.push("- " + label + ": not dispatched");
      continue;
    }
    const id = run.runId ? "[#" + run.runId + "](" + run.url + ")" : "not found";
    lines.push(
      "- " + label + ": " + id + " — " + (run.conclusion ?? run.status ?? "unknown") +
        (run.headSha ? " at `" + String(run.headSha).slice(0, 7) + "`" : "") +
        (label === "release"
          ? "; verify-only: push " +
            (run.steps?.["Commit and push (triggers Streamlit Cloud redeploy)"] ?? "not reported") +
            "; read-back " +
            (run.readback ?? "not reported") +
            (run.deployment && run.deployment !== "not judged" ? " (deployment " + run.deployment + ")" : "")
          : ""),
    );
  }
  if (result.warnings.length) {
    lines.push("");
    lines.push("Warnings:");
    for (const warning of result.warnings) lines.push("- " + warning);
  }
  if (result.problems.length) {
    lines.push("");
    lines.push("Problems:");
    for (const problem of result.problems) lines.push("- " + problem);
  }
  return lines.join("\n") + "\n";
}

function report(result, markdownPath) {
  if (markdownPath) writeFileSync(markdownPath, markdownOf(result));
  if (result.ok) {
    console.log("PASS — GitHub ran both workflows, and every asserted step matches what the conditions claim.");
    for (const label of ["release", "audit"]) {
      const run = result.runs[label];
      console.log("       " + label + ": run #" + run.runId + " " + run.conclusion + " at " + (run.headSha ?? "?") + " — " + run.url);
    }
    console.log("       Release verify-only: the push step was skipped, so nothing was published.");
    console.log("       Audit: every step concluded success, including the condition evaluator and the coverage guard.");
    for (const warning of result.warnings) console.log("       WARN: " + warning);
    return 0;
  }
  console.log("FAIL — GitHub's own record does not match what these workflows claim.");
  for (const label of ["release", "audit"]) {
    const run = result.runs[label];
    if (run) console.log("       " + label + ": run #" + run.runId + " " + (run.conclusion ?? run.status) + " — " + run.url);
  }
  for (const warning of result.warnings) console.log("       WARN: " + warning);
  for (const problem of result.problems) console.log("       " + problem);
  console.log("       The receipt beside this verdict holds the run IDs and the step conclusions.");
  return 1;
}

/* --- main ------------------------------------------------------------------ */

let ref = "main";

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      "Usage: node scripts/ci-self-test.mjs --repo <owner/name> [--ref <branch>]\n" +
        "                                     [--receipt <file>] [--markdown <file>]\n" +
        "                                     [--timeout-seconds <n>] [--poll-seconds <n>]",
    );
    return 0;
  }
  repo = args.repo;
  ref = args.ref;
  const selfTestRunId = process.env.GITHUB_RUN_ID ?? null;

  // Fail early and loudly when gh is absent or unauthenticated: a dispatch that did not
  // happen must not read as a run that passed.
  gh(["--version"]);
  await assertNoDeployInFlight();

  const dispatchedAt = new Date(Date.now() - 60000).toISOString();
  const known = {
    release: existingRunIds(RELEASE),
    audit: existingRunIds(AUDIT),
  };

  const runs = {};
  const problems = [];
  const warnings = [];
  const dispatchErrors = {};

  // The release first. It shares a concurrency group with real deploys, so it is
  // dispatched immediately after the guard rather than after another workflow has been
  // started; the audit run has no group and can follow without displacing anything.
  for (const spec of [RELEASE, AUDIT]) {
    try {
      gh(["workflow", "run", spec.workflow, "--repo", repo, "--ref", ref, ...spec.inputs]);
    } catch (error) {
      dispatchErrors[spec.label] = error.message;
      problems.push("could not dispatch " + spec.workflow + ": " + error.message);
    }
  }

  // A run that was started is read back even when the other dispatch failed: the
  // receipt has to name every run this command caused.
  for (const spec of [RELEASE, AUDIT]) {
    if (dispatchErrors[spec.label]) continue;
    try {
      const found = await discover(spec, known[spec.label], dispatchedAt, args.timeoutSeconds, args.pollSeconds);
      const view = await waitFor(found.run.databaseId, args.timeoutSeconds, args.pollSeconds);
      const steps = spec.label === "release" ? judgeRelease(view, problems) : judgeAudit(view, problems);
      // The read-back's verdict is the deployment's state, not this command's subject.
      // A release run that is red only because the deployed copy is not this build has
      // still proved what the self-test exists to prove; it is reported as a warning so
      // the operator sees it, and the deployment checks own the failure.
      const readback = steps["Read back what the deployed repository now holds"];
      const deployment = readback === "success" ? "matches this build" : readback === "failure" ? "does not match this build" : "not judged";
      if (view.status !== "completed") {
        problems.push(
          "the " + spec.label + " run did not finish within " + args.timeoutSeconds + " seconds (status " + JSON.stringify(view.status) + "); it is " + view.url,
        );
      } else if (view.conclusion !== "success") {
        if (spec.label === "release" && readback === "failure") {
          warnings.push(
            "the release run is red because its read-back judged the deployment and failed: the copy served from richardparslow-commits/health_app.py is " +
              deployment +
              ". That is the deployment checks' verdict, not this command's; the condition ran, the checkout ran, and the push was skipped as a verify-only dispatch requires.",
          );
        } else {
          problems.push("the " + spec.label + " run concluded " + JSON.stringify(view.conclusion) + " — " + view.url);
        }
      }
      if (found.ignored.length) problems.push("more than one new dispatch run appeared for " + spec.workflow + "; judged #" + found.run.databaseId + " and ignored " + found.ignored.map((id) => "#" + id).join(", "));
      runs[spec.label] = {
        workflow: spec.workflow,
        runId: view.databaseId ?? found.run.databaseId,
        url: view.url ?? found.run.url,
        headSha: view.headSha ?? found.run.headSha,
        status: view.status,
        conclusion: view.conclusion ?? null,
        event: view.event ?? found.run.event,
        ...(spec.label === "release" ? { readback, deployment } : {}),
        steps,
      };
    } catch (error) {
      problems.push(error.message);
    }
  }

  if (runs.release && runs.audit && runs.release.headSha && runs.audit.headSha && runs.release.headSha !== runs.audit.headSha) {
    problems.push(
      "the two runs judged different commits (" + runs.release.headSha + " and " + runs.audit.headSha + "); a push landed between the dispatches, so no single commit is proven",
    );
  }

  const result = receipt({ dispatchedAt, selfTestRunId, runs, problems, warnings, dispatchErrors });
  writeFileSync(args.receipt, JSON.stringify(result, null, 2) + "\n");
  return report(result, args.markdown);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error("ci-self-test: " + error.message);
    process.exitCode = 1;
  });
