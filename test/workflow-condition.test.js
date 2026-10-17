"use strict";
/* The `if:` expressions that decide whether a release step runs at all.

   Every harness in `test/` executes a step's shell, but GitHub decides *whether* to run
   that shell from `if:` — and nothing evaluated it. The publish harnesses matched the
   condition with a regular expression, so `env.VERIFY_PUBLISHED != 'True'`, a condition
   naming the wrong variable, or an `||` where `&&` was meant all read as plausible and
   passed the text match. For the read-back that means a run which says nothing about what
   it published, with every check green.

   `scripts/workflow-condition.js` evaluates the subset of GitHub's expression language
   these workflows use. This file holds it to GitHub's documented semantics (strings
   compare case-insensitively, a non-empty string is truthy even when it is "false", null
   compares equal to '' and false, mixed types compare as numbers) and then puts the real
   conditions of `deploy-streamlit.yml` through every run shape: token or no token, main
   or another ref, push or verify-only dispatch. A mistyped gate now fails here.

   It also parses every `if:` in every workflow in the repository, so a condition this
   evaluator cannot read is a failure rather than a step nobody judged.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { evaluate, parse, equalish, truthy } = require("../scripts/workflow-condition.js");
const { readStep } = require("../scripts/workflow-step.js");

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
function throws(fn, pattern, label) {
  assert.throws(fn, pattern, label);
  checks++;
}
function runs(step, context, state = {}) {
  return evaluate(step.condition, context, state);
}

/* --- the semantics this evaluator has to get right ------------------------ */

equal(evaluate("${{ always() }}", {}), true, "always() is true");
equal(evaluate("always()", {}), true, "a bare condition parses the same as a wrapped one");
equal(evaluate("${{ success() }}", {}), true, "a successful run satisfies success()");
equal(evaluate("${{ success() }}", {}, { success: false }), false, "and a failed one does not");
equal(evaluate("${{ failure() }}", {}, { failure: true }), true, "failure() follows the run");
equal(evaluate("${{ cancelled() }}", {}, { cancelled: true }), true, "cancelled() follows the run");

equal(evaluate("true || false && false", {}), true, "&& binds tighter than ||");
equal(evaluate("(true || false) && false", {}), false, "parentheses override it");
equal(evaluate("!false", {}), true, "not() negates truthiness");
equal(evaluate("!''", {}), true, "and the empty string is not truthy");
equal(evaluate("env.X", { env: { X: "false" } }), true, "a non-empty string is truthy even when it is \"false\"");
equal(evaluate("env.X", { env: { X: "" } }), false, "while the empty string is not");

equal(evaluate("env.X == 'TRUE'", { env: { X: "true" } }), true, "string comparison is case-insensitive");
equal(evaluate("env.X == 'true'", { env: { X: "false" } }), false, "and it still compares the values");
equal(evaluate("'' == false", {}), true, "the empty string equals false, as GitHub documents");
equal(evaluate("'true' == true", {}), false, "but a string 'true' is not the boolean true");
equal(evaluate("null == ''", {}), true, "null equals the empty string");
equal(evaluate("env.MISSING == ''", {}), true, "a missing context property is null, so it equals ''");
equal(evaluate("env.MISSING != ''", {}), false, "which is the same fact, negated");

equal(
  evaluate("${{ steps.check.outcome == 'success' && env.CHANNEL == 'latest' }}", {
    steps: { check: { outcome: "success" } },
    env: { CHANNEL: "latest" },
  }),
  true,
  "nested context lookups (steps.*.outcome) are read",
);
equal(
  evaluate("${{ needs.canary.result == 'success' && needs.canary.outputs.ceiling_needed == 'true' }}", {
    needs: { canary: { result: "success", outputs: { ceiling_needed: "true" } } },
  }),
  true,
  "and so are needs.*.result and needs.*.outputs.*",
);
equal(
  evaluate("${{ needs.canary.result == 'success' }}", { needs: { canary: {} } }),
  false,
  "a missing output is null, not the string 'null'",
);

equal(truthy(0), false, "zero is falsy");
equal(equalish("A", "a"), true, "equalish is the comparison used everywhere");

throws(() => parse(""), /empty condition/, "an empty condition is refused");
throws(() => parse("env.X =="), /ended early/, "a truncated comparison is refused");
throws(() => parse("env.X == 'open"), /unterminated string/, "an unterminated string is refused");
throws(() => parse("mystery()"), /unknown function/, "an unknown function is refused");
throws(() => parse("a b"), /trailing input/, "trailing input is refused rather than ignored");
throws(() => parse("env.X == 'a' 'b'"), /trailing input/, "so is a missing operator");

/* --- the real conditions, in every run shape ------------------------------ */

const readback = readStep(workflow, "deploy", "Read back what the deployed repository now holds");
const gate = readStep(workflow, "deploy", "Fail when the deploy token is not configured (main)");
const warning = readStep(workflow, "deploy", "Explain the skipped push on a non-main ref");
const summary = readStep(workflow, "deploy", "Summarise what this run published");
const push = readStep(workflow, "deploy", "Commit and push (triggers Streamlit Cloud redeploy)");

// The job maps the token from a secret and the dispatch input to env, so a step sees them
// as strings: '' when the secret is absent, 'true'/'false' for the boolean input.
function context({ token = "", verify = "false", ref = "refs/heads/main" } = {}) {
  return { env: { STREAMLIT_PUSH_TOKEN: token, VERIFY_PUBLISHED: verify }, github: { ref } };
}

const shapes = [
  {
    name: "a push on main with the token",
    context: context({ token: "token" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: true },
  },
  {
    name: "a verify-only dispatch on main",
    context: context({ verify: "true" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: false },
  },
  {
    // The token is configured, but the dispatch says verify only. The read-back needs
    // the token; the push must not take it as permission to publish.
    name: "a verify-only dispatch on main with a token configured",
    context: context({ token: "token", verify: "true" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: false },
  },
  {
    name: "a push on main without the token",
    context: context({}),
    runs: { readback: false, gate: true, warning: false, summary: true, push: false },
  },
  {
    name: "a push on another ref without the token",
    context: context({ ref: "refs/heads/feature" }),
    runs: { readback: false, gate: false, warning: true, summary: true, push: false },
  },
  {
    // The warning explains a push that was skipped for want of a token, not one nobody
    // asked for: a verify-only dispatch carries no token on any ref, and the summary
    // already says "Verified, not published". It is the non-main half of the gate
    // above, so it has the gate's dispatch clause.
    name: "a verify-only dispatch on another ref",
    context: context({ verify: "true", ref: "refs/heads/feature" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: false },
  },
  {
    // `inputs.verify_published` is a boolean input defaulting to false, so an unmapped
    // value is the string "false" here; '' must behave the same way.
    name: "a push on main where the input is unset",
    context: context({ verify: "" }),
    runs: { readback: false, gate: true, warning: false, summary: true, push: false },
  },
];

const steps = { readback, gate, warning, summary, push };
for (const shape of shapes) {
  for (const [name, step] of Object.entries(steps)) {
    equal(
      runs(step, shape.context),
      shape.runs[name],
      `${shape.name}: ${name} should ${shape.runs[name] ? "run" : "not run"} (${step.condition})`,
    );
  }
}

// A condition that is "almost right" is the failure this file exists for: an `||` where
// `&&` was meant, a negated comparison dropped. These mutate the real conditions — the
// same text with one operator changed — and require the shape that should have run to
// stop running, so a matrix that could not distinguish them would fail here.
function mutant(step, from, to) {
  if (!step.condition.includes(from)) throw new Error("mutation matched nothing: " + from);
  return { ...step, condition: step.condition.replace(from, to) };
}
equal(
  runs(mutant(readback, "||", "&&"), context({ verify: "true" })),
  false,
  "a verify dispatch stops running the read-back when || becomes &&",
);
equal(
  runs(mutant(gate, "env.VERIFY_PUBLISHED != 'true'", "env.VERIFY_PUBLISHED == 'true'"), context({ verify: "true" })),
  true,
  "a verify dispatch would trip the token gate if its negation were dropped",
);
equal(
  runs(mutant(warning, "github.ref != 'refs/heads/main'", "github.ref == 'refs/heads/main'"), context({})),
  true,
  "a tokenless main run would take the non-main warning if its comparison were flipped",
);
equal(
  runs(
    mutant(warning, " && env.VERIFY_PUBLISHED != 'true'", ""),
    context({ verify: "true", ref: "refs/heads/feature" }),
  ),
  true,
  "without its dispatch clause the warning would annotate a verify-only run it was not asked to publish",
);
equal(
  runs(mutant(push, " && env.VERIFY_PUBLISHED != 'true'", ""), context({ token: "token", verify: "true" })),
  true,
  "without its dispatch clause the push would publish from a verify-only dispatch",
);

/* --- every condition in the repository parses ----------------------------- */

const workflowDir = path.join(root, ".github/workflows");
const files = fs.readdirSync(workflowDir).filter((name) => /\.ya?ml$/.test(name)).sort();
let conditions = 0;
let ifLines = 0;
for (const file of files) {
  const lines = fs.readFileSync(path.join(workflowDir, file), "utf8").split("\n");
  lines.forEach((line, index) => {
    // Every `if:` in the repository, job-level and step-level. The count is compared
    // below with the number of values parsed, so a form this reader does not understand
    // is a missing condition rather than one nobody notices: an `if:` with no value on
    // its line, or a block scalar whose first line is `|`, is refused by `parse` rather
    // than skipped.
    if (/^\s*if:/.test(line)) ifLines += 1;
    const match = /^\s*if:\s*(\S.*)$/.exec(line);
    if (!match) return;
    conditions += 1;
    try {
      parse(match[1]);
    } catch (error) {
      throw new Error(file + " line " + (index + 1) + ": " + error.message);
    }
  });
}
equal(conditions, ifLines, "every `if:` in every workflow was a condition this evaluator read (" + conditions + ")");
ok(conditions >= 15, "and the sweep saw every workflow, not one of them (" + files.length + " files)");

// A job-level `if:` is not a step, and `readStep` only reads steps; the sweep above is
// what covers those, and this asserts it saw the deploy workflow's own conditions.
equal(files.includes("deploy-streamlit.yml"), true, "the sweep includes the release workflow");

console.log("Passed " + checks + " workflow-condition assertions.");
