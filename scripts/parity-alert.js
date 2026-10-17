#!/usr/bin/env node
/* Write the drift tracking issue and its comments.

   `.github/workflows/consumer-parity.yml` opens one labelled issue while a
   comparison job is not green. That issue is the only thing a person sees when a
   scheduled run goes red, so it has to answer the question the comparison itself
   answers: *which deployment was judged?*

   It used to say which jobs failed, the run URL and the build commit — everything
   about this repository and nothing about the deployed copies. That made the three
   states the check can tell apart look identical in the notification:
     - the deployment is the named commit and has not been published yet,
     - the deployment is an older commit (the copy is behind this build), and
     - the job failed before it read any commit (a missing token, a ref that does
       not exist, a cancelled run).
   Each has a different fix — wait, republish, or fix the read — so the issue names
   the deployment for every job it reports, and says plainly when there is none.

   The text lives here rather than in a workflow heredoc so it can be fixture-tested:
   a notification that drops the commit, or invents one for a job that never read
   it, is a bug in the message rather than in the comparison.

   Usage (the workflow passes these as env; see the alert job):
     node scripts/parity-alert.js --not-green       # "Live website, Streamlit artifact" or "none"
     node scripts/parity-alert.js --deployments     # "- Label: repo@sha", one per job
     node scripts/parity-alert.js --body            # the issue body
     node scripts/parity-alert.js --comment         # "still failing" comment
     node scripts/parity-alert.js --closed-comment  # "matches again" comment

   `RESULTS` is `toJSON(needs)`: one entry per comparison job, each with a `result`
   and the `outputs` the job declared (`repo`, `commit`). A job that never reached
   its fetch step has empty outputs, which is reported as "no deployment read"
   rather than as a missing deployment.
*/
"use strict";

const JOB_LABELS = {
  website: "Live website",
  streamlit: "Streamlit artifact",
  "streamlit-runtime": "Streamlit runtime",
};

// A job's deployment as a person would say it: repo@short-sha, or why there is none.
// `result` decides how an absent commit is described — a job that did not run never
// had the chance to read one, and saying "failed before reading it" about a skipped
// job would send someone looking for a token problem that does not exist.
function deploymentOf(id, entry) {
  const label = JOB_LABELS[id] ?? id;
  const outputs = (entry && entry.outputs) || {};
  const commit = String(outputs.commit ?? "").trim();
  const repo = String(outputs.repo ?? "").trim();
  const short = commit ? commit.slice(0, 7) : "";
  if (entry?.result === "success")
    return { label, state: "judged", text: commit ? (repo || "unknown") + "@" + short : "no deployment recorded" };
  if (entry?.result === "skipped") return { label, state: "skipped", text: "the job did not run" };
  // A cancelled job may still have read its commit before it was stopped; naming it
  // is more use than hiding it behind the cancellation.
  if (commit)
    return {
      label,
      state: "judged",
      text: (repo || "unknown") + "@" + short + (entry?.result === "cancelled" ? " (cancelled before it finished)" : ""),
    };
  if (entry?.result === "cancelled") return { label, state: "cancelled", text: "cancelled before it finished" };
  return {
    label,
    state: "unread",
    text: "no deployment read — the job ended before it fetched one (a missing read token, a ref that does not exist, or a failed build)",
  };
}

// Every job the alert depends on, in the order it runs. A job added to `needs` later
// still appears, under its own id, rather than being dropped from the report.
function deployments(results) {
  const known = Object.keys(JOB_LABELS).filter((id) => Object.prototype.hasOwnProperty.call(results ?? {}, id));
  const extra = Object.keys(results ?? {}).filter((id) => !known.includes(id));
  return [...known, ...extra].map((id) => ({ id, ...deploymentOf(id, results[id]) }));
}

const deploymentLines = (judged) => judged.map((d) => "  - " + d.label + ": " + d.text);

function notGreen(results) {
  return Object.entries(results ?? {})
    .filter(([, entry]) => entry?.result !== "success")
    .map(([id]) => JOB_LABELS[id] ?? id);
}

const list = (items) => (items.length ? items.join(", ") : "none");

// The issue body. The deployment list is not a footnote: it is the part that says
// whether the fix is a republish, a re-run, or a read that needs a token.
function buildBody({ results, owner, runUrl, headSha, event }) {
  const judged = deployments(results);
  const lines = [
    "@" + owner + " — the consumer-parity check found that a deployed copy of the estimator no longer matches the build.",
    "",
    "- Failing job(s): " + list(notGreen(results)),
    "- Run: " + runUrl,
    "- Build commit: " + headSha,
    "- Trigger: " + event,
    "- Deployment judged:",
    ...deploymentLines(judged),
    "",
    "Open the run's Summary tab for the per-consumer diff. The check compares the live website and the published Streamlit artifact against a fresh build of main — the artifact byte for byte, with its manifest, and the website against both the page it serves and the page committed in its repository — and exercises the deployed wrapper's own verification. It fails when a consumer disagrees on underwriting logic (rules, state or engine), when the artifact is not the reviewed build, or when the served page is not the deployment named above.",
    "",
    "If the live website job names a cache rather than a component, nothing was compared: the run asked for a URL no cache can hold an entry for and was still answered from one, so re-run once that entry has expired instead of republishing.",
    "",
    "If it names one of the page's declared adaptations instead, or says the page is not this build with them, the page and this repository disagree about what the page is: a page serving an older build has to be regenerated from this one, and a release that moved an anchor the page's generator depends on has to move the generator and `consumers/website.json` in the same change.",
    "",
    "Read the deployment line against the commit you expect to be live. The same commit means the deploy is green here but has not been published (or has not finished publishing); an older commit means the deployed copy is behind this build and has to be republished; and a job that reports no deployment read failed before it judged anything, so fix that read — usually the token — and re-run before treating the comparison as a verdict.",
    "",
    "If a copy is simply behind the build, republish it (the website from its repository; the Streamlit app from deploy-streamlit.yml). Never edit a copy to match.",
    "",
    "This issue closes automatically on the first run where every consumer matches again.",
  ];
  return lines.join("\n") + "\n";
}

// The comment on a later red run: still failing, and what it judged this time.
function buildComment({ results, runUrl, headSha, event }) {
  const judged = deployments(results);
  const failing = judged.filter((d) => results[d.id]?.result !== "success");
  return (
    "Still failing: " +
    list(notGreen(results)) +
    " — " +
    runUrl +
    " (build " +
    headSha +
    ", trigger " +
    event +
    ").\n" +
    "Deployments judged: " +
    (failing.length ? failing.map((d) => d.label + " " + d.text).join("; ") : "none") +
    "."
  );
}

// The comment that closes the issue: every consumer matched, and which deployments
// were found to match. A close that names them is the record that the deployment a
// person suspected was in fact the one checked.
function buildClosedComment({ results, runUrl, headSha, event }) {
  return (
    "Every consumer matches the build again: " +
    runUrl +
    " (build " +
    headSha +
    ", trigger " +
    event +
    ").\n" +
    "Deployments judged: " +
    deployments(results)
      .map((d) => d.label + " " + d.text)
      .join("; ") +
    ". Closing."
  );
}

function main(argv) {
  const mode = argv[0] ?? "--body";
  let results;
  try {
    results = JSON.parse(process.env.RESULTS ?? "");
  } catch (error) {
    throw new Error("RESULTS is not the JSON of the `needs` context: " + error.message);
  }
  const context = {
    results,
    owner: process.env.OWNER ?? "",
    runUrl: process.env.RUN_URL ?? "",
    headSha: process.env.HEAD_SHA ?? "",
    event: process.env.EVENT ?? "",
  };
  if (mode === "--not-green") process.stdout.write(list(notGreen(results)));
  else if (mode === "--deployments") process.stdout.write(deploymentLines(deployments(results)).join("\n"));
  else if (mode === "--body") process.stdout.write(buildBody(context));
  else if (mode === "--comment") process.stdout.write(buildComment(context) + "\n");
  else if (mode === "--closed-comment") process.stdout.write(buildClosedComment(context) + "\n");
  else throw new Error("Unknown mode: " + mode + " (--not-green, --deployments, --body, --comment or --closed-comment)");
  return 0;
}

module.exports = { buildBody, buildComment, buildClosedComment, deployments, deploymentOf, notGreen };

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error("parity-alert: " + error.message);
    process.exitCode = 1;
  }
}
