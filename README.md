# HealthClassEstimator

Life-insurance pre-underwriting screening with explicit carrier, product and underwriting route selection. Version 69 replaces the shared carrier ladder with source-edition rules and dated histories. The browser runtime remains dependency-free JavaScript.

The result is preliminary. It does not quote a price, issue insurance, confirm product availability or replace the current carrier application and underwriter.

## Run and verify

Open `index.html` in a browser, or serve this directory with a static web server.

```sh
npm test
npm run build
npm run test:css
npm run test:builder
npm run test:manifest
npm run test:parity
npm run test:workflows
npm run release:artifact

# The deployed wrapper, exercised two ways (the second needs Streamlit):
python3 scripts/verify-streamlit-runtime.py <staged-deploy-checkout>
python3.12 scripts/verify-streamlit-live.py <staged-deploy-checkout>   # the deployed interpreter

# The deployed app, loaded the way a visitor loads it (needs Chromium):
npm run verify:deployed
npm run verify:deployed -- --json-out deployed.json   # the same verdict, written for the alert
```

The standalone output is `dist/app.html`. The builder includes rules, state, engine and UI in that order and stamps the same release version as `index.html`. `npm run release:artifact` writes the Streamlit pair: `app_embedded.html` (the same bytes as `dist/app.html`) plus `app_embedded.manifest.json`, the sha256/size/version/builder record the deployed repository verifies before it serves anything.

The second command must be run with the deployed interpreter, not whatever `python3` happens to be: the check fails when the Python running it is not the one the deployment declares. The deployed app's interpreter is declared once, in `richardparslow-commits/health_app.py`'s `.python-version` (`3.12`): a local checkout, this repository's deploy and canary workflows (`python-version-file`), and the dev container all read or match that one file, and `verify-streamlit-live.py` fails when the interpreter running it is not the declared one. Streamlit Community Cloud is the exception it cannot be — Cloud chooses the interpreter in the app's Advanced settings and ignores version files — so the declaration is the instruction for that setting, and the deployed README says so plainly instead of implying a file controls it.

`verify-streamlit-runtime.py` proves the deployed wrapper's verification contract against a stubbed Streamlit API — a good pair is served, and a tampered artifact, a missing artifact, a missing manifest, a manifest naming another file and a manifest whose version lies are each refused. `verify-streamlit-live.py` runs the same wrapper through Streamlit's real runtime with `AppTest`, which is the only check that can see the library itself: it caught the wrapper rendering through `st.components.v1.html`, an API Streamlit removes after 2026-06-01 — a date already past — so one upgrade would have taken the deployed app down with no change here. The deployed app now renders through `st.iframe` and requires `streamlit>=1.66`.

That pin is a promise this repository cannot keep on its own: Streamlit Cloud upgrades within it, and the check above only ever runs against the pinned version. `.github/workflows/streamlit-canary.yml` therefore runs daily — and on demand, with an optional `prerelease` channel — installing the **newest** Streamlit from PyPI while deliberately ignoring the deployed ceiling, then running `verify-streamlit-live.py` against the pair `richardparslow-commits/health_app.py` serves right now. A pass is early warning that the ceiling can move; a failure is the breakage that would arrive when it does, and it means either teaching the wrapper the new API or holding the ceiling. The summary states how the installed version sits against the deployed pin, so a green run cannot be mistaken for "the deployed version passed". A green run whose installed release sits *above* the deployed ceiling does more than say so: it opens a pull request against the deployed repository that raises the ceiling and links the run, because an upgrade that is a review rather than a chore has to arrive as a diff somebody can approve. `scripts/streamlit-ceiling.js` makes that decision — the new pin is the next major above the release that was proved, the floor stays where it is — and the `propose-ceiling` job puts it on one stable branch and opens or updates a single review; a second green run for a newer release replaces the proposal instead of filing a rival. A green run inside the ceiling opens nothing, because there is no lift to review. A warranted lift that could not be proposed (no `STREAMLIT_PUSH_TOKEN`) fails that job rather than passing quietly, so the canary never reads as done when the review it owes was never opened. A red canary keeps one `streamlit-canary` issue open (commenting rather than filing duplicates) and closes it on the first passing run; a scheduled workflow is disabled after 60 days without repository activity, so the summary also reports when the previous attempt was — a long gap there is evidence the schedule was dark.

`npm run test:builder` runs the embedded builder against doctored copies of the sources, so its end-of-build guards are exercised rather than trusted: an added external script and a loader that survives the strip must both fail the build. That second case used to pass silently — the strip is anchored on the loader's comment, so an edit to the comment removed the only evidence the guard looked for.

`npm run test:css` guards the stylesheet against rules no element can match (`node scripts/css-audit.js` reports them, and the test fails when any are found). The stylesheet is inlined into every consumer of the build, so a rule whose class left with the interface it styled keeps describing behaviour the product no longer has — 441 lines of it had accumulated before Release 80. A class or id counts as referenced when it appears as a `class`/`id` value in `index.html` or as a string literal in `js/*.js`, which is where the app builds elements and looks them up. The audit refuses to run if a class name is ever assembled at runtime, because a fragment-built name would look unreferenced and the audit would delete a live rule.

The real-browser checks run in CI — `audit-checks.yml`'s `browser` job — and can be run by hand the same way:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run build
npm run test:ui
```

`HCE_BROWSER_PATH` can select an existing Chromium binary. The browser test starts and closes a temporary localhost server, exercises the actual interview controls, checks saved-state migration and mobile layout, and verifies the embedded output. Runtime deployment requires none of these testing dependencies, which is why the job installs Playwright with `--no-save` rather than adding it to this project.

Nothing here trusts a suite to run: `npm run check:workflow-coverage` fails when any `test*` script is not invoked by a workflow that a push to `main` would run, and when a file in `test/` is run by no script at all, printing which workflow covers each suite. It is not a hypothetical guard. `audit-checks.yml` was scoped to pull requests and to every branch except `main` — correct while changes to `main` arrived as pull requests, and wrong from 2026-10-10, when the last one was merged: the suite that verifies the release machinery then ran nowhere on `main`, and `test/ui.test.js` was invoked by no workflow at all, because the workflow that should have run it excluded the only branch that ships. Both are wired now, and `npm run test:coverage` (51 assertions) holds the guard to the shapes that must not pass — the branch filter that caused this, a scheduled-only invocation, a command named only in a comment, a longer script name counted for a shorter one (`npm run test:builder` standing in for `test:build`), an orphaned fixture, a repository with nothing to check, and an exception written without a reason.

## Consumers of the build

The website embeds `dist/app.html` in an iframe and the Streamlit app receives a copy on release. Both are copies, so both can drift from the sources that were reviewed:

```sh
npm run check:consumer                                        # the live tool page
node scripts/check-consumer-parity.js --consumer <file|url>    # any consumer
node scripts/check-consumer-parity.js --consumer <file> --expect-identical
```

The check compares each consumer with a fresh build and fails when they disagree on underwriting logic — `rules`, `state` or `engine` — because then the published tool is not the tool these sources describe. Presentational differences, and the adaptations a consumer is entitled to make (its own CSP, same-origin contact links, an injected accessibility shim), are reported without failing. A single missing final newline is reported as trailing whitespace rather than drift.

`--expect-identical` removes that presentational tolerance for a consumer that receives the build verbatim: the Streamlit deployment copies the artifact as built, so anything but byte identity there means it is not the reviewed build.

The website is the consumer that adapts, and the adaptations are described once, here: [`consumers/website.json`](consumers/website.json) holds a stricter CSP, its own same-origin `/contact` links, a result-page contact card, and the deliberate omission of the cross-product comparison table. The page's `scripts/embed-estimator.mjs` reads that file rather than carrying its own copy, rebuilds the embed from `dist/app.html`, refuses to write unless every anchor and count holds, and answers "does this page still match the build?" with `npm run embed:estimator:check`. Because the page's generator reads the same file, the parity check's account of the page and the page's own generator cannot describe different documents, and the site's `npm run test:embed` holds it there: nine tests, run against this file, that prove an edited declaration changes what the generator writes, that the committed page is reproducible from it byte for byte, and that a moved anchor, a wrong rewrite count, a dropped omission, a missing file and malformed JSON each stop the run instead of producing a page. The site's own repository runs that gate and those tests on every push (`.github/workflows/verify.yml`): it checks this repository out beside itself, builds `dist/app.html` — the dependency-free build is the only thing it needs — requires the committed page to reproduce from it, and only then installs the site's dependencies from its lockfile, runs its suite and builds the site the deployment serves. A second job there runs the site's browser suite, which until 2026-10-17 no workflow invoked at all: it reads the canonical URL, `og:url`, robots meta and scheduled-post 404 of the 30 pages the site promises stay indexable, and it opens the predictor and uses the tool — finding the estimator in its `srcdoc` frame, requiring the frame's release to be the one the page's stamp claims, accepting the acknowledgment gate and requiring the interview to appear. That last part is the only check that can tell a working tool from a dead one: the estimator is a single inline script, a `srcdoc` document inherits the embedding page's CSP, and a policy that blocks inline script leaves a boxed-off tool behind HTML the parity check still calls identical. `.github/workflows/e2e-production.yml` runs the same suite daily against the deployed origin, because a rendered promise is only a promise where people can read it. The embed tests fail rather than skip when the estimator is absent under CI, because nine skipped tests would report success for a page nobody compared. So a page that cannot be regenerated fails where it is edited, instead of at the next nightly parity run. It applies them to `dist/app.html` in declaration order, requires the page's document to begin with the result, and reports the difference as declared: the page's own contact card is not called invented logic any more, and nothing is suggested to be ported back from it.

Declaring them makes that comparison exact rather than tolerant, which is what the page's copy deserves: a page serving an older build now fails even when the release changed only presentation, the way a stylesheet-only release could have gone unnoticed before. Three things fail: the page is not the build plus these adaptations (so it is a different build), a release no longer carries an anchor the page's generator inserts at, rewrites or removes by (so the page cannot be regenerated from it), or the page carries something it declares omitted — the cross-product comparison table, which is exactly what the page tells applicants it does not show. The page's own render-time adapters are spliced in after the embed, so they stay the page's business and cannot turn the check into a copy of it.

A page can serve this build byte for byte and still tell a reader — and a crawler — that it is an older release. That happened here: `schema.org softwareVersion` said `78` while the page ran `80`, because it was one of two release numbers typed by hand while the generator restamped the other two. So every place the page states its release is declared in `consumers/website.json` (`releaseClaims`: the route comment, the visible footer, the FAQ sentence and the structured-data version) and checked against the build's own `HCE_VERSION`, on the committed page and on the served page. A claim that names another release, stops appearing, or appears more often than declared fails the run with the claim, both numbers and the fix: regenerate the page, don't correct the number by hand. The page's generator stamps the same claims from the same build, which is what keeps the two from drifting independently.

The copies are compared with the build daily by `.github/workflows/consumer-parity.yml`, as separate jobs so one cannot hide another's result: the live page is read from the served site through a URL carrying a fresh nonce, so the cache in front of it cannot answer with the previous deployment, and an answer that came from a cache anyway is retried and then refused rather than compared; the page also names the deployment it is, because the site's build stamps the commit it was made from into the page it serves, so the verdict reads that commit out of the bytes a visitor gets and reports `richardparslow-commits/life-policy-light@<sha>` (full SHA in `--json`) — without this repository holding a credential for the private repository the page is published from, which is what it used to need and never had, so the job spent every run reporting "no deployment read" instead of judging the page. A page that does not state which build it is fails instead, with the stamp named as the fix. The claim that the *committed* copy is this build moved back to where that copy lives: the site's own CI checks this public repository out beside it and gates the copy before it is pushed. The published Streamlit artifact in `richardparslow-commits/health_app.py` must be **byte-identical** to a fresh build *and* match the manifest it ships with, both read from a single fetched commit so a run shortly after a deploy cannot compare the previous one — and that commit is what the verdict names (`richardparslow-commits/health_app.py@642f75f`), so a green Streamlit run says which published copy it judged instead of naming only a file; and the deployed wrapper itself is exercised the way Streamlit runs it — the published pair must load and be served byte for byte, and a tampered artifact, a missing artifact, a missing manifest, a manifest that names a different file as its artifact and a manifest whose release version lies must all be refused. A red run also opens a labelled tracking issue — naming the deployment each job judged, `repo@commit`, and saying when a job read none, because "not published yet", "the copy is behind" and "the read failed" have three different fixes — and closes it on the first run where every consumer matches again, so drift cannot fail quietly. What lets the release job publish the pair those jobs then verify is a push credential on `richardparslow-commits/health_app.py`: a read/write **deploy key** scoped to that one public repository, stored here as `STREAMLIT_DEPLOY_KEY` (a PAT with Contents read/write works too, as `STREAMLIT_PUSH_TOKEN`). It is a deploy key rather than the PAT the workflow asked for because the PAT never existed: on main every run failed its own credential gate and the deployed copy could only be updated by hand, which is how the app came to serve release 80 for a day while this repository was at 82 (issue #7). Either credential is enough — the gate fails only when there is neither.

The publish is now exercised, not just described. `npm run test:publish-step` (36 assertions) reads four steps out of `deploy-streamlit.yml` with `scripts/workflow-step.js` — the `cmp` gate, the staging copy, the refusal to publish a repository that rebuilds the estimator, and the commit-and-push — and runs them against a local bare repository playing the deployed one, so what executes is the shell GitHub executes and a `git push` whose result can be inspected. It holds the release to: a fresh pair passes the gate and says what it compared; one appended byte fails it with both files named and nothing pushed; a missing judged build fails rather than reading as agreement; the staged artifact is byte-identical to the built one and the loose `index.html`/`css`/`js` an older release received are gone; a wrapper carrying `def build_app_html` is refused; the push publishes the artifact byte for byte with the manifest beside it and a commit message naming the source commit; and a second run with nothing to publish commits nothing and says so. Writing it found two things the YAML had hidden: the push step relied on `set -u` to catch a missing source commit, which bash 3.2 (macOS) does not do inside `${VAR:0:7}` while the runner's bash 5 does, so the step now states the requirement with `: "${SOURCE_SHA:?…}"`; and the same harness builds into a temporary directory rather than the checkout, so judging the release leaves the working tree alone.

The publish itself now says what it left behind. Two builds ship from one run — `app_embedded.html`, the pair that is pushed, and `dist/app.html`, the copy every check above judged — so the release job refuses to publish unless those are byte-identical, and after the push it reads `main` back from origin: the head must be the commit it just pushed, the published artifact must be byte-identical to this build, and the published manifest must describe the published artifact, checked with the manifest writer's own `--check` — the same contract the deployed wrapper enforces before it serves anything. Only then does the run summary name the live commit, and that commit is put through `verify-streamlit-runtime.py` as well, so a run that says "published" names a copy that was read back rather than the staging directory it pushed from. `npm run verify:published` runs the same read-back by hand against any checkout, and dispatching the deploy workflow with `verify_published` runs it against the deployed repository's current main from CI without pushing anything — which is how a copy synced by hand is judged while the push token does not exist. The same read-back runs daily (`07:20` UTC) with no dispatch at all: a read-back that needs somebody to ask is only evidence when somebody remembers, and while the token is unset a push run never reaches it, so a deployment could stay drifted for as long as the repository stayed quiet. The scheduled run is verify-only by construction — the job derives `VERIFY_PUBLISHED` from `github.event_name == 'schedule' || inputs.verify_published`, and the push step's clause keeps it from publishing — and it takes its own concurrency group (`…-verify`), so a daily read-back cannot cancel a release that is mid-push, nor a push cancel the read-back; `npm run test:published` is its fixture suite (56 assertions) against real bare repositories and a real build, covering the cases that decide whether a release may be called published: a matching pair, an artifact that differs by one byte, a manifest written for a different build, a repository missing the artifact, a missing local build, and a branch head that is not the commit the run pushed.

The steps that make those claims are executed too. `npm run test:publish-claim` (134 assertions) reads the read-back invocation, the credential gate and the non-main warning and the summary writer out of the same workflow and runs them against a local bare repository playing the deployed one — the remote is rewritten by git's own `url.*.insteadOf` in a config file inside the fixture, so nothing reaches the network — with a `python3` that records the runtime check it was asked to run. It holds the release to: the read-back expecting the commit `streamlit-app` was left at, writing that commit for the summary, and naming it in its verdict; a branch head that moved after the push failing the step, writing no commit and never running the runtime check on a copy this run did not push; a verify-only dispatch judging origin's current main instead; an artifact that differs from this build failing before the runtime verifier; and a runtime verifier that refuses the pair failing the step even though the read-back passed — `set -o pipefail` is what carries that failure, and removing it fails this suite. The credential gate and the warning are run for their outcomes (main with neither credential exits 1 with the instruction, naming both; a non-main run warns and passes), and the summary for its five, and each of them decided by evidence rather than by which path the run took: the read-back step now leaves `published-ok.txt` only when both of its checks finished (the pair comparison and the deployed runtime), so "Published" requires that marker *and* a commit that came back, and a commit alone — written before the runtime check — gets `Pushed, not verified` while still naming the commit origin holds. A verify-only run says "Verified, not published" only if the marker is there; otherwise it says `Not verified` and that it cannot vouch for the deployment, instead of the sentence it used to print above its own FAIL. A push with no credential at all says "Not published". Its last case runs the four steps as one run in one workdir: sync, push, read-back, summary. The other cases hand the read-back a fixture that already looks pushed; that one makes the push happen and then asks the read-back to verify it, so the claimed commit is the commit this run's own push created — the seam between "we pushed" and "we verified what is live", which no single-step case can see. Writing it also fixed the shared step reader: `readStep` only saw a step's `env:` when it came first, so the read-back's variables — which follow its `if:` — were invisible, and the harness would have asserted nothing about them. Five mutations of the workflow (a renamed `--commit-out`, a short expected commit, `set -o pipefail` removed, the summary's branch inverted, the token gate exiting 0) each fail it, with the workflow restored byte-identically (sha256). It also renders the two expressions the schedule introduced in the three events rather than matching them: the scheduled run decides verification for itself and takes the `…-verify` concurrency group, a push leaves it unset and deploys in the `…-deploy` group, a verify dispatch does the first and an ordinary dispatch the second, and a run with only the deploy key reads the deployment back and pushes with it — and it requires the schedule and its time to be there at all. It also runs a verify-only read-back with a token configured against an origin that moved after staging, because the expectation of a pushed commit is a push-run decision: requiring it there would have reported a hand sync as a build mismatch, and a scheduled run will have a token once the secret is set.

That still leaves the one thing no local harness can answer: whether GitHub itself ran the workflow the way it is described here. `npm run test:self-test` is the fixture suite behind a dispatchable workflow (`.github/workflows/self-test.yml`) that runs both workflows once in Actions — the release with `verify_published=true`, which is forbidden to push, and the whole audit suite — then reads each run's own step record back from the API and holds it to what the conditions claim: the checkout ran, the read-back ran, the token gate, the non-main warning and the push were skipped, the summary was written, and every audit step, including the condition evaluator and the coverage guard, concluded success. The receipt names both run IDs, their URLs, the commit each judged and every asserted conclusion, and is published to the run summary and kept as an artifact; a run whose push step did not skip is reported as a publish. It refuses to dispatch while a deploy is in progress, because runs in the deploy concurrency group cancel one another. The fixtures play the API with a fake `gh` that makes a run appear only after it was dispatched, and cover the run that published, a read-back that ran and judged the deployment, the skipped read-back, the failed and renamed audit steps, a run that never finishes, a rejected dispatch, a deploy already in flight and two runs on different commits. The read-back only has to have *run*: a verify-only dispatch whose read-back reports that the deployed copy is not this build is proving that the condition and checkout executed, not failing the self-test — that verdict belongs to the deployment checks, and the receipt records it as a warning. Driven for real on 2026-10-17: the first dispatch was refused because a deploy was in flight, and after the read-back/deployment boundary was corrected (and a fake-`gh` clock bug CI found in the fixtures), the final run `39056600831` on `74709ca` produced a green receipt — audit run `39056620999` succeeded with every step, including the condition evaluator and the self-test's own fixtures, and release run `39056619027` was red only at its read-back, because the deployed copy is still release 80 (238,132 bytes against this build's 245,183), with the push, gate and non-main warning skipped.

And the `if:` above each of those steps is now decided rather than matched as text. GitHub evaluates a condition before it runs any shell, so a gate naming the wrong variable, a dropped negation, or an `&&` where `||` was meant passed every harness here while the step it guards never ran — for the read-back, a green run that says nothing about what it published. `scripts/workflow-condition.js` evaluates the subset of GitHub's expression language these workflows use: `env`, `github`, `inputs`, `needs` and `steps` lookups, `==`/`!=`/`!`/`&&`/`||` and parentheses, strings with `''` escapes, numbers, booleans, null, and the four status functions — with the semantics that are easy to get wrong, because they are GitHub's: strings compare case-insensitively, a non-empty string is truthy even when it is `"false"`, null equals `""` and `false`, mixed types compare as numbers, and `&&`/`||` return an operand rather than a boolean — so the ternary idiom `${{ cond && 'yes' || 'no' }}` renders `yes`, which is what the deploy workflow's concurrency group relies on. Anything it has not been taught throws instead of being guessed at. `npm run test:condition` (131 assertions) holds it to those semantics, runs the release's conditions in eleven run shapes (a deploy key, a token, or neither — on main or another ref, as a push or a verify-only dispatch), evaluates the canary's gates (the tamper self-test, the ceiling decision, the proposal job, the token gate) and the `always()` summaries, refuses a `needs.<job>.outputs.<name>` that the named job does not declare, and requires every `if:` in every workflow to be *decided* by one of those shapes — a condition with no shape fails the suite, so a new gate cannot arrive merely parsed. It also exports `render`, the same parser substituting `${{ … }}` the way GitHub does before a shell runs; `test:publish-claim` now renders its step scripts with it in strict mode, so an expression with no value in the harness's context fails instead of reaching bash as text. Evaluating them found one: a verify-only dispatch on a non-main ref took the "push skipped for want of a token" warning even though it had asked for no push and its summary already said "Verified, not published"; the warning is the non-main half of the token gate but was missing the gate's dispatch clause. `npm run test:publish-claim` now evaluates those conditions too, instead of matching their text. Dispatching the release with `verify_published` is what the self-test does, so that input is now verify-only in fact as well as in name: the push step carries the dispatch clause even when a token is configured, and the summary answers the dispatch first rather than reporting a publish that did not happen.

Neither comparison can fall back to `raw.githubusercontent.com`, and that is enforced rather than remembered: `npm run check:workflows` fails on a read of any repository file over that host anywhere in a workflow — a `run:` line, an `env:` value — while a comment that explains the bug it came from is not a read. `npm run test:workflows` is the fixture suite behind it, and it proves the guard fires on the line the old jobs used, names the file and line, and passes on the workflows in this repository.

There is no second implementation of the build anywhere, and that is deliberate. `health_app.py` used to inline loose `index.html`, `css` and `js` assets whenever the artifact was absent, and it claimed byte-for-byte parity while joining its script blocks differently in three places; a stylesheet containing a CSS escape (`content: "\2192"`) made it fail outright through a `re.sub` replacement string; and its loader-strip guard could be defeated by editing the comment it was anchored on. Each was fixed in the copy rather than the cause. The wrapper now holds no build logic at all, and the assets it used to inline are deleted from the deployed repository.

Policy: a change to underwriting behavior is made here, with a test, and only then regenerated into a consumer. A consumer's copy is never edited to match, and a rule never originates there. Porting a rule *into* this repository after finding it only in a copy is the one exception, and it belongs in the same change that regenerates the copy.

## The deployed app

The checks above judge the bytes, not the service. On 2026-10-17 that difference was the whole problem: the URL was written down only in the deployed repository's README, no workflow had ever requested it, and it answered a browser with "Zzzz — This app has gone to sleep due to inactivity" — the sleep screen, no estimator — while every check here passed. So the deployment is declared once, in [`consumers/streamlit.json`](consumers/streamlit.json), and `npm run verify:deployed` loads it in headless Chromium as a visitor does: it recognises the sleep screen, clicks the wake control and waits for the app to come up, then finds the estimator in whichever frame Streamlit puts it (the live app nests it one frame deeper than the fixtures first assumed) and requires this build's release inside it with the acknowledgment gate and the product select. It also measures the two controls that move a visitor forward — the gate's continue button and the interview's Next — against the window, not the frame: presence is not reach, and on 2026-10-17 the frame Streamlit sets (2,400px) put Next 1,361px below the fold of a 900px window while every check called the app healthy. An error raised inside the estimator's frame fails the run; the Streamlit shell's own failed requests do not, because it makes some on every page load. A document that puts those controls at the bottom of a frame taller than the window is a finding, whether it is this app before release 82 or somebody else's embed of it.

And a document is not a tool. Everything the check looked at could be right of a copy whose script never ran: the markers are in the HTML, `HCE_VERSION` is stamped by an inline tag before the app loads, and the gate and footer are markup. On 2026-10-17 this repository's build with its interview script emptied — every marker, the version, a 746px frame, no handler on anything — passed the check outright, because the gate was in the window and nothing ever asked it to work. So when the way forward is on screen the check takes it: it ticks the acknowledgment, presses continue, and requires the interview to arrive with its step pills rendered and focus moved into it, the same two facts the website's own browser suite requires of this build in its frame. A gate that answers nothing, a continue button that never enables, and a gate closed over an empty document are each reported in their own words, so the fix is not guessed at. The interaction only happens when the gate is reachable — one a visitor cannot see is already named by the layout verdict — and it changes nothing on the deployment beyond that session's own acknowledgment, which the app keeps in `sessionStorage`.

A visitor is a slow client, so the check is generous with time and explicit about what it waited for: the verdict says whether the app was awake on arrival or had to be woken, and how long that took. It is the only check that can see the difference between "published correctly" and "served at all".

`.github/workflows/streamlit-deployed.yml` runs it every six hours and on demand, publishing the verdict to the run summary even when it fails. The schedule is not only a detection interval: a Community Cloud app suspends after a stretch without traffic, so the check is also the traffic that prevents the sleep it reports. Each run states what it found, so whether the cadence is sufficient is answered by the logs rather than assumed. `npm run test:deployed` is the fixture suite behind it — 75 assertions driving the real script against a local server that plays each state a deployment can be in: asleep and woken by the click, awake with the estimator in its frame, awake with nothing in the frame, serving another release, missing the acknowledgment gate, throwing inside the frame, a noisy shell page, bad usage, the report `--json-out` writes for the alert, the too-tall frame whose controls are below the fold (a stub, which must fail), this repository's own build served in that same geometry (which must pass, and report the eleven steps its gate led to), and the three gate states that separate a document from a tool — this build with its interview script taken out, a gate whose continue button answers nothing, and a continue button that never enables. It runs in `audit-checks.yml`'s browser job on every branch, which is also where it gets its browser.

A red run reports itself. The workflow's `alert` job keeps one `deployed-app-drift` issue open while the check is red, comments on it while it stays red, and comments on and closes it with the first run that passes. The issue quotes the verdict — the state the app was in and the problem the check named, e.g. `the frame runs release "80", this repository is release "81"` — rather than pointing at a run URL, because the fixes differ: a sleeping app is woken by the check and passes, an app on another release has to be republished, and a browser that never installed needs neither. It therefore reads the check's own report (`--json-out`) instead of its prose, and a run that ended without a verdict opens an issue that says the app was not judged and claims nothing about it; a cancelled or skipped run changes nothing at all. `scripts/deployed-app-alert.js` decides and writes; `npm run test:deployed-alert` (93 assertions) covers every state, the text of each, the `$GITHUB_OUTPUT` encoding, and the workflow wiring.

That wiring is text, and the step is a shell that has to run: a `gh` call with an empty variable, a body passed as an argument instead of a file, or a loop that closes only the first issue would pass a test that reads the YAML. So `npm run test:alert-step` (59 assertions) reads the alert step's own `env:` and `run: |` out of the workflow and executes it with a `gh` on `PATH` that records every call and answers as GitHub does — then holds the calls to account in each state a run can be in: red with nothing open files one labelled issue whose body names the app and the problem, red with an issue open comments on it and files no second, green comments on and closes every open one, green with nothing open makes no issue calls, and a cancelled or skipped run makes none at all. The interface is read from the code rather than remembered: the variables the step passes are the ones `scripts/deployed-app-alert.js` reads (a new read the workflow does not feed fails here by name, with `REPORT_FILE` — the one the other job's `--outputs` mode reads — proven to be that by running it), no key the step passes is dead, and the four values the issue quotes are wired to the outputs that produce them, because the harness supplies its own values and could not otherwise see `STATE` pointing at `outputs.outcome`. Each passed variable is also asserted where a reader meets it — the owner mention, the run URL, the commit, the trigger and the app's state in the body — so a key that stops being passed fails as text, not as a missing line in a list. Four mutations were caught while this was written — `$issue` misspelled as `$id` (which `set -u` turns into a dead step), `--body-file` weakened to `--body`, a new `env("TIER")` read the workflow never feeds, and `STATE` wired to the wrong output — where the text assertions and a hand-written key list had accepted all four.

## Interview and outcomes

The interview records birth date, selected product/route/state/term/amount, residency and visa details, travel destinations and dates, all tobacco products, weight changes and dated readings, individual driving and criminal events, medical diagnoses and treatment, current/past prescriptions with indications and fill dates, and biological family diagnoses and causes/ages of death.

Answers begin unanswered. “No” must be selected explicitly. Complete-history confirmations are separate from negative answers. An unknown, inconsistent or unmodeled fact withholds a final class. Old drafts preserve entered facts but must be reconfirmed; unchecked boxes and mild/good-control defaults are not imported as negative evidence. Product selection persists instead of reverting to Banner.

The result separates:

- Product eligibility and published exclusion screens.
- Health class, tobacco basis and any published build table component.
- Flat-extra consideration and benefit design.
- Missing evidence, review reasons and the source edition/physical PDF pages.

A published exclusion means the disclosed facts fail that product's screen, not that a carrier has issued a formal declination or that every product is unavailable. Known exclusions still govern when unrelated information is missing. A review result clears the final health class and benefit tier. Ranges never begin at an unsupported favorable class. Comparisons include only the same coverage type and underwriting route, in carrier order, with no “best offer” ranking.

## Source scope and limitations

`js/rules.js` contains document IDs, edition labels, file hashes where local PDFs were supplied, physical PDF page references, rule tables and product scope. Source documents are not bundled or republished. The original corpus was reviewed October 8, 2026, with the Eagle Select and legacy-product reconciliation updated October 9, 2026; this is not certification that every edition or product is currently available.

Class criteria are modeled for Banner OPTerm, Foresters medically underwritten Your Term and Advantage Plus II, United of Omaha's fully underwritten base-life criteria, Transamerica Trendsetter Super, F&G Quantum's criteria and selected Corebridge SimpliNow Legacy benefit screens. Exact MOO term/permanent plan eligibility and riders still require confirmation. Quantum's age basis is not established in the supplied material, so its final class is withheld for carrier review. Term length, amount and tobacco-specific age limits apply where product specifications establish them.

BeyondTerm and BeyondTermflex keep the September 2026 chart separate from March OPTerm. Release 73 corrects their discretionary weight-loss handling: valid intentional loss within the last 12 calendar months can produce a possible half-loss add-back for carrier review, while current weight/BMI remain recorded separately. An optional adjustment alone cannot trigger a Flex BMI decline or establish a build ceiling/level. Older or invalid dates do not receive the adjustment. OPTerm and Foresters retain their separate adjustment rules. Release 72 adds BeyondTermflex’s August 2026 age-based coverage maximums and 10/15/20/25-year term limits. These are outer eligibility screens; Level 1-dependent requests and unknown age-basis boundaries require review, and BMI alone never establishes the actual Flex level. Their verified build/exclusion screens are available, but the complete class/level decision remains a review route. Foresters non-medical, SMART UL, MOO Express, F&G Pathsetter, QSFP/American Amicable, SBLI, Royal and UHL profiles apply verified screens without inventing a final class. UHL's implemented application is Texas-specific and distinguishes Simple Term 20 DLX Part A from other term plans' Part B. Release 71 screens only the verified outer age and face-amount limits for Americo Eagle Select using the March 2026 reference sheet and January 2026 agent guide. Eagle Select 1/2/3 selection, nicotine treatment, Quit Smoking Advantage, medical exclusions and benefit tiers remain under carrier review. The legacy QTP selection is retained without automatically migrating saved answers to BeyondTerm; Quility’s current naming reference and the historical 2024 guide establish identity, not current underwriting criteria. National Life needs an exact plan and issuing company; John Hancock needs a current Simple Term with Vitality application and underwriting guide. Their current overview pages provide product references only. Of 24 profiles, 7 contain class/benefit criteria, 14 are partial and 3 remain unverified; a criteria label does not guarantee an estimated outcome.

Disclosed conditions beyond explicitly modeled screens go to review. This includes mild conditions where the source requires clinical detail not yet modeled. Prescription names never create a diagnosis or unconditional decline. QSFP's implemented anticoagulant exclusion requires the published indication and fill window; Corebridge AF uses chronic-diagnosis and daily-treatment answers. Medical combinations, exceptional family-history credits and possible underwriting credits require a carrier decision.

No static country tiers are guessed. Foreign travel/residence and immigration exceptions require current carrier checks. Generic VA-disability percentage and combat-history class caps were removed; actual hazardous deployment and the underlying conditions are considered separately.

Two conservative evidence policies are tool safeguards, not claimed carrier thresholds: readings older than a year require updated evidence; low build without a reconciled lower boundary requires review. Printed chart overlaps/gaps and uncertain fractional-height rounding are never silently resolved. MOO's `+25` table notation means percentage rating, not added pounds.

## Privacy and maintenance

Answers autosave only to this browser's local storage. No answers are sent to carriers or other services. Anyone with access to the same browser profile may see the draft. Delete saved answers from the result page or clear this site's browser data. The acknowledgment explains the actual storage behavior; its acceptance record can be printed.

`js/state.js` defines the versioned interview and migration. `js/engine.js` accepts `Engine.run(productId, interview, { asOf: 'YYYY-MM-DD' })`; omitting `asOf` uses today's UTC date. Date windows use calendar anniversaries; future/invalid event dates require clarification. Rules are deeply frozen and age adjustments cannot mutate a chart used by another applicant.

Update source identity, product scope, questions and source-derived boundary tests together. Do not promote a partial profile to class estimation until its application, eligibility and class rules are reconciled. The former 991 assertions tested legacy behavior, including audited inaccuracies; the new suite replaces those assumptions with source-derived scenarios and browser flows. Git history retains the legacy implementation and tests.

The existing main-branch workflow tests/builds before syncing the Streamlit repository. Pull-request checks verify the source and build without deployment. Review the change before merging: a main-branch push can trigger the configured deployment workflow.


Release 74 adds separately scoped BeyondTermflex medical screens from D077 physical pages 7, 8, 10 and 11. New condition questions record asthma counts/restrictions, diabetes follow-up/control/kidney complications, cancer dates/spread/treatment and confirmed cardiomyopathy. AF and pending-apnea conflicts require explicit review. BeyondTerm does not inherit the Flex-only exclusions; its unverified tobacco lookbacks no longer assign a class ceiling. Both profiles remain partial.

Release 75 adds selected Eagle Select medical exclusion screens from the January 2026 guide, dated twelve-month care history, its initial 24-month nicotine definition and the March 2026 build chart. Generic pending care and unspecified nicotine products remain review cases. Quit Smoking Advantage is separate from initial nicotine classification. No class/tier is inferred; Americo remains partial.


Release 76 corrects American Amicable QSFP to final-expense whole life. It no longer requires a term or appears among term-product comparisons. Published family age/maximum-face/New York limits are recorded; the July/October 2026 minimum-face conflict stays under review. Amount-dependent classes, current application/rating rules and age basis remain unconfirmed, and no class or tier is assigned.

Release 77 adds EasyTrak's $100,000 minimum, $1,000 increments, age-based maximums and complete 10/15/20/30-year term screens using age nearest birthday. Income multiples and mortgage-only 1.5x quoting limits produce financial review; undefined income bases are never invented for nonworking applicants. New quote-income and mortgage answers start unanswered in saved drafts. The supplied replacement guides conflict, so replacement requests now require review instead of an unconditional exclusion. NY remains unavailable. The EasyTrak profile stays partial and never assigns a final class.

EasyTrak nicotine history retains a disclosed basis for consistent never use or current nicotine use, without a health-class ceiling. Past use needs the current application; no generic twelve-month cutoff or mapping of Elite/Select to Preferred Plus is assumed.


## Release 78 — documented limits and remaining evidence

Seven partial profiles now screen additional documented product limits: Foresters
Strong Foundation and SMART UL medical, MOO Term Life Express and IUL Express,
F&G Pathsetter, and the two Texas UHL term routes. The UHL other-term route now
requires an explicit Simple Term 20 / 30 / 20 ROP plan; old saved records do not
infer a plan. Invalid existing Foresters coverage cannot reduce the total.

The April 2026 Foresters underwriting guide resolves the older product-table
overlap at age 55: the lower non-medical coverage band starts at age 56.
Strong Foundation's male tobacco term ages are applied separately. Pathsetter's
$500,000 maximum premium is not a face-amount cap. Texas application limits
are not treated as exclusions for other states. Current source metadata records
the physical PDF pages, editions, official URLs and hashes.

Validation: 2,426 engine assertions (259 added), plus standalone build, version,
asset, single-engine and script-order checks. All 14 partial and three unverified
profiles continue to withhold final health classes and benefit tiers. Missing
application editions, medical/rating combinations, tobacco definitions and
state-specific evidence remain genuine blockers to complete underwriting rules.
National Life needs an exact product and issuing company. John Hancock's general
field guide excludes Simple Term; it cannot supply the missing Simple Term rules.
The legacy QTP identifier must be reconfirmed before choosing BeyondTerm.

### Quantum coverage-limit follow-up

The carrier-hosted ADV4682 Quantum At-a-Glance, revision September 2026
(26-47554), physical page 1, confirms a $500,000 maximum at issue ages 0–17
and $1,000,000 at ages 18–60, with a $50,000 minimum. The juvenile cap is
now screened separately. Because issue-age basis remains unresolved, a
17/18 boundary uses the more permissive supported cap for the outer exclusion
screen and continues to require carrier review; it cannot produce a final class.
Juvenile application and growth-chart rules remain separate from adult classes.
The source PDF is recorded by official URL and SHA-256. No other profile's
face-limit or age logic changed.

### Quantum New York source conflict

Quantum's ADV5691 July 2025 guide, physical page 4, lists all 50 states.
Its ADV4682 September 2026 product sheet, physical page 4, identifies the
issuing company as operating outside New York. A New York answer now raises
an explicit source-conflict review with that citation. Carrier confirmation
of current Quantum availability and the issuing company remains required.
This guard independently withholds a final class even if issue-age basis is
later reconciled. It does not infer a new state exclusion or affect other
products' verified state rules. The Quantum source list now includes page 4;
its coverage-limit findings still cite page 1.


### Mutual of Omaha simplified-issue driving review

Term Life Express and IUL Express no longer turn a generic recent DUI/DWI event
into an automatic exclusion. The April 2026 United of Omaha simplified-issue
guide (618352_0426), physical page 7, refers to convictions and explicitly makes
the applicable timeframes dependent on the state's application. The interview
currently records a combined conviction/event date; it does not verify an
application edition or conviction outcome. These cases now require those facts
and carrier/application review, with the current guide citation. The official
carrier copy is byte-identical to the owner's Desktop copy.

The older D295 guide remains archived in source metadata. These two active
profiles cite M-SI-2026 for their simplified-issue guide. SBLI EasyTrak's separate
five-year screen and every other product's driving logic are unchanged. The
MOO profiles remain partial, without final classes or benefit tiers; independent
published product age/amount exclusions still govern. Existing draft fields and
migration are unchanged. No state-specific period or favorable class is guessed.

Nicotine evidence consistency: every product now withholds the tobacco basis and nicotine class ceiling for malformed, incomplete or contradictory histories, invalid/future last-use dates, current-use/date conflicts and positive cotinine conflicts. Complete consistent histories still use the existing product definitions, lookbacks and exceptions. Independent product exclusions remain in force.

Vital evidence consistency: blood-pressure and cholesterol component limits are withheld for invalid, future, stale or missing dates/readings, unconfirmed treatment/control or basis, required-average mismatches, contradictory values, treatment/history conflicts and uncontrolled blood pressure. Foresters tobacco-specific limits also require a known tobacco basis. Existing limits and independent exclusions remain unchanged.

History evidence consistency: modeled family/driving class limits and joint class support require explicit, complete, internally consistent histories. Diagnosis after death, driving before birth, impossible speeding details, invalid relative labels and contradictory same-person records require reconciliation. Independently verified product exclusions remain in force; carrier criteria, lookbacks and profile completeness are unchanged.

Build limits now require confirmed measurements and a complete, consistent weight-change history. Invalid dates, direction/cause conflicts and Foresters stability dates before the reported change withhold build class/table/benefit components. Current measurements remain recorded evidence; independent known upper-BMI exclusions and valid carrier adjustments are preserved. No carrier criteria, source editions or fields changed.

Criminal timing screens use only affirmative sentence answers and valid active completion dates. Hidden retained dates after No/Unsure are inactive. Conflicting case/birth/conviction/release dates require reconciliation before their timing screen; independently known current-status, conviction and product exclusions remain supported. No carrier periods, sources or applicant fields changed.


### Release 78 synchronization follow-up

The canonical source and Streamlit distribution now include the verified
Release 78 follow-ups: immediate Review completeness refresh; Quantum juvenile
coverage and New York source-conflict guards; Mutual of Omaha simplified-issue
driving/application review; and complete, consistent nicotine, vitals, family,
driving, build/weight and criminal-date evidence prerequisites. The cumulative
source-derived suite contains 10,260 assertions. The 24 profiles remain seven
with class/benefit criteria, 14 partial and three unverified.

The standalone acknowledgment and footer broker links open the current contact
page directly. They send no estimator answers. Website-specific iframe sizing,
parent navigation adapters, Contact/Concierge APIs and mail delivery live in the
separate website project, rather than this dependency-free estimator.

This is a Release 78 follow-up, and the website copy carried the same engine,
rules, state and UI modules at the time. Streamlit uses a rebuilt single-file artifact; uploading
only separate source assets is insufficient. Automatic cross-repository sync
still depends on the existing workflow's configured token. No credential is
created by this release.

## Release 82 — the frame is not the window

`health_app.py` embeds this app at `st.iframe(..., height=2400)`: a 2,400px-tall frame
inside whatever window the visitor has. Everything the app positioned against the
viewport landed at the bottom of that frame — a document nobody sees the whole of — and
on 2026-10-17 the deployed app answered `the interview's Next button is at 2261px —
1361px below the fold` of a 900px window (with the gate's continue button at 1,695px
before Release 81's gate fix). The way forward existed only at the end of a scroll of
the page around the frame, past a screenful of empty space.

The app now measures the window it is actually shown in — the embedding window's height
minus the frame's own offset where a same-origin frame can read it, a plausible 800px
where it cannot — and when the frame is framed *and* taller than any plausible window it
becomes the window-shaped panel the embedder should have made: it takes the top of the
frame at the height that is visible, scrolls inside itself, and keeps Back / Save draft /
Next at the panel's bottom edge, with the gate capped to the same band and a step change
returning the panel to the top. A 746px website frame, a phone, an iPad and a browser tab
are window-shaped and never take that path, so nothing about them changes; the two
details that made this work are that the scroller has to be the body with the root's own
overflow taken out of the picture (a body overflow alone is propagated to the frame and
never scrolls) and that the footer is sticky rather than fixed, so a question
taller than the panel scrolls under it instead of being covered by it forever.

Measured in Chromium against the built artifact in the deployed geometry — a 2,400px
frame in a 900px window — the continue button is at 592px and Next at 753px, both inside
the window, where before the fix Next was at 2,261px. The panel is 892px tall there with
1,857px of content, which scrolls inside it, and the footer stays at the panel's bottom
edge while it does. `npm run test:ui` asserts this from inside the frame in that
geometry, and `npm run test:deployed` serves the real build in the same geometry and
requires the deployed check to pass it — with the stub that still positions its controls
against the frame required to fail, so the criterion did not move. **No underwriting,
rules, state, engine or interview behaviour changed**: the footer's ids, the gate's
`hce_ack_v2` flag and the printable acknowledgment record are untouched.

## Release 81 — the acknowledgment gate fits the frame that shows it

The predictor page embeds this estimator in an iframe whose height it fixes, and the
gate was 2,103px tall inside a 746px frame on a phone: a visitor met a wall of legal
text and no button, and the only way forward was scrolling a fixed overlay that gave
no sign it scrolled. The card is now sized to the frame and only the acknowledgment
text moves; the checkbox, the continue button and the hint are an action row that
stays on screen at every height the page allows. Below 560px of frame height — a
landscape phone is 420 — the card scrolls as one and the action row sticks to its
bottom edge, so the text stays reachable instead of being squeezed out of the card.
The printable record drops that row with the rest of the controls.

Measured in Chromium, the continue button is on screen without scrolling and the card
sits inside the frame at 390×844, 390×480, 390×420 and 1280×900. `npm run test:ui`
asserts it at a desktop, a phone and a landscape phone, and the site's browser suite
asserts it inside the embedded frame at the two phone heights. **No underwriting,
rules, state, engine or interview behaviour changed**: the gate's wording, ids and the
`hce_ack_v2` session flag are untouched, so an already-accepted session stays accepted
and the Streamlit copy behaves as before once it is re-synced to this release.

## Release 80 — unreachable stylesheet rules removed

`css/styles.css` carried 441 lines that no element could match. The cross-carrier
comparison table (`compare-*`, `tag-*`, `#btn-compare`) described a comparison view
the results section no longer renders. The `#print-sheet` and `#ack-sheet` system —
including `body.print-compare` and `body.print-ack`, which nothing ever set — was
replaced by the popup window `printAck()` opens, so its one-page sheets could never
appear. The rest was the interface before the edition-specific interview: the
carrier panel and its eligibility grid, the checkbox condition picker, the class
range strip and gate boxes, the acknowledgement flag pills, and the evidence/note
presentation helpers. `.klass-chip`, `.btn-print`, `.step-num` and `.no-print` were
in the same position: referenced nowhere, or only ever as part of a longer name
(`btn-print-ack`).

The stylesheet is 464 lines instead of 905 and the standalone build is 238,132
bytes instead of 253,914 (Release 80 identifies these bytes). **No underwriting,
rules, state, engine or interview behaviour changed**, and no applicant-visible
rendering changed either: both builds were rendered in a browser and the computed
style of every element — 341 at the acknowledgment gate, 279 on the medical-history
step and 201 on the results view, across some 44 properties each — hashes identically
before and after. The remaining `.no-print` name was dropped from the print-hide
selector list rather than deleting that rule, which is still live.

`scripts/css-audit.js` now answers this question for the whole sheet, with
`npm run test:css` failing on any rule no element can match and the release workflow
running it before it publishes anything. Both fixes are needed together: the audit
is what makes the removal verifiable, and the removal is what makes the audit able
to run without an exception list. The Streamlit copy is re-synced to Release 80, and
so is the website: its page generates that embed from this build rather than
pasting one, and the live page serves `HCE_VERSION` 80 — verified 2026-10-17 by
fetching the page and comparing the document it delivers with the page's own copy
(sha256 `3f25dbc0…`). The page's FAQ named release 78 until that day, which is what
the earlier "the website is behind" note was reading; the embed had been 80 since
its own release. A push to the website project reaches the live page with no
separate publish step — measured at about 90 seconds.
