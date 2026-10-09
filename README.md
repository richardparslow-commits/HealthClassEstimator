# HealthClassEstimator

Life-insurance pre-underwriting screening with explicit carrier, product and underwriting route selection. Version 69 replaces the shared carrier ladder with source-edition rules and dated histories. The browser runtime remains dependency-free JavaScript.

The result is preliminary. It does not quote a price, issue insurance, confirm product availability or replace the current carrier application and underwriter.

## Run and verify

Open `index.html` in a browser, or serve this directory with a static web server.

```sh
npm test
npm run build
node scripts/build-embedded.js app_embedded.html
```

The standalone output is `dist/app.html`. The builder includes rules, state, engine and UI in that order and stamps the same release version as `index.html`.

Optional real-browser checks require Playwright and its Chromium browser:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run build
npm run test:ui
```

`HCE_BROWSER_PATH` can select an existing Chromium binary. The browser test starts and closes a temporary localhost server, exercises the actual interview controls, checks saved-state migration and mobile layout, and verifies the embedded output. Runtime deployment requires none of these testing dependencies.

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
