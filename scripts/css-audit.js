#!/usr/bin/env node
/* Find stylesheet rules that no element can match, and gate on them.

   Dead CSS is not only clutter: this stylesheet is inlined into every consumer of
   the build, and a rule whose class was removed with the interface it styled keeps
   describing behaviour the product no longer has. Release 78 shipped roughly 440
   lines of it — the cross-carrier comparison table, the print-sheet/ack-sheet
   system whose replacement prints through a popup window, and the carrier-panel,
   condition-picker and acknowledgement-chip styles from the interface before the
   edition-specific interview (ISSUE-010). Nothing detected it, so it accumulated.

   A rule is dead when any class or id its selector requires is referenced nowhere:
   a compound such as `.result-hero .hero-meta` cannot match when `hero-meta` is
   built by no code path, even though `result-hero` is. A selector *list* is dead
   when every one of its parts is dead, so a stale name sitting alongside a live one
   (`.btn, .no-print`) is reported for cleanup instead of deleting a used rule.

   References are read from the two places a class or id can legitimately come from:
     - `class=` / `id=` attribute values in index.html, so prose that happens to
       contain a word ("United States flag") cannot keep a dead `.flag` rule alive;
     - string literals in js/*.js, which is how js/app.js assigns classes and ids —
       `node(tag, cls, text)` writes `className`, and `$()`/`getElementById` take ids.

   js/app.js never assembles a class name from fragments, which is what makes a
   literal search sound. methods below re-assert that assumption rather than trust it.

   Usage:  node scripts/css-audit.js                 # report every dead rule
           node scripts/css-audit.js compare|print   # only matching selectors
   Exit status: 1 when a dead rule was found, 0 when the stylesheet is clean.
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { filter: null, quiet: false };
  for (const value of argv) {
    if (value === "--quiet") args.quiet = true;
    else if (!value.startsWith("--")) args.filter = value;
    else throw new Error("Unknown argument: " + value);
  }
  return args;
}

const escape = (token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Parse the sheet into rules with absolute source offsets. `start` reaches back to
   the end of the previous rule in the same container, so a rule's own comment is
   part of its range — removing a rule removes the comment that documents it. */
function parse(text, from, to, context, out) {
  let prev = from;
  let i = from;
  while (i < to) {
    if (text[i] === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      i = close < 0 ? to : close + 2;
      continue;
    }
    if (text[i] !== "{") {
      i++;
      continue;
    }
    const head = text.slice(prev, i).replace(/\/\*[\s\S]*?\*\//g, "").trim();
    let depth = 1;
    let j = i + 1;
    while (j < to && depth > 0) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") depth--;
      j++;
    }
    if (head.startsWith("@") && !/^@(font-face|keyframes|page|import|counter-style)/.test(head)) {
      // A container (@media, @supports) holds further rules; record it so its parts
      // can be reported, and recurse for the rules inside it.
      out.push({ selector: head, start: prev, end: j, context: context.slice(), container: true, tokens: [] });
      parse(text, i + 1, j - 1, context.concat(head), out);
    } else if (head) {
      // One selector list is split so each part is judged on its own: a stale name
      // beside a live one must not condemn the whole rule.
      const parts = head.split(",").map((part) => part.trim()).filter(Boolean);
      out.push({ selector: head, parts, start: prev, end: j, context: context.slice() });
    }
    prev = j;
    i = j;
  }
}

function sources() {
  const css = fs.readFileSync(path.join(ROOT, "css/styles.css"), "utf8");
  const markup = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const scripts = ["rules", "state", "engine", "app"]
    .map((name) => fs.readFileSync(path.join(ROOT, "js", name + ".js"), "utf8"))
    .join("\n");
  const attributes = [];
  for (const match of markup.matchAll(/(?:class|id)\s*=\s*"([^"]*)"/g)) attributes.push(match[1]);
  return { css, references: attributes.join(" ") + "\n" + scripts };
}

/* A class name built from fragments (`node("span", "chip-" + type)`, a template
   literal, or a variable handed to classList) would look unreferenced here, and this
   audit would then delete a live rule. The app assigns classes from literals today;
   that is checked rather than documented and hoped for. `n.className = cls` inside
   the node() helper is fine — cls arrives from the literal at each call site. */
const ASSEMBLED_CLASS = [
  /node\([^,]*,\s*(?:"[^"]*"\s*\+|'[^']*'\s*\+|`[^`]*\$\{)/,
  /classList\.(?:add|remove|toggle)\(\s*[^"'`)]/,
  /className\s*=\s*[^;\n]*\+[^;\n]*(?:;|$)/,
];
function assertLiteralClassNames(scripts) {
  for (const pattern of ASSEMBLED_CLASS) {
    const found = scripts.match(pattern);
    if (found) {
      throw new Error(
        "A class name is assembled at runtime (" + found[0].trim() + "). This audit matches class names as " +
          "literals, so it cannot see that one: keep class names literal, or teach scripts/css-audit.js to resolve them."
      );
    }
  }
}

function deadRules(options = {}) {
  const filter = options.filter ? new RegExp(options.filter, "i") : null;
  const { css, references } = sources();
  assertLiteralClassNames(
    ["rules", "state", "engine", "app"].map((n) => fs.readFileSync(path.join(ROOT, "js", n + ".js"), "utf8")).join("\n")
  );
  const referenced = (token) =>
    new RegExp("(^|[^A-Za-z0-9_-])" + escape(token) + "([^A-Za-z0-9_-]|$)").test(references);

  const rules = [];
  parse(css, 0, css.length, [], rules);

  const found = [];
  for (const rule of rules) {
    if (rule.container) continue;
    if (filter && !filter.test(rule.selector)) continue;
    const parts = rule.parts.map((part) => {
      const tokens = [...part.matchAll(/[.#]([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
      return { part, tokens, unused: tokens.filter((token) => !referenced(token)) };
    });
    if (!parts.length) continue;
    if (!parts.every((entry) => entry.tokens.length && entry.unused.length === entry.tokens.length)) continue;
    found.push({
      selector: rule.selector.replace(/\s+/g, " "),
      context: rule.context.join(" "),
      line: css.slice(0, rule.start).split("\n").length,
      endLine: css.slice(0, rule.end).split("\n").length,
      unused: [...new Set(parts.flatMap((entry) => entry.unused))],
    });
  }
  return { dead: found, rules: rules.filter((rule) => !rule.container) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dead, rules } = deadRules({ filter: args.filter });
  if (!args.quiet) {
    for (const rule of dead) {
      const where = rule.context ? rule.context + " " : "";
      console.log(`DEAD  L${rule.line}-${rule.endLine}  ${where}${rule.selector}   <-- never referenced: ${rule.unused.join(", ")}`);
    }
    console.log(`\n${dead.length} dead rule(s); ${rules.length - dead.length} referenced rule(s) of ${rules.length} class/id rules in css/styles.css.`);
  }
  if (dead.length) {
    console.error(
      "\nA rule no element can match is shipped to every consumer of the build. Remove it, or restore the class " +
        "that uses it (see scripts/css-audit.js)."
    );
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { deadRules };
