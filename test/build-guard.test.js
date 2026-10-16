"use strict";
/* Guard the embedded builder's end-of-build checks.

   The builder must never emit a document that still needs files the embed cannot
   load. Its strip of the cache-busting loader is anchored on the loader's comment,
   so an edit to that comment defeats the strip — and, before the loader's signature
   was checked too, defeated the guard as well: the build emitted a document that
   loads js/rules.js and friends over the network inside an iframe whose policy
   forbids it, with nothing reported. These cases run the real script against a
   copied tree, so the guard is exercised the way a release exercises it.

   Each case copies the sources into a temporary directory: the builder resolves its
   inputs from its own location, so a copy is what lets a case doctor one input. */
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

function stage(name, doctor = (index) => index) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `hce-build-${name}-`));
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.mkdirSync(path.join(dir, "css"));
  fs.mkdirSync(path.join(dir, "js"));
  fs.copyFileSync(path.join(ROOT, "scripts/build-embedded.js"), path.join(dir, "scripts/build-embedded.js"));
  fs.copyFileSync(path.join(ROOT, "css/styles.css"), path.join(dir, "css/styles.css"));
  for (const name of ["rules", "state", "engine", "app"]) {
    fs.copyFileSync(path.join(ROOT, `js/${name}.js`), path.join(dir, `js/${name}.js`));
  }
  const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  fs.writeFileSync(path.join(dir, "index.html"), doctor(index));
  return dir;
}

function build(dir) {
  const out = path.join(dir, "out.html");
  const run = spawnSync(process.execPath, [path.join(dir, "scripts/build-embedded.js"), out], {
    cwd: dir,
    encoding: "utf8",
  });
  return { run, out };
}

// 1. The unmodified sources build, and the output is self-contained.
const clean = build(stage("clean"));
assert.equal(clean.run.status, 0, "the unmodified tree must build: " + clean.run.stderr);
const html = fs.readFileSync(clean.out, "utf8");
assert.ok(!html.includes('src="js/') && !html.includes('href="css/'), "the build must inline its assets");
assert.ok(
  ["const PRODUCT_RULES =", "const InterviewState =", "const Engine =", "const App ="].every((marker) => html.includes(marker)),
  "the four inlined scripts are present"
);
assert.ok(!html.includes('createElement("script")'), "the loader must be gone from the output");

// 2. A script tag the inliner does not handle fails the build.
const added = build(
  stage("added-script", (index) => index.replace("</body>", '<script src="js/extra.js"></script>\n</body>'))
);
assert.equal(added.run.status, 1, "an added external script must fail the build");
assert.match(added.run.stderr, /still references external assets or the loader/, "the failure explains itself");

// 3. The loader surviving because its comment changed also fails the build — the
//    case the strip anchor alone cannot catch, and which used to pass silently.
const renamed = build(
  stage("renamed-comment", (index) => index.replace("Single cache-busting version", "Cache-busting version"))
);
assert.equal(renamed.run.status, 1, "a loader that survives the strip must fail the build");
assert.match(renamed.run.stderr, /still references external assets or the loader/, "the failure explains itself");
assert.ok(
  !fs.existsSync(renamed.out),
  "a refused build must not leave a half-built document behind for someone to publish"
);

console.log("Passed builder guards: clean build, added external script refused, unstripped loader refused.");
