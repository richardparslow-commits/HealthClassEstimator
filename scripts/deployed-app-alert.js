#!/usr/bin/env node
/* Write the deployed-app tracking issue and its comments.

   `.github/workflows/streamlit-deployed.yml` loads the deployed app in a browser every
   six hours. Until this existed, a red run lived only in the Actions tab — the same way
   the app could sit asleep, or serve an older release, while every check in this
   repository passed. The two other deployed-copy checks already keep an issue open while
   they fail (the parity run and, in the site repository, the deployment check); this is
   the third, and it is the one about whether a person can use the app at all.

   What it adds over "the run is red": the check's own verdict, quoted in the issue. The
   check writes its report as JSON (`--json-out`), and the deployed job reduces it to
   this script's `--outputs`: whether it passed, whether the app arrived awake or had to
   be woken, and each problem it found. The issue therefore says *what* a visitor got —
   "the frame runs release 80, this repository is release 81" — instead of pointing at
   a run summary.

   Three states, because a red job is not always a broken app:
     failing — the job failed. If the check reported a verdict it has problems; if it
               reported none, nothing was judged, and the text says so rather than
               claiming the app is wrong (that is a browser that would not install, a
               step that timed out, a report that never got written).
     passing — the job succeeded; the deployed app serves this release.
     unknown — cancelled or skipped, or no result at all. The workflow leaves the issue
               alone: the run never looked, so it cannot open one about what it saw or
               close one about what it did not.

   Usage (env: RUN_URL, HEAD_SHA, EVENT, RESULT, OUTCOME, STATE, PROBLEMS, OWNER,
   REPORT_FILE):
     node scripts/deployed-app-alert.js --state           # failing | passing | unknown
     node scripts/deployed-app-alert.js --outputs         # $GITHUB_OUTPUT lines
     node scripts/deployed-app-alert.js --body
     node scripts/deployed-app-alert.js --comment
     node scripts/deployed-app-alert.js --closed-comment
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DECLARATION = path.join(ROOT, "consumers", "streamlit.json");
const FAILING = new Set(["failure", "timed_out", "action_required"]);

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

// "failing" is the job's result, not the app's: a run that ended unsuccessfully is
// reported whether or not the check got far enough to judge the deployment. The body
// then distinguishes the two, because "the app is wrong" and "the check never looked"
// send a person to different places.
function stateOf(result) {
  const value = String(result ?? "").trim();
  if (value === "success") return "passing";
  if (FAILING.has(value)) return "failing";
  return "unknown";
}

// The report the check wrote, reduced to the three facts the issue needs. Anything
// unreadable is "unknown" with the reason kept, so the body can say what was not
// learned instead of reporting an absence of problems as agreement.
function readReport(file) {
  const name = String(file ?? "").trim();
  if (!name) return { outcome: "unknown", state: "", problems: [], reason: "no report was named" };
  if (!fs.existsSync(name)) return { outcome: "unknown", state: "", problems: [], reason: "the check wrote no report" };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(name, "utf8"));
  } catch {
    return { outcome: "unknown", state: "", problems: [], reason: "the report is not JSON" };
  }
  if (typeof data.ok !== "boolean" || !Array.isArray(data.lines) || !Array.isArray(data.problems))
    return { outcome: "unknown", state: "", problems: [], reason: "the report is not a verdict" };
  const stateLine = data.lines.find((line) => /^State\s+:/.test(String(line)));
  return {
    outcome: data.ok ? "pass" : "fail",
    state: stateLine ? String(stateLine).replace(/^State\s+:\s*/, "").trim() : "",
    problems: data.problems.map((problem) => String(problem)),
    reason: "",
  };
}

// `$GITHUB_OUTPUT` is line-oriented: a value with a newline needs the delimiter form,
// and the delimiter must not occur in the value.
function outputLine(name, value) {
  const text = String(value ?? "");
  if (!text.includes("\n")) return name + "=" + text;
  let token = "__" + name.toUpperCase() + "__";
  while (text.includes(token)) token += "_";
  return name + "<<" + token + "\n" + text + "\n" + token;
}

function outputs(report) {
  return [
    outputLine("outcome", report.outcome),
    outputLine("state", report.state),
    outputLine("problems", report.problems.join("\n")),
  ].join("\n");
}

// The app the issue is about is the one the check loaded, and both read the single
// declaration: an issue that names a hand-typed URL could outlive a moved deployment.
function declaredUrl() {
  if (!fs.existsSync(DECLARATION))
    throw new Error("no " + path.relative(ROOT, DECLARATION) + " — it declares the deployed app this issue is about");
  let declared;
  try {
    declared = JSON.parse(fs.readFileSync(DECLARATION, "utf8"));
  } catch (error) {
    throw new Error(path.relative(ROOT, DECLARATION) + " is not JSON: " + error.message);
  }
  if (typeof declared.deployedUrl !== "string" || !declared.deployedUrl.startsWith("http"))
    throw new Error(path.relative(ROOT, DECLARATION) + " has no deployedUrl");
  return declared.deployedUrl;
}

function context() {
  const sha = env("HEAD_SHA");
  return {
    owner: env("OWNER", "maintainer"),
    runUrl: env("RUN_URL", "(no run URL)"),
    commit: sha ? sha.slice(0, 7) : "(unknown commit)",
    event: env("EVENT", "unknown"),
    result: env("RESULT"),
    outcome: env("OUTCOME"),
    state: env("STATE"),
    problems: env("PROBLEMS")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    appUrl: declaredUrl(),
  };
}

const header = (ctx) => [
  "- App: " + ctx.appUrl,
  "- Run: " + ctx.runUrl,
  "- Commit checked: " + ctx.commit,
  "- Trigger: " + ctx.event,
  "- Job result: " + (ctx.result || "unknown"),
];

const CHECK_DESCRIPTION =
  "The check loads the declared URL in headless Chromium the way a visitor does: it clicks the sleep screen's wake button when the app is asleep, waits for the estimator's frame, and requires this repository's release inside it with the acknowledgment gate and the product select — and it measures the two controls that move a visitor forward, the gate's continue button and the interview's Next, in the window the app is served in, because a frame an embedder made taller than that window used to put them at the bottom of a document nobody sees the whole of. Its run summary carries the full output.";

function buildBody(ctx) {
  const lines = [];
  if (ctx.outcome === "fail") {
    lines.push(
      "@" + ctx.owner + " — the six-hourly check loaded the deployed app in a browser and did not get this repository's release.",
      "",
      ...header(ctx),
      "- App state: " + (ctx.state || "not reported"),
      "- Finding(s):",
      ...(ctx.problems.length ? ctx.problems.map((problem) => "  - " + problem) : ["  - the check reported a failure without naming one"]),
      "",
      CHECK_DESCRIPTION,
      "",
      "A sleep screen is not this failure: the check clicks it, and a woken app passes. This means a visitor is not getting the tool, is getting a different build, or has no visible way forward. Wake it in the Streamlit Cloud dashboard if it is asleep; if it is awake and the frame runs another release, the deployed pair has to be published — `deploy-streamlit.yml` pushes it when `STREAMLIT_PUSH_TOKEN` is set, and until then `app_embedded.html` and `app_embedded.manifest.json` are copied and committed there. A finding that a control is below the fold is about the frame the embedder sets, not the app: `health_app.py` embeds it at `st.iframe(..., height=2400)`, and a window-like height (the website uses 746px) is the right way to embed this. Since release 82 the app no longer depends on that — it sizes itself to the window it is actually shown in and scrolls inside itself — so a copy whose footer still sits at the bottom of a 2,400px frame is older than that release, and publishing this release is the fix. Never edit a deployed copy to match.",
      "",
      "This issue closes automatically on the first run where the deployed app serves this release again.",
    );
  } else if (ctx.outcome === "pass") {
    lines.push(
      "@" + ctx.owner + " — the six-hourly check judged the deployed app and passed, but the job itself failed.",
      "",
      ...header(ctx),
      "- App state: " + (ctx.state || "not reported"),
      "- Verdict: a browser gets this release from the deployed app",
      "",
      "This is not evidence that the app is behind or broken: the check's own verdict was a pass, and something after it — its report, or the step that writes the run summary — ended the job instead. Read the log for that step. Nothing has to be republished, and this issue closes on the first run that passes, which is the next one if the failure was transient.",
      "",
      CHECK_DESCRIPTION,
    );
  } else {
    lines.push(
      "@" + ctx.owner + " — the six-hourly check about the deployed app ended without a verdict.",
      "",
      ...header(ctx),
      "- Verdict: none — the check did not judge the app",
      "",
      "This is not evidence that the app is broken or behind: the job ended before the check reported, which is usually the browser it drives failing to install, a step timing out, or a run that was stopped. The app was not looked at, so read the run's log for what stopped it, fix that and re-run. Nothing has to be republished — and nothing should be, on the strength of this run.",
      "",
      CHECK_DESCRIPTION,
      "",
      "This issue closes on the first run that passes, and on the first run that judges the app and finds it wrong (which replaces this text with the finding).",
    );
  }
  return lines.join("\n") + "\n";
}

// The comment on a later red run: what this run saw, not just that it is red again.
function buildComment(ctx) {
  if (ctx.outcome === "fail")
    return [
      "@" + ctx.owner + " — still failing.",
      "",
      "- Run: " + ctx.runUrl,
      "- Commit checked: " + ctx.commit,
      "- App state: " + (ctx.state || "not reported"),
      ...(ctx.problems.length ? ["- Finding(s):", ...ctx.problems.map((problem) => "  - " + problem)] : []),
    ].join("\n") + "\n";
  if (ctx.outcome === "pass")
    return [
      "@" + ctx.owner + " — the check passed, and the job failed after it.",
      "",
      "- Run: " + ctx.runUrl,
      "- Commit checked: " + ctx.commit,
      "- App state: " + (ctx.state || "not reported"),
      "",
      "No finding about the app: the verdict was a pass. The log names the step that ended the job.",
    ].join("\n") + "\n";
  return [
    "@" + ctx.owner + " — still no verdict about the deployed app.",
    "",
    "- Run: " + ctx.runUrl,
    "- Commit checked: " + ctx.commit,
    "- Job result: " + (ctx.result || "unknown"),
    "",
    "The run ended before the check could look at the app; the log says why.",
  ].join("\n") + "\n";
}

// The close: a passing run judged the app, so it names what it found.
function buildClosedComment(ctx) {
  return [
    "Passing again: " + ctx.runUrl + " (checked " + ctx.commit + ").",
    "",
    "The deployed app serves this repository's release again" +
      (ctx.state ? " (state: " + ctx.state + ")" : "") +
      ". Closing.",
  ].join("\n") + "\n";
}

function usage() {
  return fs
    .readFileSync(__filename, "utf8")
    .split("*/")[0]
    .replace(/^[\s\S]*?\/\*/, "")
    .trim();
}

function main(argv) {
  const [mode = "--body", ...rest] = argv;
  if (rest.length) {
    console.error("ERROR: unexpected argument " + rest[0]);
    return 2;
  }
  switch (mode) {
    case "--state":
      process.stdout.write(stateOf(env("RESULT")) + "\n");
      return 0;
    case "--outputs":
      process.stdout.write(outputs(readReport(env("REPORT_FILE"))) + "\n");
      return 0;
    case "--body":
      process.stdout.write(buildBody(context()));
      return 0;
    case "--comment":
      process.stdout.write(buildComment(context()));
      return 0;
    case "--closed-comment":
      process.stdout.write(buildClosedComment(context()));
      return 0;
    case "--help":
    case "-h":
      process.stdout.write(usage() + "\n");
      return 0;
    default:
      console.error("ERROR: unknown argument " + mode + "; see --help");
      return 2;
  }
}

module.exports = { buildBody, buildComment, buildClosedComment, outputs, readReport, stateOf };

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error("deployed-app-alert: " + error.message);
    process.exitCode = 1;
  }
}
