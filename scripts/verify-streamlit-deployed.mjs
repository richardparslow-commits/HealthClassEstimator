#!/usr/bin/env node
/* Load the deployed Streamlit app in a real browser and check that a person gets the
   tool — not a sleep screen, not an empty frame, not another release.

   Why this exists. Every other check in this repository stays on the near side of the
   deployment: `verify-streamlit-runtime.py` imports the wrapper with Streamlit stubbed
   and proves it serves the pair; `verify-streamlit-live.py` runs it through Streamlit's
   own AppTest; the parity jobs clone the deployed repository and judge the bytes in it.
   All three pass while the service itself is asleep, suspended, renamed or serving a
   frame the browser refuses to render, because none of them ever contacts it.

   That is not hypothetical. On 2026-10-17 the deployed app answered a browser with
   "Zzzz — This app has gone to sleep due to inactivity", and no check in either
   repository could have known: the URL was written down once, in the deployed
   repository's README, and no workflow had ever requested it. Streamlit Community
   Cloud suspends an app that gets no traffic, so the checks that never touched it were
   also the reason it slept.

   What this does: loads the URL in headless Chromium (the URL is declared in
   consumers/streamlit.json, so the app the page links to is named in one place),
   clicks the wake button when the sleep screen is showing and measures how long the
   wake took, waits for the estimator frame, and then judges what a visitor would see —
   the frame is present, it carries this repository's release version, its
   acknowledgment gate and product select are there, and nothing inside it threw.

   The run is also the traffic that keeps the app awake, which is why it is scheduled
   more than once a day: a daily check against a service that sleeps on idle would
   find it asleep every time. Its verdict says whether it arrived awake or asleep, so
   the cadence can be judged from the logs rather than assumed.

   Errors from the host page are reported but not fatal: the Streamlit shell loads its
   own analytics and user-details APIs, and a 404 for either is not this app failing
   (measured: heap-.js and /api/v2/user/details both 404 while the app works). Errors
   inside the estimator frame are ours and do fail the run.

   Usage:
     node scripts/verify-streamlit-deployed.mjs                     # the declared URL
     node scripts/verify-streamlit-deployed.mjs --url <url>         # any deployment
     node scripts/verify-streamlit-deployed.mjs --expect-version <n>  # release to require
     node scripts/verify-streamlit-deployed.mjs --timeout-ms <ms>   # how long to wait
     node scripts/verify-streamlit-deployed.mjs --json              # machine-readable

   Exit status: 0 when a browser gets this release; 1 when it does not (sleep screen
   that will not wake, no frame, another release, missing anchors, an error inside the
   frame); 2 on a usage error.
*/
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DECLARATION = "consumers/streamlit.json";

// What the estimator's own document carries, and what a stub would not: its engine,
// its acknowledgment gate and its product select. Bare identifiers, because the
// controls are built at runtime as well as written into the document — the frame is
// read back as a serialized DOM, where both forms appear.
const MARKERS = { engine: "const Engine =", acknowledgment: "ack-check", product: "productId" };
const carriesEstimator = (html) => Object.values(MARKERS).every((marker) => html.includes(marker));

function fail(message) {
  console.error("ERROR: " + message);
  process.exit(1);
}

function usage() {
  return readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/, "").trim();
}

// A flag at the end of the line, or followed by another flag, is a mistake in the
// caller: pretending it was absent would run the check against something the caller
// did not ask for, which is the one answer that must never come out of a usage error.
function valueFor(argv, i, flag) {
  const value = argv[i + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error("ERROR: " + flag + " needs a value.");
    process.exit(2);
  }
  return value;
}

function parseArgs(argv) {
  const args = { timeoutMs: 180000, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") { args.url = valueFor(argv, i, "--url"); i++; }
    else if (a === "--expect-version") { args.expectedVersion = valueFor(argv, i, "--expect-version"); i++; }
    else if (a === "--timeout-ms") { args.timeoutMs = Number(valueFor(argv, i, "--timeout-ms")); i++; }
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else {
      console.error("ERROR: unknown argument " + a);
      process.exit(2);
    }
  }
  if (args.url !== undefined && !args.url) {
    console.error("ERROR: --url needs a value (or drop it and use the declared one).");
    process.exit(2);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
    console.error("ERROR: --timeout-ms needs a number of milliseconds (at least 1000).");
    process.exit(2);
  }
  return args;
}

function readDeclaration() {
  const file = resolve(ROOT, DECLARATION);
  if (!existsSync(file)) fail("no " + DECLARATION + " — it declares the deployed URL this check loads.");
  const declared = JSON.parse(readFileSync(file, "utf8"));
  if (typeof declared.deployedUrl !== "string" || !declared.deployedUrl.startsWith("http"))
    fail(DECLARATION + " has no deployedUrl");
  return { file, declared };
}

// The release this repository is on, from the same declaration the build is stamped
// with: a deployed copy that answers with another number is not this release, however
// healthy it looks.
function buildVersion() {
  const match = readFileSync(resolve(ROOT, "index.html"), "utf8").match(/var HCE_VERSION = "([^"]+)"/);
  if (!match) fail("could not read HCE_VERSION from index.html");
  return match[1];
}

/* --- what a browser sees --------------------------------------------------- */

const SLEEP = /gone to sleep|waking up|Wake this app/i;
const WAKE_BUTTON = /get this app back up|wake/i;

// Console errors are attributed by the URL their location names: a message from the
// estimator's own frame is ours and fails the run, one from Streamlit's shell (its
// analytics script and /api/v2/user/details both 404 while the app works) is not.
async function observe(page, timeoutMs, consoleErrors = []) {
  const started = Date.now();
  let sawSleepScreen = false;
  let clickedWake = false;
  let wakeMs = null;
  let found = null;

  // The deployed app nests the document twice: Streamlit's component frame, and inside
  // it the srcdoc frame that holds the artifact. The component frame's own serialized
  // DOM carries the markers too — they sit inside the srcdoc attribute — and its
  // window has no HCE_VERSION, so the frame that defines the version is the one that
  // is actually running the tool. Measured against the live app on 2026-10-17; without
  // this the check reported the wrapper frame and called a working app broken.
  const readFrame = async () => {
    let markersOnly = null;
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const html = await frame.content().catch(() => "");
      if (!carriesEstimator(html)) continue;
      const version = await frame.evaluate(() => window.HCE_VERSION).catch(() => null);
      const found = { url: frame.url(), bytes: html.length, version: typeof version === "string" ? version : null, acknowledgment: true };
      if (found.version) return found;
      markersOnly = markersOnly ?? found;
    }
    return markersOnly;
  };

  while (Date.now() - started < timeoutMs) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (SLEEP.test(text)) {
      sawSleepScreen = true;
      if (!clickedWake) {
        const button = page.getByRole("button", { name: WAKE_BUTTON }).first();
        if (await button.count()) {
          await button.click({ timeout: 15000 }).catch(() => {});
          clickedWake = true;
          wakeMs = Date.now() - started;
        }
      }
    }
    found = await readFrame();
    if (found) break;
    await page.waitForTimeout(2000);
  }

  const frameErrors = found ? consoleErrors.filter((one) => one.from === found.url || one.from === "about:srcdoc") : [];
  const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
  return { url: page.url(), sawSleepScreen, clickedWake, wakeMs, frame: found, body, frameErrors, consoleErrors, elapsedMs: Date.now() - started };
}

export function verdict({ expectedVersion, observed }) {
  const problems = [];
  if (!observed.frame) {
    problems.push(
      "no estimator frame after " +
        observed.elapsedMs +
        " ms: the page says " +
        JSON.stringify(observed.body) +
        (observed.sawSleepScreen
          ? observed.clickedWake
            ? " (the sleep screen was showing and was woken)"
            : " (the sleep screen was showing and no wake button was found)"
          : "") +
        ". A visitor sees that too.",
    );
  } else if (observed.frame.version === null) {
    problems.push(
      "the estimator frame carries no window.HCE_VERSION, so what it serves is not this repository's build (" +
        observed.frame.bytes +
        " bytes from " +
        observed.frame.url +
        ")",
    );
  } else {
    if (observed.frame.version !== expectedVersion)
      problems.push(
        "the frame runs release " +
          JSON.stringify(observed.frame.version) +
          ", this repository is release " +
          JSON.stringify(expectedVersion) +
          " — the deployment is serving a different build",
      );
    for (const error of observed.frameErrors) problems.push("inside the estimator frame: " + error.text);
  }
  const lines = [];
  if (observed.wakeMs !== null) lines.push("State  : asleep on arrival — woken by this check in " + observed.wakeMs + " ms");
  else lines.push(observed.sawSleepScreen ? "State  : sleep screen seen (wake not clicked)" : "State  : awake on arrival");
  lines.push("URL    : " + observed.url);
  if (observed.frame)
    lines.push(
      "Frame  : " +
        observed.frame.bytes +
        " bytes at " +
        observed.frame.url.replace(/^about:srcdoc$/, "about:srcdoc (the wrapper's frame)") +
        ", release " +
        JSON.stringify(observed.frame.version) +
        ", acknowledgment gate and product select present",
    );
  return { problems, lines, ok: problems.length === 0 };
}

function report(result, json) {
  const payload = { ok: result.ok, problems: result.problems, lines: result.lines };
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return result.ok ? 0 : 1;
  }
  if (result.ok) {
    console.log("PASS — a browser gets this release from the deployed app.");
    for (const line of result.lines) console.log("       " + line);
    return 0;
  }
  for (const line of result.lines) console.log("       " + line);
  console.log("");
  console.log("FAIL — a browser does not get this release from the deployed app.");
  for (const problem of result.problems) console.log("       " + problem);
  console.log("       This is the hop the local checks cannot see: the wrapper, the pair and the");
  console.log("       repository can all be right while the service a visitor loads is not. Wake it");
  console.log("       in the Streamlit Cloud dashboard if it is asleep, and check the app's settings");
  console.log("       if it is awake and still wrong.");
  return 1;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  const { declared } = readDeclaration();
  const url = args.url ?? declared.deployedUrl;
  const expectedVersion = String(args.expectedVersion ?? buildVersion());
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    consoleErrors.push({ from: (message.location()?.url ?? "").split("?")[0], text: message.text().slice(0, 200) });
  });
  page.on("pageerror", (error) =>
    consoleErrors.push({
      // A stack that names the frame's document is the frame's error, whatever URL the
      // browser puts in it; otherwise the first URL in the stack is the host page.
      from: /srcdoc/.test(error.stack ?? "") ? "about:srcdoc" : ((error.stack ?? "").match(/https?:\/\/[^\s)]+/)?.[0] ?? ""),
      text: (error.message ?? String(error)).slice(0, 200),
    }),
  );
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: Math.min(args.timeoutMs, 60000) });
    const observed = await observe(page, args.timeoutMs, consoleErrors);
    const result = verdict({ expectedVersion, observed });
    // Everything else the host page said is reported, never fatal: it belongs to
    // Streamlit's shell (analytics, user details), not to the tool this check is about.
    const hostOnly = observed.consoleErrors.filter((one) => !observed.frameErrors.includes(one));
    if (hostOnly.length && !args.json)
      console.log("       Host page errors (not judged, they are Streamlit's shell): " + hostOnly.slice(0, 3).map((one) => one.text).join("; "));
    return report(result, args.json);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error("streamlit-deployed: " + error.message);
      process.exitCode = 1;
    });
}

export { observe, SLEEP, MARKERS, carriesEstimator };
