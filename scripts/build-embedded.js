#!/usr/bin/env node
/* Build the self-contained single-file HTML used by the Streamlit deployment.

   Inlines css/styles.css into a <style> tag and js/{rules,engine,app}.js into
   inline <script> tags (rules -> engine -> app document order), replacing the
   dynamic cache-busted script loader. Mirrors the runtime inlining in the
   health_app.py repo's health_app.py — kept in sync deliberately, because a
   relative href/script src cannot resolve inside a Streamlit component iframe.

   Usage:  node scripts/build-embedded.js [output-path]
   Default output: dist/app.html
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, "dist", "app.html");

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let index = read("index.html");
const css = read("css/styles.css");
const [rulesJs, engineJs, appJs] = ["js/rules.js", "js/engine.js", "js/app.js"].map(read);

// Inline the stylesheet — a relative href cannot resolve inside the iframe.
// NB: split/join instead of String.replace: replace() interprets $ patterns in
// the replacement string (e.g. "$$" collapses to "$"), which would corrupt
// JS source containing "$$".
index = index.split(/<link rel="stylesheet"[^>]*>/).join("<style>\n" + css + "\n</style>");

// Drop the dynamic cache-busted script loader (anchored on its comment so the
// build fails loudly if the loader's structure changes) and inline the scripts.
index = index.split(/<script>\s*\/\* Single cache-busting version[\s\S]*?<\/script>/).join("");

const inline = [rulesJs, engineJs, appJs].map((src) => "<script>\n" + src + "\n</script>").join("\n");
index = index.split("</body>").join(inline + "\n</body>");

if (index.includes('href="css/') || index.includes('src="js/') || index.includes("Single cache-busting")) {
  console.error("ERROR: build output still references external assets or the loader — aborting.");
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, index);
console.log("Built " + path.relative(ROOT, OUT) + " (" + index.length + " bytes)");
