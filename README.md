# HealthClassEstimator

A **life-insurance pre-underwriting and case-triage tool** for producers. It organizes information from an
applicant interview into a carrier-specific master-outcome chart so a producer can estimate the most plausible
underwriting lane *before* submitting a formal application: preferred non-tobacco, standard non-tobacco,
tobacco, table-rated, flat extra, postpone, or specialist/pre-screen review.

> ⚠️ This is **not** a medical diagnostic tool. It does **not** issue insurance, bind coverage, or replace a
> carrier underwriter's decision. Every estimate is **preliminary and non-binding**, based only on disclosed
> information.

## Quick start

No build step, no dependencies — plain HTML/CSS/JavaScript.

- **Double-click `index.html`** to open it in a browser (works offline, from the desktop).
- Or serve the folder: `python3 -m http.server 8000` then open `http://localhost:8000`.

Answers are saved automatically to the browser's localStorage; **Save draft** persists the current state.
**Run estimate** produces the case-triage page, which can be printed or saved as PDF. The app is not tied to a
single carrier: the results page **defaults to the all-carrier comparison** — the same profile run through every
carrier ruleset side by side, showing the client's possible health class under each carrier (class, limiting
factors/gates, evidence highlights, financial outcome), with the primary carrier highlighted. Clicking any row
switches the full estimate below to that carrier. The **Compare / hide** button collapses the table to just the
primary carrier's full estimate. The comparison header carries a **Contact your broker advocate** CTA linking to
https://lifeinsurancebrokeradvocate.com/contact. **Print comparison** renders a dedicated one-page sheet (compact profile header +
the comparison table + guardrails) that prints on its own, distinct from the full results **Print / save PDF**
layout.

## The interview

The wizard mirrors what a real carrier application asks, organized into 12 steps:

1. **Applicant** — carrier (Banner Life, Foresters, Transamerica, Mutual of Omaha, F&G Quantum, F&G Pathsetter, or National Life Group), age, sex, state, occupation, hazardous duties, plus aviation exposure, hazardous sports, and frequent foreign travel (aviation/sports feed the hazardous-avocation lane; travel is an evidence/review note)
2. **Coverage & financial** — face amount, purpose, earned income, total in-force, replacement, premium source, coverage ownership, premium payor (evaluated: income multipliers, carrier total-line caps, replacement rules, purpose-driven evidence, third-party/financed-payor review and accelerated-UW exclusion)
3. **Tobacco & nicotine** — product (cigarettes, vaping/e-cigarettes, chewing tobacco/snuff, cigars, nicotine substitutes), last-use date, frequency, per-product amount (cigarettes per day feeds Foresters Tobacco Plus ≤1 pack/day; heavier use → Standard Tobacco), cigar exception
4. **Build** — height, weight, weight-change history (intentional vs. unexplained)
5. **Vitals & labs** — blood pressure (readings only — carriers evaluate with or without treatment), total/HDL cholesterol, A1c
6. **Driving & criminal** — moving violations, DUI/reckless/suspension, criminal status, **current and past probation/parole** (current → decline screen where the carrier publishes one; past → review flag), bankruptcy
7. **Alcohol & substances** — alcohol, non-marijuana drugs, recovery duration, marijuana (rated separately from tobacco; daily-use declines per F&G/National Life)
8. **Medical history** — condition picker with per-condition detail (status, severity, control, medications,
   onset, complications, stability, postpone/decline concerns)
9. **Medications & prescriptions** — current prescription list, cross-checked against disclosed conditions
   and each carrier's APS triggers
10. **Family history** — early cardiovascular death in parents/siblings
11. **Function & ADLs** — living setting, mobility, ADL assistance, home-health/hospice
12. **Pending care** — pending tests/referrals, recent hospitalization/surgery, uninvestigated symptoms

## How the estimate works

The engine follows a **gate-first, then least-favorable-wins** approach (per the build spec in
*Start with a carrier-specific model.pdf*):

1. **Gate screen first.** Pending tests, recent hospitalization/surgery, active uninvestigated symptoms,
   unstable or recent-onset serious conditions, facility/hospice care, ADL dependence, active substance abuse,
   and other postpone/decline triggers are resolved **before** any class is assigned. A missing outcome can
   matter more than the known history. Gate lists are deduplicated per condition — a condition's published
   decline text and its auto-decline trigger are the same screen and appear once.
2. **Best class per domain.** Tobacco/nicotine lookback, build (carrier height/weight chart), blood pressure,
   cholesterol/HDL ratio, driving history, family history, medical ceilings, substance history, and functional
   status are each scored independently. BMI is a *screening flag only* — the carrier chart is the binding rule.
3. **Least favorable factor wins.** The worst supported domain sets the provisional class. A preferred build
   never overrides a Standard medical ceiling.
4. **Credits are shown, not applied.** Only carriers that publish a credit rule surface one: Banner's
   one-class credit (build / BP / family history / cholesterol) is flagged as a "possible credit review"
   requiring 3 of 7 credit criteria — never auto-applied. Foresters and Transamerica publish no such credit,
   so none is shown for them. Mutual of Omaha's **Fit program** (up to 2 *table* credits: 3 characteristics =
   1 credit, 5 = 2 credits, best final class Standard) is different in kind — it improves table ratings, not
   health classes — so it is surfaced as a guide note, never auto-applied.
5. **Confidence and flags.** Confidence reflects evidence completeness — and skipped questions are
   treated as missing, never as the best answer. Tobacco & nicotine is a required question (the estimate
   cannot run without it); family history, pending care, functional status, driving violations, substance
   history, and hazardous-occupation status all start unanswered and count against confidence until
   explicitly answered, showing as "Not provided" in the domain table rather than silently assuming
   "none"/"no"/zero. A build that cannot be evaluated (height/weight outside the
   carrier chart) ranks as `manual_review` — above any estimable class but never overriding a
   decline or postpone gate outcome, which always win. Flags include `needs_aps`,
   `needs_exam`, `likely_table`, `possible_decline`, `manual_review`, `missing_material_data`,
   `financial_review`, and `undisclosed_meds`.
6. **Medication cross-check.** Disclosed prescriptions are matched against a reference dictionary of
   generic/brand names and each carrier's APS-trigger conditions. A medication suggesting a condition the
   applicant did not disclose raises `undisclosed_meds` and an APS line — advisory, never a diagnosis; the
   carrier's prescription-history check will surface the same fact at underwriting.
7. **Comorbidity interaction check.** Combinations such as diabetes + CAD/kidney disease, CKD + hypertension,
   or mental health + alcohol abuse are flagged as materially different from an isolated diagnosis.

The results page shows the preliminary class, a likely range, the limiting factors, the full domain breakdown,
an evidence/workflow checklist (APS, exam, labs, questionnaires, age/amount requirements), financial
justification against income multipliers, and the mandatory guardrails.

## Carrier rulesets

| Carrier | Coverage | Source |
|---|---|---|
| **Banner Life** (primary) | Full master-outcome chart: Preferred Plus / Preferred / Standard Plus / Standard NT, tobacco classes, build chart, BP & lipid ceilings, driving & family-history rules, medical best-class ceilings, postpone/decline triggers, evidence requirements, income multipliers | *Field guide for life insurance underwriting*, Banner Life family of companies, March 2026 |
| **Foresters** (secondary) | Preferred Plus / Preferred / Standard Plus / Standard NT, Tobacco Plus, age-band BP & cholesterol ceilings, build charts, family-history and driving rules, non-medical eligibility screens and impairment declines | *Underwriting Guide — Your Term, Advantage Plus II, Strong Foundation and SMART UL*, 506305 US (04/26) |
| **Transamerica** (secondary) | Trendsetter Super / Trendsetter LB, FFIUL II/IUL, FCIUL II/IUL: Preferred Plus/Preferred Elite, Preferred, Standard Plus, Standard NT + tobacco equivalents; sex-neutral blended BMI chart (age bands, Table A–H, decline ≤16/>46); age-band BP & cholesterol/HDL ceilings; driving, family-history and substance tiers; impairment-table declines | *A Field Guide to Underwriting* (Trendsetter Super/LB, IULs), 03/25 |
| **Mutual of Omaha** (secondary) | United of Omaha term & permanent: Preferred Plus / Preferred / Standard Plus / Standard NT + Preferred Tobacco; unisex height/weight build chart with published table bands (Table 1 +25 lb through Table 12 +300 lb); BP (<140/85, <145/90, <150/90) & cholesterol ratio (5.0/6.0/7.0, total ≤300) class criteria; family history disregarded at 60+; impairment-table ranges and declines; alcohol/drug 15/10/5-year class tiers; age/amount evidence grid; income multipliers 25X/20X/15X/10X/7X; Fit table-credit program noted, not auto-applied | *Underwriting Guidelines — Life Insurance (Brokerage), For Term and Permanent Products*, 417212_0120 (Jan 2020) |
| **F&G Quantum** (secondary) | Fidelity & Guaranty Life, ages 0-60, $50K-$1M face: Preferred Non-Tobacco (no tobacco 2 yrs) / Non-Tobacco (1 yr) + Preferred Tobacco / Tobacco; sex-specific build chart with age add-lbs (51-60) and Table D 200% ceiling; BP & cholesterol by age band (treatment allowed if 2-yr averages meet parameters); driving (≤2 violations, no DUI 5 yrs); family (≤1 early coronary/cancer death); electronic-database underwriting (MIB, RX/lab/medical claims) with no paramedical; strict decline lists (cancer within 10 yrs, diabetes A1c 7+, drug use within 5 yrs, etc.); premium-to-income by net worth; $1M total-coverage cap | *Underwriting Guidelines — F&G Quantum*, ADV5691 (07-2025) |
| **F&G Pathsetter** (secondary) | Fidelity & Guaranty Life IUL, ages 0-80: same non-tobacco class structure (Preferred NT 2 yrs / NT 1 yr) + tobacco classes + Express Standard fallback lane; sex-specific build chart with **two age add-lbs steps** (+5 lb at 51-65, +10 lb at 66+) and Table H 300% ceiling; BP (150/90→160/95 by age band, Std 155/95→165/95) & cholesterol (260/280/300 by age band, ratio 7/8); driving & family rules identical to Quantum; Exam-Free Underwriting ages 0-60 through $1M (electronic databases, no paramed), paramed + HOS/blood + EKG above; APS thresholds by age/amount; income multipliers 30X/25X/15X/10X/5X; premium-to-income by net worth; $1M non-working-spouse cap; large-case rules at $2M+ | *F&G Pathsetter Agent Guide* (IUL; impairment specifics per F&G standards, ADV5691 07-2025) |
| **National Life Group** (secondary) | National Life Insurance Co / LSW term, whole life & IUL (Flex Life II, Term, TotalSecure, Protector Life, Peaklife): Elite (no tobacco 60 mo) / Preferred (36 mo) / Select (12 mo) / Verified Standard NT + Preferred/Standard/Express Standard Tobacco; six-column unisex height/weight chart (Elite BMI 18.5-27.1 through Express Standard 2 42.5-46.5 — substandard to 200% = Express Std NT 1, 225-300% = Express Std NT 2); BP 135/85 → 140/90 → 150/90; cholesterol total 260/280/300 with ratio 4.5/5.5/6.5 (5.0/6.0/7.0 at 65+); driving ≤1/2/3 violations + no reckless/alcohol 5 yr, no suspension 3 yr; family history disregarded at 65+ (one parent death → Select); uninsurable list (juvenile-onset diabetes <20, A1c 10+, current cancer treatment/internal organ within 3-5 yr, HIV, dementia, cirrhosis, dialysis, transplant, severe COPD, alcohol tx <2 yr, drug use <3 yr); age 60+ requires a physical within 24 months; three lanes (full medical, Streamlined ≤$250K/65-, EZ-Underwriting 18-60 ≤$1M); income multipliers 40X/35X/25X/15X/10X/5X (earned income only, not applicable 70+) | *Life Insurance Underwriting Guide*, TC102228(0319)P (March 2019) |

Rules live as **data** in `js/rules.js` (carrier, guide version, effective date, risk domain, thresholds,
outcomes) so carrier updates can be made without touching engine code. The engine (`js/engine.js`) is
carrier-agnostic; `js/app.js` is the wizard UI. The Foresters LTC material is intentionally **not** merged into
the life engine — LTC is a separate product silo evaluating ADL/IADL and long-term-care utilization risk.
Transamerica's build rule is a **blended BMI chart** (sex-neutral), so the engine scores build by BMI with
age bands for that carrier rather than a height/weight lookup. Mutual of Omaha's build chart is a **unisex
height/weight chart with published table ratings**, so the engine reads the table ladder directly (above
Standard, build alone can support Table 1 through Table 12). F&G Quantum uses a **sex-specific build chart**
(Preferred/Standard columns, +5 lb at ages 51-60) with a Table D (200%) substandard ceiling, and its classes
map onto the normalized model as Preferred Non-Tobacco → preferred_plus and Non-Tobacco → standard.
F&G Pathsetter shares the same chart numbers but applies **two age add-lbs steps** (+5 lb at 51-65, +10 lb at
66+) with a Table H (300%) ceiling, and BP/cholesterol bands extend to 66+; its impairment specifics follow
F&G company standards and reuse the Quantum medical lists by reference. The engine's build path now supports
multi-step age adjustments and a data-driven table-ceiling label. National Life Group uses a **six-column unisex
height/weight chart** where the Express Standard 1/2 columns are substandard rate classes (to 200% and 225-300%),
so the engine's build table ladder now carries per-band labels; its family history is disregarded at age 65+, and
diabetes diagnosed before age 20 is a published decline (the engine gained a carrier `juvenileOnsetDeclineAge`
hook). National Life also illustrates the guide's three underwriting lanes (full medical, Streamlined, EZ).
Transamerica publishes per-product **age-and-face-amount requirement charts** (Trendsetter Super/LB, Financial
Choice IUL, Financial Foundation IUL/II) coded Vitals, BCP, HOS, MVR, CS, PFS, ECG, IR by band; the engine
renders the union across the three product charts for the applicant's age/face in the evidence checklist (no
product is selected, so the exact set depends on the product — the union is the conservative published answer).

## Outcome logic

| App outcome | Meaning |
|---|---|
| Preferred Plus / Preferred | Preliminary indication of low overall mortality risk, subject to complete evidence and carrier rules. |
| Standard | Likely insurable, but health or lifestyle factors may not meet preferred thresholds. |
| Tobacco class | Nicotine history drives a separate class; other health factors still affect the result. |
| Table rating | Coverage may be available at a higher premium because medical or lifestyle risk appears above standard. |
| Flat extra | An added charge may apply for a specific, measurable risk (avocation, aviation, certain medical circumstances). Hazardous avocation on an otherwise qualifying profile produces this outcome where the carrier publishes a flat-extra lane: Banner and F&G Quantum/Pathsetter (Preferred base), Mutual of Omaha (Standard Plus base); National Life caps hazardous avocation at Verified Standard instead. Gate outcomes (decline/postpone) always win over a flat extra. |
| Postpone / pre-review | A decision should wait for stability, completed testing, recovery, or additional records. |
| Specialist review / likely decline | Severe impairment, serious active disease, substantial ADL dependence, facility care, or other major concern needs carrier direction. |

## Guardrails

- The estimate must be presented as **"preliminary, non-binding, based only on disclosed information."**
- The carrier may obtain medical records, prescription history, laboratory/paramedical results, consumer
  reports, and information from other insurers or MIB, subject to authorization — those sources **can change**
  the estimate.
- Never suggest withholding information or "answering around" a condition. Applications state that answers
  influence acceptance and that material misrepresentation or nondisclosure can jeopardize coverage.
- Separate an underwriting-class estimate from conditional or temporary coverage: temporary coverage exists
  only if the exact carrier receipt conditions are met, **not** because the app gives a favorable estimate.

## Acknowledgment gate & consumer-report links

- Before any applicant information can be entered, the user must check the acknowledgment box and accept that
  the tool is only an **estimate**, is **not binding**, and that **all carriers have the final and absolute say**
  on the client's underwriting and health class. The gate blocks the entire wizard until accepted; acceptance
  persists per browser via localStorage (`hce_ack_v1`).
- The gate repeats the full legal disclaimer (non-diagnostic tool; carrier may obtain records, prescription
  history, lab/paramedical results, consumer reports, and information from other insurers or MIB; never
  suggest withholding information; temporary coverage only per carrier receipt conditions).
- The footer links to the consumer-report record-request pages the disclaimer references: **MIB Consumer File**
  (https://www.mib.com/request_your_record.html) and **Milliman IntelliScript**
  (https://www.rxhistories.com/for-consumers/insurance/).
- Acceptance is stored as a **dated record** (`hce_ack_v1` = `{ accepted, acceptedAt }`). A **Print
  acknowledgment** button (footer, and on the results page) produces a one-page record a producer can file
  with the case file: acceptance date/time, app version, optional case reference, current case context,
  the full acknowledgment + legal disclaimer text, the consumer-report links, and producer signature/date
  lines. It prints via a dedicated `body.print-ack` layout, separate from the comparison sheet and full
  results print.

## Reference documents

- `Start with a carrier-specific model.pdf` — the build plan and data schema
- `underwriting-field-guide.pdf` — Banner Life field guide (primary ruleset)
- `foresters-underwriting-guide-your-term-adv-plus-ii-smart-ul.pdf` — Foresters current guide
- `Foresters-503554-US-Foresters-Non-Medical-Underwriting-Guide.pdf`, `Foresters-Financial-Field-Underwriting-Guide.pdf`
- `SBLIUnderwritingGuide.pdf` (effective July 2020 — tagged historical in the build plan; verify before production use)
- `23-1056-Quility-Agent-Guide-Final-1.pdf`
- `Mutual-of-Omaha-Field-Underwriting-Guide.pdf` — Mutual of Omaha / United of Omaha brokerage guide (Jan 2020)
- `life_underwriting_carrier_research_checklist_and_schema.pdf` — carrier research checklist + normalized schema
- `Conduct an exhaustive search for underwriting guidelines.pdf` — medication-limitation research notes
- `ADV5691 Quantum Field Underwriting Guide 25-0814.pdf` — F&G Quantum (Fidelity & Guaranty Life) guide (07-2025); `2026 F&G Quantum Underwriting Guidleines.pdf` is the same document (byte-identical)
- `F&G Pathsetter Agent Guide.pdf` — F&G Pathsetter IUL field underwriting guide
- `Underwriting Guide 0319.pdf` — National Life Group (National Life / LSW) life underwriting guide (March 2019)
- `2025 Ensured Legacy Final Expense Risk Assessment Chart.pdf` — Royal Neighbors of America final-expense risk
  chart (Preferred/Standard/GDB/GI); simplified final-expense lane, noted but not wired into the engine
- `Transamerica FE Express Solution Agent Guide.pdf` + `08-2023 Immediate Solutions Agent Guide.pdf` (Live Smart
  final expense) — Transamerica simplified-issue final expense (no exams/labs, real-time decisions, up to $50K);
  simplified lane, noted but not wired into the engine
- `2021 SBLI Agent Guide-Easy Track.pdf` — SBLI simplified-issue lane (separate from the historical SBLI guide)
- `UHL Underwriting Terminology 2019.pdf` — scanned images, no extractable text
- `Foresters PlanRight Medical Reference Guide 11192019.pdf` — Foresters PlanRight whole-life medical reference (build chart, drug combinations); noted as a separate whole-life lane
- `2026 Corebridge SimpliNow Legacy SIWL Agent Guide.pdf` + `2026 Corebridge SimpliNow Knockout Questions.pdf` — Corebridge simplified-issue whole life (Level/Graded/Decline decision table); simplified lane, noted but not wired into the fully-underwritten engine
- AMAM simplified-issue agent guides — `AMAM_EXPRESS TERM`, `AMAM_HOME CERTAINTY`, `AMAM Term Made Simple`,
  `AMAM_DIGNITY SOLUTIONS` (final expense), `AMAM QSFP Prescription Reference Guide` (scanned — no extractable
  text). These are **simplified-issue product lanes** (Express Term, Home Certainty, Term Made Simple, Dignity
  Solutions) rather than fully underwritten life; they are noted but not wired into the fully-underwritten engine.
- `LTC-Underwriting-Guide-June-2025.pdf` (kept in its own product silo)

## Project layout

```
index.html          App shell (inline loader stamps HCE_VERSION on all script URLs)
css/styles.css      Styling (screen + print)
js/rules.js         Carrier rule data (Banner, Foresters, Transamerica, Mutual of Omaha, F&G Quantum, F&G Pathsetter, National Life Group), medication dictionary, sources, class metadata
js/engine.js        Rule engine: gates, domains, least-favorable-wins, credits, confidence, flags
js/app.js           Wizard UI, localStorage persistence, results rendering
test/engine.test.js Engine test harness — 489 assertions (230 scenarios + gate-dedup probe + results-page contract checks + evidence/APS probe)
package.json        npm test wiring (no dependencies, no install needed)
```

## Adding or updating rules

Edit `js/rules.js` only — every threshold is keyed to its source guide. Run the engine test harness:

```bash
npm test   # 489 assertions: 230 scenarios + cross-carrier gate-dedup probe + results-page contract checks + evidence/APS probe
```

No dependencies — `npm test` is just `node test/engine.test.js`, so a fresh checkout needs no
install step. Then open `index.html` and walk a sample case through to the estimate. After any edit
to `js/*.js`, bump the single `HCE_VERSION` constant in `index.html` (an inline loader stamps it on
all three script URLs) so the preview does not serve a stale cached script set.
