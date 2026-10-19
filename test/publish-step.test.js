"use strict";
/* The release's own steps, executed rather than read.

   `test/published-pair.test.js` already exercises the *read-back* against real bare
   repositories, and `scripts/verify-streamlit-runtime.py` proves the staged pair is what
   the deployed wrapper will serve. What neither touches is the shell that decides whether
   a release happens at all: the `cmp` gate that refuses a pair the checks did not judge,
   the staging copy, the refusal to publish a repository that rebuilds the estimator, and
   the commit-and-push with its "nothing changed" path. Those were verified by reading
   `deploy-streamlit.yml`, which is how a release workflow ends up shipping the wrong file
   or pushing an unattributable commit while every check stays green.

   So this runs them, in order, against a local bare repository playing the deployed
   repository: no token, no network, and a real `git push` whose result can be inspected.
   The steps are read out of the workflow by `scripts/workflow-step.js`, so what runs is
   the shell GitHub runs, not a copy of it.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readStep, runStep } = require("../scripts/workflow-step.js");

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

const gate = readStep(workflow, "deploy", "Refuse to publish an artifact the tests did not judge");
const sync = readStep(workflow, "deploy", "Sync the artifact and its manifest into streamlit repo");
const refusal = readStep(workflow, "deploy", "Refuse to publish a repository that rebuilds the estimator");
const push = readStep(workflow, "deploy", "Commit and push (triggers Streamlit Cloud redeploy)");

/* --- a bare repository playing the deployed one ---------------------------- */

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });
function mustGit(args, cwd) {
  const run = git(args, cwd);
  if (run.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + run.stderr);
  return run.stdout.trim();
}

// A fresh workdir per case: the bare repository is `origin`, the clone in `streamlit-app`
// is what the steps edit, and the built pair sits beside it exactly where the workflow
// keeps it. Building is done once by the caller, because it is the same artifact.
function freshWorkdir(build, { healthApp, pycache } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-step-"));
  const bare = path.join(dir, "deployed.git");
  const seed = path.join(dir, "seed");
  mustGit(["init", "-b", "main", "--bare", bare], dir);
  mustGit(["clone", bare, seed], dir);
  // The deployed repository as it really is: the wrapper, the pinned requirements and a
  // README. No build inputs, and no second implementation of the build.
  fs.writeFileSync(
    path.join(seed, "health_app.py"),
    healthApp ?? 'import streamlit as st\nst.iframe("app_embedded.html", height=2400)\n',
  );
  fs.writeFileSync(path.join(seed, "requirements.txt"), "streamlit>=1.66\n");
  fs.writeFileSync(path.join(seed, "README.md"), "# deployed\n");
  // The deployed repository as it really was from 2026-10-19: the pair verifier imported
  // the wrapper in the checkout it verified, so the sync committed its bytecode.
  if (pycache) {
    fs.mkdirSync(path.join(seed, "__pycache__"));
    fs.writeFileSync(path.join(seed, "__pycache__", "health_app.cpython-312.pyc"), "MZ^C\r\n");
  }
  // The loose copies an older release used to receive: the sync step must remove them.
  fs.mkdirSync(path.join(seed, "css"));
  fs.mkdirSync(path.join(seed, "js"));
  fs.writeFileSync(path.join(seed, "index.html"), "<!doctype html><p>loose</p>\n");
  fs.writeFileSync(path.join(seed, "css", "styles.css"), "body{}\n");
  fs.writeFileSync(path.join(seed, "js", "app.js"), "// loose\n");
  mustGit(["add", "-A"], seed);
  mustGit(["-c", "user.name=seed", "-c", "user.email=seed@example.invalid", "commit", "-m", "initial"], seed);
  mustGit(["push", "origin", "main"], seed);

  mustGit(["clone", bare, path.join(dir, "streamlit-app")], dir);
  fs.copyFileSync(path.join(build, "app_embedded.html"), path.join(dir, "app_embedded.html"));
  fs.copyFileSync(path.join(build, "app_embedded.manifest.json"), path.join(dir, "app_embedded.manifest.json"));
  fs.mkdirSync(path.join(dir, "dist"));
  fs.copyFileSync(path.join(build, "dist", "app.html"), path.join(dir, "dist", "app.html"));
  return { dir, bare };
}

const headOf = (bare) => git(["rev-parse", "main"], bare).stdout.trim();
// Untrimmed: the assertion is byte equality with the artifact built here, and a trimmed
// string would pass for a file that lost its trailing newline.
const fileAt = (bare, name) => {
  const run = spawnSync("git", ["show", "main:" + name], {
    cwd: bare,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error("git show main:" + name + " failed: " + run.stderr);
  return run.stdout;
};

/* --- the artifact ---------------------------------------------------------- */

// Built here rather than assumed: the gate compares this run's two outputs, which is only
// meaningful against a build. Built into a temporary directory, not the checkout — the
// workflow writes beside itself because that is where it stages from, but a suite that
// rewrote the working tree would be a test with a side effect on the code it judges.
const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "publish-build-"));
function build(args) {
  const run = spawnSync("node", args, { cwd: root, encoding: "utf8" });
  if (run.status !== 0) throw new Error("node " + args.join(" ") + " failed: " + run.stderr);
}
const ARTIFACT = path.join(BUILD, "app_embedded.html");
const MANIFEST = path.join(BUILD, "app_embedded.manifest.json");
const JUDGED = path.join(BUILD, "dist", "app.html");
build(["scripts/build-embedded.js", ARTIFACT]);
build(["scripts/write-artifact-manifest.js", ARTIFACT]);
build(["scripts/build-embedded.js", JUDGED]);
ok(fs.existsSync(MANIFEST), "the manifest writer put a manifest beside the artifact it describes");
equal(
  fs.readFileSync(ARTIFACT, "utf8"),
  fs.readFileSync(JUDGED, "utf8"),
  "the two builds of one source tree are the same bytes, which is what the gate assumes",
);

ok(gate.script.includes("cmp -s app_embedded.html dist/app.html"), "the gate compares the pair that ships with the build that was judged");  ok(push.script.includes("set -euo pipefail"), "the push step fails on an unset variable: an unnamed source commit cannot be published");
  ok(/: "\$\{SOURCE_SHA:\?/.test(push.script), "and states that requirement rather than leaving it to the shell (bash 3.2 does not fail on ${VAR:0:7}, bash 5 does)");
ok(push.script.includes("git diff --cached --quiet"), "and it knows the run where nothing changed");
// The credential the release actually has is a read/write deploy key on the deployed
// repository, so the step selects the remote and the key from it, and keeps a token path
// for a repository that has one. Neither goes in a URL: a failed push prints its
// arguments, which is how a credential reaches a log.
ok(/STREAMLIT_DEPLOY_KEY/.test(push.script) && /STREAMLIT_PUSH_TOKEN/.test(push.script), "the push step reads both credentials");
ok(/git remote set-url origin "git@github\.com:\$\{DEPLOYED_REPO\}\.git"/.test(push.script), "the key path pushes over SSH to the deployed repository");
ok(/export GIT_SSH_COMMAND="ssh -i \$key -o IdentitiesOnly=yes/.test(push.script), "with the key in a file git is pointed at, never in the remote URL");
ok(/http\.https:\/\/github\.com\/.extraheader=AUTHORIZATION/.test(push.script), "and the token path carries the token in a header rather than in a URL");
ok(/git \$\{auth\[@\]\+"\$\{auth\[@\]\}"\} push/.test(push.script), "the push is an empty-safe array expansion before the subcommand — where `git -c` goes — because bash 3.2 fails on an empty array under `set -u` where bash 5 does not, and the key path pushes with no arguments at all");

/* --- the gate -------------------------------------------------------------- */

{
  const { dir, bare } = freshWorkdir(BUILD);
  const before = headOf(bare);
  const passed = runStep(gate, { cwd: dir });
  equal(passed.status, 0, "a fresh pair passes the gate: " + passed.stderr);
  ok(/The pair to publish is the build the checks judged/.test(passed.stdout), "and says what it compared");

  // One byte appended to the pair: the file that ships is no longer the file the checks
  // judged, which is the exact mistake the gate exists for.
  fs.appendFileSync(path.join(dir, "app_embedded.html"), "\n");
  const failed = runStep(gate, { cwd: dir });
  equal(failed.status, 1, "a pair that differs from the judged build fails the gate");
  ok(/::error::app_embedded.html \(the pair that ships\) differs from dist\/app.html/.test(failed.stdout), "naming both files: " + failed.stdout.slice(0, 160));
  ok(/nothing has been pushed/.test(failed.stdout), "and saying nothing was pushed");
  equal(headOf(bare), before, "and nothing was pushed: the deployed head is unchanged");

  // A missing build is a failure, not a pass: `cmp` on an absent file exits 2, and the
  // step must not read that as agreement.
  fs.rmSync(path.join(dir, "dist"), { recursive: true, force: true });
  equal(runStep(gate, { cwd: dir }).status, 1, "a missing judged build fails the gate");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* --- staging and the refusal ---------------------------------------------- */

{
  const { dir } = freshWorkdir(BUILD);
  equal(runStep(refusal, { cwd: dir }).status, 0, "a repository that only verifies the artifact passes the refusal");
  equal(runStep(sync, { cwd: dir }).status, 0, "the sync step succeeds");
  const staged = path.join(dir, "streamlit-app");
  equal(fs.readFileSync(path.join(staged, "app_embedded.html"), "utf8"), fs.readFileSync(ARTIFACT, "utf8"), "the artifact staged is the one built here");
  ok(fs.existsSync(path.join(staged, "app_embedded.manifest.json")), "and so is the manifest that describes it");
  ok(!fs.existsSync(path.join(staged, "index.html")), "the loose index.html an older release received is gone");
  ok(!fs.existsSync(path.join(staged, "css")) && !fs.existsSync(path.join(staged, "js")), "and the loose css/ and js/ directories with it");
  ok(fs.existsSync(path.join(staged, "health_app.py")), "while the wrapper the deployment runs is untouched");
  fs.rmSync(dir, { recursive: true, force: true });
}

{
  const { dir, bare } = freshWorkdir(BUILD, {
    healthApp: "def build_app_html():\n    return '<p>a second build</p>'\n",
  });
  const before = headOf(bare);
  const refused = runStep(refusal, { cwd: dir });
  equal(refused.status, 1, "a deployed repository with its own build implementation is refused");
  ok(/still implements the embedded build/.test(refused.stdout), "and the message says why: " + refused.stdout.slice(0, 140));
  equal(headOf(bare), before, "nothing is pushed by a refused run");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* --- bytecode is not part of the deployment ------------------------------- */

{
  const { dir, bare } = freshWorkdir(BUILD, { pycache: true });
  const committed = git(["ls-tree", "-r", "--name-only", "main"], bare).stdout;
  ok(/__pycache__\/health_app\.cpython-312\.pyc/.test(committed), "the deployed repository starts with committed bytecode, as it did on 2026-10-19");
  equal(runStep(sync, { cwd: dir }).status, 0, "the sync step succeeds");
  ok(!fs.existsSync(path.join(dir, "streamlit-app", "__pycache__")), "and removes the bytecode before anything is committed");
  const pushed = runStep(push, {
    cwd: dir,
    env: { SOURCE_SHA: "5c0de5a1b2c3d4e5f60718293a4b5c6d7e8f9012", STREAMLIT_PUSH_TOKEN: "token", STREAMLIT_DEPLOY_KEY: "" },
  });
  equal(pushed.status, 0, "the push step succeeds: " + pushed.stderr);
  const published = git(["ls-tree", "-r", "--name-only", "main"], bare).stdout;
  ok(!/__pycache__|\/.*\.pyc$/.test(published), "and the published tree carries no bytecode: " + published);
  equal(git(["log", "-1", "--format=%s", "main"], bare).stdout.trim(), "Sync from HealthClassEstimator 5c0de5a", "under the usual sync commit, which records the deletion");
  fs.rmSync(dir, { recursive: true, force: true });
}

// The sync removes bytecode that is there when it runs. This is the other half: a step
// after the sync writes it (an import from the checkout, a restored cache), and the push
// must refuse rather than publish what the sync never saw.
{
  const { dir, bare } = freshWorkdir(BUILD);
  equal(runStep(sync, { cwd: dir }).status, 0, "the sync stages the pair");
  fs.mkdirSync(path.join(dir, "streamlit-app", "tools", "__pycache__"), { recursive: true });
  fs.writeFileSync(path.join(dir, "streamlit-app", "tools", "__pycache__", "helper.cpython-312.pyc"), "MZ^C\r\n");
  const before = headOf(bare);
  const refused = runStep(push, {
    cwd: dir,
    env: { SOURCE_SHA: "6c0de5a1b2c3d4e5f60718293a4b5c6d7e8f9012", STREAMLIT_PUSH_TOKEN: "token", STREAMLIT_DEPLOY_KEY: "" },
  });
  equal(refused.status, 1, "bytecode written after the sync fails the push: " + refused.stdout.slice(0, 200));
  ok(/Python bytecode is staged/.test(refused.stdout), "naming what it found: " + refused.stdout.slice(0, 200));
  ok(/tools\/__pycache__\/helper\.cpython-312\.pyc/.test(refused.stdout), "and the file that was staged");
  ok(/nothing has been pushed/.test(refused.stdout), "and saying nothing was published");
  equal(headOf(bare), before, "the deployed head is unchanged");
  fs.rmSync(path.join(dir, "streamlit-app", "tools"), { recursive: true, force: true });
  const cleaned = runStep(push, {
    cwd: dir,
    env: { SOURCE_SHA: "6c0de5a1b2c3d4e5f60718293a4b5c6d7e8f9012", STREAMLIT_PUSH_TOKEN: "token", STREAMLIT_DEPLOY_KEY: "" },
  });
  equal(cleaned.status, 0, "and the same step publishes once the bytecode is gone: " + cleaned.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
}

// The root cause, executed rather than read: the verifier's successful case imports the
// directory it was given, and a verification that writes into the checkout is a
// verification that changes what ships.
{
  // Bytecode is looked for in a cache prefix as well as beside the source, because the
  // interpreter that runs this suite locally redirects it to `~/Library/Caches` (Apple's
  // build sets sys.pycache_prefix), while the release runner writes `__pycache__` into the
  // checkout. The probe itself runs with -B so its own imports write nothing; the child
  // process the verifier starts inherits only the environment, not that flag, so `-B` in
  // the verifier is exactly what this observes.
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "pycache-prefix-"));
  const probe = [
    "import importlib.util, pathlib, tempfile",
    "spec = importlib.util.spec_from_file_location('runtime', " + JSON.stringify(path.join(root, "scripts", "verify-streamlit-runtime.py")) + ")",
    "runtime = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(runtime)",
    "directory = pathlib.Path(tempfile.mkdtemp())",
    "(directory / 'health_app.py').write_text(\"import streamlit as st\\nst.iframe('x')\\n\", encoding='utf-8')",
    "(directory / 'app_embedded.html').write_text('x', encoding='utf-8')",
    "run = runtime.run_health_app(directory)",
    "print('SERVED' if 'SERVED-EXACT' in run.stdout else 'NOT-SERVED')",
    "written = list(directory.rglob('*.pyc')) + list(pathlib.Path(" + JSON.stringify(cache) + ").rglob('*.pyc'))",
    "print('BYTECODE ' + ' '.join(str(p) for p in written) if written else 'CLEAN')",
  ].join("\n");
  const inspected = spawnSync("python3", ["-B", "-c", probe], {
    encoding: "utf8",
    env: { ...process.env, PYTHONPYCACHEPREFIX: cache },
  });
  equal(inspected.status, 0, "the runtime verifier runs against a fixture: " + inspected.stderr);
  ok(/^SERVED$/m.test(inspected.stdout), "its in-place case still proves what the wrapper serves: " + inspected.stdout);
  ok(/^CLEAN$/m.test(inspected.stdout), "and leaves no bytecode in the checkout it verified or beside it: " + inspected.stdout);
  fs.rmSync(cache, { recursive: true, force: true });
}

/* --- the push and the quiet second run ------------------------------------ */

{
  const { dir, bare } = freshWorkdir(BUILD);
  const before = headOf(bare);
  equal(runStep(sync, { cwd: dir }).status, 0, "the sync step stages the pair");

  const sourceSha = "37d743e1a2b3c4d5e6f708192a3b4c5d6e7f8091";
  // The job maps both credentials to env, so the step's own shell always sees a string:
  // '' when the secret is absent. A harness that left one unset would fail a step that
  // works in Actions, which is why they are supplied here rather than tolerated by `${X:-}`.
  const first = runStep(push, {
    cwd: dir,
    env: { SOURCE_SHA: sourceSha, STREAMLIT_PUSH_TOKEN: "token", STREAMLIT_DEPLOY_KEY: "" },
  });
  equal(first.status, 0, "the push step succeeds: " + first.stderr);
  const after = headOf(bare);
  ok(after !== before, "and moves the deployed branch");
  equal(fileAt(bare, "app_embedded.html"), fs.readFileSync(ARTIFACT, "utf8"), "the published artifact is byte for byte the one built here");
  ok(fileAt(bare, "app_embedded.manifest.json").includes("app_embedded.html"), "with the manifest beside it");
  equal(git(["log", "-1", "--format=%s", "main"], bare).stdout.trim(), "Sync from HealthClassEstimator 37d743e", "the commit names the source commit it came from");
  ok(!fs.existsSync(path.join(dir, "streamlit-app", "index.html")), "and the loose copies are gone from the published tree");

  // The six-hourly/nightly shape: the same sources again. A push with no changes must be
  // a no-op, not an empty commit that makes every run look like a release.
  const second = runStep(push, {
    cwd: dir,
    env: { SOURCE_SHA: sourceSha, STREAMLIT_PUSH_TOKEN: "token", STREAMLIT_DEPLOY_KEY: "" },
  });
  equal(second.status, 0, "a second run with nothing to publish succeeds");
  ok(/No changes to deploy/.test(second.stdout), "and says so instead of committing: " + second.stdout.trim());
  equal(headOf(bare), after, "leaving the deployed head where it was");

  // The hardening this harness exists to keep: with a change to publish and no source
  // commit, the message would be "Sync from HealthClassEstimator " — a deployed commit
  // with nothing linking it back to the sources. `set -u` makes that fail instead.
  fs.appendFileSync(path.join(dir, "streamlit-app", "README.md"), "\nchanged\n");
  const unattributable = runStep(push, {
    cwd: dir,
    env: { SOURCE_SHA: undefined, STREAMLIT_PUSH_TOKEN: "token", STREAMLIT_DEPLOY_KEY: "" },
  });
  ok(unattributable.status !== 0, "a change with no source commit fails the step rather than publishing a nameless sync: " + unattributable.stdout);
  ok(/the source commit is missing/.test(unattributable.stderr), "saying what is missing: " + unattributable.stderr.trim());
  equal(headOf(bare), after, "and nothing is pushed");
  fs.rmSync(dir, { recursive: true, force: true });
}

/* --- the push with the deploy key the release actually has ---------------- */

// The release asked for a personal access token, which was never created, so on main every
// run failed at its own gate and the deployed copy could only be updated by hand — which is
// how the app came to serve release 80 for a day while this repository was at 82 (issue
// #7). The credential it has now is a read/write deploy key on the deployed repository, so
// the push step selects an SSH remote and the key file. This executes that path against a
// local bare repository: git's own `url.<path>.insteadOf` rewrites the SSH URL to it, so
// nothing reaches the network and the bytes that land are the pair built here.
{
  const { dir, bare } = freshWorkdir(BUILD);
  const before = headOf(bare);
  equal(runStep(sync, { cwd: dir }).status, 0, "the sync step stages the pair for the key push");

  const sourceSha = "9228814fa1b2c3d4e5f60718293a4b5c6d7e8f9";
  const gitconfig = path.join(dir, "key-gitconfig");
  fs.writeFileSync(
    gitconfig,
    '[url "file://' + bare + '"]\n\tinsteadOf = git@github.com:richardparslow-commits/health_app.py.git\n',
  );
  const pushed = runStep(push, {
    cwd: dir,
    env: {
      STREAMLIT_DEPLOY_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----\nnot-a-real-key\n-----END OPENSSH PRIVATE KEY-----\n",
      STREAMLIT_PUSH_TOKEN: "",
      DEPLOYED_REPO: "richardparslow-commits/health_app.py",
      SOURCE_SHA: sourceSha,
      RUNNER_TEMP: dir,
      GIT_CONFIG_GLOBAL: gitconfig,
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  equal(pushed.status, 0, "the push step succeeds with only the deploy key: " + pushed.stderr);
  ok(/Pushing with the deploy key/.test(pushed.stdout), "and says which credential it used: " + pushed.stdout.trim());
  ok(headOf(bare) !== before, "the deployed branch moved, which is the deploy trigger");
  equal(
    fileAt(bare, "app_embedded.html"),
    fs.readFileSync(ARTIFACT, "utf8"),
    "the published artifact is byte for byte the one built here",
  );
  equal(
    git(["log", "-1", "--format=%s", "main"], bare).stdout.trim(),
    "Sync from HealthClassEstimator 9228814",
    "under a commit naming the source commit it came from",
  );
  ok(
    !pushed.stdout.includes("not-a-real-key") && !pushed.stderr.includes("not-a-real-key"),
    "and the key itself never reaches the log",
  );
  fs.rmSync(dir, { recursive: true, force: true });
}

fs.rmSync(BUILD, { recursive: true, force: true });
console.log("Passed " + checks + " publish-step assertions.");
