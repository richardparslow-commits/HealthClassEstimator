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
   acknowledgment gate and product select are there, nothing inside it threw, and, when
   the way forward is on screen, it takes it: the acknowledgment is ticked, continue is
   pressed, and the interview has to arrive with its steps rendered and focus in it.

   The last part is the difference between a document and a tool. On 2026-10-17 this
   build with its interview script emptied — every marker, the version stamp, the gate
   and the footer intact, an embedder's 746px frame, and no handler on anything — passed
   this check: the gate was in the window, so the layout verdict was green, and the
   visitor could never get past it. Markers survive a script that never runs, so the
   only way to tell a working copy from a dead one is to use it. What the interaction
   changes on the deployment is a session's own acknowledgment, kept in sessionStorage:
   nothing is submitted and no data leaves the browser.

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
     node scripts/verify-streamlit-deployed.mjs --json-out <file>   # the same, written beside the human verdict

   `--json-out` is for the workflow: the alert reads what this check judged from the
   file rather than from its printed text, so a red scheduled run can say what a
   visitor got without parsing a person's prose.

   Exit status: 0 when a browser gets this release and can use it; 1 when it does not
   (sleep screen that will not wake, no frame, another release, missing or unreachable
   anchors, a gate that does not yield, an interview that renders nothing, an error
   inside the frame); 2 on a usage error.
*/
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
    else if (a === "--json-out") { args.jsonOut = valueFor(argv, i, "--json-out"); i++; }
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
  let running = null;
  const readFrame = async () => {
    let markersOnly = null;
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      const html = await frame.content().catch(() => "");
      if (!carriesEstimator(html)) continue;
      const version = await frame.evaluate(() => window.HCE_VERSION).catch(() => null);
      const found = { url: frame.url(), bytes: html.length, version: typeof version === "string" ? version : null, acknowledgment: true };
      if (found.version) {
        running = frame;
        return found;
      }
      markersOnly = markersOnly ?? found;
      running = running ?? frame;
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
  const layout = found && running ? await measureLayout(page, running) : null;
  const interview = found && running && layout ? await exerciseInterview(running, layout, timeoutMs) : null;
  return { url: page.url(), sawSleepScreen, clickedWake, wakeMs, frame: found, layout, interview, body, frameErrors, consoleErrors, elapsedMs: Date.now() - started };
}

// Where the way forward is, in the coordinates the visitor's window uses.
//
// Presence is not reach. The app positions its acknowledgment gate and its footer
// against the frame's viewport, and an embedder may make that viewport far taller than
// the window: Streamlit's `st.iframe(..., height=2400)` did, and on 2026-10-17 the
// continue button sat 1,765px down a 900px window while every check called the app
// healthy. So the frame is scrolled into view as a visitor scrolls to the tool, and the
// two controls that move a visitor forward are measured against the window.
//
// `boundingBox()` of a frame element is in the main page's coordinates even when the
// frame is nested, which is what makes the offset through Streamlit's component frame
// honest without walking the tree by hand.
async function measureLayout(page, frame) {
  const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
  const handle = await frame.frameElement().catch(() => null);
  if (handle) {
    await handle.evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
    await page.waitForTimeout(150);
  }
  const box = handle ? await handle.boundingBox().catch(() => null) : null;
  const rects = await frame
    .evaluate(() => {
      const read = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      };
      return { accept: read("#ack-accept"), next: read("#btn-next"), frameHeight: window.innerHeight, frameWidth: window.innerWidth };
    })
    .catch(() => null);
  if (!rects) return null;
  const offsetY = box ? box.y : 0;
  const offsetX = box ? box.x : 0;
  const at = (r) =>
    r && {
      top: Math.round(r.top),
      windowTop: Math.round(r.top + offsetY),
      windowBottom: Math.round(r.bottom + offsetY),
      windowLeft: Math.round(r.left + offsetX),
      windowRight: Math.round(r.right + offsetX),
    };
  return {
    viewport: { width: viewport.width, height: viewport.height },
    frameHeight: Math.round(rects.frameHeight),
    frameWidth: Math.round(rects.frameWidth),
    accept: at(rects.accept),
    next: at(rects.next),
  };
}

/* --- what a visitor does with it ------------------------------------------ */

// The gate in the app: the continue button is disabled until the acknowledgment is
// ticked, accepting hides the gate (the `.hidden` class), renders the interview's step
// pills into #steps-nav and focuses #productId. Read as visibility rather than as a
// class, so a copy that hides the gate some other way is judged by what a visitor sees.
const GATE_STATE = () => {
  const gate = document.querySelector("#ack-gate");
  const accept = document.querySelector("#ack-accept");
  const box = gate ? gate.getBoundingClientRect() : null;
  const style = gate ? getComputedStyle(gate) : null;
  const shown = !!gate && !gate.hidden && style.display !== "none" && style.visibility !== "hidden" && !!box && box.height > 0;
  return {
    present: !!gate,
    open: shown,
    steps: document.querySelectorAll(".step-pill").length,
    acceptEnabled: !!accept && !accept.disabled,
    focused: (document.activeElement && document.activeElement.id) || null,
  };
};

const clickBrief = (error) => String(error && error.message ? error.message : error).split("\n")[0].slice(0, 200);

// Takes the gate as a visitor does, and then holds the copy to being a tool.
//
// The interaction only happens when the gate is inside the window: a gate a visitor
// cannot reach is already named by the layout judgement, and clicking something off
// screen would report the same defect twice in words that suggest a different one. A
// copy whose gate is already accepted — an embedder that remembered the acknowledgment —
// is judged on the interview alone.
async function exerciseInterview(frame, layout, timeoutMs) {
  const wait = Math.min(timeoutMs ?? 15000, 15000);
  const problems = [];
  const read = () => frame.evaluate(GATE_STATE).catch(() => null);
  const first = await read();
  if (!first) return { attempted: false, accepted: false, steps: 0, problems, reason: "the frame could not be read" };
  if (!first.present) return { attempted: false, accepted: false, steps: first.steps, problems, reason: "the frame has no acknowledgment gate" };

  if (!first.open) {
    // A copy whose acknowledgment is remembered opens on the interview; a copy whose
    // script never ran opens on nothing, because the gate ships closed and the script
    // is what opens it. The steps are what tells them apart.
    if (first.steps === 0) {
      problems.push(
        "the acknowledgment gate is closed and the interview rendered no step pills (.step-pill): nothing is running behind the document, so a visitor gets neither the gate nor the tool",
      );
      return { attempted: false, accepted: false, steps: 0, problems, reason: "the gate is closed with no interview behind it" };
    }
    return { attempted: false, accepted: true, steps: first.steps, problems, reason: null };
  }

  if (!layout || !layout.accept || !inWindow(layout.accept, layout))
    return {
      attempted: false,
      accepted: false,
      steps: first.steps,
      problems,
      reason: "the gate is not on screen, so a visitor cannot accept it — the layout verdict names that",
    };

  const check = frame.locator("#ack-check");
  if ((await check.count().catch(() => 0)) === 0) {
    problems.push("the acknowledgment gate has no checkbox (#ack-check), so its continue button can never be enabled");
    return { attempted: true, accepted: false, steps: first.steps, problems, reason: "no checkbox" };
  }
  try {
    if (!(await check.isChecked().catch(() => false))) await check.click({ timeout: wait });
  } catch (error) {
    problems.push("a visitor's click on the acknowledgment's checkbox did not land: " + clickBrief(error));
    return { attempted: true, accepted: false, steps: first.steps, problems, reason: "the checkbox could not be ticked" };
  }

  const ticked = await read();
  if (ticked && !ticked.acceptEnabled) {
    problems.push(
      "the acknowledgment's continue button stayed disabled after the checkbox was ticked — the gate's own script is not running, so no visitor can accept it",
    );
    return { attempted: true, accepted: false, steps: ticked.steps, problems, reason: "continue stayed disabled" };
  }

  try {
    await frame.locator("#ack-accept").click({ timeout: wait });
  } catch (error) {
    problems.push("a visitor's click on the acknowledgment's continue button did not land: " + clickBrief(error));
    return { attempted: true, accepted: false, steps: first.steps, problems, reason: "the continue button could not be clicked" };
  }

  // Bounded, polling: the tool may render in a frame or two. No fixed sleep, because a
  // copy that never answers must fail the run rather than wait it out.
  const yielded = await frame
    .waitForFunction(
      () => {
        const gate = document.querySelector("#ack-gate");
        const style = gate ? getComputedStyle(gate) : null;
        const closed = !gate || gate.hidden || style.display === "none" || style.visibility === "hidden";
        return closed && document.querySelectorAll(".step-pill").length > 0;
      },
      null,
      { timeout: wait },
    )
    .then(() => true)
    .catch(() => false);

  const after = await read();
  const steps = after ? after.steps : 0;
  if (!yielded) {
    problems.push(
      steps === 0
        ? "the acknowledgment gate is on screen and its continue button was clicked, but nothing happened: no step pills rendered. Every marker this check looks for is in the document and the tool behind them is not running, so a visitor sees the gate and can go no further."
        : "the acknowledgment gate was accepted and the interview rendered " +
          steps +
          " step pills, but the gate stayed on screen over it",
    );
    return { attempted: true, accepted: false, steps, problems, reason: null };
  }

  // Focus is what makes the first answer reachable without a mouse; the site's own e2e
  // requires the same of this build in its frame.
  if (after && after.focused !== "productId")
    problems.push(
      "the gate was accepted and the interview rendered, but focus stayed on " +
        JSON.stringify(after.focused) +
        " instead of the first product question (#productId)",
    );

  return { attempted: true, accepted: true, steps, focused: after ? after.focused : null, problems, reason: null };
}

// In the window, not merely in the document. A control whose top is below the window is
// unreachable without scrolling something the visitor may not know scrolls; that is the
// defect this measurement exists to name.
// Area matters as much as position: an element with nothing on screen — the gate a copy
// ships closed, a control hidden with display:none — sits at 0×0 in the top-left corner
// and would otherwise pass as "in the window".
const inWindow = (r, layout) =>
  r.windowBottom > r.windowTop &&
  r.windowRight > r.windowLeft &&
  r.windowTop >= 0 &&
  r.windowBottom <= layout.viewport.height &&
  r.windowLeft >= 0 &&
  r.windowRight <= layout.viewport.width;

function unreachable(label, rect, layout) {
  if (rect.windowBottom <= rect.windowTop || rect.windowRight <= rect.windowLeft)
    return label + " has no area on screen (" + (rect.windowRight - rect.windowLeft) + " × " + (rect.windowBottom - rect.windowTop) + "px), so nothing a visitor does can press it";
  const below = Math.max(0, rect.windowTop - layout.viewport.height);
  const embedder =
    layout.frameHeight > layout.viewport.height * 1.4
      ? "; the frame is " +
        layout.frameHeight +
        "px tall in a " +
        layout.viewport.height +
        "px window, and the embedder sets that height (Streamlit's st.iframe uses 2400), so the app's fixed footer sits at the bottom of a document the visitor cannot see the whole of"
      : "; the frame is " + layout.frameHeight + "px tall in a " + layout.viewport.height + "px window";
  return label + " is at " + rect.windowTop + "px" + (below ? " — " + below + "px below the fold" : "") + embedder;
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
  if (observed.frame && observed.layout) {
    const layout = observed.layout;
    if (!layout.accept) problems.push("the estimator frame has no acknowledgment continue button (#ack-accept), so a visitor has no way to accept the gate");
    else if (!inWindow(layout.accept, layout)) problems.push(unreachable("the acknowledgment's continue button", layout.accept, layout));
    if (!layout.next) problems.push("the estimator frame has no interview Next button (#btn-next), so an accepted gate leads nobody anywhere");
    else if (!inWindow(layout.next, layout)) problems.push(unreachable("the interview's Next button", layout.next, layout));
  }
  // What the interaction found: the gate yielded, the interview arrived, focus moved.
  if (observed.interview) for (const problem of observed.interview.problems) problems.push(problem);
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
  if (observed.interview)
    lines.push(
      "Interview : " +
        (observed.interview.reason
          ? "not reached — " + observed.interview.reason
          : observed.interview.attempted
            ? observed.interview.steps +
              " steps after accepting the gate" +
              (observed.interview.focused ? ", focus on " + observed.interview.focused : "")
            : "gate already accepted — " + observed.interview.steps + " steps"),
    );
  if (observed.layout)
    lines.push(
      "Layout : " +
        (observed.layout.accept ? "continue button at " + observed.layout.accept.windowTop + "px" : "no continue button") +
        ", " +
        (observed.layout.next ? "Next at " + observed.layout.next.windowTop + "px" : "no Next button") +
        ", frame " +
        observed.layout.frameHeight +
        "px tall in a " +
        observed.layout.viewport.height +
        "px window",
    );
  return { problems, lines, ok: problems.length === 0 };
}

function report(result, json, jsonOut) {
  const payload = { ok: result.ok, problems: result.problems, lines: result.lines };
  // Written before the human verdict is printed: the alert reads this file, so a run
  // that printed a verdict must always have one beside it. An absent file is read as
  // "nothing was judged" rather than as a pass.
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(payload, null, 2) + "\n");
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
    return report(result, args.json, args.jsonOut);
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
