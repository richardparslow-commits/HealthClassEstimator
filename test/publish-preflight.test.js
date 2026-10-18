"use strict";
/* The credential check that stops a release before it builds anything.

   A release that cannot publish used to find out last. On 2026-10-18 every run on main
   built the pair, put it through Streamlit's runtime, staged it, and only the final step
   said the deployment was not live — a green-looking run that had done everything except
   deploy, while the app served the release before it (issue #7). Worse, a credential
   that exists but does not work looked exactly like one that does: revoked, rotated,
   pasted with a line missing, marked read-only, or added to another repository. Only the
   push itself ever noticed.

   So the release now asks two questions before the build: is there a credential at all
   (`Fail when no push credential is configured (main)`, moved from the end of the job),
   and does the credential it has actually work (`Prove the push credential works before
   anything is built`, new). This suite executes both out of `deploy-streamlit.yml` with
   `scripts/workflow-step.js`, so what is judged is the shell GitHub runs.

   The working case is real: git's own `url.*.insteadOf` rewrites both remote URLs to a
   `git init --bare` repository in the fixture, so the step performs an actual
   `git push --dry-run` against an actual remote and creates nothing. The refusal cases
   replace `git` on PATH with a shim that answers the way GitHub's receive-pack does,
   because a read-only key, a revoked key and a key for another repository are server
   answers no local remote can produce — and the shim records its argv, which is how the
   suite proves the probe always asked for `--dry-run` rather than trusting its text.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { readStep, runStep } = require("../scripts/workflow-step.js");

const root = path.resolve(__dirname, "..");
const workflow = path.join(root, ".github/workflows/deploy-streamlit.yml");
const deploy = fs.readFileSync(workflow, "utf8");
let checks = 0;
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}

const gate = readStep(workflow, "deploy", "Fail when no push credential is configured (main)");
const probe = readStep(workflow, "deploy", "Prove the push credential works before anything is built");
const push = readStep(workflow, "deploy", "Commit and push (triggers Streamlit Cloud redeploy)");

const DEPLOYED_REPO = "richardparslow-commits/health_app.py";
// A value that is obviously not a key, so an assertion that it never reaches a log can
// only pass if the step keeps it out.
const KEY = "-----BEGIN OPENSSH PRIVATE KEY-----\npreflight-fixture\ndo-not-log-this-value\n-----END OPENSSH PRIVATE KEY-----";
const TOKEN = "preflight-fixture-token";

/* --- where they sit, which is the whole point ----------------------------- */

// The ordering is the change: a step can be perfect and still be useless if it runs after
// the four minutes of build and verification it was meant to save.
const gateAt = deploy.indexOf("Fail when no push credential is configured (main)");
const probeAt = deploy.indexOf("Prove the push credential works before anything is built");
const checkoutsAt = deploy.indexOf("Check out streamlit repo (health_app.py)");
const stagingAt = deploy.indexOf("Check out streamlit repo for staging (no token needed)");
const buildsAt = deploy.indexOf("Build the artifact and its manifest");
const pushAt = deploy.indexOf("Commit and push (triggers Streamlit Cloud redeploy)");
ok(gateAt > 0 && probeAt > 0, "both credential checks are named in the workflow");
ok(Math.max(gateAt, probeAt) > Math.min(stagingAt, checkoutsAt), "they run after staging, because the probe pushes from the staging clone");
ok(gateAt < buildsAt, "the gate comes before the build: a run with no credential cannot publish, so it must not spend the time");
ok(probeAt < buildsAt, "and the probe does too: a credential that does not work is the same answer");
ok(gateAt < pushAt && probeAt < pushAt, "both run long before the push they exist to protect");
ok(!/Fail when no push credential is configured \(main\)/.test(deploy.slice(pushAt)), "the gate is not also left at the end of the job, where it used to be the last thing a run heard");

/* --- the gate keeps its message ------------------------------------------ */

equal(
  gate.condition,
  "${{ env.STREAMLIT_PUSH_TOKEN == '' && env.STREAMLIT_DEPLOY_KEY == '' && env.VERIFY_PUBLISHED != 'true' && github.ref == 'refs/heads/main' }}",
  "the gate still decides on both credentials, the verify-only dispatch and the ref",
);
ok(/Nothing has been built or published/.test(gate.script), "and says that it stopped before the build, which is now true of it");

/* --- the probe's shape ---------------------------------------------------- */

// The step is a call into `scripts/verify-push-credential.sh`, shared with the daily
// credential check, so the shape assertions belong to the script — the ones below run it.
const probeScript = fs.readFileSync(path.join(root, "scripts", "verify-push-credential.sh"), "utf8");
ok(/bash scripts\/verify-push-credential\.sh streamlit-app/.test(probe.script), "the step runs the shared script against the staging clone");
ok(/push --dry-run/.test(probeScript), "the probe asks the server to authorise the push and sends nothing");
ok(/GIT_TERMINAL_PROMPT=0/.test(probeScript), "and cannot hang on a credential prompt with nothing to type into it");
ok(/refs\/heads\/preflight-credential-check/.test(probeScript), "a scratch ref is the destination, so the answer is about the credential rather than the state of main");
ok(/STREAMLIT_DEPLOY_KEY/.test(probeScript) && /STREAMLIT_PUSH_TOKEN/.test(probeScript), "it reads both credentials, as the push does");
ok(/remote="git@github\.com:\$\{DEPLOYED_REPO\}\.git"/.test(probeScript), "the key path is given as a URL, so it does not depend on which checkout ran");
// The credential goes in a file (`GIT_SSH_COMMAND`) or a header, never in the remote: a
// failed push prints its arguments, which is how a credential reaches a log.
ok(!/github\.com\/[^"\s]*\$\{?(STREAMLIT|key)/.test(probeScript), "and no credential is interpolated into that URL");
ok(/IdentitiesOnly=yes/.test(probeScript) && /BatchMode=yes/.test(probeScript), "with the key file named and no agent or prompt able to answer for it");
ok(probeScript.includes("${auth[@]+\"${auth[@]}\"}"), "and an empty-safe array expansion, because the key path passes no `-c` at all");

/* --- the reader that finds these steps ----------------------------------- */

// Moving an `if:` up under a staging checkout exposed a real defect in the shared reader:
// a `uses:` step has no shell, and `readStep` walked on into the step below and returned
// the credential gate's `run:` block and `if:` as the checkout's own. Two suites read the
// checkouts for their conditions, and one of them started failing the moment the gate
// moved. A step now ends at the next step, and a step without a shell says so.
const checkout = readStep(workflow, "deploy", "Check out streamlit repo (health_app.py)");
equal(checkout.script, null, "a `uses:` step reports no shell rather than the next step's");
ok(checkout.condition === "${{ env.STREAMLIT_PUSH_TOKEN != '' }}", "while its own condition is still read: " + checkout.condition);
assert.throws(() => runStep(checkout, { cwd: root }), /has no `run: \|` block to execute/, "and running it is refused, not silently a pass");
checks++;

/* --- fixtures ------------------------------------------------------------ */

const git = (args, cwd) => spawnSync("git", args, { cwd, encoding: "utf8" });
function mustGit(args, cwd) {
  const run = git(args, cwd);
  if (run.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + run.stderr);
  return run.stdout.trim();
}

// A bare repository playing the deployed one and a clone of it in `streamlit-app`, which
// is where the workflow stages. `gitconfig` rewrites both remote URLs the step can build
// to that repository, so no network is touched and nothing has to be stubbed to succeed.
function fixture({ shallow = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-preflight-"));
  const bare = path.join(dir, "deployed.git");
  const seed = path.join(dir, "seed");
  mustGit(["init", "-b", "main", "--bare", bare], dir);
  mustGit(["clone", "--quiet", bare, seed], dir);
  fs.writeFileSync(path.join(seed, "health_app.py"), "import streamlit as st\n");
  fs.writeFileSync(path.join(seed, "requirements.txt"), "streamlit>=1.66\n");
  mustGit(["add", "-A"], seed);
  mustGit(["-c", "user.name=seed", "-c", "user.email=seed@example.invalid", "commit", "-m", "initial"], seed);
  mustGit(["push", "origin", "main"], seed);
  const staged = path.join(dir, "streamlit-app");
  if (shallow) mustGit(["clone", "--quiet", "--depth", "1", "file://" + bare, staged], dir);
  else mustGit(["clone", "--quiet", bare, staged], dir);
  // The step calls the shared script, so the fixture provides it where the step's own
  // working directory expects: the copy is of the real file, not a stand-in, because what
  // runs here is the shell a runner would run and the script a runner would fetch.
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(
    path.join(root, "scripts", "verify-push-credential.sh"),
    path.join(dir, "scripts", "verify-push-credential.sh"),
  );
  const gitconfig = path.join(dir, "preflight-gitconfig");
  fs.writeFileSync(
    gitconfig,
    '[url "file://' + bare + '"]\n' +
      "\tinsteadOf = git@github.com:" + DEPLOYED_REPO + ".git\n" +
      "\tinsteadOf = https://github.com/" + DEPLOYED_REPO + ".git\n",
  );
  return { dir, bare, gitconfig };
}

// A `git` that answers like GitHub's receive-pack and records the argv it was handed. The
// refusals in the probe's classifier are server answers — a read-only key, a revoked key,
// a key for another repository — so the only honest way to run those branches is to
// answer the way the server does.
function fakeGit(dir, { stderr, status = 128 }) {
  const bin = path.join(dir, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, "git"),
    "#!/bin/sh\n" +
      'printf "%s\\n" "$@" > "' + path.join(dir, "git-argv.txt") + '"\n' +
      "printf '%s\\n' " + JSON.stringify(stderr) + " >&2\n" +
      "exit " + status + "\n",
  );
  fs.chmodSync(path.join(bin, "git"), 0o755);
  return bin;
}

const base = (fx, extra = {}) => ({
  STREAMLIT_PUSH_TOKEN: "",
  STREAMLIT_DEPLOY_KEY: "",
  VERIFY_PUBLISHED: "false",
  DEPLOYED_REPO,
  RUNNER_TEMP: fx.dir,
  GIT_CONFIG_GLOBAL: fx.gitconfig,
  GIT_CONFIG_NOSYSTEM: "1",
  ...extra,
});

/* --- the gate, which fails without touching the network ------------------- */

{
  const fx = fixture();
  const failed = runStep(gate, { cwd: fx.dir, env: base(fx, { GITHUB_REF: "refs/heads/main" }) });
  equal(failed.status, 1, "a push on main with no credential fails");
  ok(/::error::No push credential is configured/.test(failed.stdout), "with an error that says so");
  ok(/STREAMLIT_DEPLOY_KEY/.test(failed.stdout) && /STREAMLIT_PUSH_TOKEN/.test(failed.stdout), "naming both ways to give it one");
  ok(/was NOT updated and this release is not live/.test(failed.stdout), "and the consequence: the deployment is not this build");
  ok(/Nothing has been built or published/.test(failed.stdout), "and that nothing was spent finding out");
  ok(!fs.existsSync(path.join(fx.dir, "dist")), "nothing was built in the run it stopped");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the probe says nothing when there is nothing to prove ---------------- */

{
  const fx = fixture();
  const none = runStep(probe, { cwd: fx.dir, env: base(fx) });
  equal(none.status, 0, "a run with no credential passes the probe: the gate above is what fails on main");
  ok(/nothing to prove/.test(none.stdout), "and says why it did nothing");
  ok(!/Proving/.test(none.stdout), "without claiming to have proved anything");

  const verify = runStep(probe, { cwd: fx.dir, env: base(fx, { VERIFY_PUBLISHED: "true", STREAMLIT_DEPLOY_KEY: KEY }) });
  equal(verify.status, 0, "a verify-only dispatch passes the probe, which is the promise the input makes");
  ok(/pushes nothing, so there is no credential to prove/.test(verify.stdout), "and says the dispatch is why");
  ok(!fs.existsSync(path.join(fx.dir, "streamlit_preflight_key")), "the key was not even written to disk for a run that pushes nothing");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the probe with a credential that works ------------------------------- */

// Real git, real remote, and the credential written to a file: the step performs the
// dry-run push it would perform on the runner, and the assertion is that nothing moved.
{
  const fx = fixture();
  const before = mustGit(["rev-parse", "main"], fx.bare);
  const refsBefore = mustGit(["for-each-ref", "--format=%(refname)"], fx.bare);
  const passed = runStep(probe, { cwd: fx.dir, env: base(fx, { STREAMLIT_DEPLOY_KEY: KEY }) });
  equal(passed.status, 0, "a key the remote accepts passes the probe: " + passed.stderr);
  ok(/Proving the deploy key can push to/.test(passed.stdout), "saying which credential it is proving");
  ok(/authorised a dry-run push and received nothing/.test(passed.stdout), "and what the server answered");
  equal(mustGit(["rev-parse", "main"], fx.bare), before, "the deployed branch did not move");
  equal(mustGit(["for-each-ref", "--format=%(refname)"], fx.bare), refsBefore, "and no ref was created: the probe cannot publish even when the credential works");
  ok(!passed.stdout.includes("do-not-log-this-value") && !passed.stderr.includes("do-not-log-this-value"), "the key itself never reaches the log");
  ok(fs.existsSync(path.join(fx.dir, "streamlit_preflight_key")), "the key was given to git as a file, which is how the push will use it");
  equal(fs.statSync(path.join(fx.dir, "streamlit_preflight_key")).mode & 0o777, 0o600, "with permissions a credential is allowed to have");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

// The staging clone in the workflow is `--depth 1`, and a shallow clone is still something
// a dry-run push can be asked from: this is the shape the probe actually runs in.
{
  const fx = fixture({ shallow: true });
  ok(fs.existsSync(path.join(fx.dir, "streamlit-app", ".git", "shallow")), "the fixture clone is shallow, as staging is");
  const passed = runStep(probe, { cwd: fx.dir, env: base(fx, { STREAMLIT_DEPLOY_KEY: KEY }) });
  equal(passed.status, 0, "and the probe works from it: " + passed.stderr);
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- the probe with a credential the server refuses ----------------------- */

// Each case is a server answer, so each case is a shim answering that way. The argv the
// shim records is the assertion that matters most: whatever the outcome, the step asked
// for a dry run of a scratch ref and never for a push of the branch that deploys.
const refusals = [
  {
    name: "a key marked read-only",
    stderr: "ERROR: The key you are authenticating with has been marked as read only.\nfatal: Could not read from remote repository.",
    expect: /marked read-only on that repository/,
  },
  {
    name: "a key that was deleted or revoked",
    stderr: "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
    expect: /not accepted for that repository: it was deleted or revoked/,
  },
  {
    name: "a key added to another repository",
    stderr: "ERROR: Repository not found.\nfatal: Could not read from remote repository.",
    expect: /not authorised for that repository/,
  },
  {
    name: "a secret whose value is not a key",
    stderr: "Load key \"/tmp/streamlit_preflight_key\": invalid format\nPermission denied (publickey).",
    expect: /not a usable private key/,
  },
  {
    name: "a token the server rejects",
    stderr: "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/" + DEPLOYED_REPO + "/'",
    expect: /the token is expired, revoked, or lacks Contents read\/write/,
  },
];

for (const refusal of refusals) {
  const fx = fixture();
  const bin = fakeGit(fx.dir, { stderr: refusal.stderr });
  const credential = /token/.test(refusal.name) ? { STREAMLIT_PUSH_TOKEN: TOKEN } : { STREAMLIT_DEPLOY_KEY: KEY };
  const failed = runStep(probe, {
    cwd: fx.dir,
    env: base(fx, { ...credential, PATH: bin + ":" + process.env.PATH }),
  });
  equal(failed.status, 1, refusal.name + " fails the release before it builds");
  ok(refusal.expect.test(failed.stdout), refusal.name + " is reported for what it is: " + failed.stdout.slice(-320));
  ok(/::error::The push credential/.test(failed.stdout), refusal.name + " is an error, not a warning");
  ok(/nothing has been built or published/.test(failed.stdout), refusal.name + " says nothing was built");
  ok(/--allow-write/.test(failed.stdout) && /STREAMLIT_DEPLOY_KEY/.test(failed.stdout), refusal.name + " names the fix");
  const argv = fs.readFileSync(path.join(fx.dir, "git-argv.txt"), "utf8");
  ok(/^--dry-run$/m.test(argv), refusal.name + ": the probe asked for a dry run");
  ok(/^HEAD:refs\/heads\/preflight-credential-check$/m.test(argv), refusal.name + ": of a scratch ref, not the branch that deploys");
  ok(!/^HEAD:refs\/heads\/main$/m.test(argv), refusal.name + ": and never of main");
  ok(!failed.stdout.includes("do-not-log-this-value"), refusal.name + ": the key is not echoed by the failure");
  ok(!argv.includes("do-not-log-this-value"), refusal.name + ": nor is it on the git command line");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

// The token path cannot authenticate against a fixture, but it must be the path the push
// will take: an HTTPS remote and a header, with nothing about the token in the URL.
{
  const fx = fixture();
  const bin = fakeGit(fx.dir, { stderr: "fatal: everything is fine, this is a stub", status: 0 });
  const passed = runStep(probe, { cwd: fx.dir, env: base(fx, { STREAMLIT_PUSH_TOKEN: TOKEN, PATH: bin + ":" + process.env.PATH }) });
  equal(passed.status, 0, "a token the server accepts passes the probe");
  ok(/Proving STREAMLIT_PUSH_TOKEN can push to/.test(passed.stdout), "naming the token as the credential it proved");
  const argv = fs.readFileSync(path.join(fx.dir, "git-argv.txt"), "utf8");
  ok(/^https:\/\/github\.com\/richardparslow-commits\/health_app\.py\.git$/m.test(argv), "over HTTPS to the deployed repository");
  ok(/^http\.https:\/\/github\.com\/\.extraheader=AUTHORIZATION: basic /m.test(argv), "carrying the token in a header");
  ok(!/github\.com\/.*x-access-token:/.test(argv), "never in the URL");
  ok(!passed.stdout.includes(TOKEN), "and the token is not printed by a successful run");
  fs.rmSync(fx.dir, { recursive: true, force: true });
}

/* --- and the push it protects still pushes ------------------------------- */

ok(/git \$\{auth\[@\]\+"\$\{auth\[@\]\}"\} push/.test(push.script), "the push step still publishes with the same credential the probe proved");

console.log("Passed " + checks + " publish-preflight assertions.");
