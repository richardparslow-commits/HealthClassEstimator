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
npm run release:artifact
```

The standalone output is `dist/app.html`. The builder includes rules, state, engine and UI in that order and stamps the same release version as `index.html`. `npm run release:artifact` writes the Streamlit pair: `app_embedded.html` (the same bytes as `dist/app.html`) plus `app_embedded.manifest.json`, the sha256/size/version/builder record the deployed repository verifies before it serves anything.

`npm run test:builder` runs the embedded builder against doctored copies of the sources, so its end-of-build guards are exercised rather than trusted: an added external script and a loader that survives the strip must both fail the build. That second case used to pass silently — the strip is anchored on the loader's comment, so an edit to the comment removed the only evidence the guard looked for.

`npm run test:css` guards the stylesheet against rules no element can match (`node scripts/css-audit.js` reports them, and the test fails when any are found). The stylesheet is inlined into every consumer of the build, so a rule whose class left with the interface it styled keeps describing behaviour the product no longer has — 441 lines of it had accumulated before Release 80. A class or id counts as referenced when it appears as a `class`/`id` value in `index.html` or as a string literal in `js/*.js`, which is where the app builds elements and looks them up. The audit refuses to run if a class name is ever assembled at runtime, because a fragment-built name would look unreferenced and the audit would delete a live rule.

Optional real-browser checks require Playwright and its Chromium browser:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run build
npm run test:ui
```

`HCE_BROWSER_PATH` can select an existing Chromium binary. The browser test starts and closes a temporary localhost server, exercises the actual interview controls, checks saved-state migration and mobile layout, and verifies the embedded output. Runtime deployment requires none of these testing dependencies.

## Consumers of the build

The website embeds `dist/app.html` in an iframe and the Streamlit app receives a copy on release. Both are copies, so both can drift from the sources that were reviewed:

```sh
npm run check:consumer                                        # the live tool page
node scripts/check-consumer-parity.js --consumer <file|url>    # any consumer
node scripts/check-consumer-parity.js --consumer <file> --expect-identical
```

The check compares each consumer with a fresh build and fails when they disagree on underwriting logic — `rules`, `state` or `engine` — because then the published tool is not the tool these sources describe. Presentational differences, and the adaptations a consumer is entitled to make (its own CSP, same-origin contact links, an injected accessibility shim), are reported without failing. A single missing final newline is reported as trailing whitespace rather than drift.

`--expect-identical` removes that presentational tolerance for a consumer that receives the build verbatim: the Streamlit deployment copies the artifact as built, so anything but byte identity there means it is not the reviewed build.

The copies are compared with the build daily by `.github/workflows/consumer-parity.yml`, as separate jobs so one cannot hide another's result: the live page is read from the served site; the published Streamlit artifact in `richardparslow-commits/health_app.py` must be **byte-identical** to a fresh build *and* match the manifest it ships with; and the deployed wrapper itself is exercised the way Streamlit runs it — the published pair must load and be served byte for byte, and a tampered artifact, a missing artifact, a missing manifest and a manifest whose release version lies must all be refused. A red run also opens a labelled tracking issue, and closes it on the first run where every consumer matches again, so drift cannot fail quietly. `STREAMLIT_PUSH_TOKEN` is what lets the release job publish the pair those jobs then verify.

There is no second implementation of the build anywhere, and that is deliberate. `health_app.py` used to inline loose `index.html`, `css` and `js` assets whenever the artifact was absent, and it claimed byte-for-byte parity while joining its script blocks differently in three places; a stylesheet containing a CSS escape (`content: "\2192"`) made it fail outright through a `re.sub` replacement string; and its loader-strip guard could be defeated by editing the comment it was anchored on. Each was fixed in the copy rather than the cause. The wrapper now holds no build logic at all, and the assets it used to inline are deleted from the deployed repository.

Policy: a change to underwriting behavior is made here, with a test, and only then regenerated into a consumer. A consumer's copy is never edited to match, and a rule never originates there. Porting a rule *into* this repository after finding it only in a copy is the one exception, and it belongs in the same change that regenerates the copy.

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

This is a Release 78 follow-up, matching the current website's engine, rules,
state and UI modules. Streamlit uses a rebuilt single-file artifact; uploading
only separate source assets is insufficient. Automatic cross-repository sync
still depends on the existing workflow's configured token. No credential is
created by this release.

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
to run without an exception list. The Streamlit copy is re-synced to Release 80; the
website copy is republished from Lovable, which remains the outstanding step for
Release 79's engine as well.
