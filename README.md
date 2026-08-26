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
**Run estimate** produces the case-triage page, which can be printed or saved as PDF.

## The interview

The wizard mirrors what a real carrier application asks, organized into 12 steps:

1. **Applicant** — carrier (Banner Life, Foresters, Transamerica, or Mutual of Omaha), age, sex, state, occupation, hazardous duties
2. **Coverage & financial** — face amount, purpose, earned income, total in-force, replacement, premium source
3. **Tobacco & nicotine** — product, last-use date, frequency, cigar exception, marijuana
4. **Build** — height, weight, weight-change history (intentional vs. unexplained)
5. **Vitals & labs** — blood pressure, total/HDL cholesterol, A1c
6. **Driving & criminal** — moving violations, DUI/reckless/suspension, criminal status, bankruptcy
7. **Alcohol & substances** — alcohol, non-marijuana drugs, recovery duration
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
   matter more than the known history.
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
5. **Confidence and flags.** Confidence reflects evidence completeness. Flags include `needs_aps`,
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

Rules live as **data** in `js/rules.js` (carrier, guide version, effective date, risk domain, thresholds,
outcomes) so carrier updates can be made without touching engine code. The engine (`js/engine.js`) is
carrier-agnostic; `js/app.js` is the wizard UI. The Foresters LTC material is intentionally **not** merged into
the life engine — LTC is a separate product silo evaluating ADL/IADL and long-term-care utilization risk.
Transamerica's build rule is a **blended BMI chart** (sex-neutral), so the engine scores build by BMI with
age bands for that carrier rather than a height/weight lookup. Mutual of Omaha's build chart is a **unisex
height/weight chart with published table ratings**, so the engine reads the table ladder directly (above
Standard, build alone can support Table 1 through Table 12).

## Outcome logic

| App outcome | Meaning |
|---|---|
| Preferred Plus / Preferred | Preliminary indication of low overall mortality risk, subject to complete evidence and carrier rules. |
| Standard | Likely insurable, but health or lifestyle factors may not meet preferred thresholds. |
| Tobacco class | Nicotine history drives a separate class; other health factors still affect the result. |
| Table rating | Coverage may be available at a higher premium because medical or lifestyle risk appears above standard. |
| Flat extra | An added charge may apply for a specific, measurable risk (avocation, aviation, certain medical circumstances). |
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
- `LTC-Underwriting-Guide-June-2025.pdf` (kept in its own product silo)

## Project layout

```
index.html          App shell
css/styles.css      Styling (screen + print)
js/rules.js         Carrier rule data (Banner, Foresters, Transamerica, Mutual of Omaha), medication dictionary, sources, class metadata
js/engine.js        Rule engine: gates, domains, least-favorable-wins, credits, confidence, flags
js/app.js           Wizard UI, localStorage persistence, results rendering
```

## Adding or updating rules

Edit `js/rules.js` only — every threshold is keyed to its source guide. Run the engine test harness:

```bash
node /tmp/engine_test.js   # 103 scenario checks across all four carriers
```

Then open `index.html` and walk a sample case through to the estimate.
