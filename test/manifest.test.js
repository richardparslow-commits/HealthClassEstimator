"use strict";
/* Fixtures for scripts/write-artifact-manifest.js.

   The manifest is what lets the deployed Streamlit repository verify the artifact
   it serves, and the deployment refuses to start when it disagrees. A manifest
   that silently recorded the wrong thing would pass that verification, so every
   refusal this script can make is exercised here against a real build and against
   doctored inputs.

   Each case builds into a temporary directory: the writer resolves its default
   paths from its own location, so a copy is what lets a case doctor one input.
*/
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WRITER = path.join(ROOT, "scripts/write-artifact-manifest.js");
const BUILDER = path.join(ROOT, "scripts/build-embedded.js");

let assertions = 0;
const equal = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  assertions++;
};
const ok = (value, label) => {
  assert.ok(value, label);
  assertions++;
};

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hce-manifest-"));
const env = { ...process.env, SOURCE_COMMIT: "test-commit", BUILT_UTC: "2026-01-02T03:04:05Z" };
const manifestFor = (artifact) => artifact.replace(/\.html$/, "") + ".manifest.json";

function buildArtifact(name = "app_embedded.html") {
  const out = path.join(dir, name);
  const run = spawnSync(process.execPath, [BUILDER, out], { cwd: ROOT, encoding: "utf8" });
  equal(run.status, 0, "the reviewed builder must build the fixture artifact: " + run.stderr);
  return out;
}
function writer(args) {
  return spawnSync(process.execPath, [WRITER, ...args], { cwd: ROOT, encoding: "utf8", env });
}

// 1. A real build writes a manifest that describes it exactly.
const artifact = buildArtifact();
let run = writer([artifact]);
equal(run.status, 0, "writing a manifest for a real build succeeds: " + run.stderr);
const manifestPath = manifestFor(artifact);
ok(fs.existsSync(manifestPath), "the manifest is written beside the artifact");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const bytes = fs.readFileSync(artifact);
const declaredVersion = fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/var HCE_VERSION = "(\d+)"/)[1];
equal(manifest.artifact, "app_embedded.html", "the manifest names the artifact");
equal(manifest.sha256, crypto.createHash("sha256").update(bytes).digest("hex"), "sha256 is the artifact's real hash");
equal(manifest.bytes, bytes.length, "bytes is the artifact's real length");
equal(manifest.hce_version, declaredVersion, "hce_version is the version the markup declares");
equal(manifest.builder, "scripts/build-embedded.js", "the manifest names the reviewed builder");
equal(manifest.source_commit, "test-commit", "source_commit is injectable, so tests are deterministic");
equal(manifest.built_utc, "2026-01-02T03:04:05Z", "built_utc is injectable, so tests are deterministic");
equal(fs.readFileSync(manifestPath, "utf8").endsWith("\n"), true, "the manifest ends with a newline");
equal(manifest.sha256.length, 64, "sha256 is a full 64-character digest");

// 2. --check accepts the manifest it wrote, and refuses a byte of drift.
run = writer(["--check", artifact]);
equal(run.status, 0, "--check accepts the manifest it wrote: " + run.stderr);
ok(/Manifest matches/.test(run.stdout), "--check says what it verified");

const drifted = path.join(dir, "drifted.html");
const driftedBytes = Buffer.from(bytes);
driftedBytes[Math.floor(driftedBytes.length / 2)] ^= 0x20;
fs.writeFileSync(drifted, driftedBytes);
fs.copyFileSync(manifestPath, manifestFor(drifted));
run = writer(["--check", drifted]);
equal(run.status, 1, "--check refuses an edited artifact");
ok(/sha256/.test(run.stderr), "the refusal names the sha256");
ok(/does not describe/.test(run.stderr), "the refusal says the manifest no longer describes the artifact");

// 3. An artifact this repository did not build is refused, and nothing is written.
const unstamped = path.join(dir, "unstamped.html");
fs.writeFileSync(
  unstamped,
  '<html><head><title>hand-written</title></head><body><script>\nwindow.HCE_VERSION = "80";\n</script></body></html>'
);
run = writer([unstamped]);
equal(run.status, 1, "an artifact without the builder stamp is refused");
ok(/provenance stamp/.test(run.stderr), "the refusal names the missing stamp");
ok(!fs.existsSync(manifestFor(unstamped)), "a refused artifact gets no manifest");

const unversioned = path.join(dir, "unversioned.html");
fs.writeFileSync(unversioned, "<html><body><script>\n// stamped by build-embedded.js\n</script></body></html>");
run = writer([unversioned]);
equal(run.status, 1, "an artifact with no release version is refused");
ok(/HCE_VERSION/.test(run.stderr), "the refusal names HCE_VERSION");

run = writer([path.join(dir, "never-built.html")]);
equal(run.status, 1, "a missing artifact is refused");
ok(/not found/.test(run.stderr) && /release:artifact/.test(run.stderr), "the refusal names the command that builds it");

// 4. --check refuses a manifest that is absent, and one that lies about the version.
const orphan = buildArtifact("orphan.html");
run = writer(["--check", orphan]);
equal(run.status, 1, "--check refuses a manifest that is not there");
ok(/not found/.test(run.stderr), "the refusal says the manifest is missing");

const lying = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
lying.hce_version = String(Number(lying.hce_version) + 1);
fs.writeFileSync(manifestPath, JSON.stringify(lying, null, 2) + "\n");
run = writer(["--check", artifact]);
equal(run.status, 1, "--check refuses a manifest whose release version does not match the artifact");
ok(/hce_version/.test(run.stderr), "the refusal names the field that disagreed");

fs.rmSync(dir, { recursive: true, force: true });
console.log("Passed " + assertions + " manifest assertions.");
