#!/usr/bin/env node
/* Write the publish-credential tracking issue and its comments.

   `.github/workflows/streamlit-credential.yml` asks, every day, whether the credential
   this repository publishes with can still push to the deployed repository. The release
   already asks the same question (and refuses in seconds when the answer is no), so this
   exists for the other half: a key that is revoked, rotated or replaced with a read-only
   one between releases is invisible until a release needs it, and "until a release needs
   it" can be a quiet stretch in which nothing would be published anyway.

   A red check is not a red deployment. Nothing is pushed here: the check asks GitHub to
   authorise a push to a scratch ref with `--dry-run`, and GitHub receives nothing. What a
   red check means is that the *next* release could not publish — which is worth an issue
   before somebody is waiting for one.

   The facts come from the check itself: `scripts/verify-push-credential.sh` writes
   `credential.json` (`{"ok":…,"code":"read-only","detail":"…","error":"…"}`) when
   `CREDENTIAL_JSON` is set, and the check job reduces it to `--outputs`. The issue
   therefore says which refusal it was — a read-only key, a revoked one, a key for
   another repository, a value that is not a key, a rejected token, or no credential at
   all — rather than "the run is red".

   Three states:
     failing — the job failed, or (a wiring error worth reporting) the job passed while
               the check reported that the credential cannot push.
     passing — the credential can push.
     unknown — cancelled or skipped, or no result at all. The issue is left alone: the
               run never asked, so it cannot open one about what it saw nor close one
               about what it did not.

   Usage (env: RESULT, RUN_URL, HEAD_SHA, EVENT, OWNER, DEPLOYED_REPO, and either
   REPORT_FILE or CODE/DETAIL/ERROR):
     node scripts/credential-alert.js --state           # failing | passing | unknown
     node scripts/credential-alert.js --outputs         # $GITHUB_OUTPUT lines
     node scripts/credential-alert.js --body
     node scripts/credential-alert.js --comment
     node scripts/credential-alert.js --closed-comment
*/
"use strict";

const fs = require("fs");

const FAILING = new Set(["failure", "timed_out", "action_required"]);

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function stateOf(result, ok) {
  const value = String(result ?? "").trim();
  // The check reports the credential's verdict; the job reports whether the run ended.
  // They agree in a healthy run. When the job passed and the check still said no, that
  // disagreement is the finding — hiding it would make the one useless outcome silent.
  if (value === "success") return ok === false ? "failing" : "passing";
  if (FAILING.has(value)) return "failing";
  return "unknown";
}

// The verdict, from the report file when the caller hands one over, otherwise from the
// job outputs the check job already reduced it to.
function facts() {
  const file = env("REPORT_FILE");
  if (file && fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (typeof data.ok === "boolean")
        return {
          ok: data.ok,
          code: String(data.code ?? ""),
          detail: String(data.detail ?? ""),
          error: String(data.error ?? ""),
          sourced: true,
        };
    } catch {
      /* an unreadable report is no report: the outputs below are the fallback */
    }
  }
  const detail = env("DETAIL");
  const code = env("CODE");
  if (!detail && !code) return { ok: null, code: "", detail: "", error: "", sourced: false };
  return {
    ok: null,
    code,
    detail: detail || "was refused by the server",
    error: env("ERROR"),
    sourced: true,
  };
}

function outputLine(name, value) {
  const text = String(value ?? "");
  if (!text.includes("\n")) return name + "=" + text;
  let token = "__" + name.toUpperCase() + "__";
  while (text.includes(token)) token += "_";
  return name + "<<" + token + "\n" + text + "\n" + token;
}

function outputs(report) {
  return [
    outputLine("code", report.code),
    outputLine("detail", report.detail),
    outputLine("error", report.error),
  ].join("\n");
}

function context() {
  const sha = env("HEAD_SHA");
  return {
    owner: env("OWNER", "maintainer"),
    repo: env("DEPLOYED_REPO", "the deployed repository"),
    runUrl: env("RUN_URL", "(no run URL)"),
    commit: sha ? sha.slice(0, 7) : "(unknown commit)",
    event: env("EVENT", "unknown"),
    result: env("RESULT"),
    ...facts(),
  };
}

const header = (ctx) => [
  "- Deployed repository: " + ctx.repo,
  "- Run: " + ctx.runUrl,
  "- Commit checked: " + ctx.commit,
  "- Trigger: " + ctx.event,
  "- Job result: " + (ctx.result || "unknown"),
];

const WHAT_THE_CHECK_DOES =
  "The check asks GitHub to authorise a push to a scratch ref with `git push --dry-run`, using the same credential `deploy-streamlit.yml` publishes with, and GitHub receives nothing: no ref is created and nothing is published. That is why a read-only key is caught here — reading the repository would not catch it — and why a red check is not evidence that anything is live or was changed.";

const FIX =
  "A read/write **deploy key** on " +
  "%REPO%" +
  " is the credential this repository expects: `gh repo deploy-key add <key>.pub -R %REPO% --allow-write`, then `gh secret set STREAMLIT_DEPLOY_KEY`. `gh repo deploy-key list -R %REPO%` says whether the key the secret holds still exists and whether it is still read/write. A PAT with Contents read/write on that repository also works, as `STREAMLIT_PUSH_TOKEN`.";

function buildBody(ctx) {
  const lines = [];
  // Branched on the check's verdict, not on the job's result: a run that never asked
  // (cancelled, timed out before the check) has no verdict, and saying "the credential
  // cannot push" there would be a claim about a question nobody asked.
  if (ctx.ok === false) {
    lines.push(
      "@" + ctx.owner + " — the daily credential check could not push to " + ctx.repo + ".",
      "",
      ...header(ctx),
      "- Verdict: " + (ctx.detail || "the check reported no verdict"),
      ...(ctx.error ? ["- GitHub said: `" + ctx.error + "`"] : []),
      "",
      WHAT_THE_CHECK_DOES,
      "",
      ctx.result === "success"
        ? "The job itself passed while the check reported this, which is a wiring fault in the workflow as much as a credential one: read the run above."
        : "So the next release could not publish. `deploy-streamlit.yml` refuses before it builds when the credential is missing or refused, which means a release will stop in seconds instead of after its verification — this check is what finds it before anybody is waiting for one.",
      "",
      FIX.replace(/%REPO%/g, ctx.repo),
      "",
      "This issue closes on the first run of the check that passes.",
    );
  } else if (ctx.ok === true) {
    lines.push(
      "@" + ctx.owner + " — the daily credential check reported that the credential *can* push to " + ctx.repo + ", but the run failed anyway.",
      "",
      ...header(ctx),
      "- Verdict: " + (ctx.detail || "the credential can push"),
      "",
      "This is not a credential problem: the check asked GitHub and was told the push would be allowed, and something after it — the report, the summary — ended the run. Read the log for that step. Nothing has to be rotated, and this issue closes on the first run that passes.",
      "",
      WHAT_THE_CHECK_DOES,
    );
  } else {
    lines.push(
      "@" + ctx.owner + " — the daily credential check ended without a verdict about " + ctx.repo + ".",
      "",
      ...header(ctx),
      "- Verdict: none — the check did not ask GitHub",
      "",
      "This is not evidence that the credential is broken: the job ended before the check reported, which is usually a step that timed out or a run that was stopped. Nothing was asked, so nothing was learned.",
      "",
      FIX.replace(/%REPO%/g, ctx.repo),
      "",
      "This issue closes on the first check that passes, and on the first check that names a refusal (which replaces this text).",
    );
  }
  return lines.join("\n") + "\n";
}

function buildComment(ctx) {
  if (ctx.ok === true)
    return [
      "@" + ctx.owner + " — still no credential finding: the check passed and the job failed after it.",
      "",
      "- Run: " + ctx.runUrl,
      "- Commit checked: " + ctx.commit,
      "- Verdict: " + (ctx.detail || "the credential can push"),
      "",
      "The log names the step that ended the run.",
    ].join("\n") + "\n";
  if (ctx.ok === false)
    return [
      "@" + ctx.owner + " — still failing.",
      "",
      "- Run: " + ctx.runUrl,
      "- Commit checked: " + ctx.commit,
      "- Verdict: " + (ctx.detail || "no verdict reported"),
      ...(ctx.error ? ["- GitHub said: `" + ctx.error + "`"] : []),
    ].join("\n") + "\n";
  return [
    "@" + ctx.owner + " — still no verdict.",
    "",
    "- Run: " + ctx.runUrl,
    "- Commit checked: " + ctx.commit,
    "- Job result: " + (ctx.result || "unknown"),
    "",
    "The run ended before the check asked GitHub; the log says why.",
  ].join("\n") + "\n";
}

function buildClosedComment(ctx) {
  return [
    "Passing again: " + ctx.runUrl + " (checked " + ctx.commit + ").",
    "",
    "The credential can push to " + ctx.repo + " again" + (ctx.detail ? " (" + ctx.detail + ")" : "") + ". Closing.",
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
    case "--state": {
      const report = facts();
      process.stdout.write(stateOf(env("RESULT"), report.ok) + "\n");
      return 0;
    }
    case "--outputs":
      process.stdout.write(outputs(facts()) + "\n");
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

module.exports = { buildBody, buildComment, buildClosedComment, outputs, stateOf };

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error("credential-alert: " + error.message);
    process.exitCode = 1;
  }
}
