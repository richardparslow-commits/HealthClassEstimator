"use strict";
/* Guard the stylesheet against dead rules (ISSUE-010).

   The stylesheet is inlined into every consumer of the build, so a rule whose class
   left with the interface it styled is shipped to applicants and to the website and
   Streamlit copies. Nothing detected that, and roughly 440 lines of it accumulated —
   the cross-carrier comparison table, the print-sheet/ack-sheet system, and the
   pre-release-78 carrier-panel and condition-picker styles. This is the check that
   would have caught each of them. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { deadRules } = require("../scripts/css-audit.js");

const root = path.resolve(__dirname, "..");
const { dead, rules } = deadRules();

assert.ok(rules.length > 0, "The audit must find rules to judge; an empty parse is a broken audit, not a clean sheet.");
assert.deepEqual(
  dead.map((rule) => `${rule.context ? rule.context + " " : ""}${rule.selector} (no: ${rule.unused.join(", ")})`),
  [],
  "Dead CSS: these rules name classes or ids no markup or script can produce. Remove them, or restore the class that uses them."
);

// The audited file must be the one that ships: the builder inlines css/styles.css
// into dist/app.html, so a mismatch means the guard is watching a different sheet.
const css = fs.readFileSync(path.join(root, "css/styles.css"), "utf8");
const build = fs.readFileSync(path.join(root, "dist/app.html"), "utf8");
assert.ok(build.includes(css.trim()), "dist/app.html must inline the audited css/styles.css");

console.log(`Passed stylesheet audit: ${rules.length} rules, none unreachable, all inlined into the build.`);
