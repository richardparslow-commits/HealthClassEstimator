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
  conditions of `deploy-streamlit.yml` through every run shape: a deploy key, a token, or
  neither, on main or another ref, as a push or a verify-only dispatch. A mistyped gate
  now fails here.

   It also parses every `if:` in every workflow in the repository *and requires a run
   shape to evaluate it*: a gate that only parses is a gate nobody decided, and a typo in
   one (a misspelled output, an env name that is never set) is invisible until the step it
   guards stops running. The sweep fails on a condition with no shape here, so a new gate
   has to be given one.

   `render` is the same language used where GitHub substitutes `${{ … }}` into a step's
   shell; it is held to GitHub's stringification here so the harnesses that execute steps
   can stop carrying their own expression renderer.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { evaluate, render, parse, equalish, truthy } = require("../scripts/workflow-condition.js");
const { readStep, readJobCondition } = require("../scripts/workflow-step.js");

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
// Every condition exercised here is recorded, and the sweep at the end requires the set
// to cover every `if:` in the repository. A condition with no run shape fails the suite
// rather than being read and believed.
const COVERED = new Set();
function runs(step, context, state = {}) {
  const condition = (typeof step === "string" ? step : step.condition).trim();
  COVERED.add(condition);
  return evaluate(condition, context, state);
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

/* --- rendering: the other use of the same language ------------------------ */

equal(render("ref ${{ github.ref }}", { github: { ref: "refs/heads/main" } }), "ref refs/heads/main", "render substitutes an expression inside text");
equal(
  render("${{ env.A }}/${{ env.B }}", { env: { A: "one", B: "two" } }),
  "one/two",
  "and every expression in the string, not only the first",
);
equal(render("${{ env.ON }}", { env: { ON: true } }), "true", "a boolean renders as its literal form");
equal(render("${{ env.OFF }}", { env: { OFF: false } }), "false", "including false, not the string 'false'");
equal(render("${{ env.N }}", { env: { N: 42 } }), "42", "a number renders as its digits");
equal(render("[${{ env.MISSING }}]", {}), "[]", "an absent value renders as the empty string, as GitHub does");equal(render("${{ env.A == 'x' }}", { env: { A: "X" } }),
  "true",
  "rendering uses the same comparison semantics as a condition",
);
equal(render("${{ true && 'yes' || 'no' }}"), "yes", "the ternary idiom renders the chosen operand, not a boolean");
equal(render("${{ false && 'yes' || 'no' }}"), "no", "including the fallback");
equal(render("${{ 'a' && 'b' }}"), "b", "&& returns its last operand");
equal(render("${{ env.MISSING || 'default' }}"), "default", "|| returns the first truthy operand, so a default works");
equal(render("${{ 0 || 'zero-is-falsy' }}"), "zero-is-falsy", "including when the left is the number zero");
equal(evaluate("${{ 'a' && 'b' }}"), true, "while a condition only asks whether the operand is truthy");
throws(() => render("${{ env.MISSING }}", {}, {}, { strict: true }), /has no value in this render's context/, "strict rendering refuses a value the context does not have");
throws(() => render("${{ open"), /unterminated/, "an unterminated expression is refused, never left for bash");
throws(() => render("${{ }}"), /empty `\$\{\{ \}\}` expression/, "an empty expression is refused");
throws(() => render("${{ mystery() }}"), /unknown function/, "an unknown function is refused by the renderer too");

/* --- the real conditions, in every run shape ------------------------------ */

const readback = readStep(workflow, "deploy", "Read back what the deployed repository now holds");
const gate = readStep(workflow, "deploy", "Fail when no push credential is configured (main)");
const warning = readStep(workflow, "deploy", "Explain the skipped push on a non-main ref");
const summary = readStep(workflow, "deploy", "Summarise what this run published");
const push = readStep(workflow, "deploy", "Commit and push (triggers Streamlit Cloud redeploy)");

// The job maps both credentials from secrets and the dispatch input to env, so a step sees
// them as strings: '' when the secret is absent, 'true'/'false' for the boolean input.
// There are two credentials because the one this repository has is a deploy key on the
// deployed repository; a token also works, and either is enough to push.
function context({ token = "", key = "", verify = "false", ref = "refs/heads/main" } = {}) {
  return {
    env: { STREAMLIT_PUSH_TOKEN: token, STREAMLIT_DEPLOY_KEY: key, VERIFY_PUBLISHED: verify },
    github: { ref },
  };
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
    name: "a push on main with the deploy key",
    context: context({ key: "KEY" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: true },
  },
  {
    // The push is a publish in both credential shapes; the key only changes how it
    // authenticates, never whether a verify-only dispatch may publish.
    name: "a verify-only dispatch on main with a deploy key configured",
    context: context({ key: "KEY", verify: "true" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: false },
  },
  {
    // No credential at all: the one shape that may not push, and may not let the read-back
    // stand for a push either.
    name: "a push on main without any credential",
    context: context({}),
    runs: { readback: false, gate: true, warning: false, summary: true, push: false },
  },
  {
    name: "a push on another ref with the deploy key",
    context: context({ key: "KEY", ref: "refs/heads/feature" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: true },
  },
  {
    name: "a push on another ref without any credential",
    context: context({ ref: "refs/heads/feature" }),
    runs: { readback: false, gate: false, warning: true, summary: true, push: false },
  },
  {
    // The warning explains a push that was skipped for want of a credential, not one
    // nobody asked for: a verify-only dispatch carries none on any ref, and the summary
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
    context: context({ verify: "", key: "KEY" }),
    runs: { readback: true, gate: false, warning: false, summary: true, push: true },
  },
  {
    name: "a push on main where the input is unset and no credential is configured",
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
// The read-back's own dispatch clause, not the first `||` in it: with two credentials
// before it, flipping the first operator leaves `verify == 'true'` deciding the result
// and the mutant would read as correct. The clause that lets a verify-only run read the
// deployment is the one this mutates.
equal(
  runs(
    mutant(readback, "|| env.VERIFY_PUBLISHED == 'true'", "&& env.VERIFY_PUBLISHED == 'true'"),
    context({ verify: "true" }),
  ),
  false,
  "a verify dispatch stops running the read-back when its own clause becomes &&",
);
equal(
  runs(mutant(readback, "||", "&&"), context({ token: "token", verify: "true" })),
  true,
  "and a run that has a token reads the deployment whatever the operator: the credential is what it reads with",
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

/* --- the other workflows' gates, decided rather than read ------------------ */

// The release's remaining conditions: which staging checkout runs, and the summary that
// must run even after something above it failed.
const stagingClone = readStep(workflow, "deploy", "Check out streamlit repo for staging (no token needed)");
const tokenClone = readStep(workflow, "deploy", "Check out streamlit repo (health_app.py)");
const verified = readStep(workflow, "deploy", "Publish the verification to the run summary");
equal(runs(stagingClone, context({})), true, "the public staging clone runs without a token");
equal(runs(stagingClone, context({ token: "token" })), false, "and is skipped when the token can clone with credentials");
equal(runs(tokenClone, context({ token: "token" })), true, "the credentialed checkout runs with a token");
equal(runs(tokenClone, context({})), false, "and not without one");
equal(runs(verified, {}, { success: false, failure: true }), true, "the verification summary is published even when the run failed");

// The canary's gates. Neither is on the release path, and a typo in either would stop
// the tamper self-test or the ceiling review without a parse error: exactly the kind of
// gate the old sweep read and believed.
const canaryWorkflow = path.join(root, ".github/workflows/streamlit-canary.yml");
const tamper = readStep(canaryWorkflow, "canary", "Tamper the fetched pair (self-test only)");
const ceiling = readStep(canaryWorkflow, "canary", "Decide whether the ceiling should move");
const proposal = readJobCondition(canaryWorkflow, "propose-ceiling");
const liftGate = readStep(canaryWorkflow, "propose-ceiling", "Fail when a warranted lift cannot be proposed");

equal(runs(tamper, { env: { SELF_TEST: "true" } }), true, "the canary tampers the pair when the dispatch asks");
equal(runs(tamper, { env: { SELF_TEST: "false" } }), false, "and not on an ordinary run");
equal(
  runs(ceiling, { env: { CHANNEL: "latest", SELF_TEST: "false" }, steps: { check: { outcome: "success" } } }),
  true,
  "a green stable canary decides whether to move the ceiling",
);
equal(
  runs(ceiling, { env: { CHANNEL: "prerelease", SELF_TEST: "false" }, steps: { check: { outcome: "success" } } }),
  false,
  "a prerelease does not",
);
equal(
  runs(ceiling, { env: { CHANNEL: "latest", SELF_TEST: "false" }, steps: { check: { outcome: "failure" } } }),
  false,
  "nor does a failed check",
);
equal(
  runs(ceiling, { env: { CHANNEL: "latest", SELF_TEST: "true" }, steps: { check: { outcome: "success" } } }),
  false,
  "nor a self-test run",
);
equal(
  runs(proposal, { needs: { canary: { result: "success", outputs: { ceiling_needed: "true" } } } }),
  true,
  "the proposal job runs when the canary says the ceiling should move",
);
equal(
  runs(proposal, { needs: { canary: { result: "failure", outputs: { ceiling_needed: "true" } } } }),
  false,
  "but not when the canary failed",
);
equal(
  runs(proposal, { needs: { canary: { result: "success", outputs: { ceiling_needed: "false" } } } }),
  false,
  "nor when it says the ceiling should not move",
);
equal(runs(proposal, { needs: { canary: { result: "success", outputs: {} } } }), false, "nor when the output is missing");
equal(runs(liftGate, { env: { STREAMLIT_PUSH_TOKEN: "" } }), true, "a warranted lift without a token fails instead of passing quietly");
equal(runs(liftGate, { env: { STREAMLIT_PUSH_TOKEN: "token" } }), false, "and with one it does not");

// Parsing cannot see these: both conditions are well-formed and both decide false.
// Evaluation in a shape where the gate should run is what makes them fail here.
equal(
  runs({ condition: proposal.replace("ceiling_needed", "ceiling_need") }, { needs: { canary: { result: "success", outputs: { ceiling_needed: "true" } } } }),
  false,
  "a misspelled output name stops the proposal it should have started",
);
equal(
  runs({ condition: ceiling.condition.replace("env.CHANNEL", "env.CHANEL") }, { env: { CHANNEL: "latest", SELF_TEST: "false" }, steps: { check: { outcome: "success" } } }),
  false,
  "and a misspelled env name stops the ceiling decision",
);

/* --- every condition in the repository parses ----------------------------- */

// A `needs.<job>.outputs.<name>` path is a cross-job contract, and a renamed output is
// the typo evaluation alone would only catch if some shape happened to expect it. The
// job named in the condition has to declare the output.
function declaresOutput(lines, job, output) {
  const start = lines.findIndex((line) => line === "  " + job + ":");
  if (start < 0) return false;
  let inOutputs = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[A-Za-z_][\w-]*:/.test(lines[i])) break;
    if (lines[i] === "    outputs:") {
      inOutputs = true;
      continue;
    }
    if (inOutputs && /^ {4}\S/.test(lines[i])) inOutputs = false;
    if (inOutputs && new RegExp("^ {6}" + output + ":").test(lines[i])) return true;
  }
  return false;
}

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
    const condition = match[1].trim();
    conditions += 1;
    try {
      parse(condition);
    } catch (error) {
      throw new Error(file + " line " + (index + 1) + ": " + error.message);
    }
    // Parsing is not judging. A condition no shape above evaluates is a gate this suite
    // would only read — the state this file exists to end — so adding an `if:` here means
    // adding a shape that decides it.
    if (!COVERED.has(condition)) {
      throw new Error(
        file + " line " + (index + 1) + ": no run shape evaluates `" + condition + "`. Add a case that decides it in test/workflow-condition.test.js.",
      );
    }
    for (const [, job, output] of condition.matchAll(/needs\.([\w-]+)\.outputs\.([\w-]+)/g)) {
      if (!declaresOutput(lines, job, output)) {
        throw new Error(
          file + " line " + (index + 1) + ": `" + condition + "` reads needs." + job + ".outputs." + output + ", but job `" + job + "` declares no such output.",
        );
      }
    }
  });
}
equal(conditions, ifLines, "every `if:` in every workflow was a condition this evaluator read (" + conditions + ")");
const distinct = new Set(
  files.flatMap((file) =>
    fs
      .readFileSync(path.join(workflowDir, file), "utf8")
      .split("\n")
      .map((line) => /^\s*if:\s*(\S.*)$/.exec(line)?.[1].trim())
      .filter(Boolean),
  ),
);
equal(
  [...distinct].filter((condition) => !COVERED.has(condition)),
  [],
  "every distinct condition in the repository was decided by a run shape, not only parsed (" + distinct.size + ")",
);
ok(conditions >= 15, "and the sweep saw every workflow, not one of them (" + files.length + " files)");

// A job-level `if:` is not a step, and `readStep` only reads steps; the sweep above is
// what covers those, and this asserts it saw the deploy workflow's own conditions.
equal(files.includes("deploy-streamlit.yml"), true, "the sweep includes the release workflow");

console.log("Passed " + checks + " workflow-condition assertions.");
