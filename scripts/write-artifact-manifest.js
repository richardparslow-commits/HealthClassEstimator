#!/usr/bin/env node
/* Write — or check — app_embedded.manifest.json, the provenance record that lets
   the Streamlit deployment verify the artifact it serves.

   The Streamlit repository holds no build logic: it receives the output of
   scripts/build-embedded.js plus this manifest, and refuses to serve the pair
   unless the artifact's sha256, byte length, builder stamp and release version
   all agree with what is recorded here. The check exists because a copy edited
   where it lands must fail loudly rather than render a tool nobody audited —
   release 78 shipped a screen that existed only inside a consumer's copy, and a
   second implementation of the build drifted from the reviewed one in three
   places before it was removed.

   Usage:
     node scripts/write-artifact-manifest.js [artifact]          # write the manifest
     node scripts/write-artifact-manifest.js --check [artifact]  # verify one that exists

   Defaults: artifact app_embedded.html (repository root), manifest beside it with
   .html replaced by .manifest.json. SOURCE_COMMIT (or GITHUB_SHA) and BUILT_UTC
   override the recorded provenance, so tests are deterministic.

   Exit status: 0 on success; 1 when the artifact was not produced by the reviewed
   builder, or when --check finds a manifest that does not describe the artifact.
*/
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUILDER = "scripts/build-embedded.js";
const STAMP = "stamped by " + path.basename(BUILDER, ".js");
const VERSION = /window\.HCE_VERSION = "([^"]+)"/;

const fail = (message) => {
  console.error("ERROR: " + message);
  process.exit(1);
};

function parseArgs(argv) {
  const args = { artifact: "app_embedded.html", out: null, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") args.check = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("--")) fail("unknown argument: " + a);
    else if (args.artifact !== "app_embedded.html") fail("more than one artifact given");
    else args.artifact = a;
  }
  return args;
}

const manifestPathFor = (artifact) => artifact.replace(/\.html$/, "") + ".manifest.json";

/* Read the artifact and describe it. Refuses anything this repository did not
   build, so a manifest can never vouch for a hand-written document. */
function describe(artifactPath) {
  if (!fs.existsSync(artifactPath)) {
    fail(artifactPath + " not found — build it first: npm run release:artifact");
  }
  const bytes = fs.readFileSync(artifactPath);
  const text = bytes.toString("utf8");
  if (!text.includes(STAMP)) {
    fail(
      path.basename(artifactPath) +
        " does not carry the provenance stamp '" +
        STAMP +
        "' — it was not produced by " +
        BUILDER +
        "."
    );
  }
  const version = text.match(VERSION);
  if (!version) {
    fail(
      "could not find window.HCE_VERSION in " +
        path.basename(artifactPath) +
        " — it is not a " +
        BUILDER +
        " document."
    );
  }
  return {
    artifact: path.basename(artifactPath),
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    hce_version: version[1],
    builder: BUILDER,
    source_commit: process.env.SOURCE_COMMIT || process.env.GITHUB_SHA || "local",
    built_utc: process.env.BUILT_UTC || new Date().toISOString(),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/, "").trim());
    return;
  }
  const artifactPath = path.resolve(ROOT, args.artifact);
  const manifestPath = args.out ? path.resolve(ROOT, args.out) : manifestPathFor(artifactPath);

  if (!args.check) {
    const manifest = describe(artifactPath);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(
      "Wrote " +
        path.relative(ROOT, manifestPath) +
        " (sha256 " +
        manifest.sha256.slice(0, 16) +
        "…, " +
        manifest.bytes +
        " bytes, release " +
        manifest.hce_version +
        ", from " +
        manifest.source_commit +
        ")."
    );
    return;
  }

  if (!fs.existsSync(manifestPath)) {
    fail(
      manifestPath +
        " not found — every artifact ships with its manifest; regenerate it with: npm run release:artifact"
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(path.basename(manifestPath) + " is not readable JSON (" + error.message + ").");
  }
  const expected = describe(artifactPath);
  const problems = [];
  for (const field of ["artifact", "sha256", "bytes", "hce_version", "builder"]) {
    if (manifest[field] !== expected[field]) {
      problems.push(
        field +
          ": the manifest records " +
          JSON.stringify(manifest[field]) +
          ", the artifact has " +
          JSON.stringify(expected[field])
      );
    }
  }
  if (problems.length) {
    fail(
      path.basename(manifestPath) +
        " does not describe " +
        path.basename(artifactPath) +
        ":\n  " +
        problems.join("\n  ")
    );
  }
  console.log(
    "Manifest matches " +
      path.basename(artifactPath) +
      " (sha256 " +
      expected.sha256.slice(0, 16) +
      "…, " +
      expected.bytes +
      " bytes, release " +
      expected.hce_version +
      ")."
  );
}

try {
  main();
} catch (error) {
  fail(error.message);
}
