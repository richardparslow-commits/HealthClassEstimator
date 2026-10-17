"use strict";
/* Read a workflow step and run its shell.

   Two suites now execute steps out of these workflows rather than inspecting their YAML —
   the deployed-app alert (`test/alert-step.test.js`) and the release push
   (`test/publish-step.test.js`) — and both need the same thing: the `env:` and the
   `run: |` block of one named step, verbatim. This is that reader, kept in one place so a
   step cannot be read slightly differently by the two files that judge it.

   Deliberately narrow. It understands a two-space-indented job, a six-space-indented
   `- name:` step, an eight-space `env:` with ten-space entries, and an eight-space
   `run: |` whose body is ten spaces in — which is the shape these workflows use. Anything
   else throws rather than returning an empty string: a harness that silently executes
   nothing passes everything.
*/
const fs = require("node:fs");
const path = require("node:path");

function readStep(workflowPath, job, stepName) {
  const lines = fs.readFileSync(workflowPath, "utf8").split("\n");
  const where = path.basename(workflowPath);

  const jobStart = lines.findIndex((line) => line === "  " + job + ":");
  if (jobStart < 0) throw new Error("no job `" + job + "` in " + where);
  let jobEnd = lines.length;
  for (let i = jobStart + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z_][\w-]*:/.test(lines[i])) {
      jobEnd = i;
      break;
    }
  }

  const stepStart = lines.findIndex((line, i) => i > jobStart && i < jobEnd && line === "      - name: " + stepName);
  if (stepStart < 0) throw new Error("no step `" + stepName + "` in job `" + job + "` of " + where);

  // The step's condition, when it has one. `if:` may sit before or after `env:` — the
  // read-back step puts it first — so both are found by scanning the step up to its
  // `run:`, rather than assuming an order. The condition is returned as written; a
  // harness decides it with `scripts/workflow-condition.js`, which reads the subset of
  // GitHub's expression language these workflows use and throws on anything else.
  let condition = null;
  let runIndex = -1;
  for (let j = stepStart + 1; j < jobEnd; j++) {
    if (lines[j] === "        run: |") {
      runIndex = j;
      break;
    }
    const match = /^ {8}if:\s*(\S.*)$/.exec(lines[j]);
    if (match) condition = match[1].trim();
  }
  if (runIndex < 0) throw new Error("step `" + stepName + "` in " + where + " has no `run: |` block");

  // `env:` entries, eight spaces in. A step with no `env:` block has none, and a step
  // whose `env:` follows its `if:` must still yield them: an empty map here would make a
  // harness assert nothing about the variables a step depends on.
  const env = {};
  const envIndex = lines.findIndex(
    (line, j) => j > stepStart && j < runIndex && line === "        env:",
  );
  if (envIndex >= 0) {
    for (let j = envIndex + 1; j < runIndex && /^ {10}\S/.test(lines[j]); j++) {
      const match = /^ {10}([A-Z0-9_]+):\s*(.*)$/.exec(lines[j]);
      if (match) env[match[1]] = match[2];
    }
  }

  const body = [];
  let started = false;
  for (let j = stepStart; j < jobEnd; j++) {
    if (!started) {
      if (lines[j] === "        run: |") started = true;
      continue;
    }
    // GitHub's block scalar body sits two spaces inside `run: |`.
    if (lines[j].trim() === "") body.push("");
    else if (/^ {10}/.test(lines[j])) body.push(lines[j].slice(10));
    else break;
  }
  return { name: stepName, job, condition, env, script: body.join("\n").replace(/\n+$/, "") + "\n" };
}

// A job-level `if:`, which decides whether any of its steps exist to judge. `readStep`
// only reads steps; the canary's ceiling proposal is a job gate, and leaving it unread
// would leave the one condition that opens the review unjudged.
function readJobCondition(workflowPath, job) {
  const lines = require("node:fs").readFileSync(workflowPath, "utf8").split("\n");
  const where = require("node:path").basename(workflowPath);
  const start = lines.findIndex((line) => line === "  " + job + ":");
  if (start < 0) throw new Error("no job `" + job + "` in " + where);
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z_][\w-]*:/.test(lines[i])) break;
    const match = /^ {4}if:\s*(\S.*)$/.exec(lines[i]);
    if (match) return match[1].trim();
  }
  return null;
}

// One execution of a step's shell. Not `bash -e`: GitHub runs step scripts with `-e`, but
// each step that needs `-u`/pipefail says so itself, and a harness that silently added
// options could hide a step that forgot them.
function runStep(step, { cwd, env = {} } = {}) {
  const { spawnSync } = require("node:child_process");
  const child = { ...process.env, ...env };
  // A caller passing `{ NAME: undefined }` means "the job did not set this" — which a
  // `set -u` step must see as unset, not as the string "undefined".
  for (const [name, value] of Object.entries(env)) if (value === undefined) delete child[name];
  return spawnSync("bash", ["-c", step.script], { cwd, encoding: "utf8", env: child });
}

module.exports = { readStep, readJobCondition, runStep };
