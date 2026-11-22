# Release 90 — deduplicated underwriting intake

## Source review and limits

This revision draws question patterns from 36 underwriting-guide PDFs in the supplied ZIP and three example application PDFs (39 source PDFs; 933 pages total). The example applications contain completed applicants' personal information. **None of their filled-in values, identifiers, signatures, or application images were copied into source code or test fixtures.** The guide editions and sample application forms are reference material, not a statement of current carrier approval rules.

The question set is deliberately **carrier-, product-, and underwriting-route-neutral**. It is a history and disclosure intake, not an insurer application, health-class determination, eligibility recommendation, price quote, underwriting rule, or policy-design selection.

## Eleven sections

1. Proposed Insured Information, Citizenship & Foreign Travel
2. Occupation, Income, Military Service & Financial History
3. Existing Insurance, Replacement & Recent Applications
4. Tobacco & Nicotine Use
5. Health & Medical History
6. Mental Health History
7. Family Medical History
8. Personal History — Alcohol & Substance Use
9. Personal History — Driving Record (MVR)
10. Personal History — Criminal & Legal History
11. Personal History — Aviation & Hazardous Avocations

The canonical questions are in `js/intake-questions.js` and are rendered by `js/app.js`. The main question keys are unique across sections; repeated lists hold one record per event, condition, trip, prescription, relative, or activity. Branch questions are shown only when applicable. The question registry contains 141 unique top-level prompts and 125 potential follow-up fields across repeatable record types; neither number is a guaranteed per-applicant question count.

**Deduplication:** A date and complete record are collected once for each underlying fact. The last nicotine-use date can support 12-/36-month and five-year review windows; diagnoses and treatments support 2-/3-/5-/7-/10-year history review; alcohol/drug history, traffic incidents and criminal dispositions are likewise dated once. Review windows are informational; the neutral profile does not apply carrier-specific accept/reject logic.

**Private identifier exclusions:** The interface must never request Social Security numbers, bank or routing numbers, tax ID numbers, driver's license numbers, passport/visa/immigration ID numbers, policy numbers, case/docket/citation numbers, or government ID images. The archive/applications may contain such information; it is out of scope. Names and optional contact details explicitly requested by the questionnaire are personal data, and health answers are sensitive: the existing acknowledgment warns that the draft stays in the local browser storage and can be read by anyone who has access to the browser profile. Nothing sends the answers to an insurer, broker or backend.

**Mental health safety:** A positive answer to the current self-harm question displays an immediate 911/988 support message and is flagged in the neutral summary; the app does not monitor responses or summon help automatically.

**Saved drafts:** Legacy carrier/product choices are stripped by the existing schema migrator. Earlier mental diagnoses entered in the combined medical list are moved into the separate mental health section, retained for confirmation rather than silently discarded.

## Verification

```sh
npm test
npm run build
npm run test:ui
npm run test:css
npm run test:builder
npm run check:workflow-coverage
npm run test:manifest
npm run soak -- --cycles 12 --workers 2 --seed 20261122
```

Browser checks cover condition-sensitive follow-ups, citizenship, medical care, driving, self-harm support, consent, saved-state migration, privacy exclusions, and carrier neutrality. Never incorporate example applicants' completed answers into fixtures or logs.

## Future maintenance

Keep the eleven titles, unique top-level question IDs, semantic nonduplication, branch gating, current-documentation safety language, and the no-identifiers constraint. A new carrier guide can add generally applicable question concepts, but not an insurer selection menu, hidden default carrier, carrier-specific eligibility conclusion or a copied insurer-specific proprietary scoring table. Reviewers should verify source editions and regulatory requirements before using any disclosure as an official insurance application.
