#!/usr/bin/env node
/* Randomized soak harness for the estimator's interview, run by hand.
 *
 * Every cycle walks every section the application has — the acknowledgment gate,
 * all eleven interview steps, the result, the reset, the kept-draft panel, a
 * migration, a storage failure and rapid navigation — and injects randomized and
 * deliberately hostile input in each. It records objective anomalies only:
 * uncaught exceptions, console errors, a section that stops rendering, output
 * that contains NaN/undefined/Infinity, an injected script element, storage that
 * is not saved or not cleared, a gate that leaks, a download that does not fire,
 * and horizontal overflow at a phone width.
 *
 * Playwright is not a dependency of this repository: install it the way the browser suite
 * documents (`npm install --no-save playwright; npx playwright install chromium`).
 *
 * Usage:
 *   node test/qa-soak.js [--cycles 400] [--workers 6] [--seed 1234] [--out /tmp/hce-qa]
 *
 * Exit status: 0 when every cycle completed, 1 when the run itself could not
 * finish. A cycle finding a defect still exits 0 — the report is the deliverable.
 */
"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function arg(name, fallback) {
  const at = process.argv.indexOf("--" + name);
  return at > 0 ? process.argv[at + 1] : fallback;
}

const CYCLES = Number(arg("cycles", 400));
const WORKERS = Number(arg("workers", 6));
const ENTRY = arg("entry", "/");
const SEED = Number(arg("seed", Date.now() % 100000));
const OUT = arg("out", "/tmp/hce-qa");
fs.mkdirSync(OUT, { recursive: true });

const TEXT_POOL = [
  "A".repeat(5000),
  "José O'Neill-Ōno",
  "🦷💥🧪",
  '<script>window.__qaXss=true</script>',
  "\u0000",
  "'; DROP TABLE drafts; --",
  "   ",
  "<img src=x onerror=window.__qaXss=true>",
  "x".repeat(20000),
  "line one\nline two\nline three",
  "0",
  "null",
];
const NUMBER_POOL = ["0", "-1", "1e309", "1e-9", "999999999999", "abc", "", "0.1", "NaN", "-0"];
const DATE_POOL = ["1900-01-01", "2099-12-31", "0000-01-01", "2026-02-30", "not-a-date", ""];
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
  { width: 390, height: 420 },
  { width: 768, height: 1024 },
];

const STEPS = [
  "Product & profile",
  "Residency & travel",
  "Tobacco & nicotine",
  "Height & weight",
  "Vitals & labs",
  "Driving",
  "Criminal history",
  "Medical history",
  "Prescriptions",
  "Family history",
  "Review",
];

const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const file = path.resolve(ROOT, "." + (name === "/" ? "/index.html" : name));
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html",
    );
    res.end(data);
  });
});

const anomalies = [];
function record(cycle, section, kind, detail, input) {
  anomalies.push({ cycle, section, kind, detail: String(detail).slice(0, 800), input: input ?? null });
}

const BAD_TEXT = /(?:^|[^\w])(NaN|undefined|Infinity)(?:[^\w]|$)|\[object Object\]/;

async function fillSection(page, seed) {
  return page.evaluate(
    ({ seed, TEXT_POOL, NUMBER_POOL, DATE_POOL }) => {
      let s = seed >>> 0;
      const rnd = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const pick = (pool) => pool[Math.floor(rnd() * pool.length)];
      const root = document.querySelector("#step-content");
      const fillOne = (el) => {
        const tag = el.tagName;
        if (tag === "SELECT") {
          const values = [...el.options].map((o) => o.value);
          const nonEmpty = values.filter(Boolean);
          const r = rnd();
          el.value = r < 0.1 ? "" : nonEmpty.length ? pick(nonEmpty) : "";
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (el.type === "date") {
          el.value = pick(DATE_POOL);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else if (el.type === "number") {
          el.value = pick(NUMBER_POOL);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          el.value = pick(TEXT_POOL);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
        return true;
      };
      let filled = 0;
      const controls = [...root.querySelectorAll("input,select,textarea")];
      for (const el of controls) if (!el.disabled) filled += fillOne(el) ? 1 : 0;
      // Editors only exist once their screen is answered yes; make some cycles list-bearing.
      const adds = [...root.querySelectorAll("button")].filter(
        (b) => /^Add /.test(b.textContent) && !b.disabled,
      );
      for (const add of adds.slice(0, 3)) {
        const times = 1 + Math.floor(rnd() * 2);
        for (let i = 0; i < times; i += 1) add.click();
        const fresh = [...root.querySelectorAll("input,select,textarea")].filter(
          (el) => !el.disabled && (el.value === "" || el.value == null),
        );
        for (const el of fresh) filled += fillOne(el) ? 1 : 0;
      }
      return { filled, adds: adds.length };
    },
    { seed, TEXT_POOL, NUMBER_POOL, DATE_POOL },
  );
}

async function drain(page, state, cycle, section) {
  const errors = state.errors.splice(state.seenErrors);
  const consoleErrors = state.consoleErrors.splice(state.seenConsole);
  for (const message of errors) record(cycle, section, "uncaught-exception", message);
  for (const message of consoleErrors) record(cycle, section, "console-error", message);
}

const sectionRuns = {};
async function section(page, state, cycle, name, fn) {
  sectionRuns[name] = (sectionRuns[name] || 0) + 1;
  try {
    await fn();
  } catch (error) {
    record(cycle, name, "harness-interaction", error.message.split("\n").slice(0, 4).join(" | "));
  }
  await drain(page, state, cycle, name);
}

function attach(page, state) {
  page.on("pageerror", (e) => state.errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") state.consoleErrors.push(m.text());
  });
  page.on("requestfailed", (r) => {
    if (r.url().startsWith("http://127.0.0.1")) state.consoleErrors.push("request failed: " + r.url());
  });
}

async function checkAlive(page, cycle, sectionName, expectedHeading) {
  const found = await page.evaluate(() => {
    const h = document.querySelector("#step-content h2");
    return {
      heading: h ? h.textContent : null,
      bad: (document.querySelector("#step-content")?.innerText || "").match(
        /(?:^|[^\w])(NaN|undefined|Infinity)(?:[^\w]|$)|\[object Object\]/,
      ),
      script: document.querySelectorAll("#step-content script, #results-content script").length,
      xss: Boolean(window.__qaXss),
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  if (!found.heading) record(cycle, sectionName, "missing-dom", "no step heading after the section");
  else if (expectedHeading && found.heading !== expectedHeading)
    record(cycle, sectionName, "wrong-section", `expected "${expectedHeading}", the page shows "${found.heading}"`);
  if (found.bad) record(cycle, sectionName, "bad-output", `text contains "${found.bad[0]}"`);
  if (found.script) record(cycle, sectionName, "injected-script", `${found.script} script element(s) in app content`);
  if (found.xss) record(cycle, sectionName, "script-executed", "an injected handler ran (window.__qaXss)");
  if (found.overflow) record(cycle, sectionName, "horizontal-overflow", "document is wider than the viewport");
  return found;
}

async function cycle(page, state, n) {
  const seed = (SEED + n * 2654435761) >>> 0;
  await page.setViewportSize(VIEWPORTS[n % VIEWPORTS.length]);
  await page.goto("about:blank");
  await page.goto("http://127.0.0.1:" + server.address().port + ENTRY);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.waitForSelector("#productId", { state: "attached" });

  // 1. Acknowledgment gate.
  await section(page, state, n, "Acknowledgment gate", async () => {
    const disabled = await page.locator("#ack-accept").isDisabled();
    if (!disabled) record(n, "Acknowledgment gate", "gate-leak", "accept is enabled before the checkbox");
    await page.locator("#ack-accept").click({ force: true }).catch(() => {});
    if (await page.locator("#ack-gate").isHidden())
      record(n, "Acknowledgment gate", "gate-leak", "the gate closed without the checkbox");
    await page.locator("#ack-check").check();
    await page.locator("#ack-accept").click();
    if (!(await page.locator("#ack-gate").isHidden()))
      record(n, "Acknowledgment gate", "gate-stuck", "the gate did not close after accepting");
    if (await page.evaluate(() => document.querySelector(".app-main").inert))
      record(n, "Acknowledgment gate", "gate-stuck", "the interview stayed inert after accepting");
  });

  // 2. Every interview step.
  for (let i = 0; i < STEPS.length; i += 1) {
    await section(page, state, n, STEPS[i], async () => {
      await page.locator("#steps-nav .step-pill").nth(i).click();
      const filled = await fillSection(page, seed + i * 97);
      if (!filled.filled) record(n, STEPS[i], "empty-section", "no controls were rendered for this section");
      await checkAlive(page, n, STEPS[i], STEPS[i]);
      if (STEPS[i] === "Review") {
        await page.locator("#btn-next").click();
      } else {
        await page.locator("#btn-next").click();
        const nextHeading = await page.locator("#step-content h2").textContent().catch(() => null);
        if (nextHeading !== STEPS[i + 1])
          record(n, STEPS[i], "stale-step", `Next left the page on "${nextHeading}" instead of "${STEPS[i + 1]}"`);
      }
    });
  }

  // 3. Result.
  await section(page, state, n, "Results", async () => {
    await page.waitForSelector("#result-heading", { timeout: 5000 });
    const facts = await page.evaluate(() => {
      const text = document.querySelector("#results-content")?.innerText || "";
      return {
        heading: document.querySelector("#result-heading")?.textContent || null,
        blank: text.trim().length === 0,
        bad: text.match(/(?:^|[^\w])(NaN|undefined|Infinity)(?:[^\w]|$)|\[object Object\]/),
        reset: [...document.querySelectorAll("#results-content button")].some((b) =>
          /Delete saved answers/.test(b.textContent),
        ),
        factors: document.querySelectorAll("#results-content table tbody tr").length,
      };
    });
    if (!facts.heading) record(n, "Results", "missing-dom", "no result heading");
    if (facts.blank) record(n, "Results", "blank-result", "the result region rendered no text");
    if (facts.bad) record(n, "Results", "bad-output", `result text contains "${facts.bad[0]}"`);
    if (!facts.reset) record(n, "Results", "missing-control", "no delete-saved-answers action");
  });

  // 4. Reset from the result.
  await section(page, state, n, "Reset", async () => {
    await page.getByRole("button", { name: "Delete saved answers and start over" }).click();
    const after = await page.evaluate(() => ({
      heading: document.querySelector("#step-content h2")?.textContent || null,
      v2: localStorage.getItem("hce_state_v2"),
      v1: localStorage.getItem("hce_state_v1"),
    }));
    if (!after.heading) record(n, "Reset", "missing-dom", "no step heading after reset");
    if (after.v2 !== null || after.v1 !== null)
      record(n, "Reset", "storage-not-cleared", "saved answers survived the reset");
  });

  // 5. Kept-draft panel: read, download, delete.
  await section(page, state, n, "Kept-draft panel", async () => {
    const raw = n % 3 === 0 ? "{not json" : n % 3 === 1 ? "[]" : "<script>window.__qaXss=true</script>";
    await page.evaluate((raw) => {
      localStorage.setItem("hce_state_v2", raw);
      localStorage.setItem("hce_state_v1", JSON.stringify({ conditions: [{ id: 12 }] }));
    }, raw);
    await page.reload();
    await page.waitForSelector("#productId", { state: "attached" });
    // A browser restores scroll on reload; a reader arriving at the page does not, so
    // measure the layout from the top rather than from wherever the last action ended.
    await page.evaluate(() => window.scrollTo(0, 0));
    const notice = await page.locator(".migration-notice").count();
    if (!notice) record(n, "Kept-draft panel", "missing-notice", "an unreadable draft produced no notice");
    if (!(await page.locator("details.kept-draft").count())) {
      record(n, "Kept-draft panel", "missing-panel", "an unreadable draft was not preserved");
      return;
    }
    // The footer is fixed and wraps to several rows at a phone width, so at a landscape
    // phone's height it can cover the first control. That is recorded as a layout finding
    // and the panel's own behaviour is then driven from the DOM, so one covered control
    // does not hide every finding below it.
    if (process.env.QA_TRACE)
      console.log(
        "trace",
        n,
        await page.evaluate(() => ({
          vh: window.innerHeight,
          vw: window.innerWidth,
          footer: Math.round(document.querySelector(".app-footer").getBoundingClientRect().height),
          summary: Math.round(document.querySelector("details.kept-draft summary").getBoundingClientRect().top),
          scrollY: window.scrollY,
        })),
      );
    const occluded = await page.evaluate(() => {
      const s = document.querySelector("details.kept-draft summary");
      if (!s) return null;
      const r = s.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!top || top === s || s.contains(top)) return null;
      const footer = document.querySelector(".app-footer").getBoundingClientRect();
      return { by: top.className || top.tagName, vh: window.innerHeight, footer: Math.round(footer.height) };
    });
    if (occluded)
      record(
        n,
        "Kept-draft panel",
        "footer-occlusion",
        `the panel summary is covered by .${occluded.by} in a ${occluded.vh}px-tall window whose fixed footer is ${occluded.footer}px`,
      );
    await page.evaluate(() => document.querySelector("details.kept-draft summary").click());
    const shown = await page.locator(".kept-draft textarea").first().inputValue();
    if (raw === "{not json" && shown !== raw)
      record(n, "Kept-draft panel", "wrong-draft-text", `the panel shows "${shown.slice(0, 40)}"`);
    if (n % 10 === 0) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 4000 }).catch(() => null),
        page.evaluate(() =>
          [...document.querySelectorAll(".kept-draft button")]
            .find((b) => /^Download the kept draft$/.test(b.textContent))
            .click(),
        ),
      ]);
      if (!download) record(n, "Kept-draft panel", "download-missing", "the download action produced no file");
    }
    const panelClick = (label) =>
      page.evaluate((label) => {
        const b = [...document.querySelectorAll(".kept-draft button")].find((x) => x.textContent === label);
        if (!b) throw new Error("no button: " + label);
        b.click();
      }, label);
    await panelClick("Delete this kept draft");
    if (!(await page.getByRole("button", { name: "Delete permanently" }).count()))
      record(n, "Kept-draft panel", "missing-confirmation", "delete did not ask before acting");
    await panelClick("Keep it");
    if (!(await page.getByRole("button", { name: "Delete this kept draft" }).count()))
      record(n, "Kept-draft panel", "stuck-confirmation", "cancelling the delete did not restore the action");
    await panelClick("Delete this kept draft");
    await panelClick("Delete permanently");
    const left = await page.evaluate(() => ({
      key: localStorage.getItem("hce_state_v2_unreadable"),
      panel: Boolean(document.querySelector("details.kept-draft")),
      focus: document.activeElement?.tagName,
    }));
    if (left.key !== null && n % 2 === 0)
      record(n, "Kept-draft panel", "delete-incomplete", "a kept draft remained after deleting the last one");
    if (!left.panel && !["H2", "SUMMARY"].includes(left.focus))
      record(n, "Kept-draft panel", "focus-lost", `focus landed on ${left.focus} after deleting the last draft`);
  });

  // 6. Legacy migration with hostile shapes.
  await section(page, state, n, "Legacy migration", async () => {
    const legacy = [
      { heightFt: "tall", weightLb: -4, conditions: [{ id: 12 }] },
      "[]",
      { conditions: "not-a-list" },
      { productId: 42, dob: "not-a-date" },
      null,
    ][n % 5];
    await page.evaluate((legacy) => {
      localStorage.clear();
      localStorage.setItem("hce_state_v1", JSON.stringify(legacy));
    }, legacy);
    await page.reload();
    await page.waitForTimeout(120);
    const alive = await page.evaluate(() => Boolean(document.querySelector("#step-content")));
    if (!alive) record(n, "Legacy migration", "blank-page", "the page rendered nothing after a hostile legacy draft");
  });

  // 7. Storage that refuses to save. The override is installed after the reload, because a
  // reload is what would discard it: the point is to make the running app's own save() fail.
  await section(page, state, n, "Storage failure", async () => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector("#productId", { state: "attached" }).catch(() => {});
    if (!(await page.locator("#ack-gate").isHidden())) {
      await page.locator("#ack-check").check().catch(() => {});
      await page.locator("#ack-accept").click().catch(() => {});
    }
    await page.evaluate(() => {
      window.__qaSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function () {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      };
    });
    await page.locator("[data-field='productId']").selectOption({ index: 1 }).catch(() => {});
    const toast = await page.locator("#toast").textContent().catch(() => "");
    if (!/could not save/i.test(toast || ""))
      record(n, "Storage failure", "missing-warning", `no save warning; toast said "${toast}"`);
    await page.evaluate(() => {
      if (window.__qaSetItem) Storage.prototype.setItem = window.__qaSetItem;
    });
    const alive = await page.evaluate(() => Boolean(document.querySelector("#step-content h2")));
    if (!alive) record(n, "Storage failure", "blank-page", "the page did not survive a refusing storage");
  });

  // 8. Rapid navigation.
  await section(page, state, n, "Rapid navigation", async () => {
    for (let i = 0; i < 6; i += 1) await page.locator("#btn-next").click().catch(() => {});
    for (let i = 0; i < 3; i += 1) await page.locator("#btn-back").click().catch(() => {});
    const alive = await page.evaluate(() => ({
      heading: document.querySelector("#step-content h2")?.textContent || null,
      result: Boolean(document.querySelector("#result-heading")),
    }));
    if (!alive.heading && !alive.result)
      record(n, "Rapid navigation", "blank-page", "rapid Next/Back left no step and no result");
  });

  await page.evaluate(() => localStorage.clear());
  state.completed += 1;
}

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await chromium.launch({ headless: true });
  const started = Date.now();
  const workerState = Array.from({ length: WORKERS }, (_, i) => ({
    errors: [],
    consoleErrors: [],
    seenErrors: 0,
    seenConsole: 0,
    completed: 0,
    worker: i,
  }));
  let next = 0;
  const progress = setInterval(() => {
    const done = workerState.reduce((sum, w) => sum + w.completed, 0);
    fs.writeFileSync(
      path.join(OUT, "progress.json"),
      JSON.stringify({ done, cycles: CYCLES, anomalies: anomalies.length, elapsedMs: Date.now() - started }),
    );
  }, 3000);

  await Promise.all(
    workerState.map(async (state) => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addInitScript(() => {
        window.__qaXss = false;
        window.addEventListener("securitypolicyviolation", () => {
          window.__qaXss = true;
        });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      attach(page, state);
      for (;;) {
        const n = next++;
        if (n >= CYCLES) break;
        try {
          await cycle(page, state, n);
        } catch (error) {
          record(n, "Cycle", "cycle-aborted", error.message.split("\n")[0]);
          state.errors.length = 0;
          state.consoleErrors.length = 0;
        }
        state.seenErrors = state.errors.length;
        state.seenConsole = state.consoleErrors.length;
      }
      await context.close();
    }),
  );

  clearInterval(progress);
  await browser.close();
  await new Promise((resolve) => server.close(resolve));

  const bySection = {};
  for (const a of anomalies) {
    bySection[a.section] = bySection[a.section] || {};
    bySection[a.section][a.kind] = (bySection[a.section][a.kind] || 0) + 1;
  }
  const report = {
    cycles: CYCLES,
    workers: WORKERS,
    seed: SEED,
    base,
    completed: workerState.reduce((sum, w) => sum + w.completed, 0),
    elapsedMs: Date.now() - started,
    anomalies: anomalies.length,
    sectionRuns,
    bySection,
    findings: anomalies,
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      { completed: report.completed, cycles: report.cycles, anomalies: report.anomalies, bySection, ms: report.elapsedMs },
      null,
      2,
    ),
  );
  process.exit(report.completed === CYCLES ? 0 : 1);
})().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
