"use strict";
/* Fixtures for scripts/verify-published-pair.sh, the deploy workflow's read-back.

   The workflow verified the staged copy and then pushed it. Nothing compared the
   file that ships (`app_embedded.html`, built by `release:artifact`) with the build
   the CSS, builder and manifest checks judge (`dist/app.html`, built by
   `npm run build`), and nothing read the branch back from origin afterwards — so a
   push that landed a different commit, or a pair that diverged from the judged
   build, was published first and noticed by the next scheduled parity run.

   These fixtures publish into a real bare repository, which is what makes them
   evidence: the script is exercised through git (ls-remote, clone) against a
   remote that accepts a push, and the cases are the ones that decide whether a
   release may be called published — the matching pair, an artifact that differs,
   a manifest that differs, a missing file, and a branch head that is not the
   commit the run pushed.

   Then it reads the workflow, because a verifier nothing calls proves nothing.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "verify-published-pair.sh");
let checks = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks++;
}
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hce-published-pair-"));
const build = path.join(scratch, "build");
fs.mkdirSync(build);

// A real build and a real manifest, so the comparison is against the same kind of
// artifact the workflow publishes rather than a stand-in. The file is named
// app_embedded.html because the manifest records that name and the deployed
// wrapper checks it: a manifest written for a differently named build is refused by
// both, which is why the workflow's `release:artifact` keeps the published name.
execFileSync(process.execPath, [path.join(root, "scripts", "build-embedded.js"), path.join(build, "app_embedded.html")], {
  cwd: root,
  stdio: "pipe",
});
const artifact = path.join(build, "app_embedded.html");
const manifest = path.join(build, "app_embedded.manifest.json");
execFileSync(process.execPath, [path.join(root, "scripts", "write-artifact-manifest.js"), artifact], {
  cwd: root,
  stdio: "pipe",
  env: { ...process.env, SOURCE_COMMIT: "0123456789abcdef0123456789abcdef01234567", BUILT_UTC: "2026-10-16T00:00:00Z" },
});
ok(fs.existsSync(manifest), "the fixture writes a real artifact and manifest");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// A bare repository standing in for richardparslow-commits/health_app.py, plus a
// working clone the fixtures push from.
const remote = path.join(scratch, "deployed.git");
git(scratch, "init", "--quiet", "--bare", "-b", "main", remote);
const work = path.join(scratch, "deployed-work");
git(scratch, "clone", "--quiet", remote, work);
git(work, "config", "user.name", "Fixture");
git(work, "config", "user.email", "fixture@example.com");
// The deployed repository's wrapper is not reproduced here: the read-back judges
// the pair, and the workflow runs the wrapper's own verifier on the checkout it
// keeps. A placeholder keeps that distinction visible.
fs.writeFileSync(path.join(work, "health_app.py"), "import streamlit as st\n");
function publish(files) {
  for (const [name, contents] of Object.entries(files)) fs.writeFileSync(path.join(work, name), contents);
  git(work, "add", "-A");
  git(work, "commit", "--quiet", "-m", "Sync from HealthClassEstimator 0123456");
  git(work, "push", "--quiet", "origin", "main");
  return git(work, "rev-parse", "HEAD");
}

function run(args) {
  const result = spawnSync("bash", [script, ...args], { cwd: root, encoding: "utf8" });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

/* --- the pair as published is the build ---------------------------------- */

const good = publish({
  "app_embedded.html": fs.readFileSync(artifact, "utf8"),
  "app_embedded.manifest.json": fs.readFileSync(manifest, "utf8"),
});
const into = path.join(scratch, "readback");
const commitOut = path.join(scratch, "published-commit.txt");
const passed = run(["--remote", remote, "--into", into, "--artifact", artifact, "--expect", good, "--commit-out", commitOut]);

equal(passed.status, 0, "a published pair identical to the build passes: " + passed.err);
ok(/^PASS — the pair origin holds is the build this repository produced\.$/m.test(passed.out), "the verdict says what was proved");
ok(
  new RegExp("Layout: " + path.basename(scratch) + "/deployed@" + good.slice(0, 7) + "$", "m").test(passed.out),
  "the verdict names the layout it read back as owner/repo@sha: " + passed.out
);
ok(passed.out.includes("Commit: " + good), "the verdict names the full commit");
ok(/manifest {2}Manifest matches app_embedded\.html \(sha256 [0-9a-f]{16}…, \d+ bytes, release [\d.]+\)\./.test(passed.out), "and reports the published manifest as describing the published artifact: " + passed.out);
equal(fs.readFileSync(commitOut, "utf8").trim(), good, "the commit is written out for a run summary");
ok(fs.existsSync(path.join(into, "app_embedded.html")), "the read-back checkout is kept for the deployed app's own verifier");
ok(git(into, "rev-parse", "HEAD") === good, "and it is the commit origin reported, not a local copy");
ok(!passed.out.includes(scratch), "the verdict does not leak the scratch path into its labels");

/* --- a published artifact that is not the build --------------------------- */

const tamperedDir = path.join(scratch, "tampered");
fs.mkdirSync(tamperedDir);
const tampered = path.join(tamperedDir, "app.html");
// One byte, where a reader would never look: the shell copy exists in the wild, and
// a hash-only check would have to guess which side was wrong without saying so.
const source = fs.readFileSync(artifact);
const changed = Buffer.from(source);
changed[Math.floor(changed.length / 2)] = changed[Math.floor(changed.length / 2)] === 0x41 ? 0x42 : 0x41;
fs.writeFileSync(tampered, changed);

const tamperedHead = publish({
  "app_embedded.html": changed.toString("utf8"),
  "app_embedded.manifest.json": fs.readFileSync(manifest, "utf8"),
});
const tamperedRun = run(["--remote", remote, "--into", path.join(scratch, "readback-tampered"), "--artifact", artifact]);
equal(tamperedRun.status, 1, "an artifact that differs from the build fails");
ok(/is not the build this repository produced/.test(tamperedRun.err), "the failure says the published artifact is not the build");
ok(tamperedRun.err.includes("sha256 " + require("node:crypto").createHash("sha256").update(source).digest("hex")), "it reports the local hash");
ok(/published app_embedded\.html\s+sha256/.test(tamperedRun.err), "and the published one, on its own line");
ok(tamperedRun.err.includes(tamperedHead), "and the commit it judged");
ok(!/^PASS/m.test(tamperedRun.out), "and it does not print a verdict");

/* --- a manifest that describes something else ----------------------------- */

const lyingManifest = JSON.parse(fs.readFileSync(manifest, "utf8"));
lyingManifest.hce_version = "999";
publish({
  "app_embedded.html": fs.readFileSync(artifact, "utf8"),
  "app_embedded.manifest.json": JSON.stringify(lyingManifest, null, 2) + "\n",
});
const lyingRun = run(["--remote", remote, "--into", path.join(scratch, "readback-lying"), "--artifact", artifact]);
equal(lyingRun.status, 1, "a published manifest that does not describe the published artifact fails");
ok(/the published manifest does not describe the published artifact/.test(lyingRun.err), "the failure says the manifest is the problem");
ok(/hce_version: the manifest records "999", the artifact has/.test(lyingRun.err), "and quotes the checker's own diagnosis of the field that disagrees");

/* --- a repository missing half the pair ---------------------------------- */

const bareOnlyWrapper = path.join(scratch, "no-artifact.git");
git(scratch, "init", "--quiet", "--bare", "-b", "main", bareOnlyWrapper);
const bareWork = path.join(scratch, "no-artifact-work");
git(scratch, "clone", "--quiet", bareOnlyWrapper, bareWork);
git(bareWork, "config", "user.name", "Fixture");
git(bareWork, "config", "user.email", "fixture@example.com");
fs.writeFileSync(path.join(bareWork, "health_app.py"), "import streamlit as st\n");
git(bareWork, "add", "-A");
git(bareWork, "commit", "--quiet", "-m", "wrapper only");
git(bareWork, "push", "--quiet", "origin", "main");

const missing = run(["--remote", bareOnlyWrapper, "--into", path.join(scratch, "readback-missing"), "--artifact", artifact]);
equal(missing.status, 1, "a repository with no artifact fails");
ok(/has no app_embedded\.html/.test(missing.err), "the failure names the file that is missing");
ok(/must carry both the artifact and its manifest/.test(missing.err), "and why both are required");

/* --- a branch head that is not the commit this run pushed ---------------- */

const stale = run(["--remote", remote, "--into", path.join(scratch, "readback-stale"), "--artifact", artifact, "--expect", "0".repeat(40)]);
equal(stale.status, 1, "a branch head other than the expected commit fails");
ok(/origin's main is [0-9a-f]{40}, not 0{40}/.test(stale.err), "the failure names origin's head and the expectation");
ok(/Nothing was compared/.test(stale.err), "and says no verdict was reached about the copy origin holds");
ok(!fs.existsSync(path.join(scratch, "readback-stale")), "nothing is cloned when the head is already known to be wrong");

/* --- a local build that is not there ------------------------------------ */

const noBuild = run(["--remote", remote, "--into", path.join(scratch, "readback-nobuild"), "--artifact", path.join(scratch, "absent.html")]);
equal(noBuild.status, 1, "a missing local build is an error, not a pass");
ok(/does not exist, so there is nothing to compare/.test(noBuild.err), "the failure says there is nothing to compare");
ok(/npm run build/.test(noBuild.err), "and what produces it");

/* --- usage errors are the caller's, not the publish's -------------------- */

const unknown = run(["--remote", remote, "--into", path.join(scratch, "x"), "--nope"]);
equal(unknown.status, 2, "an unknown flag is a usage error");
ok(/unknown argument --nope/.test(unknown.err), "the usage error names the flag");

const noRemote = run(["--into", path.join(scratch, "y")]);
equal(noRemote.status, 2, "a missing --remote is a usage error");
ok(/--remote is required/.test(noRemote.err), "the usage error says what is missing");

const help = run(["--help"]);
equal(help.status, 0, "--help exits 0");
ok(/--commit-out <file>/.test(help.out), "--help documents the interface the workflow uses");

/* --- the workflow calls it, in the right order --------------------------- */

const deploy = fs.readFileSync(path.join(root, ".github", "workflows", "deploy-streamlit.yml"), "utf8");
const gateAt = deploy.indexOf("Refuse to publish an artifact the tests did not judge");
const pushAt = deploy.indexOf("Commit and push (triggers Streamlit Cloud redeploy)");
const readBackAt = deploy.indexOf("Read back what the deployed repository now holds");
const tokenGateAt = deploy.indexOf("Fail when the deploy token is not configured (main)");

ok(gateAt > 0, "the workflow compares the pair it ships with the build the tests judged");
ok(
  gateAt < deploy.indexOf("Sync the artifact and its manifest into streamlit repo"),
  "and does so before the pair is staged, so a divergent pair never reaches the deployed checkout"
);
ok(deploy.includes("cmp -s app_embedded.html dist/app.html"), "the gate is a byte comparison, not a hash or a size check");
ok(pushAt > 0 && readBackAt > pushAt, "the read-back runs after the push, not before it");
ok(deploy.includes("scripts/verify-published-pair.sh"), "the read-back is the fixture-tested script");
ok(/--expect "\$\(git -C streamlit-app rev-parse HEAD\)"/.test(deploy), "the read-back requires origin to be the commit this run pushed");
ok(/--commit-out published-commit\.txt/.test(deploy), "and records that commit for the summary");
ok(/python3 scripts\/verify-streamlit-runtime\.py published/.test(deploy), "the deployed commit is run through the same pair verifier as the staged copy");
ok(readBackAt < tokenGateAt, "the token gate stays last, so its message is what a tokenless run ends on");
const readBackStep = deploy.slice(readBackAt, deploy.indexOf("- name:", readBackAt + 10));
ok(/Deployed commit: .+\$\{PUBLISHED_SHA\}/.test(deploy), "the run summary names the commit that is live");

/* --- and the read-back can be run without a token ------------------------ */

// The read-back only runs on a push once STREAMLIT_PUSH_TOKEN exists, so until it
// does — and for a copy synced by hand, which is how releases ship today — the
// dispatch input is the only way CI ever exercises this path. A verification that
// cannot be run is documentation.
ok(/verify_published:\n(\s+)description: .*\n\s+type: boolean\n\s+default: false/.test(deploy), "the workflow can be dispatched to verify the deployed copy without publishing");
ok(
  /VERIFY_PUBLISHED: \$\{\{ github\.event_name == 'schedule' \|\| inputs\.verify_published \}\}/.test(deploy),
  "the input is mapped to an env var, since the inputs context cannot be read in if: — and a scheduled run decides it too, which is what makes the daily read-back verify-only",
);
ok(
  /if: \$\{\{ env\.STREAMLIT_PUSH_TOKEN != '' \|\| env\.VERIFY_PUBLISHED == 'true' \}\}/.test(readBackStep),
  "the read-back runs for a verify-only dispatch as well as for a push"
);
ok(
  /expect=\(\)[\s\S]*if \[ -n "\$STREAMLIT_PUSH_TOKEN" \] && \[ "\$VERIFY_PUBLISHED" != "true" \]; then[\s\S]*expect=\(--expect "\$\(git -C streamlit-app rev-parse HEAD\)"\)/.test(readBackStep),
  "but only a push run requires origin to be the commit it pushed: a verify-only run judges whatever main is, token or no token"
);
ok(
  /if: \$\{\{ env\.STREAMLIT_PUSH_TOKEN == '' && env\.VERIFY_PUBLISHED != 'true' && github\.ref == 'refs\/heads\/main' \}\}/.test(deploy),
  "a verify-only run is not failed by the token gate it deliberately has no token for"
);
ok(/### Verified, not published/.test(deploy), "and its summary says it verified rather than published");
ok(
  /quote_output\(\) \{[\s\S]*?cat published\.txt 2>\/dev\/null[\s\S]*?\}/.test(deploy) &&
    (deploy.match(/^ +quote_output$/gm) || []).length >= 2,
  "both the published and the verify-only summaries carry the read-back output, through one renderer"
);
ok(
  /printf[^\n]*> published-ok\.txt/.test(readBackStep) &&
    readBackStep.indexOf("published-ok.txt") > readBackStep.indexOf("verify-streamlit-runtime.py"),
  "the completed-verification marker is written only after the deployed runtime check, so the summary cannot call a half-checked run verified"
);

const parityWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "consumer-parity.yml"), "utf8");
ok(
  parityWorkflow.includes("--consumer-commit") && deploy.includes("--expect"),
  "the publish names its commit in the same shape the parity check does, so the two records can be joined"
);

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
equal(pkg.scripts["test:published"], "node test/published-pair.test.js", "the fixtures are wired into npm scripts");
ok(/verify-published-pair\.sh/.test(pkg.scripts["verify:published"] || ""), "and the verifier can be run by hand against any checkout");

fs.rmSync(scratch, { recursive: true, force: true });
console.log("Passed " + checks + " published-pair assertions.");
