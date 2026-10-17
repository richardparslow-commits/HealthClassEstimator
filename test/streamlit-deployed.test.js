"use strict";
/* Fixtures for scripts/verify-streamlit-deployed.mjs, the browser check of the
   deployed app.

   The check exists because every other check stays on the near side of the
   deployment, and on 2026-10-17 the deployed app answered a browser with a sleep
   screen while all of them passed. These fixtures drive the real script — not a copy
   of its logic — against a local server that plays each state a deployment can be in:
   asleep and woken by the click, awake with the estimator in its frame, awake with
   nothing in the frame at all, serving another release, missing the acknowledgment
   gate, and throwing inside the frame. The host page's own errors are the last case,
   because Streamlit's shell 404s its analytics and user-details APIs while working.

   Needs Chromium, which the browser job in audit-checks.yml installs for the
   interview suite as well: HCE_BROWSER_PATH can point at an existing one.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "scripts", "verify-streamlit-deployed.mjs");
let checks = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks++;
}
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}

// The estimator document the frames carry: the two markers the check looks for and a
// version it reads back, plus whatever the case needs.
function estimatorDocument(version, extra = "") {
  return (
    "<!doctype html><html><head><title>Estimator</title></head><body>" +
    '<select id="productId"></select><input id="ack-check" type="checkbox">' +
    "<script>const Engine = {};window.HCE_VERSION = \"" +
    version +
    "\";" +
    extra +
    "</script></body></html>"
  );
}

const frameElement = (document) => "<iframe title=\"estimator\" srcdoc='" + document.replace(/'/g, "&apos;") + "'></iframe>";
const frame = (document) => "<!doctype html><html><body><h1>Life policy pilot</h1>" + frameElement(document) + "</body></html>";

const PAGES = {
  // The sleep screen Streamlit serves for an idle app, with the button it offers. Its
  // listener navigates to the awake page rather than replacing the body from an
  // embedded copy of it: a document inside a script string closes the script tag it
  // sits in, and a broken wake button would be the page failing, not the check.
  asleep: () =>
    "<!doctype html><html><body><p>Zzzz</p>" +
    "<p>This app has gone to sleep due to inactivity. Would you like to wake it back up?</p>" +
    '<button id="wake" onclick="location.href = \'/awake\'">Yes, get this app back up!</button>' +
    "</body></html>",
  awake: (version) => frame(estimatorDocument(version)),
  empty: () => "<!doctype html><html><body><h1>Life policy pilot</h1><p>No frame here.</p></body></html>",
  throwing: (version) => frame(estimatorDocument(version, "throw new Error('engine exploded');")),
  // What the deployed app actually nests: Streamlit's component frame, and inside it
  // the srcdoc frame the wrapper serves. The component frame's serialized DOM carries
  // the markers too — inside the srcdoc attribute — and its window has no version, so
  // the check has to find the inner frame or it reports a working app as broken.
  nested: () => "<!doctype html><html><body><iframe title=\"component\" src=\"/component\"></iframe></body></html>",
  component: (version) =>
    "<!doctype html><html><body><p>Streamlit component shell</p>" + frameElement(estimatorDocument(version)) + "</body></html>",
  // A frame carrying the markers but not the build: a stubbed or truncated document.
  stub: () => frame('<select id="productId"></select><input id="ack-check"><script>const Engine = {};</script>'),
  // The host page's own noise: an uncaught error in its own script and a 404 for a
  // shell API, while the estimator frame works. Streamlit's shell does exactly this.
  hostErrors: (version) =>
    "<!doctype html><html><body><h1>Life policy pilot</h1>" +
    "<script>fetch('/api/v2/user/details').catch(() => {}); setTimeout(() => { throw new Error('shell noise'); }, 0);</script>" +
    frame(estimatorDocument(version)),
};

const VERSION = "80";
const server = http.createServer((req, res) => {
  const name = req.url.replace(/^\//, "").split("?")[0] || "awake";
  const rendered = (PAGES[name] ?? PAGES.awake)(VERSION);
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(rendered);
});

// Asynchronous on purpose: the pages under test are served by this process, and
// spawnSync would block its event loop until the child finished — the child would
// then time out navigating to a server that cannot answer.
function run(args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (status) => done({ status, out, err }));
  });
}

(async () => {
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const base = "http://127.0.0.1:" + server.address().port;

  /* --- awake, serving this release ---------------------------------------- */

  const nested = await run(["--url", base + "/nested", "--expect-version", VERSION]);
  equal(nested.status, 0, "the app's real nesting — component frame around the srcdoc frame — passes: " + nested.err);
  ok(/release "80"/.test(nested.out) && /about:srcdoc/.test(nested.out), "and the frame it reports is the inner one that runs the tool: " + nested.out);

  const stub = await run(["--url", base + "/stub", "--expect-version", VERSION, "--timeout-ms", "8000"]);
  equal(stub.status, 1, "a frame carrying the markers but no build version fails");
  ok(/carries no window\.HCE_VERSION/.test(stub.out), "and says the document is not this build");

  const awake = await run(["--url", base + "/awake", "--expect-version", VERSION]);
  equal(awake.status, 0, "an awake app serving this release passes: " + awake.err);
  ok(/^PASS — a browser gets this release from the deployed app\.$/m.test(awake.out), "the verdict says what was proved");
  ok(/State {2}: awake on arrival/.test(awake.out), "and that it arrived awake");
  ok(/release "80"/.test(awake.out), "naming the release it found");

  const json = await run(["--url", base + "/awake", "--expect-version", VERSION, "--json"]);
  equal(json.status, 0, "and it can report itself as JSON");
  const payload = JSON.parse(json.out);
  equal(payload.ok, true, "whose ok field is the verdict");
  ok(payload.lines.some((line) => /release "80"/.test(line)), "and carries the same evidence");

  /* --- asleep, and woken by the check -------------------------------------- */

  const asleep = await run(["--url", base + "/asleep", "--expect-version", VERSION, "--timeout-ms", "30000"]);
  equal(asleep.status, 0, "an app that was asleep but wakes passes, and the run wakes it: " + asleep.err);
  ok(/State {2}: asleep on arrival — woken by this check in \d+ ms/.test(asleep.out), "and says that it was asleep, and how long the wake took");

  /* --- awake, and wrong ---------------------------------------------------- */

  const empty = await run(["--url", base + "/empty", "--expect-version", VERSION, "--timeout-ms", "6000"]);
  equal(empty.status, 1, "an app with no estimator frame fails");
  ok(/no estimator frame after \d+ ms/.test(empty.out), "the failure says the frame never arrived");
  ok(/No frame here\./.test(empty.out), "and quotes what the page said instead");

  const other = await run(["--url", base + "/awake", "--expect-version", "81"]);
  equal(other.status, 1, "a frame running another release fails");
  ok(/the frame runs release "80", this repository is release "81"/.test(other.out), "the failure names both releases");
  ok(/serving a different build/.test(other.out), "and says what that means");

  const throwing = await run(["--url", base + "/throwing", "--expect-version", VERSION, "--timeout-ms", "15000"]);
  equal(throwing.status, 1, "an error inside the estimator frame fails");
  ok(/inside the estimator frame: engine exploded/.test(throwing.out), "the failure quotes the error from the frame");

  // The host page's errors are reported and not judged: the harness page rejects a
  // promise and 404s a shell API while the estimator works, which is what Streamlit
  // does on every load.
  const noisy = await run(["--url", base + "/hostErrors", "--expect-version", VERSION]);
  equal(noisy.status, 0, "the host page's own errors do not fail the run: " + noisy.err);
  ok(/Host page errors \(not judged/.test(noisy.out), "but they are reported");

  /* --- the declaration and the interface ----------------------------------- */

  const declared = JSON.parse(fs.readFileSync(path.join(root, "consumers", "streamlit.json"), "utf8"));
  ok(/^https:\/\//.test(declared.deployedUrl), "the deployed app is declared with an https URL");
  ok(/streamlit\.app/.test(declared.deployedUrl), "which is the Streamlit deployment");
  equal(declared.repo, "richardparslow-commits/health_app.py", "alongside the repository it serves from");

  const bare = await run(["--url", base + "/awake"]);
  equal(bare.status, 0, "with no --expect-version the build's own release is the expectation");
  ok(/release "80"/.test(bare.out), "which is read from index.html");

  const usage = await run(["--url", base + "/awake", "--nope"]);
  equal(usage.status, 2, "an unknown flag is a usage error");
  ok(/unknown argument --nope/.test(usage.err), "the usage error names the flag");

  const noValue = await run(["--url"]);
  equal(noValue.status, 2, "--url without a value is a usage error");
  ok(/--url needs a value/.test(noValue.err), "the usage error says what is missing");

  const badTimeout = await run(["--url", base + "/awake", "--timeout-ms", "0"]);
  equal(badTimeout.status, 2, "an unusable timeout is a usage error");

  const help = await run(["--help"]);
  equal(help.status, 0, "--help exits 0");
  ok(/--expect-version/.test(help.out), "--help documents the interface");

  /* --- the wiring ----------------------------------------------------------- */

  // A check nobody runs is the same failure as no check, which is the whole reason
  // the deployment went unrequested. These assertions are about the plumbing: the
  // scheduled workflow must call the verifier, and the verifier must be the script
  // that exists here rather than a copy of its logic.

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  equal(pkg.scripts["verify:deployed"], "node scripts/verify-streamlit-deployed.mjs", "npm run verify:deployed runs this script");
  equal(pkg.scripts["test:deployed"], "node test/streamlit-deployed.test.js", "and its fixtures are an npm script too");

  const scheduled = fs.readFileSync(path.join(root, ".github", "workflows", "streamlit-deployed.yml"), "utf8");
  ok(/^  schedule:$/m.test(scheduled), "a workflow loads the deployment on a schedule");
  ok(/^  workflow_dispatch:$/m.test(scheduled), "and can be run by hand");
  ok(/cron: ".*\b0,6,12,18\b.*"/.test(scheduled), "four times a day, which is also what keeps a sleep-prone app awake");
  ok(/npm run verify:deployed/.test(scheduled), "and it runs the check against the declared URL");
  ok(!/--url/.test(scheduled), "without restating the URL in the workflow, where the declaration could drift");
  ok(/GITHUB_STEP_SUMMARY/.test(scheduled), "and writes the verdict where the run shows it even when the check fails");

  const audit = fs.readFileSync(path.join(root, ".github", "workflows", "audit-checks.yml"), "utf8");
  ok(/npm run test:deployed/.test(audit), "and every branch exercises these fixtures, in the job that has a browser");

  await new Promise((resolveClose) => server.close(resolveClose));
  console.log("Passed " + checks + " deployed-service assertions.");
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
