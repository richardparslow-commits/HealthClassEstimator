#!/usr/bin/env node
/* Decide whether a workflow step's `if:` would run, without GitHub.

   Why this exists. The harnesses in `test/` execute a step's shell, but GitHub decides
   *whether* to run that shell from `if:`, and nothing evaluated it: `readStep` returned
   the condition as text and each harness matched it with a regular expression. A gate
   written `env.VERIFY_PUBLISHED != 'True'`, or gated on the wrong variable, reads as
   plausible and passes a text match while the step it guards never runs — which for the
   release's read-back means a run that says nothing about what it published.

   So this evaluates the subset of GitHub's expression language these workflows use:
   `env`, `github`, `inputs`, `needs` and `steps` lookups; `==`, `!=`, `!`, `&&`, `||`
   and parentheses; single-quoted strings, booleans and null; and the four status
   functions. Unknown syntax, an unknown function, or a bare word that is not a literal
   throws: a condition this cannot read must fail the caller, not be guessed at.

   `render` is the other half of the same language: GitHub substitutes every `${{ … }}`
   in a step's `env:` and `run:` before the shell sees it, and a harness that leaves one
   in place is executing text GitHub would never run. It renders with the same parser and
   evaluator, and `{ strict: true }` additionally refuses an expression whose value is
   absent from the context — the harness equivalent of a typo that GitHub would quietly
   turn into an empty string.

   The semantics are GitHub's documented ones, stated here because they are surprising:
   strings compare case-insensitively; a non-empty string is truthy even when it is
   "false"; null compares equal to the empty string and to false; and a missing context
   property is null, not an empty string. Values of different types are compared as
   numbers (so `'' == false`), which is what GitHub documents for loose equality. `&&`
   and `||` return an operand rather than a boolean — `a && b` is `b` when `a` is truthy
   and `a` otherwise — so the ternary idiom `${{ cond && 'yes' || 'no' }}` renders the
   word, not `true`.

   Usage:
     const { evaluate, parse } = require("./workflow-condition");
     evaluate("${{ env.TOKEN != '' }}", { env: { TOKEN: "x" } })   // true
     parse("always()")                                            // throws only on bad syntax
   Exit status when run directly: 0 when the expression given as the argument parses.
*/
"use strict";

/* --- tokens --------------------------------------------------------------- */

const COMPARISONS = ["==", "!="];
const PUNCTUATION = ["(", ")", ","];
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*/;

function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const space = /^\s+/.exec(rest);
    if (space) {
      i += space[0].length;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (COMPARISONS.includes(two)) {
      tokens.push({ type: "compare", value: two });
      i += 2;
      continue;
    }
    if (two === "&&" || two === "||") {
      tokens.push({ type: "logic", value: two });
      i += 2;
      continue;
    }
    if (text[i] === "!") {
      tokens.push({ type: "not" });
      i += 1;
      continue;
    }
    if (PUNCTUATION.includes(text[i])) {
      tokens.push({ type: text[i] });
      i += 1;
      continue;
    }
    if (text[i] === "'") {
      // A single-quoted string; GitHub escapes a quote by doubling it.
      let value = "";
      i += 1;
      let closed = false;
      while (i < text.length) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        value += text[i];
        i += 1;
      }
      if (!closed) throw new Error("unterminated string in condition: " + text);
      tokens.push({ type: "string", value });
      continue;
    }
    const number = /^\d+(\.\d+)?/.exec(rest);
    if (number) {
      tokens.push({ type: "number", value: Number(number[0]) });
      i += number[0].length;
      continue;
    }
    const identifier = IDENTIFIER.exec(rest);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0] });
      i += identifier[0].length;
      continue;
    }
    throw new Error("cannot read condition `" + text + "` at `" + rest.slice(0, 12) + "`");
  }
  return tokens;
}

/* --- parser --------------------------------------------------------------- */

// Recursive descent, loosest binding first: `||`, then `&&`, then comparison, then
// unary `!`, then a primary. The result is a tree so the same condition can be evaluated
// against many contexts without re-reading it.
function parse(text) {
  const source = String(text ?? "").trim();
  if (!source) throw new Error("an empty condition is not a condition");
  const wrapped = /^\$\{\{([\s\S]*)\}\}$/.exec(source);
  const expression = wrapped ? wrapped[1].trim() : source;
  const tokens = tokenize(expression);
  let at = 0;

  const peek = () => tokens[at];
  const take = (type, value) => {
    const token = tokens[at];
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(
        "expected " + (value ?? type) + " in condition `" + source + "`, found " +
          (token ? token.type + (token.value ? " " + token.value : "") : "the end"),
      );
    }
    at += 1;
    return token;
  };

  function primary() {
    const token = peek();
    if (!token) throw new Error("condition ended early: `" + source + "`");
    if (token.type === "(") {
      at += 1;
      const inner = or();
      take(")");
      return inner;
    }
    if (token.type === "not") {
      at += 1;
      return { kind: "not", operand: primary() };
    }
    if (token.type === "string") {
      at += 1;
      return { kind: "literal", value: token.value };
    }
    if (token.type === "number") {
      at += 1;
      return { kind: "literal", value: token.value };
    }
    if (token.type === "identifier") {
      at += 1;
      if (token.value === "true") return { kind: "literal", value: true };
      if (token.value === "false") return { kind: "literal", value: false };
      if (token.value === "null") return { kind: "literal", value: null };
      if (peek() && peek().type === "(") {
        // Rejected at parse time, not only when evaluated: the sweep over every workflow
        // parses conditions without knowing the run, and a function GitHub does not have
        // is invalid however the run turns out.
        if (!STATUS[token.value]) {
          throw new Error("unknown function `" + token.value + "()` in condition `" + source + "`");
        }
        at += 1;
        const args = [];
        if (peek() && peek().type !== ")") {
          args.push(or());
          while (peek() && peek().type === ",") {
            at += 1;
            args.push(or());
          }
        }
        take(")");
        return { kind: "call", name: token.value, args };
      }
      return { kind: "context", path: token.value };
    }
    throw new Error("unexpected " + token.type + " in condition `" + source + "`");
  }

  function comparison() {
    let left = primary();
    while (peek() && peek().type === "compare") {
      const operator = peek().value;
      at += 1;
      left = { kind: "compare", operator, left, right: primary() };
    }
    return left;
  }

  function and() {
    let left = comparison();
    while (peek() && peek().type === "logic" && peek().value === "&&") {
      at += 1;
      left = { kind: "logic", operator: "&&", left, right: comparison() };
    }
    return left;
  }

  function or() {
    let left = and();
    while (peek() && peek().type === "logic" && peek().value === "||") {
      at += 1;
      left = { kind: "logic", operator: "||", left, right: and() };
    }
    return left;
  }

  const tree = or();
  if (at !== tokens.length) {
    throw new Error("condition `" + source + "` has trailing input at token " + at);
  }
  return tree;
}

/* --- evaluation ----------------------------------------------------------- */

const STATUS = {
  always: () => true,
  // A step with an `if:` is judged only when its dependencies succeeded, unless the
  // condition says otherwise; a caller that is simulating a failed run passes
  // `success: false`. These defaults describe a normal, successful run.
  success: (state) => state.success !== false,
  failure: (state) => state.failure === true,
  cancelled: (state) => state.cancelled === true,
};

function lookup(path, context) {
  const parts = String(path).split(".");
  let value = context;
  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== "object") return null;
    value = Object.prototype.hasOwnProperty.call(value, part) ? value[part] : null;
  }
  return value === undefined ? null : value;
}

// GitHub's loose equality, as documented. Strings are compared case-insensitively, null is
// empty/false, and mixed types are compared as numbers — which is why '' == false is true
// and 'true' == true is not.
function equalish(left, right) {
  if (typeof left === "string" && typeof right === "string") {
    return left.toLowerCase() === right.toLowerCase();
  }
  if (left === null || left === undefined || right === null || right === undefined) {
    const other = left === null || left === undefined ? right : left;
    return other === null || other === undefined || other === "" || other === false;
  }
  if (typeof left === "boolean" && typeof right === "boolean") return left === right;
  if (typeof left === "number" && typeof right === "number") return left === right;
  return Number(left) === Number(right);
}

function truthy(value) {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === "") return false;
  return true;
}

function evaluateTree(node, context, state) {
  switch (node.kind) {
    case "literal":
      return node.value;
    case "context":
      return lookup(node.path, context);
    case "call": {
      const fn = STATUS[node.name];
      if (!fn) throw new Error("unknown function `" + node.name + "()` in a workflow condition");
      if (node.args.length) {
        throw new Error("`" + node.name + "()` takes no arguments in a workflow condition");
      }
      return fn(state);
    }
    case "not":
      return !truthy(evaluateTree(node.operand, context, state));
    case "compare": {
      const left = evaluateTree(node.left, context, state);
      const right = evaluateTree(node.right, context, state);
      const same = equalish(left, right);
      return node.operator === "==" ? same : !same;
    }
    case "logic": {
      // GitHub returns an operand, not a boolean: `a && b` is `b` when `a` is truthy and
      // `a` otherwise, `a || b` is `a` when `a` is truthy and `b` otherwise. Conditions
      // only need the truthiness, but rendering does not: the ternary idiom
      // `${{ cond && 'yes' || 'no' }}` is a string here, and a boolean-returning
      // evaluator would render `true`. Short-circuiting is preserved — the right side is
      // not evaluated when the left decides.
      const left = evaluateTree(node.left, context, state);
      if (node.operator === "&&") return truthy(left) ? evaluateTree(node.right, context, state) : left;
      return truthy(left) ? left : evaluateTree(node.right, context, state);
    }
    default:
      throw new Error("unknown condition node `" + node.kind + "`");
  }
}

// The condition as GitHub would decide it. `state` is for the status functions; a normal
// successful run is the default.
function evaluate(condition, context = {}, state = {}) {
  return truthy(evaluateTree(parse(condition), context, state));
}

/* --- rendering ------------------------------------------------------------- */

// GitHub's stringification for a rendered expression: null and an absent value become
// the empty string, booleans and numbers their literal form, and an object or array its
// JSON — which is what a `${{ toJSON(x) }}`-shaped value would produce.
function stringify(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

const TEMPLATE = /\$\{\{([\s\S]*?)\}\}/g;

// Substitute every `${{ … }}` in a string, the way GitHub does before a step runs. A
// stray `${{` left over is an unterminated expression, not literal text: GitHub rejects
// it, and a harness that let it through would show a shell syntax error where a workflow
// bug is. `strict` throws when a referenced value is absent from the context, so a
// misspelled property fails here instead of rendering as an empty string.
function render(text, context = {}, state = {}, options = {}) {
  const source = String(text ?? "");
  const rendered = source.replace(TEMPLATE, (_, expression) => {
    const inner = expression.trim();
    if (!inner) throw new Error("an empty `${{ }}` expression cannot be rendered");
    const value = evaluateTree(parse(inner), context, state);
    if (options.strict && (value === null || value === undefined)) {
      throw new Error("expression `" + inner + "` has no value in this render's context: " + source.slice(0, 120));
    }
    return stringify(value);
  });
  if (/\$\{\{/.test(rendered)) {
    throw new Error("unterminated `${{` expression: " + rendered.slice(0, 160));
  }
  return rendered;
}

module.exports = { evaluate, render, parse, equalish, truthy, stringify };

if (require.main === module) {
  const [first, ...rest] = process.argv.slice(2);
  if (!first || rest.length) {
    console.error("usage: node scripts/workflow-condition.js '<condition>'");
    process.exitCode = 2;
  } else {
    try {
      parse(first);
      process.stdout.write("parsed\n");
    } catch (error) {
      console.error("ERROR: " + error.message);
      process.exitCode = 1;
    }
  }
}
