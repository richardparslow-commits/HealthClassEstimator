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

   The manifest cases are here for the same reason a release number was not enough: the
   frame can say release 84 over bytes that are not the published artifact, so
   `/manifest/<page>` serves the deployed repository's record of what that page carries,
   and `?kind=` serves the ways it can disagree — another build's digest, another
   release, another file name, a length that is off by one, a 404 and a non-JSON body.

   Needs Chromium, which the browser job in audit-checks.yml installs for the
   interview suite as well: HCE_BROWSER_PATH can point at an existing one.
*/
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
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

// The gate's own behaviour, which is what the check now exercises. The app keeps its
// continue button disabled until the acknowledgment is ticked, and accepting it hides the
// gate, renders the interview's steps and puts focus on the first product question. The
// stubs carry the same behaviour for the same reason the app does: a fixture that never
// answered a click would let a check that never clicked pass. `stuck` is the shape of a
// copy that is not this build — same gate, nothing behind it — and `deaf` a gate whose
// script never ran, so its continue button can never be enabled.
const GATE_SCRIPT = {
  works:
    "<script>(function(){var check=document.getElementById('ack-check'),accept=document.getElementById('ack-accept')," +
    "gate=document.getElementById('ack-gate'),nav=document.createElement('div');nav.id='steps-nav';" +
    "document.body.appendChild(nav);accept.disabled=true;" +
    "check.addEventListener('change',function(){accept.disabled=!check.checked;});" +
    "accept.addEventListener('click',function(){if(!check.checked)return;gate.classList.add('hidden');" +
    "for(var i=0;i<3;i++){var b=document.createElement('button');b.className='step-pill';b.textContent=(i+1)+'. Step';nav.appendChild(b);}" +
    "document.getElementById('productId').focus();});})();</script>",
  stuck: "",
  deaf: "<script>document.getElementById('ack-accept').disabled=true;</script>",
};

// The estimator document the frames carry: the markers the check looks for, a version
// it reads back, and the controls that move a visitor forward — the gate's checkbox and
// accept button, the interview's Next — positioned the way the app positions them,
// against the frame's viewport. `gateTop`/`footerTop` push them down for the too-tall
// case; `behaviour` picks which of the three gate states above the document is in.
function estimatorDocument(version, extra = "", { gateTop = 0, footerTop = 0, behaviour = "works" } = {}) {
  return (
    '<!doctype html><html><head><title>Estimator</title>' +
    "<style>.hidden{display:none}</style></head><body style=\"margin:0\">" +
    '<div id="ack-gate" style="position:fixed;left:0;right:0;' +
    (gateTop ? "top:" + gateTop + "px;bottom:auto;" : "top:0;bottom:0;") +
    '"><input id="ack-check" type="checkbox"><button id="ack-accept">I acknowledge</button></div>' +
    '<select id="productId"></select>' +
    '<footer class="app-footer" style="position:fixed;left:0;right:0;' +
    (footerTop ? "top:" + footerTop + "px;bottom:auto;" : "bottom:0;") +
    '"><button id="btn-next">Next</button></footer>' +
    "<script>const Engine = {};window.HCE_VERSION = \"" +
    version +
    "\";" +
    extra +
    "</script>" +
    GATE_SCRIPT[behaviour] +
    "</body></html>"
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
  // The two gate states a copy can be in when the layout is right: nothing answers the
  // click, and nothing ever enables it. Both are documents with the tool's markup, and
  // neither is a tool.
  stuck: (version) => frame(estimatorDocument(version, "", { behaviour: "stuck" })),
  deaf: (version) => frame(estimatorDocument(version, "", { behaviour: "deaf" })),
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
  stub: () => frame(STUB_DOC),
  // The real artifact in the deployed geometry: Streamlit's 2,400px frame in a 900px
  // window, carrying this repository's build rather than a stub. The stub above says the
  // check notices a document that positions its controls against the frame; this says
  // this repository's app does not — it sizes itself to the window it is actually shown
  // in and keeps Back / Save draft / Next at that panel's bottom edge.
  overTallBuild: () =>
    '<!doctype html><html><body style="margin:0">' +
    '<iframe title="estimator" style="width:100%;height:2400px;border:0" src="/build/app.html"></iframe>' +
    "</body></html>",
  // What Streamlit's wrapper does: `st.iframe(..., height=2400)` makes the frame's
  // viewport 2,400px tall in a 900px window, so the app's fixed gate and footer sit at
  // the bottom of a document the visitor cannot see the whole of. This is the live
  // layout measured on 2026-10-17, with the continue button at 1,765px.
  tooTall: (version) =>
    '<!doctype html><html><body style="margin:0">' +
    "<iframe title=\"estimator\" style=\"width:100%;height:2400px;border:0\" srcdoc='" +
    estimatorDocument(version, "", { gateTop: 1700, footerTop: 2200 }).replace(/'/g, "&apos;") +
    "'></iframe></body></html>",
  // This repository's build with its interview script taken out, in an embedder's
  // window-height frame: every marker, the version stamp, the gate, the footer and the
  // geometry intact, and nothing answering. This is the copy that passed the check on
  // 2026-10-17, before it took the gate — and the shape of the failure the check exists
  // for, because a visitor gets a frame they cannot use.
  dead: () =>
    '<!doctype html><html><body style="margin:0">' +
    '<iframe title="estimator" style="width:100%;height:746px;border:0" src="/build/dead.html"></iframe>' +
    "</body></html>",
  // The host page's own noise: an uncaught error in its own script and a 404 for a
  // shell API, while the estimator frame works. Streamlit's shell does exactly this.
  hostErrors: (version) =>
    "<!doctype html><html><body><h1>Life policy pilot</h1>" +
    "<script>fetch('/api/v2/user/details').catch(() => {}); setTimeout(() => { throw new Error('shell noise'); }, 0);</script>" +
    frame(estimatorDocument(version)),
};

// The repository's own release, so the fixtures move with it: the check's default is
// index.html's HCE_VERSION, and a fixture pinned to an older number would exercise a
// deployment that is behind rather than the one this repository builds.
const VERSION = /var HCE_VERSION = "(\d+)"/.exec(fs.readFileSync(path.join(root, "index.html"), "utf8"))[1];
const NEXT_VERSION = String(Number(VERSION) + 1);
// The build the deployed-geometry case serves. `npm run build` writes it, and the browser
// job in audit-checks.yml builds before this suite runs.
const BUILT_APP = path.join(root, "dist", "app.html");
const builtSource = fs.existsSync(BUILT_APP) ? fs.readFileSync(BUILT_APP, "utf8") : "";
// Every inline script the build carries, in document order. The app's is the last one,
// and this is read from the artifact rather than assumed: the dead case is only the dead
// case if the block it empties is the interview, not the engine it needs to look alive.
const builtScripts = [...builtSource.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const appScript = builtScripts[builtScripts.length - 1];
const DEAD_BUILD = appScript
  ? builtSource.slice(0, appScript.index) + "<script></script>" + builtSource.slice(appScript.index + appScript[0].length)
  : builtSource;

// The document each page actually serves into its frame. The manifest has to describe
// that, not the host page around it, or every case would fail on bytes for the wrong
// reason. A page served by URL (`/build/...`) is described by the file it loads.
const STUB_DOC = '<select id="productId"></select><input id="ack-check"><script>const Engine = {};</script>';
const ARTIFACTS = {
  awake: () => estimatorDocument(VERSION),
  nested: () => estimatorDocument(VERSION),
  asleep: () => estimatorDocument(VERSION),
  empty: () => estimatorDocument(VERSION),
  hostErrors: () => estimatorDocument(VERSION),
  throwing: () => estimatorDocument(VERSION, "throw new Error('engine exploded');"),
  tooTall: () => estimatorDocument(VERSION, "", { gateTop: 1700, footerTop: 2200 }),
  stuck: () => estimatorDocument(VERSION, "", { behaviour: "stuck" }),
  deaf: () => estimatorDocument(VERSION, "", { behaviour: "deaf" }),
  stub: () => STUB_DOC,
  overTallBuild: () => builtSource,
  dead: () => DEAD_BUILD,
};

const digest = (text) => {
  const bytes = Buffer.from(String(text), "utf8");
  return { sha256: crypto.createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
};

const manifestFor = (name, kind) => {
  const artifact = (ARTIFACTS[name] ?? ARTIFACTS.awake)();
  const real = digest(artifact);
  const manifest = {
    artifact: "app_embedded.html",
    sha256: real.sha256,
    bytes: real.bytes,
    hce_version: VERSION,
    builder: "scripts/build-embedded.js",
    source_commit: "test",
    built_utc: "2026-10-19T00:00:00.000Z",
  };
  if (kind === "other") {
    const other = digest(estimatorDocument(NEXT_VERSION));
    manifest.sha256 = other.sha256;
    manifest.bytes = other.bytes;
  }
  if (kind === "version") manifest.hce_version = NEXT_VERSION;
  if (kind === "artifact") manifest.artifact = "streamlit_embedded.html";
  if (kind === "lengthened") manifest.bytes = real.bytes + 1;
  return manifest;
};

// The port the fixtures listen on, assigned once it is listening: `run` needs it to name
// the manifest each page carries, and it is defined before the server starts.
let base = "";

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/manifest/")) {
    const [pathPart, query] = req.url.split("?");
    const name = pathPart.slice("/manifest/".length) || "awake";
    const kind = new URLSearchParams(query ?? "").get("kind");
    if (kind === "missing") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("no manifest at this path");
      return;
    }
    if (kind === "notjson") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>this is not a manifest</html>");
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(manifestFor(name, kind), null, 2));
    return;
  }
  if (req.url.startsWith("/build/app.html") || req.url.startsWith("/build/dead.html")) {
    if (!fs.existsSync(BUILT_APP)) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("no build at dist/app.html — run npm run build first");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    if (req.url.startsWith("/build/dead.html")) res.end(DEAD_BUILD);
    else fs.createReadStream(BUILT_APP).pipe(res);
    return;
  }
  const name = req.url.replace(/^\//, "").split("?")[0] || "awake";
  const rendered = (PAGES[name] ?? PAGES.awake)(VERSION);
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(rendered);
});

// Asynchronous on purpose: the pages under test are served by this process, and
// spawnSync would block its event loop until the child finished — the child would
// then time out navigating to a server that cannot answer.
function run(args) {
  // Every run is given the manifest its page actually carries, unless the case names one
  // itself — the byte comparison is part of the check now, not an optional extra.
  const urlAt = args.indexOf("--url");
  const pageUrl = urlAt >= 0 ? String(args[urlAt + 1]) : "";
  const name = pageUrl.split("?")[0].split("/").filter(Boolean).pop() || "awake";
  const withManifest = args.includes("--manifest")
    ? args
    : [...args, "--manifest", base + "/manifest/" + name];
  return new Promise((done) => {
    const child = spawn(process.execPath, [script, ...withManifest], { cwd: root });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("close", (status) => done({ status, out, err }));
  });
}

(async () => {
  // Fails rather than skips when the build is missing: in CI the browser job builds it
  // before this suite, and a skip would report the deployed layout as unverified on the
  // day the build broke.
  ok(fs.existsSync(BUILT_APP), "the deployed-geometry case needs a build — run npm run build first");
  ok(/Accessible product-specific interview/.test(appScript[1]), "the dead case empties the build's last script block, which is the app's interview");
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  base = "http://127.0.0.1:" + server.address().port;

  /* --- awake, serving this release ---------------------------------------- */

  const nested = await run(["--url", base + "/nested", "--expect-version", VERSION]);
  equal(nested.status, 0, "the app's real nesting — component frame around the srcdoc frame — passes: " + nested.err);
  ok(new RegExp('release "' + VERSION + '"').test(nested.out) && /about:srcdoc/.test(nested.out), "and the frame it reports is the inner one that runs the tool: " + nested.out);

  const stub = await run(["--url", base + "/stub", "--expect-version", VERSION, "--timeout-ms", "8000"]);
  equal(stub.status, 1, "a frame carrying the markers but no build version fails");
  ok(/carries no window\.HCE_VERSION/.test(stub.out), "and says the document is not this build");

  const awake = await run(["--url", base + "/awake", "--expect-version", VERSION]);
  equal(awake.status, 0, "an awake app serving this release passes: " + awake.err);
  ok(/^PASS — a browser gets this release's bytes from the deployed app\.$/m.test(awake.out), "the verdict says what was proved");
  ok(/State {2}: awake on arrival/.test(awake.out), "and that it arrived awake");
  ok(new RegExp('release "' + VERSION + '"').test(awake.out), "naming the release it found");
  ok(/Interview : 3 steps after accepting the gate, focus on productId/.test(awake.out), "and the interview the gate led to: " + awake.out);

  /* --- the release number is not the bytes --------------------------------- */

  // A pass states both facts now: what the deployed repository publishes, and that the
  // frame's own bytes are that artifact. Before this, a copy built from another commit
  // and stamped 84 passed on the string alone.
  ok(
    new RegExp('Manifest : app_embedded\\.html \\d+ bytes, sha256 [0-9a-f]{12}…, release "' + VERSION + '"').test(awake.out),
    "a pass names the published artifact's digest and size: " + awake.out,
  );
  ok(/Bytes {2}: the frame's \d+ bytes are that artifact/.test(awake.out), "and says the frame's bytes are that artifact: " + awake.out);

  const otherBytes = await run(["--url", base + "/awake", "--manifest", base + "/manifest/awake?kind=other"]);
  equal(otherBytes.status, 1, "a frame whose bytes are another build's fails even with the right release: " + otherBytes.out);
  ok(
    /the frame serves \d+ bytes with sha256 [0-9a-f]{12}…; the deployed repository's manifest records app_embedded\.html at \d+ bytes with sha256 [0-9a-f]{12}…/.test(
      otherBytes.out,
    ),
    "the failure names both digests and both sizes: " + otherBytes.out,
  );
  ok(/not serving the artifact that repository publishes/.test(otherBytes.out), "and says what that means: " + otherBytes.out);
  ok(!/^PASS/m.test(otherBytes.out), "with no pass anywhere in the output");

  const lyingVersion = await run(["--url", base + "/awake", "--manifest", base + "/manifest/awake?kind=version"]);
  equal(lyingVersion.status, 1, "a manifest recording another release fails");
  ok(
    new RegExp(
      "the deployed repository's manifest records release \"" + NEXT_VERSION + "\", this repository is release \"" + VERSION + "\"",
    ).test(
      lyingVersion.out,
    ),
  );

  const wrongArtifact = await run(["--url", base + "/awake", "--manifest", base + "/manifest/awake?kind=artifact"]);
  equal(wrongArtifact.status, 1, "a manifest naming another file fails");
  ok(/names "streamlit_embedded\.html" as its artifact/.test(wrongArtifact.out), wrongArtifact.out);

  // Same digest, one byte more: the comparison is over both fields the manifest records,
  // so a size that disagrees is a disagreement with the record even where the hash matches.
  const lengthened = await run(["--url", base + "/awake", "--manifest", base + "/manifest/awake?kind=lengthened"]);
  equal(lengthened.status, 1, "a manifest whose size is off by a byte fails, even with the digest it records");
  ok(/the frame serves \d+ bytes with sha256/.test(lengthened.out), lengthened.out);

  const missingManifest = await run(["--url", base + "/awake", "--manifest", base + "/manifest/awake?kind=missing"]);
  equal(missingManifest.status, 1, "a manifest that cannot be read fails rather than reporting agreement");
  ok(/manifest could not be read — it answered 404/.test(missingManifest.out), missingManifest.out);

  const garbageManifest = await run(["--url", base + "/awake", "--manifest", base + "/manifest/awake?kind=notjson"]);
  equal(garbageManifest.status, 1, "a body that is not JSON fails");
  ok(/manifest could not be read/.test(garbageManifest.out), garbageManifest.out);

  const json = await run(["--url", base + "/awake", "--expect-version", VERSION, "--json"]);
  equal(json.status, 0, "and it can report itself as JSON");
  const payload = JSON.parse(json.out);
  equal(payload.ok, true, "whose ok field is the verdict");
  ok(payload.lines.some((line) => new RegExp('release "' + VERSION + '"').test(line)), "and carries the same evidence");

  // `--json-out` is what the workflow's alert reads: the verdict written beside the
  // human output, so a notification can quote what was judged without parsing prose.
  const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), "streamlit-deployed-report-"));
  const reportFile = path.join(reportDir, "deployed.json");
  const written = await run(["--url", base + "/awake", "--expect-version", VERSION, "--json-out", reportFile]);
  equal(written.status, 0, "a passing run with --json-out succeeds: " + written.err);
  ok(/^PASS — a browser gets this release/.test(written.out), "and still prints the human verdict");
  const writtenPayload = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  equal(writtenPayload.ok, true, "the file carries the same verdict");
  ok(writtenPayload.lines.some((line) => /^State\s+: awake on arrival/.test(line)), "and the state it observed");
  const failingFile = path.join(reportDir, "failed.json");
  const writtenFail = await run(["--url", base + "/awake", "--expect-version", NEXT_VERSION, "--json-out", failingFile]);
  equal(writtenFail.status, 1, "a failing run still writes its report");
  const failingPayload = JSON.parse(fs.readFileSync(failingFile, "utf8"));
  equal(failingPayload.ok, false, "which says the verdict was a failure");
  ok(failingPayload.problems.some((problem) => /serving a different build/.test(problem)), "and carries the problem, so the alert can name it");
  equal((await run(["--json-out"])).status, 2, "a --json-out with no value is a usage error, not a silent pass");
  fs.rmSync(reportDir, { recursive: true, force: true });

  /* --- asleep, and woken by the check -------------------------------------- */

  const asleep = await run(["--url", base + "/asleep", "--expect-version", VERSION, "--timeout-ms", "30000"]);
  equal(asleep.status, 0, "an app that was asleep but wakes passes, and the run wakes it: " + asleep.err);
  ok(/State {2}: asleep on arrival — woken by this check in \d+ ms/.test(asleep.out), "and says that it was asleep, and how long the wake took");

  /* --- awake, and wrong ---------------------------------------------------- */

  const empty = await run(["--url", base + "/empty", "--expect-version", VERSION, "--timeout-ms", "6000"]);
  equal(empty.status, 1, "an app with no estimator frame fails");
  ok(/no estimator frame after \d+ ms/.test(empty.out), "the failure says the frame never arrived");
  ok(/No frame here\./.test(empty.out), "and quotes what the page said instead");

  const other = await run(["--url", base + "/awake", "--expect-version", NEXT_VERSION]);
  equal(other.status, 1, "a frame running another release fails");
  ok(new RegExp('the frame runs release "' + VERSION + '", this repository is release "' + NEXT_VERSION + '"').test(other.out), "the failure names both releases");
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

  /* --- presence is not reach --------------------------------------------- */

  // The controls that move a visitor forward have to be in the window, not at the
  // bottom of a frame an embedder made taller than it. Streamlit's wrapper sets
  // height=2400, and on 2026-10-17 the continue button sat 1,765px down a 900px window
  // while every check here passed on "the gate is present".
  ok(/Layout : continue button at \d+px, Next at \d+px, frame \d+px tall in a 900px window/.test(nested.out), "a pass reports where the way forward was: " + nested.out);
  ok(!/below the fold/.test(nested.out), "and does not call a visible control unreachable");

  const tooTall = await run(["--url", base + "/tooTall", "--expect-version", VERSION]);
  equal(tooTall.status, 1, "a frame taller than the window fails when the way forward is at its bottom");
  ok(/the acknowledgment's continue button is at 170\dpx — \d+px below the fold/.test(tooTall.out), "the gate's unreachable button is named with its offset: " + tooTall.out);
  ok(/the interview's Next button is at 2200px/.test(tooTall.out), "and so is the interview's");
  ok(/the embedder sets that height/.test(tooTall.out), "the finding names the frame height rather than blaming the app");
  ok(/Layout : continue button at 170\dpx, Next at 2200px, frame 2400px tall in a 900px window/.test(tooTall.out), "the summary states the geometry");

  // The same geometry, carrying this repository's build. The stub above is a document
  // that still positions its controls against the frame — a third-party embed, or this
  // app before release 82 — and it must keep failing; this is the app itself, and it must
  // pass. Measured before the fix, with the real build: "Next at 2261px — 1361px below
  // the fold"; after it: "Next at 753px".
  const built = await run(["--url", base + "/overTallBuild", "--expect-version", VERSION, "--timeout-ms", "20000"]);
  equal(built.status, 0, "the real build puts the way forward inside a 900px window: " + built.out + built.err);
  ok(/^PASS — a browser gets this release's bytes from the deployed app\.$/m.test(built.out), "and the verdict says so");
  ok(!/below the fold/.test(built.out), "reporting no unreachable control: " + built.out);
  ok(/Layout : continue button at \d+px, Next at \d+px, frame 2400px tall in a 900px window/.test(built.out), "while naming the geometry it judged");
  ok(/Interview : [1-9]\d* steps after accepting the gate, focus on productId/.test(built.out), "and reports the interview it took in the real build: " + built.out);

  /* --- a document is not a tool ------------------------------------------- */

  // Everything above can be true of a copy whose script never ran: the markers are in
  // the HTML, the version is stamped by an inline tag before the app loads, and the gate
  // and footer are markup. Only using the tool tells them apart, and on 2026-10-17 this
  // build with its interview script emptied passed this check outright.
  const dead = await run(["--url", base + "/dead", "--expect-version", VERSION, "--timeout-ms", "8000"]);
  equal(dead.status, 1, "a build whose interview script never ran fails, however right its markup is: " + dead.out);
  ok(/nothing is running behind the document/.test(dead.out), "and says the gate is closed with no interview behind it: " + dead.out);
  ok(!/^PASS/m.test(dead.out), "with no pass anywhere in the output");
  ok(/Interview : not reached/.test(dead.out), "the summary says the interview was never reached");

  // A gate that answers nothing while looking exactly like the app's: the layout and the
  // version are right, the click lands, and the visitor stays on the gate forever.
  const stuck = await run(["--url", base + "/stuck", "--expect-version", VERSION, "--timeout-ms", "8000"]);
  equal(stuck.status, 1, "a continue button that answers nothing fails");
  ok(/nothing happened: no step pills rendered/.test(stuck.out), "and says the gate did not yield: " + stuck.out);

  // And a gate whose continue button never enables, which is a script that did not run —
  // reported as that, not as a click that failed to land.
  const deaf = await run(["--url", base + "/deaf", "--expect-version", VERSION, "--timeout-ms", "8000"]);
  equal(deaf.status, 1, "a continue button that never enables fails");
  ok(/stayed disabled after the checkbox was ticked/.test(deaf.out), "and says the gate's own script is not running: " + deaf.out);

  /* --- the declaration and the interface ----------------------------------- */

  const declared = JSON.parse(fs.readFileSync(path.join(root, "consumers", "streamlit.json"), "utf8"));
  ok(/^https:\/\//.test(declared.deployedUrl), "the deployed app is declared with an https URL");
  ok(/streamlit\.app/.test(declared.deployedUrl), "which is the Streamlit deployment");
  equal(declared.repo, "richardparslow-commits/health_app.py", "alongside the repository it serves from");

  const bare = await run(["--url", base + "/awake"]);
  equal(bare.status, 0, "with no --expect-version the build's own release is the expectation");
  ok(new RegExp('release "' + VERSION + '"').test(bare.out), "which is read from index.html");

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
  ok(/--manifest/.test(help.out), "including the manifest it compares against");

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
