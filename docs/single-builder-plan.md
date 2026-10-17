# Plan — one builder: retire the Streamlit twin, verify the artifact it serves

Status: **implemented** — the refactor this document plans is carried by the commits that
accompany it; §9 (the deploy token, the Lovable publish, the Streamlit Cloud render
check) remains user-owned.
Created: 2026-10-16.
Scope: `richardparslow-commits/HealthClassEstimator` (canonical) and
`richardparslow-commits/health_app.py` (Streamlit deployment target).
The website copy (`richardparslow-commits/life-policy-light`) is out of scope; §10.

## 1. The issue this fixes

The embedded build — the self-contained single-file document Streamlit renders —
exists twice:

| Where | Implementation | Runs when |
| --- | --- | --- |
| `HealthClassEstimator/scripts/build-embedded.js` | the reviewed builder (Node) | release workflow, `dist/app.html` |
| `health_app.py` (`build_app_html()`) | a hand-copied re-implementation (Python) | `app_embedded.html` is absent — a local run, or a deploy where it did not arrive |

They are required to produce the **same document byte for byte**, by hand, in two
languages. That requirement is the defect generator, and it has already fired three
times:

1. Three script blocks joined `</script><script>` instead of `</script>\n<script>` —
   a local run served a different document than the reviewed build (fixed).
2. The stylesheet passed through a `re.sub` *replacement string*, which reads
   backslash escapes and `\1` group references — a stylesheet containing a CSS
   escape (`content: "\2192"`) made the fallback die with
   `invalid group reference 21` (fixed).
3. The loader strip is anchored on a comment, so renaming the comment defeated
   both the strip and the guard, and the fallback emitted a document that loads
   `js/` over the network inside an iframe whose policy forbids it (fixed).

Each fix landed in the copy, not the cause. The daily parity job (`consumer-parity.yml`,
job `streamlit-fallback`) *detects* drift; it cannot *prevent* it. ISSUE-001 — a
Mutual of Omaha amount screen that existed only inside the website's copy — is the
same class one layer out.

Target contract, in one line: **one builder produces the artifact; the consumer
verifies it before serving it, and contains no build logic at all.**

## 2. Goal / non-goals

Goal
- After this change, no second implementation of the embedded build exists anywhere.
- The deployed Streamlit document is produced by exactly one builder and is
  hash-verified before it is served; a mismatch is a loud boot error, never a
  silently different tool.

Non-goals
- No change to underwriting behaviour, `js/**`, `css/styles.css`, `index.html`,
  or the builder's output. The artifact must stay 238,132 bytes and sha256
  `88d1204338b8a223df37a150f086b4a3507731684bbadac6bb431c9b0c4b5f03`.
- No change to the website embed or the Lovable publish.
- No change to `STREAMLIT_PUSH_TOKEN` or repository permissions (§9).

## 3. Decision

**Chosen — artifact-only with a hash-pinned manifest.** The canonical builder
runs in the release workflow and emits two files: `app_embedded.html` and
`app_embedded.manifest.json`. The Streamlit repo receives **only those two
files** and the runtime *verifies* them (`hashlib.sha256` vs the manifest, plus
provenance and version cross-checks) before handing the document to the component.
`build_app_html()` and the loose `index.html` / `css/` / `js/` copies are deleted
from the Streamlit repo. If the pair is absent or inconsistent, the app refuses
to start with a recovery command in the message.

Alternatives considered and rejected

| Option | Why rejected |
| --- | --- |
| Keep the twin + daily diff (today) | Detection, not prevention. Every builder change must still be made twice, in two languages; production can still pick the divergent path. |
| Runtime shell-out to `node scripts/build-embedded.js` | Adds a Node runtime dependency to Streamlit Cloud (`packages.txt`), keeps a second copy of the *sources* in the deployed repo, and builds an unreviewed document at boot — the exact failure mode being fixed. |
| Port the builder to Python and delete the JS one | The canonical repo's CI, guards and fixtures are Node; the artifact is the product consumers receive. Inverting the dependency moves the drift risk into the reviewed repo. |

Why verification, not trust: the artifact is a *copy* that can be edited where it
lands (the ISSUE-001 vector). Under this plan a hand-edited artifact fails at boot
instead of rendering a tool this repository never audited.

## 4. Target state

```
HealthClassEstimator (canonical)                    health_app.py (deployed repo)
─────────────────────────────────                   ────────────────────────────
index.html + css/ + js/  ──┐                        health_app.py
scripts/build-embedded.js  │  release workflow      app_embedded.html      ← CI-built
scripts/write-artifact-    ├──────────────────────► app_embedded.manifest.json ← CI-written
  manifest.js              │  (pair only)           README.md
scripts/verify-streamlit-  │                        requirements.txt
  runtime.py               ┘                        .devcontainer/
     ▲                                              (index.html, css/, js/ deleted)
     └── used by both workflows
```

Per-file changes

**HealthClassEstimator**
| File | Change |
| --- | --- |
| `scripts/write-artifact-manifest.js` | **new** — writes the manifest for a built artifact (§5) |
| `scripts/verify-streamlit-runtime.py` | **new** — imports the deployed `health_app.py` with Streamlit stubbed and proves the runtime contract on valid and broken pairs (§5, §6) |
| `scripts/build-embedded.js` | docstring only — its “mirrors … health_app.py — kept in sync deliberately” comment becomes false (§5 last item) |
| `package.json` | add `release:artifact`, `test:manifest` |
| `test/manifest.test.js` | **new** — fixture-proofs the manifest writer |
| `test/parity.test.js` | add fixtures for `--expect-identical` |
| `scripts/check-consumer-parity.js` | add `--expect-identical` (fail unless `documentIdentical`) |
| `.github/workflows/deploy-streamlit.yml` | build via `release:artifact`; sync the pair only; verify the pair before push; assert the twin is gone |
| `.github/workflows/consumer-parity.yml` | `streamlit` job gains a strict byte-identity gate + manifest check; `streamlit-fallback` job replaced by `streamlit-runtime` |
| `README.md` | rewrite the "Consumers of the build" passage and the command list |

**health_app.py repo**
| File | Change |
| --- | --- |
| `health_app.py` | delete `build_app_html()` and the `re` import; `load_app_html()` verifies the pair, else raises with recovery instructions |
| `app_embedded.manifest.json` | **new**, generated (not hand-written) |
| `README.md` | update procedure = copy the pair; verification semantics |
| `index.html`, `css/styles.css`, `js/*.js` | **delete** — nothing in the deployed repo needs them any more |

## 5. The manifest and the verification contract

`app_embedded.manifest.json` (2-space JSON, trailing newline):

```json
{
  "artifact": "app_embedded.html",
  "sha256": "88d1204338b8a223df37a150f086b4a3507731684bbadac6bb431c9b0c4b5f03",
  "bytes": 238132,
  "hce_version": "80",
  "builder": "scripts/build-embedded.js",
  "source_commit": "241853e4a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  "built_utc": "2026-10-16T18:30:00Z"
}
```

`write-artifact-manifest.js` refuses to write unless the artifact
- exists, and
- contains the builder's provenance stamp (`// stamped by build-embedded.js`) and
  `window.HCE_VERSION = "<n>"`, which it copies into the manifest.

`source_commit` is `GITHUB_SHA` in CI and `local` otherwise; `built_utc` is
injectable (`BUILT_UTC`) so tests are deterministic.

`health_app.py`'s `load_app_html()` performs, in order:

1. `app_embedded.html` exists — else `RuntimeError` naming the recovery command.
2. `app_embedded.manifest.json` exists — else the same.
3. Manifest parses; every field above is present and well-typed.
4. `sha256(bytes(artifact)) == manifest.sha256` — else `RuntimeError` showing both
   hashes and "the artifact was edited outside the build; regenerate it".
5. `len(bytes(artifact)) == manifest.bytes` (cheap consistency).
6. `manifest.builder == "scripts/build-embedded.js"`.
7. `window.HCE_VERSION = "<manifest.hce_version>";` appears in the artifact.

Only then is the document returned. Verification runs on every Streamlit rerun;
238 KB of hashing is sub-millisecond and, more importantly, must never be cached
across a redeploy. The recovery message names the exact fix:

```
app_embedded.html is missing or fails verification — regenerate the pair:
  cd HealthClassEstimator && npm run release:artifact
  cp app_embedded.html app_embedded.manifest.json ../health_app.py/
```

**Accepted residual risk:** a hand-edited artifact *with* a hand-regenerated
manifest is self-consistent and passes at boot. That is what the daily parity job
is for (§6, step 4); the deploy job only ever stages CI-built pairs.

## 6. Steps (ordered; each has an exit criterion)

**S1 — canonical side: manifest tooling (estimator repo, no workflow changes yet).**
Add `write-artifact-manifest.js`, `release:artifact`, `manifest.test.js`.
*Verify:* `npm run test:manifest` green — correct fields on a real build; refuses
a missing artifact; refuses an artifact without the builder stamp; hash equals
`shasum -a 256`.
*Done when:* `npm run release:artifact` produces the pair and
`jq -r .sha256 app_embedded.manifest.json` equals the artifact's real hash.

**S2 — runtime verifier as a reusable script.**
Add `verify-streamlit-runtime.py` (usable against any directory containing
`health_app.py` + pair). Cases, each in its own subprocess so an import-time
failure is captured cleanly: valid pair serves the artifact's exact bytes;
one flipped artifact byte fails; missing artifact fails naming the recovery
command; missing manifest fails; a manifest whose `hce_version` lies fails.
*Verify:* run it against the **current** published `health_app.py`. The tampered-
artifact, missing-manifest and missing-artifact cases must FAIL there — today's
runtime ignores the manifest, serves an edited artifact, and falls back to
`build_app_html()` when the artifact is absent — which proves the checker detects
the absence of the contract, not merely passes it.
*Done when:* the checker is proven to fail against the old code and pass against
a staged new `health_app.py`.

**S3 — streamlit repo content, staged but not pushed.**
In a clone of `health_app.py`: new `health_app.py` (verification, no builder),
new README, delete `index.html`, `css/`, `js/`. Copy the pair generated in S1.
*Verify:* `npm run release:artifact` in the estimator repo, then
`python3 scripts/verify-streamlit-runtime.py <clone>` → 6/6 PASS. Confirm
`shasum -a 256` of the artifact equals the canonical `dist/app.html`
(byte-identical, no normalisation). Confirm the staged `health_app.py` has no
`re.sub` and no `build_app_html`.

**S4 — workflow changes (estimator repo).**
`deploy-streamlit.yml`: build with `release:artifact`; sync the two files only;
`rm -rf` the obsolete loose assets in the streamlit checkout (so the sync commit
also deletes them); add a pre-push step running `verify-streamlit-runtime.py`
against the checkout; add an invariant step that fails if
`grep -q "def build_app_html" streamlit-app/health_app.py`. Keep the token gate
and summary untouched. Note: the current sync line `cp index.html css/styles.css
streamlit-app/` puts the stylesheet at the repo *root* (a latent bug that never
fired because the token is unset and every sync so far was manual) — deleting the
line removes it.
`consumer-parity.yml`: `streamlit` job adds `--expect-identical` and checks the
manifest's `sha256`/`bytes`/`hce_version` against the fresh build; replace
`streamlit-fallback` with `streamlit-runtime`, which fetches one commit of
`streamlit_repo` (git, pinned — see the CDN note in §8) and runs
`verify-streamlit-runtime.py` on the wrapper, artifact and manifest it holds. The `alert` job's `needs` list must be renamed in
the same change — a `needs` entry for a job that no longer exists fails the whole
workflow, which would silence the drift issue rather than report it.
*Verify:* run each job's exact shell locally against the S3 clone (the pattern
used for every previous guard in this repo).

**S5 — land it.**
Estimator repo: commit S1–S4 (and this plan, if wanted). Streamlit repo: one
commit — new `health_app.py` + README + pair + the three deletions — pushed
directly (the workflow's own sync is token-gated, and the pair is byte-identical
to the current artifact, so the redeploy changes no served bytes).
*Done when:* both repos are clean and level with origin.

**S6 — dispatch both workflows and read the receipts.**
`consumer-parity.yml` (no inputs): expect `Live website` green, `Streamlit
artifact` green **with strict byte identity**, `Streamlit runtime` green 6/6 —
and no `streamlit-fallback` job. `deploy-streamlit.yml` also runs
`verify-streamlit-live.py` (4/4) against the staged checkout under a real
Streamlit install; that check found the deprecated rendering API. `deploy-streamlit.yml`: expect green through
engine suite, build, CSS audit, builder guards, then the token gate (still the
only failure on `main`, as designed).
*Done when:* both runs show the expected jobs.

**S7 — optional, user-owned.**
Set `STREAMLIT_PUSH_TOKEN` (Contents and Pull requests read/write on
`richardparslow-commits/health_app.py`); the next push to estimator `main` deploys
the pair automatically, and the same token is what lets a green canary above the
ceiling open the review that raises it (A12). Without it a warranted lift fails the
`propose-ceiling` job with that instruction rather than passing as nothing to do.
Confirm the Streamlit Cloud page (§9).

## 7. Acceptance criteria

| # | Criterion | How it is checked |
| --- | --- | --- |
| A1 | No build logic in the deployed repo | `grep -c "build_app_html\|re\.sub" health_app.py` → 0 |
| A2 | No sources in the deployed repo | `git ls-files` → only `.devcontainer/`, `README.md`, `app_embedded.html`, `app_embedded.manifest.json`, `health_app.py`, `requirements.txt` |
| A3 | Published artifact is byte-identical to a fresh build | `shasum -a 256` equality, no normalisation (`88d1204338b8…`) |
| A4 | Manifest matches artifact and sources | `sha256`/`bytes`/`hce_version` equal fresh-build values |
| A5 | Runtime refuses broken pairs and serves good ones | `verify-streamlit-runtime.py` 6/6 PASS; proven to fail on the old code in S2 |
| A6 | Deploy job stages exactly the pair + deletions, verifies it, and pushes it | Staging, sync, no-rebuild invariant and runtime verification now run on **every** push (token not needed); only the push itself waits for the token (S7) |
| A7 | No underwriting or rendering change | engine suite (10,332 assertions), build/css/builder/parity/manifest suites unchanged green; artifact hash unchanged |
| A8 | The app runs under Streamlit itself | `verify-streamlit-live.py` 4/4 on the staged checkout (real `AppTest` runtime, plus the interpreter case), plus a real `streamlit run` rendering release 80 in a browser — and it found `st.components.v1.html`, which is now `st.iframe` |
| A13 | One interpreter for the local run, CI and the deployment | `richardparslow-commits/health_app.py` declares `3.12` in `.python-version`; both workflows install it with `python-version-file: streamlit-app/.python-version` instead of naming a version in YAML (the deployed repo is checked out first for that reason), both fail with an instruction when the file is missing, the dev container's image is pinned to the same 3.12, and `verify-streamlit-live.py` fails when the interpreter it is running is not the declared one. Cloud cannot be read from here: its Advanced-settings selection is the live pin, and the deployed README says that rather than implying a file controls it. `npm run test:pin` (35 assertions) covers every disagreement, the malformed/missing/unsupported declaration, patch-level pins and the workflow wiring. **Order matters on the first landing:** the deployed repository's `.python-version` and dev-container image have to be committed before these workflow changes are pushed, because the guard reads the deployed default branch — until then the next deploy fails with the instruction to add the file |
| A9 | The app still runs on the *newest* Streamlit, not just the pinned one | `.github/workflows/streamlit-canary.yml`, daily: installs the newest `streamlit` from PyPI (ignoring the deployed `>=1.66,<2` ceiling) and runs `verify-streamlit-live.py` against the deployed pair; the summary states whether the installed version is inside or outside the deployed pin, and one `streamlit-canary` issue stays open while the canary is red, closing on the first passing run |
| A12 | A green canary above the ceiling ends in a reviewable pull request, not a log line | `scripts/streamlit-ceiling.js` decides from the deployed `requirements.txt` and the version that passed — next major above the proved release, floor unchanged — and writes the review text; the `propose-ceiling` job runs only when the canary said a lift is warranted and the channel was stable, puts the one-line change on `canary/streamlit-ceiling`, and opens or updates a single pull request in the deployed repository with the canary run linked. It declines with a reason on a prerelease, an exact pin, a pin with no ceiling, a release below the floor, or a release already inside the pin; a missing token fails the job rather than skipping the review. `npm run test:ceiling` (64 assertions) covers each verdict, the byte-preserving edit incl. CRLF/markers/comments, idempotent re-application, the body text and the workflow wiring |
| A10 | No workflow reads a deployed copy over `raw.githubusercontent.com` | `npm run test:workflows` fails on a read in any workflow file (a `run:` line or an `env:` value) and passes on a comment that explains the bug; `npm run check:workflows` runs the same guard against the four workflows this repository ships |
| A14 | A green verdict names the deployment it judged | `consumer-parity.yml`'s website job fetches the page from `richardparslow-commits/life-policy-light` at one ref (`website_ref`, default `main`), prints the resolved commit, and passes it to `check-consumer-parity.js --deployed <page> --deployed-commit <sha> --deployed-repo <repo>`. The run then makes two claims and reports them separately: the committed page is this build plus the declared adaptations (otherwise the repository is behind), and the served page is that committed page byte for byte (otherwise the deployment has not published it) — the verdict prints `richardparslow-commits/life-policy-light@<sha>`, the run summary carries it, and `--json` carries the full SHA. Naming an older ref therefore checks an older deploy on purpose. That repository is private (unauthenticated API 404) while the other two are public, so the fetch carries `WEBSITE_READ_TOKEN` in an auth header — never in the remote URL, because a failed fetch prints its arguments — falling back to the existing push token; a failed or absent token fails the job with the instruction to add one rather than skipping the comparison. Covered by 192 parity assertions, including the deployment fixtures (named commit, stale live page, a commit behind the build, a half pair, an unfetched page) and the workflow wiring, plus end-to-end runs against the live page: at `37d743e`/`8319b13` PASS naming the commit, at `d7faf60` exit 1 with both claims failing and their causes named |
| A16 | A page cannot claim a release it is not serving | `consumers/website.json` `releaseClaims` declares every place the predictor page states its release — the route comment, the visible footer, the FAQ sentence and the schema.org `softwareVersion`, each as literal text with `{version}` — and `check-consumer-parity.js` matches each against the build's own `HCE_VERSION` on whichever surfaces this run read: the committed page's source (`--deployed`) and the served page (the wrapper HTML the frame came from, not the embedded document). A number other than the build's, a claim that disappeared, or one appearing more often than declared fails with the claim id, both numbers and the fix (regenerate, do not edit the number). Surfaces not read are reported as not read rather than passed. The page's generator reads the same declarations and restamps them from the build, failing when it cannot find one — that is the root-cause fix for `softwareVersion` sitting at 78 while the page ran 80: it was hand-typed while the generator restamped the other two. Site suite 9/9, including a build bumped to 81 moving all four source claims and leaving the committed page alone, and a reworded claim failing by id; estimator suite 192 assertions, including the real shape (only the structured data behind), a missing claim, a duplicated claim, a release bump and the unit rules. **The live page still serves `softwareVersion` 78** until the site is pushed — the check reports exactly that and goes red, which is the finding, not a regression |
| A15 | The drift notification names the deployment it reports on | Each comparison job declares `repo`/`commit` outputs, written in the step that checks out the deployed commit, so a job that goes red after reading it still reports what it judged (a job output survives a failed job); the `alert` job passes `toJSON(needs)` to `scripts/parity-alert.js`, which writes the issue body, the still-failing comment and the closing comment. A failed job that read a commit is named `repo@short-sha`; one that never reached its fetch is reported as "no deployment read" with the likely causes; a skipped job as "did not run" and a cancelled one as cancelled, because those never had the chance and sending someone after a token they already have is worse than saying nothing. An unknown job added to `needs` later is still reported, under its own id, instead of being dropped. The issue's guidance paragraph reads the deployment line against the expected commit: same commit = not published yet, older commit = republish, none = fix the read. `npm run test:alert` (62 assertions) covers every state, the absence of an invented commit, the preserved guidance, the closing comment naming all three deployments, the `--json`-free CLI modes, malformed `needs` input, and the workflow wiring (outputs, `$GITHUB_OUTPUT` writes, no heredoc). The alert step's shell was also exercised against a stubbed `gh`: red with no issue creates one with the body file, red with an issue comments the judged deployment, green with an issue comments and closes, green without an issue makes no issue call |
| A11 | The website's declared adaptations are checked, not explained twice — and not *described* twice either | `consumers/website.json` holds the page's four adaptations; `check-consumer-parity.js` composes them onto the build and requires the page's document to begin with the result (`237,533` characters), reports the difference as declared by name, and fails on a moved anchor, on a page still carrying the omitted table, or on a document that is not the composition — 192 parity assertions, including the fixture where the page is the build plus the four. The page's own `scripts/embed-estimator.mjs` reads the same file: with no `--declarations` it loads `consumers/website.json` beside the build, applies `inserts`/`rewrites`/`omits` generically, refuses to write unless every anchor and count holds, and `--check` still regenerates the committed embed byte-for-byte (237,549 characters) |

## 8. Risks and rollback

- **A bad pair takes the Streamlit app down at boot.** Mitigated: the deploy job
  verifies the staged pair before pushing; the error message is the fix; the pair
  is generated by one command. Rollback is a one-commit revert to the previous
  `health_app.py` — the old code ignores the extra manifest file, so no data or
  artifact change is needed to roll back.
- **CDN staleness — resolved for both consumers.** `raw.githubusercontent.com` can
  serve a pre-push copy for minutes (measured: ~3 minutes on 2026-10-16), so a
  dispatch just after a push compared the previous release, and because the
  artifact and manifest were two separate requests, they could come from two
  different commits — which reports the confusing "edited outside the build". Both
  Streamlit jobs now fetch one commit with git (`streamlit_ref`, default `main`)
  and print the commit they read, so a run names exactly what it verified and
  cannot splice two commits. The live website read had the same shape and kept it:
  that page answers through Cloudflare with `no-cache, must-revalidate, max-age=0`,
  which asks a cache to revalidate rather than promising it holds nothing, so a run
  minutes after a page deploy could compare the release before it — red for a page
  that was already correct, or green for one that had not published. Every live
  request now carries a fresh nonce in the query string, a URL no cache can hold an
  entry for (measured inert on the page: same document, same frame, identical
  srcDoc), with `no-store`/`no-cache` to cover a cache that would answer without
  asking; an answer whose headers say a cache served it is retried with a new nonce
  and then refused rather than compared, because comparing it is the wrong answer
  this guard exists to stop. What remains is deployment propagation, not caching: a
  site deploy reached the live page in about 90 seconds, and no request path
  shortens that — a fresh read of a page that has not published yet is still the
  previous deployment. Detecting that has to name the site's commit, which the
  website job now reads (A14): the served page must be the page that commit
  produces, so "not redeployed yet" and "the repository is behind this build" are
  two different failures with two different fixes instead of one silent pass. The
  regression itself is guarded: `npm run
  check:workflows` fails on any read of a repository file over that CDN in a
  workflow (A10), so the shape that produced the stale comparisons cannot come
  back without turning a suite red.
- **Self-consistent tampering** (artifact + manifest both hand-made): not
  detectable at boot by design; caught daily against a fresh build. Documented in
  §5 and in the Streamlit README.
- **Upstream API removal taking the live app down.** This is the risk the whole
  wrapper is shaped around, and it is now watched rather than remembered: the
  daily canary (A9) installs the newest Streamlit, ignoring the deployed ceiling,
  and runs the live check against the deployed pair — so the answer to "can the
  ceiling move?" arrives before the upgrade, not after it. A red canary files a
  `streamlit-canary` issue and the run summary says whether the installed version
  is inside or outside the deployed pin.
- **Streamlit Cloud process reuse.** A redeploy restarts the app; verification
  runs at import, so no stale document survives a redeploy.

## 9. Blocked on the user (unchanged)

(The parity workflow now opens a labelled `parity-drift` issue when a comparison
job is red and closes it when all are green — added after this plan, so that a
drifted copy cannot fail quietly.)

- `STREAMLIT_PUSH_TOKEN` — until it exists, the workflow never pushes; every sync
  is manual. It now stages and verifies the pair on every push regardless, so a
  run without the secret still answers whether the pair is fit to publish.
- Confirm the Streamlit Cloud page after the S5 push; that render check cannot be
  made from here.
- `WEBSITE_READ_TOKEN` (or a `STREAMLIT_PUSH_TOKEN` that also covers the site
  repository) — the website job now reads `richardparslow-commits/life-policy-light`
  at one commit to name the deployment it judged, and that repository is private.
  Without a token that job fails with the instruction instead of quietly dropping to
  a live-only comparison, so a green website job means the deployment was read.

**Release 80 on the website — verified on 2026-10-17, no longer blocked.** The
earlier note here ("the live page still serves release 78") was wrong, and its
evidence was the page's own FAQ text rather than what the page ran: the delivered
document carried `HCE_VERSION` 80 and its stylesheet matched release 80 exactly.
What was read as a missing publish was a stale sentence. The served document is
byte-identical to the page's committed embed plus its two render-time adapters
(sha256 `3f25dbc0…`, 239,583 characters), and that embed is the build this
repository produces with the page's four documented adaptations; the FAQ now says
so. Publishing needs no Lovable step from the user's side: a push to the site
repository reached the live page in about 90 seconds, checked by refetching it.

## 10. Out of scope, natural follow-ups

- **The website's four adaptations are declared once, here — done.** The four live in
  `consumers/website.json` and are read by both sides: `check-consumer-parity.js`
  composes them onto `dist/app.html` and holds the served page to the result, and the
  site's `scripts/embed-estimator.mjs` applies the same file to the same build instead
  of carrying its own copy of the CSP, the contact-card lines, the two links and the
  omitted statement. That was the duplication the previous state left: two
  descriptions of one page, reconciled by a person whenever a release moved an anchor.
  Now a moved anchor, a rewritten count that no longer matches, or a missing file stops
  generation with the adaptation's id in the message, and should the declaration and
  the build still disagree the page's `--check` reports it as stale rather than
  rewriting it quietly. The check used to report the page's own contact card as
  "consumer-only lines are not in this build — check whether the copy invented them",
  which is the opposite of true; the difference is reported as declared, by name. The
  composition also makes the comparison exact rather than tolerant: the page's document
  must begin with the build plus the four (237,533 characters of the 239,583 it serves —
  the rest is the page's own render-time adapters), so a page running an older build
  fails even when the release changed nothing underwriting-level. What stays the site's
  own is what is genuinely its own: the release stamp, the literal's escaping, the two
  render-time adapter constants and the route file.

  **Which deployment was judged — done as far as a file can say.** The check reads the
  page committed in `richardparslow-commits/life-policy-light` at one ref and requires
  the served page to be that page, so the verdict names `…@<sha>` (A14). What it still
  cannot know is which ref the site actually deployed: it judges `main` by default, and
  a deploy from another branch, or one that never ran, has to be named with
  `website_ref`. The served-equals-committed half is what catches the second case; the
  first is a matter of naming the ref the deploy came from.

  Verified by regenerating the committed embed from the declaration — byte-identical,
  237,549 characters, `--check` exit 0 — and by the site's new `npm run test:embed`
  (seven tests, now part of its `npm test`): an edited contact-card line reaches the
  generated page, which a generator reading its own copy could not do; the committed
  embed reproduces byte for byte; and a moved insert anchor, a rewrite count of 3 where
  the build has 2, a declaration with `no-comparison-table` removed (stale page,
  241,639 vs 242,831 characters), a missing file and malformed JSON each exit 1 with
  the adaptation named. Control: making the generator ignore the declaration it is
  given — the regression the suite exists for — turns 4 of the 7 red; restored, 7/7
  pass. Nothing is committed yet, so the site's next `embed:estimator` run is the first
  to use it; until these files land, the app in use carries both copies.
- If the token stays unset, consider making the deploy job open a PR against the
  Streamlit repo instead of pushing, so the pair is always CI-built even manually.

## 11. Effort

One session: about ten files added/changed in the estimator repo (2 new scripts,
1 new test, `package.json`, the builder docstring, 2 workflows, the parity check
and its fixtures, README), and 2 changed + 3 deletions in the Streamlit repo. No
underwriting, rules, state, engine, UI or stylesheet changes; the built bytes do
not move.
