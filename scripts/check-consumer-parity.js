#!/usr/bin/env node
/* Guard the single-source-of-truth rule for the built estimator.

   The tool has two consumers, and both hold a *copy* of the build:
     - the website embeds dist/app.html inside an iframe (srcDoc), and
     - richardparslow-commits/health_app.py receives a copy from the release job.

   A copy can be edited where it lands, and nothing used to notice. Release 78
   shipped a Mutual of Omaha amount screen (moo_tle_amount_conflict) plus its
   M-TLE-HIGHLIGHT source record that existed only inside the website's copy, so
   rebuilding from this repository would have deleted that screen silently.

   This script compares a consumer against the build and sorts the difference:

     - rules / state / engine carry underwriting behaviour. A difference is a
       FAILURE: the repository no longer reproduces what an applicant sees.
     - app / styles / markup are presentational. A difference is reported as a
       warning, because a consumer may legitimately adapt its embed (a
       narrow CSP, same-origin contact links, an accessibility shim), but it is
       never hidden — an edit made only in a copy still needs to come back here.
     - --expect-identical removes that tolerance entirely: the Streamlit
       deployment receives the build output copied verbatim, so for it anything
       but byte identity means the file it serves is not the reviewed build.

   Usage:
     node scripts/check-consumer-parity.js                      # the live tool page
     node scripts/check-consumer-parity.js --consumer <path>    # a local file
     node scripts/check-consumer-parity.js --build <path>       # alternate build
     node scripts/check-consumer-parity.js --expect-identical   # fail unless byte-identical
     node scripts/check-consumer-parity.js --declarations <path> # another consumer's adaptations
     node scripts/check-consumer-parity.js --deployed <path> --deployed-commit <sha> [--deployed-repo <owner/name>]
     node scripts/check-consumer-parity.js --consumer-repo <owner/name> --consumer-commit <sha>
     node scripts/check-consumer-parity.js --json

   <path> may be the built HTML, the website's route file that holds the embed as
   a JavaScript string literal (including the adapters that file splices into it at
   render time), or any file containing the embedded document.

   A live URL is read through a request no cache can answer (see "reading a live
   page" below), so a run minutes after a deploy compares the deployment rather
   than whichever copy a cache in front of it still holds. A local file is read as
   it is.

   A consumer that adapts the build declares how, in consumers/website.json, and the
   differences it explains are reported as declared rather than as drift (see "the
   consumer's declared adaptations" below). With its adaptations declared, the page is
   held to them exactly: its document must begin with this build plus those adaptations,
   followed by the page's own render-time adapters. A build-side anchor that is gone, a
   page that still carries something it declares omitted, and a document that is not
   that composition all fail — the first two mean the page cannot be regenerated from
   this build or does not match its own description, the last means it is not this build.

   A consumer that was read from a deployed repository can say so, with
   `--consumer-repo <owner/name> --consumer-commit <sha>`: the verdict then names the
   commit it judged instead of naming a copied file. That is the Streamlit job's shape —
   app_embedded.html fetched at one commit of richardparslow-commits/health_app.py — and
   without it a green run says "app_embedded.html is byte-identical to the build" while
   leaving open which published copy that was. The pair is reported, not verified against
   a second document: the bytes compared *are* that commit's copy, which is why the
   repository is fetched by commit rather than over a CDN that can serve another one.

   A consumer that states which release it runs has to state this one, in every place it
   says so (see "the release the page claims" below): the served page and the committed
   page are both checked against the build's own HCE_VERSION, because a page can be the
   right commit, serve the right bytes, and still tell a crawler and a reader that it is
   an older release — that is what schema.org softwareVersion sat at 78 while the page
   ran 80, and what an earlier investigation read as "release 78 is live".

   A live page can also be read *against the deployment it claims to be*. `--deployed
   <path> --deployed-commit <sha>` names the website's committed page — its route file,
   fetched at one commit — and the verdict then requires two things: that committed page
   is this build plus the declared adaptations, and the served page is that page, byte
   for byte. Without it a green run says "the live page matches the build" and leaves
   open which deployment was judged, which is the question a release running late or a
   cache answering for the last one both hide inside. The commit is printed and carried
   in --json, so a report names the deployment rather than describing it.

   Exit status: 0 when the underwriting components match; 1 otherwise, or 1 when the
   consumer could not be read, or a declaration of what that consumer is no longer holds,
   or the page is not the named deployment.
*/
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONSUMER = "https://lifeinsurancebrokeradvocate.com/tools/health-class-predictor";

// Markers mirror the inlining order in scripts/build-embedded.js, so a component
// is located the same way in the build and in any consumer of it.
const COMPONENTS = [
  { id: "rules", marker: "const PRODUCT_RULES =", critical: true },
  { id: "state", marker: "const InterviewState =", critical: true },
  { id: "engine", marker: "const Engine =", critical: true },
  { id: "app", marker: "const App =", critical: false },
];

function parseArgs(argv) {
  const args = { consumer: DEFAULT_CONSUMER, build: path.join("dist", "app.html"), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--consumer") args.consumer = argv[++i];
    else if (a === "--build") args.build = argv[++i];
    else if (a === "--expect-identical") args.expectIdentical = true;
    else if (a === "--declarations") args.declarations = argv[++i];
    else if (a === "--deployed") args.deployed = argv[++i];
    else if (a === "--deployed-commit") args.deployedCommit = argv[++i];
    else if (a === "--deployed-repo") args.deployedRepo = argv[++i];
    else if (a === "--consumer-repo") args.consumerRepo = argv[++i];
    else if (a === "--consumer-commit") args.consumerCommit = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error("Unknown argument: " + a);
  }
  return args;
}

/* --- reading a consumer ---------------------------------------------------- */

const ENTITIES = { quot: '"', apos: "'", lt: "<", gt: ">", amp: "&", nbsp: " ", "#39": "'", "#x27": "'", "#x2f": "/" };

// Anything unrecognised is left alone rather than thrown on: an entity this list
// does not know is not a reason to stop comparing a consumer.
function unescapeHtml(source) {
  return source.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(ENTITIES, name)) return ENTITIES[name];
    if (name[0] !== "#") return match;
    const hex = name[1] === "x" || name[1] === "X";
    const code = parseInt(hex ? name.slice(2) : name.slice(1), hex ? 16 : 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : match;
  });
}

// The embed reaches the served page as an iframe srcDoc attribute (React renders
// the prop name as `srcDoc`), so the document arrives entity-escaped with its real
// newlines intact. Once escaped, a `"` cannot appear inside the value, so the
// attribute ends at the next `"` and no full HTML parser is needed.
function extractSrcdocs(page) {
  const found = [];
  const re = /srcdoc="([^"]*)"/gi;
  let m;
  while ((m = re.exec(page))) found.push(unescapeHtml(m[1]));
  return found;
}

// The website keeps the embed as a single-quoted JavaScript string literal.
function extractStringLiteral(source, anchor) {
  const at = source.indexOf(anchor);
  if (at < 0) return null;
  let i = source.indexOf("'", at);
  if (i < 0) return null;
  let out = "";
  for (i++; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      const next = source[i + 1];
      out += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : next;
      i++;
      continue;
    }
    if (ch === "'") break;
    out += ch;
  }
  return out;
}

// The website does not serve the literal as-is: its route file splices its own
// adapters in at render time —
//   srcDoc={ESTIMATOR_HTML.replace("</body>", ADAPTER_A + ADAPTER_B + "</body>")}
// — so the literal alone is not the delivered document. Rebuilding the composition
// here keeps those adapters from reading as drift, and keeps the comparison pointed
// at what an applicant actually runs. `replace` with a string argument swaps only
// the first occurrence, which is what indexOf/slice reproduces.
function extractComposedDocument(source) {
  const literal = extractStringLiteral(source, "const ESTIMATOR_HTML =");
  const call = source.match(/ESTIMATOR_HTML\.replace\(\s*"<\/body>"\s*,\s*([^)]+)\)/);
  if (!literal || !call) return null;
  const adapters = (call[1].match(/[A-Za-z_$][\w$]*/g) ?? []).map((name) => extractTemplateBody(source, name)).filter((body) => body !== null);
  const at = literal.indexOf("</body>");
  if (at < 0 || !adapters.length) return null;
  return literal.slice(0, at) + adapters.join("") + literal.slice(at);
}

// const NAME = `...`;  — the shape the route file uses for its embed adapters.
function extractTemplateBody(source, name) {
  const match = new RegExp("const\\s+" + name + "\\s*=\\s*`").exec(source);
  if (!match) return null;
  let out = "";
  for (let i = match.index + match[0].length; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") {
      const next = source[i + 1];
      out += next === "n" ? "\n" : next === "t" ? "\t" : next === "r" ? "\r" : next;
      i++;
      continue;
    }
    if (ch === "`") return out;
    out += ch;
  }
  return null;
}

// Every component must be locatable, not merely one marker seen: a file holding the
// embed as an escaped string literal also contains the markers, but no script block.
const holdsWholeEstimator = (html) => COMPONENTS.every((c) => componentBodies(html)[c.id] !== null);

// Candidate order matters: the srcDoc of the rendered frame is what an applicant
// actually runs, so it is preferred over a serialized copy of the same string
// elsewhere on the page (React's flight payload escapes it differently, and a
// component read from there would look like drift).
function pickConsumerDocument(raw, origin) {
  const literal = extractStringLiteral(raw, "const ESTIMATOR_HTML =");
  const composed = extractComposedDocument(raw);
  const candidates = extractSrcdocs(raw).map((html) => ({ html, how: "iframe srcDoc in " + origin }));
  if (composed) candidates.push({ html: composed, how: "ESTIMATOR_HTML plus the adapter constants spliced into its srcDoc in " + origin });
  if (literal) candidates.push({ html: literal, how: "ESTIMATOR_HTML string literal in " + origin });
  candidates.push({ html: raw, how: "embedded document" });
  const chosen = candidates.find((c) => holdsWholeEstimator(c.html));
  if (chosen) return chosen;
  throw new Error("No embedded estimator found in " + origin + " (every one of the four script markers must be present in a script block).");
}

/* --- reading a live page without a cached copy ---------------------------- */

// A live consumer is read over HTTP, so whatever cache its host puts in front of
// it answers first. That is not hypothetical here: raw.githubusercontent.com served
// a pre-push copy of the Streamlit repository for about three minutes (measured
// 2026-10-16), and the website answers through Cloudflare with a document marked
// `no-cache, must-revalidate, max-age=0` — a revalidation *instruction*, not a
// promise that no shared cache is holding the previous deployment. Either way the
// comparison becomes an answer about bytes that may predate the deploy: red for a
// copy that was already correct, or green for a page that had not published yet.
//
// So a live read requests a URL that has never been requested before: a nonce in
// the query string. A cache keyed on the full URL — the default for Cloudflare and
// for every shared cache in this project — cannot hold an entry for it, so the
// answer has to come from the deployment. `cache-control: no-store` and `pragma:
// no-cache` cover a cache that would otherwise answer without asking. The query
// string is inert on the page it is sent to (measured against the live site: same
// document, same frame, byte-identical srcDoc), and the URL reported stays clean.
//
// A cache can also be configured to ignore the query string, so the answer is
// checked for the statuses a shared cache only writes when it served a stored
// body. A cached answer is retried with a *new* nonce; if every attempt is cached
// the run fails saying so, because a comparison of bytes that may be the previous
// deployment is worse than no comparison at all.
const NONCE_PARAM = "hce-parity";
const LIVE_ATTEMPTS = 3;
const LIVE_PAUSES = [0, 400, 1200];

// MISS, DYNAMIC, BYPASS and EXPIRED all mean the deployment itself was asked.
const CACHE_HIT_STATUS = {
  "cf-cache-status": ["HIT", "STALE", "REVALIDATED", "UPDATING", "STALE-WHILE-REVALIDATE"],
  "x-cache": ["HIT", "TCP_HIT", "TCP_MEM_HIT", "TCP_REFRESH_HIT", "STALE"],
  "x-vercel-cache": ["HIT", "STALE"],
  "x-proxy-cache": ["HIT"],
  "x-cache-status": ["HIT", "STALE"],
};

// Names the cache that answered, or null when the deployment did.
function servedFromCache(response) {
  for (const [name, hits] of Object.entries(CACHE_HIT_STATUS)) {
    const value = (response.headers.get(name) ?? "").trim();
    if (hits.includes(value.toUpperCase())) return name + ": " + value;
  }
  // How long a shared cache has held the response; 0 is a fresh store.
  const age = response.headers.get("age");
  if (age !== null && Number(age) > 0) return "age: " + age;
  return null;
}

function withNonce(target, nonce) {
  const url = new URL(target);
  // The fragment is never sent, and would only be in the way here.
  url.hash = "";
  url.searchParams.set(NONCE_PARAM, nonce);
  return url.toString();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readLivePage(target) {
  let cached = null;
  for (let attempt = 0; attempt < LIVE_ATTEMPTS; attempt++) {
    if (LIVE_PAUSES[attempt]) await sleep(LIVE_PAUSES[attempt]);
    // A new nonce per attempt: the retry is for a URL the cache has not seen, so
    // repeating the same one would ask the same question twice.
    const response = await fetch(withNonce(target, crypto.randomUUID()), {
      redirect: "follow",
      headers: {
        "user-agent": "health-class-estimator-parity-check",
        "cache-control": "no-store, no-cache",
        "pragma": "no-cache",
      },
    });
    if (!response.ok) throw new Error("HTTP " + response.status + " " + response.statusText + " from " + target);
    const page = await response.text();
    cached = servedFromCache(response);
    if (!cached) {
      const chosen = pickConsumerDocument(page, target);
      chosen.how += " — requested with a fresh nonce, so no cache could answer for a previous deployment";
      // The served page itself, not only the document inside its frame: the page
      // around the embed is where its release claims live.
      chosen.page = page;
      return chosen;
    }
  }
  throw new Error(
    "Every request for " + target + " was answered from a cache (" + cached + ") even with a fresh nonce in the URL, " +
      "so nothing in front of it is asking the deployment and the bytes may predate the deploy. Nothing was compared: " +
      "read the page from the deployment, or run again once the cached entry has expired."
  );
}

// A file is either the page's source or a rendered copy of it. Source is what the
// page's generator rewrites and what the release claims are declared in; a rendered
// page is what a crawler or a browser receives. The two spell the structured data
// differently, so which one this is decides which claim forms apply.
const isSource = (text) => /const ESTIMATOR_HTML\s*=/.test(text);

async function readConsumer(target) {
  if (/^https?:\/\//i.test(target)) return readLivePage(target);
  const file = path.resolve(process.cwd(), target);
  const text = fs.readFileSync(file, "utf8");
  const chosen = pickConsumerDocument(text, file);
  if (isSource(text)) chosen.source = text;
  else chosen.page = text;
  return chosen;
}

/* --- comparing a document ------------------------------------------------- */

const scriptBlocks = (html) => [...html.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g)].map((m) => m[1]);
const styleBlocks = (html) => [...html.matchAll(/<style>\n([\s\S]*?)\n<\/style>/g)].map((m) => m[1]);

function componentBodies(html) {
  const blocks = scriptBlocks(html);
  const bodies = {};
  for (const c of COMPONENTS) bodies[c.id] = blocks.find((b) => b.includes(c.marker)) ?? null;
  return bodies;
}

// Markup is compared with the embed adaptations folded out: a consumer's own CSP,
// its same-origin contact links and any injected adapter script or style must not
// read as drift, while a removed or added page element still does.
function normaliseMarkup(html) {
  const markers = COMPONENTS.map((c) => c.marker);
  return html
    .replace(/<script>\n[\s\S]*?\n<\/script>/g, (block) => (markers.some((mk) => block.includes(mk)) ? "<script></script>" : ""))
    .replace(/<style>\n[\s\S]*?\n<\/style>/g, (block, offset) => (offset === html.indexOf("<style>") ? "<style></style>" : ""))
    .split("\n")
    .filter((line) => !/http-equiv="Content-Security-Policy"/.test(line))
    .map((line) => line.replace(/<a\b[^>]*href="[^"]*\/contact"[^>]*>/g, '<a data-contact-link>'))
    .map((line) => line.trim())
    .filter((line) => line.length)
    .join("\n");
}

/* --- the consumer's declared adaptations ---------------------------------- */

// A consumer that adapts the build is not drift, but it has to say so somewhere this
// script can read, or every difference looks like an edit made in the copy. The
// website has adapted its embed since it first carried one — a stricter CSP,
// same-origin contact links, a contact card on the result page, no cross-product
// comparison table — and without a declaration this check reported that card as
// "consumer-only lines are not in this build — check whether the copy invented them",
// which is the opposite of true: it is the page's own card, generated at an anchor,
// and the page's generator is where the four are applied. consumers/website.json is
// the same four as data, so the two checks agree by construction instead of
// explaining the same document twice.
const DECLARATIONS = path.join(ROOT, "consumers", "website.json");

const occurrenceCount = (text, needle) => text.split(needle).length - 1;
// Anchors are matched the way the page's generator matches them — as an inserted
// string, which is why `const refs=node("section","card");` can name the start of a
// line that carries more statements after it. Added lines are matched whole, because
// that is what the page has to carry for the difference to be the declared one.
const hasLine = (text, line) => text.split("\n").some((other) => other.trim() === line.trim());

// The statement that starts at an anchor: its first line to the line that closes it,
// following nesting so a reformatted statement is still taken whole. The page's
// generator removes the omitted table with the same rule, so both identify the same
// lines even after the statement is reflowed.
function statementSpan(lines, anchor) {
  const at = lines.findIndex((line) => line.includes(anchor));
  if (at < 0) return null;
  let depth = 0;
  for (let i = at; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === "{" || ch === "(" || ch === "[") depth++;
      else if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    if (depth === 0 && i > at) return { at, end: i };
  }
  return null;
}

function statementLines(text, anchor) {
  const lines = text.split("\n");
  const span = statementSpan(lines, anchor);
  return span ? lines.slice(span.at, span.end + 1) : null;
}

// An implicit declaration applies only to the page it names. Explaining a different
// consumer's differences with this page's adaptations would hide real drift, and a
// local file has no origin to match, so that case has to be named with --declarations.
function loadDeclarations(target, explicit) {
  const file = explicit ? path.resolve(process.cwd(), explicit) : DECLARATIONS;
  if (!fs.existsSync(file)) {
    if (explicit) throw new Error("Declarations not found at " + file);
    return null;
  }
  let declared;
  try {
    declared = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error("Declarations at " + file + " are not valid JSON: " + error.message);
  }
  if (!explicit) {
    if (!/^https?:\/\//i.test(target) || !declared.consumer) return null;
    if (new URL(target).origin !== new URL(declared.consumer).origin) return null;
  }
  const relative = path.relative(ROOT, file);
  return {
    file: relative.startsWith("..") ? file : relative,
    adaptations: declared.adaptations ?? [],
    releaseClaims: declared.releaseClaims ?? [],
  };
}

// The page's document as this repository says it is: this build with the declared
// adaptations applied in declaration order, which is the order the page's generator
// applies them in. Anything that cannot be applied is a problem rather than a skipped
// step: an anchor that moved means the generator cannot regenerate the page from this
// build, and a release that moves one has to say so here.
function composeDeclared(buildHtml, adaptations, problems) {
  let doc = buildHtml;
  for (const adaptation of adaptations) {
    for (const rewrite of adaptation.rewrites ?? []) {
      const found = occurrenceCount(doc, rewrite.from);
      if (found !== rewrite.count) {
        problems.push(adaptation.id + ": expected " + rewrite.count + " occurrence(s) of " + JSON.stringify(rewrite.from.slice(0, 90)) + " in the build, found " + found + " — the page's generator rewrites exactly that many");
        continue;
      }
      doc = doc.split(rewrite.from).join(rewrite.to);
    }
    const insert = adaptation.inserts;
    if (insert) {
      const anchor = (insert.before ?? insert.after ?? "").trim();
      const lines = doc.split("\n");
      const at = anchor ? lines.findIndex((line) => line.includes(anchor)) : -1;
      if (at < 0) {
        problems.push(adaptation.id + ": this build no longer carries the line it is inserted at (" + JSON.stringify(anchor) + ") — the page's generator inserts there and will fail; update both in the same change");
      } else {
        lines.splice(insert.before !== undefined ? at : at + 1, 0, ...insert.lines);
        doc = lines.join("\n");
      }
    }
    for (const anchor of adaptation.omits ?? []) {
      const lines = doc.split("\n");
      const span = statementSpan(lines, anchor);
      if (!span) {
        problems.push(adaptation.id + ": this build no longer carries the statement that starts " + JSON.stringify(anchor) + " — the page's generator removes it by that anchor and will fail");
        continue;
      }
      lines.splice(span.at, span.end - span.at + 1);
      doc = lines.join("\n");
    }
  }
  return doc;
}

// Checks the declaration against both documents. Carrying something the page declares
// omitted is a problem in its own right, because that is the claim applicants read; an
// addition the page no longer carries is reported as a note, and the exactness check
// below fails it too — the page is generated, so a difference either way means it is not
// this build. With every adaptation declared, "the page runs this build" is an exact
// question: the document has to begin with the composition, and what follows is the
// page's own render-time adapters. A page serving an older build therefore fails here
// even when the underwriting components happen to match, which is the case a release
// that only changes presentation used to pass.
function verifyDeclarations(loaded, consumerHtml, buildHtml) {
  const problems = [];
  const notes = [];
  const components = { app: { consumerLines: new Set(), buildLines: new Set(), ids: [], file: loaded.file } };
  for (const adaptation of loaded.adaptations) {
    if (adaptation.component !== "app") continue;
    components.app.ids.push(adaptation.id);
    for (const line of adaptation.inserts?.lines ?? []) components.app.consumerLines.add(line.trim());
    for (const anchor of adaptation.omits ?? []) for (const line of statementLines(buildHtml, anchor) ?? []) if (line.trim()) components.app.buildLines.add(line.trim());
  }
  for (const adaptation of loaded.adaptations) {
    for (const line of adaptation.inserts?.lines ?? []) {
      if (!hasLine(consumerHtml, line)) notes.push(adaptation.id + ": the page no longer carries " + JSON.stringify(line.trim().slice(0, 90)));
      if (hasLine(buildHtml, line)) problems.push(adaptation.id + ": this build already carries the line the page adds, so the page's generator would duplicate it — " + JSON.stringify(line.trim().slice(0, 90)));
    }
    for (const anchor of adaptation.omits ?? []) {
      for (const line of statementLines(buildHtml, anchor) ?? []) {
        if (line.trim() && hasLine(consumerHtml, line)) problems.push(adaptation.id + ": the page still carries " + JSON.stringify(line.trim().slice(0, 90)) + ", which it declares omitted");
      }
    }
    for (const rewrite of adaptation.rewrites ?? []) {
      const inConsumer = occurrenceCount(consumerHtml, rewrite.to);
      if (inConsumer !== rewrite.count) notes.push(adaptation.id + ": the page carries " + inConsumer + " of the " + rewrite.count + " rewritten link(s) it declares");
    }
  }

  const composed = composeDeclared(buildHtml, loaded.adaptations, problems);
  const bodyAt = composed.indexOf("</body>");
  const head = bodyAt < 0 ? composed : composed.slice(0, bodyAt);
  const exact = consumerHtml.startsWith(head);
  if (!exact && !problems.length) {
    const diff = firstDifference(consumerHtml, head);
    problems.push("the page is not this build with its declared adaptations — first difference at character " + diff.at + ": page " + diff.left + " build " + diff.right);
  }
  return { ids: loaded.adaptations.map((a) => a.id), components, problems, notes, exact, composed: head.length };
}

/* --- the release the page claims ------------------------------------------ */

// A page that states its release can state the wrong one, and every comparison above
// would still pass: the embed is the right bytes, the commit is the right commit, and
// the claim lives outside the document being compared. That is not hypothetical —
// schema.org's softwareVersion said 78 while the page ran 80, so a crawler was told
// the tool was two releases older than the one an applicant used. Nothing noticed
// because the claim was hand-typed in a page whose generator only restamped two other
// statements.
//
// So the claims are declared (consumers/website.json, `releaseClaims`), matched as
// literal text with `{version}` standing for the number, and required to be exactly
// what this build says it is. The count is part of the declaration: a claim that
// quietly disappears is as much a drift as one that says the wrong number, because
// the page no longer tells a reader which release it runs.
function buildVersion(buildHtml) {
  const found = /window\.HCE_VERSION = "(\d+)"/.exec(buildHtml);
  if (!found) throw new Error("The build carries no HCE_VERSION — rebuild it with: npm run build");
  return found[1];
}

function claimPattern(pattern) {
  const parts = pattern.split("{version}");
  if (parts.length !== 2) throw new Error("A releaseClaim pattern must contain {version} exactly once: " + JSON.stringify(pattern));
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escape(parts[0]) + "(\\d+)" + escape(parts[1]), "g");
}

// One declaration, checked wherever that surface was actually read. A surface this
// run did not read is reported as skipped rather than passed: a live-only run cannot
// speak for the committed page, and pretending otherwise is the failure mode this
// whole check exists to avoid.
function verifyReleaseClaims(claims, surfaces, version) {
  const checked = [];
  const problems = [];
  for (const claim of claims) {
    for (const where of claim.in ?? ["source", "page"]) {
      const surface = surfaces[where];
      if (surface == null) {
        checked.push({ id: claim.id, where, state: "not read" });
        continue;
      }
      const found = [...surface.text.matchAll(claimPattern(claim.pattern))].map((m) => m[1]);
      const wrong = found.filter((value) => value !== version);
      if (wrong.length) {
        checked.push({ id: claim.id, where, state: "disagrees", found: wrong });
        problems.push(
          surface.label +
            ": " +
            JSON.stringify(claim.id) +
            " states release " +
            wrong.join(", ") +
            ", this build is release " +
            version +
            " — regenerate the page from this build; do not correct the number by hand"
        );
      } else if (found.length !== claim.count) {
        checked.push({ id: claim.id, where, state: "count", found: found.length });
        problems.push(
          surface.label +
            ": " +
            JSON.stringify(claim.id) +
            " appears " +
            found.length +
            " time(s) saying release " +
            version +
            ", the declaration expects " +
            claim.count +
            " — either the page stopped stating its release (" +
            JSON.stringify(claim.pattern) +
            ") or the declaration is stale"
        );
      } else {
        checked.push({ id: claim.id, where, state: "agrees", found: found.length });
      }
    }
  }
  return { checked, problems };
}

/* --- the deployment the page claims to be --------------------------------- */

// A green run that says "the live page matches the build" still leaves the question a
// person actually asks when something looks wrong: *which* deployment was judged? The
// website is deployed from a repository, so the answer exists — the page committed at a
// named commit — and reading it is what separates three states that a live-only check
// reports the same way: the deployment is that commit, the deployment is an older one,
// and the repository itself is behind this build.
const label = (repo, commit) => (repo ? repo + "@" : "@") + String(commit).slice(0, 7);

function readDeployment(file, commit) {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved))
    throw new Error("The page at " + label(null, commit) + " was not found at " + resolved + " — fetch the website at that commit and pass the file it holds, or drop --deployed to compare only the live page");
  const text = fs.readFileSync(resolved, "utf8");
  const document = pickConsumerDocument(text, resolved);
  return { file: resolved, document: document.html, how: document.how, surface: isSource(text) ? "source" : "page", text };
}

// Two claims, checked separately so the failure says which one broke: the committed
// page is this build plus the declarations (otherwise the repository is behind), and
// the served page is that committed page (otherwise the deployment is behind it).
function verifyDeployment(deployment, liveHtml, buildHtml, loaded, repo, commit) {
  const problems = [];
  const name = label(repo, commit);
  let exact = null;
  let composed = null;
  if (loaded) {
    const committed = verifyDeclarations(loaded, deployment.document, buildHtml);
    exact = committed.exact;
    composed = committed.composed;
    for (const problem of committed.problems) problems.push(name + ": " + problem);
  } else {
    problems.push(
      name + ": the committed page cannot be held to this build without the declarations that describe it — pass --declarations"
    );
  }
  const identical = liveHtml === deployment.document;
  if (!identical) {
    const diff = firstDifference(liveHtml, deployment.document);
    problems.push(
      "the live page is not the page " + name + " produces — first difference at character " + diff.at + ": live " + diff.left + " committed " + diff.right
    );
  }
  return { repo, commit, short: String(commit).slice(0, 7), file: deployment.file, how: deployment.how, identical, exact, composed, problems };
}

// Token overlap, used only to tell a rewritten line from a new one.
const tokens = (line) => new Set(line.match(/[A-Za-z0-9_$]+/g) ?? []);
function similarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared++;
  return shared / Math.max(ta.size, tb.size);
}

function firstDifference(a, b) {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i++;
  const context = (s) => JSON.stringify(s.slice(Math.max(0, i - 60), i + 60));
  return { at: i, left: context(a), right: context(b) };
}

function compareComponent(id, consumerText, buildText, declared) {
  if (consumerText === null || buildText === null) {
    return { id, state: "missing", detail: "absent from " + (consumerText === null ? "the consumer" : "the build") };
  }
  // Trailing whitespace carries no meaning in JS source, and a copy pasted into
  // another file routinely loses the final newline. Folding it keeps that
  // packaging artifact from reading as drift, while still being reported.
  const trimEnd = (s) => s.replace(/\s+$/, "");
  if (trimEnd(consumerText) === trimEnd(buildText)) {
    return consumerText === buildText
      ? { id, state: "identical" }
      : { id, state: "identical", detail: "identical apart from " + (buildText.length - trimEnd(buildText).length) + " trailing whitespace character(s) in the build" };
  }
  const a = consumerText.split("\n");
  const b = buildText.split("\n");
  const consumerOnly = a.filter((line) => line.trim() && !b.includes(line));
  const buildOnly = b.filter((line) => line.trim() && !a.includes(line));
  // Declared adaptations come out first: they are the differences this consumer is
  // entitled to have, and calling them drift is what this script used to do to the
  // page's own contact card. What is left is what nobody has explained.
  const declaredConsumer = consumerOnly.filter((line) => declared?.consumerLines.has(line.trim()));
  const declaredBuild = buildOnly.filter((line) => declared?.buildLines.has(line.trim()));
  const unexplainedConsumer = consumerOnly.filter((line) => !declaredConsumer.includes(line));
  const unexplainedBuild = buildOnly.filter((line) => !declaredBuild.includes(line));
  if ((declaredConsumer.length || declaredBuild.length) && !unexplainedConsumer.length && !unexplainedBuild.length) {
    return {
      id,
      state: "declared",
      detail: declaredConsumer.length + " line(s) added, " + declaredBuild.length + " omitted by " + declared.ids.join(", "),
      declared: { added: declaredConsumer.length, omitted: declaredBuild.length, ids: declared.ids, file: declared.file },
    };
  }
  // A line the copy rewrote appears in both lists. Counting those as missing logic
  // would tell a maintainer to port a fix backwards, so match each consumer-only
  // line against the build-only lines: a near match is that line's earlier version,
  // and only an unmatched line is something this repository cannot reproduce — the
  // ISSUE-001 case, where the copy carried a whole rule that no branch had.
  const newLogic = unexplainedConsumer.filter((line) => !unexplainedBuild.some((other) => similarity(line, other) >= 0.6));
  const rewritten = unexplainedConsumer.length - newLogic.length;
  const result = {
    id,
    state: "differs",
    detail:
      unexplainedConsumer.length + " undeclared line(s) only in the consumer, " + unexplainedBuild.length + " only in the build; lengths " + consumerText.length + " vs " + buildText.length +
      (declaredConsumer.length || declaredBuild.length ? " (a further " + declaredConsumer.length + " added and " + declaredBuild.length + " omitted are declared: " + declared.ids.join(", ") + ")" : ""),
    consumerOnly: unexplainedConsumer.slice(0, 5).map((l) => l.trim().slice(0, 160)),
    buildOnly: unexplainedBuild.slice(0, 5).map((l) => l.trim().slice(0, 160)),
    newLogic: newLogic.length,
    rewritten,
    first: firstDifference(consumerText, buildText),
    declared: declaredConsumer.length || declaredBuild.length ? { added: declaredConsumer.length, omitted: declaredBuild.length, ids: declared.ids, file: declared.file } : undefined,
  };
  if (newLogic.length) {
    const where = declared ? " and not declared in " + declared.file : "";
    result.direction = newLogic.length + " consumer-only line(s) are not in this build" + where + " — check whether the copy invented them";
  } else if (rewritten) result.direction = "the copy holds earlier versions of " + rewritten + " line(s) that this build has since rewritten — republish, do not port";
  else result.direction = "the copy is behind the build — regenerate it; nothing needs porting";
  return result;
}

/* --- reporting ------------------------------------------------------------ */

function report(results, meta) {
  const critical = results.filter((r) => r.critical && r.state !== "identical");
  const presentational = results.filter((r) => !r.critical && r.state !== "identical" && r.state !== "declared");
  const declaredResults = results.filter((r) => r.state === "declared");
  // --expect-identical is for the Streamlit artifact, which is this build copied
  // verbatim; there a presentational difference is a failure too.
  const byteMismatch = meta.expectIdentical && !meta.documentIdentical;
  // A declaration that no longer holds is not a difference of degree: either the page
  // cannot be regenerated from this build, or it carries something it says it does not.
  const problems = meta.declarationProblems ?? [];
  const deploymentProblems = meta.deployment?.problems ?? [];
  const releaseProblems = meta.release?.problems ?? [];
  const ok = critical.length === 0 && !byteMismatch && problems.length === 0 && deploymentProblems.length === 0 && releaseProblems.length === 0;
  if (meta.json) {
    console.log(JSON.stringify({ consumer: meta.consumer, build: meta.build, how: meta.how, readFrom: meta.readFrom ?? null, expectIdentical: meta.expectIdentical, documentIdentical: meta.documentIdentical, declarations: meta.declarationFile ? { file: meta.declarationFile, ids: meta.declarationIds, exact: meta.declarationExact, composed: meta.declarationComposed, problems, notes: meta.declarationNotes } : null, release: meta.release ? { build: meta.release.version, checked: meta.release.checked, problems: releaseProblems } : null, deployment: meta.deployment ? { repo: meta.deployment.repo, commit: meta.deployment.commit, file: meta.deployment.file, identical: meta.deployment.identical, exact: meta.deployment.exact, composed: meta.deployment.composed, problems: deploymentProblems } : null, results, ok }, null, 2));
    return ok;
  }
  console.log("Consumer : " + meta.consumer);
  console.log("           (" + meta.how + ")");
  if (meta.readFrom) {
    console.log("Deployment: " + label(meta.readFrom.repo, meta.readFrom.commit));
    console.log("            the copy compared was read from that commit, so the verdict is about it and not about");
    console.log("            whichever copy a cache or the default branch was serving");
  }
  console.log("Build    : " + meta.build);
  if (meta.declarationFile) console.log("Declared : " + meta.declarationFile + " — " + meta.declarationIds.join(", "));
  if (meta.release) {
    const agreed = meta.release.checked.filter((c) => c.state === "agrees").length;
    const skipped = meta.release.checked.filter((c) => c.state === "not read").length;
    console.log(
      "Release  : " +
        meta.release.version +
        " — " +
        agreed +
        " claim(s) agree, " +
        releaseProblems.length +
        " disagree" +
        (skipped ? ", " + skipped + " on a surface this run did not read" : "")
    );
  }
  if (meta.deployment) {
    console.log("Deployment: " + label(meta.deployment.repo, meta.deployment.commit) + "  (" + path.relative(ROOT, meta.deployment.file) + ")");
    console.log("            " + (meta.deployment.identical ? "the live page is the page that commit produces" : "the live page is NOT the page that commit produces"));
  }
  console.log("");
  for (const r of results) {
    const verdict = r.state === "identical" ? "identical" : r.state === "declared" ? "declared" : r.state === "differs" ? "DIFFERS" : "MISSING";
    console.log("  " + (r.critical ? "underwriting " : "presentation ") + r.id.padEnd(10) + verdict + (r.detail ? "  — " + r.detail : ""));
    if (r.direction) console.log("      " + r.direction);
    for (const line of r.consumerOnly ?? []) console.log("      consumer only: " + line);
    for (const line of r.buildOnly ?? []) console.log("      build only   : " + line);
    if (r.first) console.log("      first difference at char " + r.first.at + "\n        consumer " + r.first.left + "\n        build    " + r.first.right);
  }
  for (const note of meta.declarationNotes ?? []) console.log("\n  note: " + note);
  console.log("");
  if (deploymentProblems.length) {
    console.log("FAIL — the live page is not the deployment this run names:");
    for (const problem of deploymentProblems) console.log("       " + problem);
    console.log("       A live page that differs from the commit has not been redeployed; a commit that is");
    console.log("       not this build means the deployed repository is behind it. Republish or push the");
    console.log("       release — do not edit the copy to match.");
  } else if (releaseProblems.length) {
    console.log("FAIL — the page states a release that is not this build:");
    for (const problem of releaseProblems) console.log("       " + problem);
    console.log("       The page is generated, so the number is moved by regenerating it from this build,");
    console.log("       not by editing the claim: a corrected claim drifts again on the next release.");
  } else if (problems.length) {
    console.log("FAIL — the page's declared adaptations no longer hold:");
    for (const problem of problems) console.log("       " + problem);
    console.log("       A moved anchor is fixed by updating consumers/website.json and the page's generator");
    console.log("       together; a page that is not this build is fixed by regenerating it from this one.");
    console.log("       The underwriting comparison above still stands, and a page that is not this build");
    console.log("       cannot be excused by matching underwriting logic.");
  } else if (critical.length) {
    console.log("FAIL — this consumer and the build disagree on underwriting logic.");
    for (const r of critical) if (r.direction) console.log("       " + r.id + ": " + r.direction);
    if (critical.some((r) => r.newLogic)) {
      console.log("       Port each unmatched consumer-only line above into js/rules.js, js/state.js or");
      console.log("       js/engine.js with a test, and treat it as logic this repository did not know");
      console.log("       about. A line the copy rewrote is that line's earlier version here, so check the");
      console.log("       build-only side before porting anything back.");
    }
    console.log("       Then regenerate the consumer from the new build, and never edit its copy to");
    console.log("       match: that is how ISSUE-001 happened.");
  } else if (byteMismatch) {
    console.log("FAIL — this comparison requires the consumer to be byte-identical to the build.");
    console.log("       Underwriting logic matches, but the documents differ; regenerate this consumer");
    console.log("       from the build rather than adapting it. Nothing may be adapted here.");
  } else if (presentational.length) {
    console.log("PASS — underwriting logic matches the build.");
    console.log("       " + presentational.length + " presentational difference(s) above. Bring anything you want to keep back into");
    console.log("       this repository, and regenerate the copy rather than hand-editing it.");
  } else if (declaredResults.length) {
    console.log("PASS — underwriting logic matches the build, and the only presentational difference is");
    console.log("       declared in " + meta.declarationFile + ": " + (declaredResults[0].declared?.ids ?? []).join(", ") + ".");
    if (meta.declarationExact) {
      console.log("       The page runs this build: its document begins with " + meta.declarationComposed + " characters");
      console.log("       of it plus the declared adaptations, and continues with the page's own adapters.");
    }
    if (meta.deployment?.identical) {
      console.log("       The deployment judged is " + label(meta.deployment.repo, meta.deployment.commit) + ", whose committed page is this document.");
    }
    if (meta.release && !releaseProblems.length) {
      const agreed = meta.release.checked.filter((c) => c.state === "agrees").length;
      if (agreed) console.log("       It states release " + meta.release.version + " in all " + agreed + " of the places it declares.");
    }
  } else if (!meta.documentIdentical) {
    console.log("PASS — every component matches the build once this consumer's own embed adaptations are");
    console.log("       folded out; the delivered document differs only by its CSP, its embed links and its adapters.");
  } else if (results.some((r) => r.state === "identical" && r.detail)) {
    console.log("PASS — every component matches the build; only trailing whitespace differs.");
  } else {
    console.log("PASS — this consumer is byte-identical to the build.");
  }
  if (ok && meta.readFrom) console.log("       Judged: " + label(meta.readFrom.repo, meta.readFrom.commit) + ".");
  return ok;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\/\*/, "").trim());
    return 0;
  }
  const buildPath = path.resolve(ROOT, args.build);
  if (!fs.existsSync(buildPath)) throw new Error("Build not found at " + buildPath + " — run: npm run build");
  const build = fs.readFileSync(buildPath, "utf8");
  if (!holdsWholeEstimator(build)) throw new Error("Build at " + buildPath + " does not contain all four components — rebuild it with: npm run build");
  const consumer = await readConsumer(args.consumer);

  const loaded = loadDeclarations(args.consumer, args.declarations);
  const verification = loaded ? verifyDeclarations(loaded, consumer.html, build) : null;
  const version = buildVersion(build);

  // The named deployment is optional, but it is only useful as a pair: a commit with
  // no page to read names nothing, and a page with no commit cannot be reported on.
  if (args.deployed && !args.deployedCommit)
    throw new Error("--deployed needs --deployed-commit <branch, tag or SHA>, so the verdict can name the deployment it judged");
  if (args.deployedCommit && !args.deployed)
    throw new Error("--deployed-commit names a deployment to read; pass --deployed <path> with the page at that commit");
  // Where the consumer itself came from is reported, not proven: a caller can name the
  // wrong commit. The workflow sets both from the checkout it performed, which is the
  // only thing that can know.
  if (args.consumerCommit && !args.consumerRepo)
    throw new Error("--consumer-commit names the deployment the consumer was read from; pass --consumer-repo <owner/name> with it");
  if (args.consumerRepo && !args.consumerCommit)
    throw new Error("--consumer-repo needs --consumer-commit <branch, tag or SHA>, so the verdict can name the commit it judged");
  const committed = args.deployed ? readDeployment(args.deployed, args.deployedCommit) : null;
  const deployment = committed
    ? verifyDeployment(committed, consumer.html, build, loaded, args.deployedRepo ?? null, args.deployedCommit)
    : null;

  // The release claims are checked against every surface this run actually read. The
  // committed page wins over a local copy of it, and a live run contributes the
  // served page, so the same declaration covers the file a person edits and the bytes
  // a crawler receives.
  const surfaces = {};
  if (committed) surfaces[committed.surface] = { text: committed.text, label: "the committed page " + label(args.deployedRepo ?? null, args.deployedCommit) };
  if (consumer.source != null && !surfaces.source) surfaces.source = { text: consumer.source, label: "this source" };
  if (consumer.page != null && !surfaces.page) surfaces.page = { text: consumer.page, label: "the served page" };
  const release = loaded?.releaseClaims?.length ? { version, ...verifyReleaseClaims(loaded.releaseClaims, surfaces, version) } : null;

  const consumerBodies = componentBodies(consumer.html);
  const buildBodies = componentBodies(build);
  const results = COMPONENTS.map((c) => Object.assign(compareComponent(c.id, consumerBodies[c.id], buildBodies[c.id], verification?.components[c.id]), { critical: c.critical }));
  results.push(Object.assign(compareComponent("styles", styleBlocks(consumer.html)[0] ?? null, styleBlocks(build)[0] ?? null), { critical: false }));
  results.push(Object.assign(compareComponent("markup", normaliseMarkup(consumer.html), normaliseMarkup(build)), { critical: false }));

  return report(results, {
    consumer: args.consumer,
    build: path.relative(ROOT, buildPath),
    how: consumer.how,
    readFrom: args.consumerCommit ? { repo: args.consumerRepo, commit: args.consumerCommit } : null,
    json: args.json,
    documentIdentical: consumer.html === build,
    expectIdentical: args.expectIdentical,
    declarationFile: loaded?.file ?? null,
    declarationIds: verification?.ids ?? [],
    declarationProblems: verification?.problems ?? [],
    declarationNotes: verification?.notes ?? [],
    declarationExact: verification?.exact ?? false,
    declarationComposed: verification?.composed ?? 0,
    deployment,
    release,
  });
}

// Exported for the fixtures: requiring this file must not run a comparison against the
// real page, and the declaration loader is a branch the fixtures cannot reach through
// the command line (it applies only to the origin the declaration names).
module.exports = { loadDeclarations, composeDeclared, verifyDeclarations, statementLines, firstDifference, readDeployment, verifyDeployment, buildVersion, verifyReleaseClaims, claimPattern };

if (require.main === module) {
  main()
    .then((ok) => { process.exitCode = ok ? 0 : 1; })
    .catch((error) => { console.error("consumer-parity: " + error.message); process.exitCode = 1; });
}
