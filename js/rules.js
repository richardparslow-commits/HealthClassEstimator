/* =========================================================================
 * HealthClassEstimator — Carrier rule data
 * -------------------------------------------------------------------------
 * Each rule is stored as data (not hard-coded in the engine) so carrier
 * updates can be made safely, per the build spec: carrier, product, source,
 * effective date, risk domain, thresholds, and outcome.
 *
 * Sources:
 *  - Banner Life: "Field guide for life insurance underwriting" (Banner Life
 *    family of companies, MARCH 2026 edition)
 *  - Foresters: "Underwriting Guide — Your Term, Advantage Plus II, Strong
 *    Foundation and SMART UL" (506305 US 04/26)
 *  - Transamerica: "A Field Guide to Underwriting — Trendsetter Super,
 *    Trendsetter LB, FFIUL II/IUL, FCIUL II/IUL" (03/25)
 *  - Mutual of Omaha (United of Omaha Life Insurance Company):
 *    "Underwriting Guidelines — Life Insurance (Brokerage), For Term and
 *    Permanent Products" (417212_0120, as of January 2020)
 *  - F&G Quantum (Fidelity & Guaranty Life): "Underwriting Guidelines —
 *    F&G Quantum" (ADV5691, 07-2025)
 *  - Build-plan reference: "Start with a carrier-specific model.pdf"
 *
 * All outputs are preliminary, non-binding estimates for producer triage.
 * Final decision belongs to carrier underwriting.
 * ========================================================================= */
"use strict";

/* Class ordering — higher index = worse. Used for least-favorable-wins. */
const CLASS_ORDER = [
  "preferred_plus",   // 0
  "preferred",        // 1
  "standard_plus",    // 2
  "standard",         // 3
  "table",            // 4
  "flat_extra",       // 5
  "postpone",         // 6
  "decline"           // 7
];

const CLASS_INDEX = {};
CLASS_ORDER.forEach((c, i) => (CLASS_INDEX[c] = i));

const CARRIER_RULES = {

  /* ======================================================================
   * BANNER LIFE — Unified master-outcome chart
   * ==================================================================== */
  banner: {
    id: "banner",
    name: "Banner Life",
    company: "Banner Life Insurance Company / William Penn Life Insurance Company of New York",
    guide: {
      title: "Field guide for life insurance underwriting",
      version: "March 2026",
      note: "Banner states it evaluates the entire risk and may request additional evidence; final decisions may be more or less favorable than this guide."
    },

    /* ---- Nicotine / tobacco classification --------------------------- */
    nicotine: {
      classes: [
        { klass: "preferred_plus", lookbackMonths: 36, label: "Preferred Plus Non-Tobacco" },
        { klass: "preferred", lookbackMonths: 24, label: "Preferred Non-Tobacco" },
        { klass: "standard_plus", lookbackMonths: 12, label: "Standard Plus Non-Tobacco" },
        { klass: "standard", lookbackMonths: 12, label: "Standard Non-Tobacco" }
      ],
      tobaccoLookbackMonths: 12,
      cigarException: {
        note: "Occasional cigar users may qualify for non-tobacco rates (Preferred Plus at best) when: use admitted up front, ≤1 cigar per month, urine negative for cotinine, no other tobacco for 3 years, and no comorbid diabetes or asthma.",
        maxPerMonth: 1,
        maxPerYear: 12
      },
      marijuana: "Non-tobacco rates apply. Preferred classes may be available for infrequent recreational use. Medicinal use is rated on the underlying condition."
    },

    /* ---- Build chart (lbs) ------------------------------------------- */
    /* Each height (in inches) -> max weight per class band. */
    build: {
      chart: {
        58:  { pp: 134, p: 144, sp: 155, stdCredit: 181, std: 196 },
        59:  { pp: 139, p: 149, sp: 160, stdCredit: 188, std: 203 },
        60:  { pp: 144, p: 154, sp: 166, stdCredit: 194, std: 209 },
        61:  { pp: 149, p: 159, sp: 171, stdCredit: 201, std: 216 },
        62:  { pp: 153, p: 164, sp: 177, stdCredit: 207, std: 224 },
        63:  { pp: 158, p: 170, sp: 183, stdCredit: 214, std: 231 },
        64:  { pp: 164, p: 175, sp: 188, stdCredit: 221, std: 238 },
        65:  { pp: 169, p: 181, sp: 194, stdCredit: 228, std: 246 },
        66:  { pp: 174, p: 186, sp: 200, stdCredit: 235, std: 253 },
        67:  { pp: 179, p: 192, sp: 207, stdCredit: 242, std: 261 },
        68:  { pp: 185, p: 198, sp: 213, stdCredit: 249, std: 269 },
        69:  { pp: 190, p: 204, sp: 219, stdCredit: 257, std: 277 },
        70:  { pp: 196, p: 210, sp: 225, stdCredit: 264, std: 285 },
        71:  { pp: 201, p: 216, sp: 232, stdCredit: 272, std: 293 },
        72:  { pp: 207, p: 222, sp: 239, stdCredit: 279, std: 302 },
        73:  { pp: 213, p: 228, sp: 245, stdCredit: 287, std: 310 },
        74:  { pp: 219, p: 234, sp: 252, stdCredit: 295, std: 319 },
        75:  { pp: 225, p: 241, sp: 259, stdCredit: 303, std: 327 },
        76:  { pp: 231, p: 247, sp: 266, stdCredit: 311, std: 336 },
        77:  { pp: 237, p: 254, sp: 273, stdCredit: 320, std: 345 },
        78:  { pp: 243, p: 260, sp: 280, stdCredit: 328, std: 354 },
        79:  { pp: 249, p: 267, sp: 287, stdCredit: 336, std: 363 },
        80:  { pp: 256, p: 274, sp: 295, stdCredit: 345, std: 372 },
        81:  { pp: 262, p: 281, sp: 302, stdCredit: 354, std: 382 },
        82:  { pp: 268, p: 288, sp: 309, stdCredit: 363, std: 391 },
        83:  { pp: 275, p: 295, sp: 317, stdCredit: 371, std: 401 }
      },
      rules: {
        minHeightIn: 58,
        maxHeightIn: 83,
        chartMinWeight: 89,
        halfInchRounding: "Half-inch measurements round up to the next inch.",
        weightLossAdjustment: "If intentional loss exceeded 20 lb in the prior 12 months, add back 50% of the pounds lost before using the chart.",
        lowBuildReview: "Weight below chart minimum or BMI below 18.5 -> manual underwriting review.",
        belowChartMin: 18.5,
        aboveStandard: "Weight above the Standard maximum -> substandard build chart / manual review (do not guess a table rating).",
        heightAdjustCredit: "Preferred Plus / Preferred / Standard Plus build results may be eligible for a possible 1-inch height adjustment or underwriting credits — shown as 'possible credit review', not automatically applied. Standard build results are not eligible."
      }
    },

    /* ---- Blood pressure (2-year average, with or without treatment) --- */
    bp: {
      preferred_plus:   { sys: 135, dia: 85 },
      preferred:        { sys: 140, dia: 90 },
      standard_plus:    { sys: 145, dia: 90 },
      standard:         { sys: 156, dia: 94 }
    },

    /* ---- Cholesterol / HDL ------------------------------------------- */
    cholesterol: {
      totalMin: 120,
      totalMax: 300,
      ratio: {
        preferred_plus: 4.5,
        preferred: 5.5,
        standard_plus: 6.5,
        standard: 8.0
      }
    },

    /* ---- Driving history --------------------------------------------- */
    driving: {
      preferred_plus:   { maxViolations3yr: 2, cleanYears: 5 },
      preferred:        { maxViolations3yr: 2, cleanYears: 5 },
      standard_plus:    { maxViolations3yr: 3, cleanYears: 3 },
      standard:         { maxViolations3yr: 4, cleanYears: 2 }
    },

    /* ---- Family history ---------------------------------------------- */
    familyHistory: {
      mapping: { none: "preferred_plus", parent: "preferred", parent_sibling: "standard_plus", multiple: "standard" },
      preferred_plus: { text: "No cardiovascular death in either parent or sibling before age 60." },
      preferred:      { text: "No cardiovascular death in either parent before age 60." },
      standard_plus:  { text: "No cardiovascular death of more than one parent before age 60." },
      standard:       { text: "No cardiovascular death of more than one parent before age 60." },
      over70CADDisregarded: "CAD family history is disregarded for applicants over age 70 who do not use tobacco.",
      cancerNoLongerBarrier: "Cancer family history is no longer a factor preventing preferred consideration."
    },

    /* ---- Medical best-class ceilings (single impairments) ------------- */
    medicalCeilings: [
      {
        id: "anxiety", name: "Anxiety",
        ceilings: [
          { klass: "preferred_plus", when: "mild and well controlled on a single medication" },
          { klass: "preferred", when: "mild and well controlled (one medication)" }
        ],
        worse: "Ratings vary with severity, treatment type, hospitalization, and stability."
      },
      {
        id: "depression", name: "Depression",
        ceilings: [
          { klass: "preferred_plus", when: "single episode, duration under one year, no current medication" },
          { klass: "preferred", when: "mild and well controlled on one medication" }
        ],
        worse: "History of hospitalization or suicide attempt/self-harm lowers the ceiling."
      },
      {
        id: "bipolar", name: "Bipolar disorder",
        ceilings: [
          { klass: "standard_plus", when: "mild, well-followed, treatment-compliant, stable at least 5 years" }
        ],
        postpone: "Diagnosed within the last year.",
        decline: "Suicide attempt within 10 years."
      },
      {
        id: "asthma", name: "Asthma",
        ceilings: [
          { klass: "preferred_plus", when: "mild, infrequent attacks (seasonal or exercise-induced), occasional or 1 medication" },
          { klass: "preferred", when: "mild, well controlled on 2 medications or fewer" }
        ],
        worse: "Severe asthma with hospitalization -> postpone/decline screen."
      },
      {
        id: "autism", name: "Autism",
        ceilings: [
          { klass: "preferred_plus", when: "high-functioning (IQ > 70, developed language, learns/lives independently)" }
        ],
        worse: "Assumes no neurobehavioral/mental-health symptoms or epilepsy."
      },
      {
        id: "skin_cancer", name: "Skin cancer (basal / squamous)",
        ceilings: [
          { klass: "preferred_plus", when: "superficial basal cell or squamous cell skin cancer" }
        ],
        worse: "Other or deeper presentations -> cancer history rules."
      },
      {
        id: "other_cancer", name: "Other cancer history",
        ceilings: [
          { klass: "standard_plus", when: "depends on type, staging, date of onset and treatment (including efficacy)" }
        ],
        postpone: "Diagnosis or treatment within the last 12 months; multiple cancer history or recurrence — contact underwriting before submitting.",
        decline: "Active advanced cancer, recurrence, or metastatic disease (specialist review)."
      },
      {
        id: "diabetes", name: "Diabetes",
        ceilings: [
          { klass: "standard_plus", when: "onset age 50 or older, non-tobacco, well controlled, favorable risk factors" }
        ],
        decline: "A1c > 10 or significant complications (e.g., serious kidney, eye, nerve, vascular disease).",
        postpone: "Newly diagnosed/unstable, recent medication change, pending A1c, or incomplete complication workup."
      },
      {
        id: "sleep_apnea", name: "Sleep apnea",
        ceilings: [
          { klass: "preferred", when: "mild or moderate, compliant with treatment, no residual symptoms" }
        ],
        postpone: "Recent CPAP start without compliance history or untreated apnea."
      },
      {
        id: "osteoporosis", name: "Osteoporosis",
        ceilings: [
          { klass: "preferred_plus", when: "no complications or history of fractures" }
        ]
      },
      {
        id: "mvp", name: "Mitral valve prolapse",
        ceilings: [
          { klass: "preferred_plus", when: "normal-appearing valve with normal thickness, normal echo, no regurgitation" }
        ]
      },
      {
        id: "cimt", name: "Carotid imaging (CIMT)",
        ceilings: [
          { klass: "preferred_plus", when: "mildly increased CIMT for age/gender, no plaque or stenosis" }
        ]
      },
      {
        id: "dysplastic_nevi", name: "Dysplastic nevi",
        ceilings: [
          { klass: "preferred_plus", when: "single atypical/dysplastic nevus, no personal/family melanoma history, favorable dermatology follow-up" },
          { klass: "preferred", when: "up to 3 atypical/dysplastic nevi with the above criteria" }
        ]
      },
      {
        id: "substance_treatment", name: "Alcohol/drug abuse treatment history",
        ceilings: [
          { klass: "preferred", when: "last use more than 10 years ago, single treatment with no relapse, total abstinence from mood-altering drugs, no related issues" }
        ],
        decline: "Current use or abstinence under 2 years (alcohol); non-marijuana drug use within 3 years or multiple relapses."
      },
      {
        id: "schizophrenia", name: "Schizophrenia",
        ceilings: [],
        postpone: "Possible consideration only after 1 year of stability, treatment compliance, minimal symptoms, good follow-up and employment.",
        decline: "Most presentations require specialist/manual review."
      },
      {
        id: "hypertension", name: "High blood pressure",
        ceilings: [
          { klass: "preferred_plus", when: "well controlled with or without treatment; average readings within class limits" }
        ],
        note: "Treatment alone does not prevent preferred consideration; class limits apply with or without treatment."
      },
      {
        id: "high_cholesterol", name: "High cholesterol",
        ceilings: [
          { klass: "preferred_plus", when: "total cholesterol 120-300 and ratio within class limit, with or without treatment" }
        ]
      },
      {
        id: "cad", name: "Coronary artery disease",
        ceilings: [],
        postpone: "Stent or bypass within 6 months; heart attack (MI) within 6 months.",
        note: "Stable history reviewed individually; combine with diabetes or kidney disease = materially worse."
      },
      {
        id: "heart_disease", name: "Heart disease (other / CHF / cardiomyopathy)",
        ceilings: [],
        postpone: "Cardiomyopathy commonly 1-3 years from diagnosis or recovery; valve replacement within 6 months.",
        decline: "Automatic implantable cardioverter-defibrillator; many cardiomyopathies; severe/advanced heart failure (specialist review)."
      },
      {
        id: "stroke", name: "Stroke / TIA",
        ceilings: [],
        postpone: "Within 6 months (may be uninsurable depending on type).",
        decline: "Severe (impaired cognition, wheelchair, ADL assistance), multiple strokes."
      },
      {
        id: "seizures", name: "Seizures / epilepsy",
        ceilings: [],
        postpone: "Known cause: within 3 months of first seizure; unknown cause: within 6 months (exception: petit mal/absence seizures).",
        note: "Controlled on meds with 2+ years seizure-free may be considered by carrier."
      },
      {
        id: "copd", name: "COPD / emphysema / chronic bronchitis",
        ceilings: [],
        postpone: "Oxygen use or hospitalization within the last year."
      },
      {
        id: "kidney_disease", name: "Kidney disease",
        ceilings: [],
        decline: "Chronic kidney failure or dialysis.",
        note: "CKD combined with hypertension is materially worse."
      },
      {
        id: "liver_disease", name: "Liver disease",
        ceilings: [],
        decline: "Cirrhosis of the liver (all cases)."
      },
      {
        id: "hiv", name: "HIV / AIDS",
        ceilings: [],
        decline: "HIV-positive — most likely decline."
      },
      {
        id: "dementia", name: "Alzheimer's / dementia",
        ceilings: [],
        decline: "All cases."
      },
      {
        id: "transplant", name: "Organ transplant",
        ceilings: [],
        decline: "Most transplant recipients; limited exceptions (e.g., kidney/liver under age 40, bone marrow) require underwriter contact."
      },
      {
        id: "paralysis", name: "Paralysis / quadriplegia",
        ceilings: [],
        decline: "Quadriplegia most likely decline."
      }
    ],

    /* Substance-abuse-treatment ceilings by recovery duration */
    substanceTiers: { declineYears: 2, tiers: [{ minYears: 10, klass: "preferred" }, { minYears: 0, klass: "standard" }] },

    /* ---- Comorbidity combinations (materially worse than isolated) ---- */
    comorbidities: [
      { combo: "Diabetes + coronary/cardiovascular or kidney disease", flag: "high_risk_combination", text: "Materially different from an isolated diagnosis; specialist review." },
      { combo: "Chronic kidney disease + hypertension", flag: "high_risk_combination", text: "Materially worse than either alone." },
      { combo: "Mental-health condition + alcohol abuse", flag: "high_risk_combination", text: "Combination often uninsurable; specialist review." },
      { combo: "Build (obesity) + diabetes", flag: "high_risk_combination", text: "Build and diabetes combination may exceed limits; carrier worksheet applies." },
      { combo: "Multiple individually moderate factors", flag: "interaction_review", text: "Several moderate issues can combine into a less favorable estimate." }
    ],

    /* ---- Postpone triggers (gate screen) ----------------------------- */
    postponeTriggers: [
      { id: "pending_test", text: "Pending biopsy, test, referral, surgery, or evaluation with unknown results", reason: "Missing outcome can matter more than known history." },
      { id: "recent_hospitalization", text: "Hospitalization or advised hospitalization within the past 4 months (other than childbirth)", reason: "Insufficient stability." },
      { id: "recent_surgery", text: "Surgery performed or recommended within the past 4 months with unfinished/unknown results", reason: "Insufficient stability." },
      { id: "active_symptom", text: "Unexplained bleeding, lump/growth, fainting, persistent cough, changing mole, or other new symptom under first-time evaluation", reason: "Uninvestigated symptom." },
      { id: "cancer_recent", text: "Non-skin cancer diagnosed or treated within the last 12 months", reason: "Banner: contact underwriting before submitting." },
      { id: "cancer_recurrence", text: "Multiple cancer history or recurrence", reason: "Banner: contact underwriting before submitting." },
      { id: "mi_recent", text: "Heart attack (MI) within the last 6 months", reason: "Postpone period." },
      { id: "stent_bypass_recent", text: "Coronary stent or bypass within the last 6 months", reason: "Postpone period." },
      { id: "valve_recent", text: "Valve replacement within the last 6 months", reason: "Postpone period." },
      { id: "cardiomyopathy_recent", text: "Cardiomyopathy diagnosed or recovered within 1-3 years", reason: "Most cardiomyopathies have a postpone period of at least 1-3 years." },
      { id: "gastric_bypass_recent", text: "Gastric bypass within the last 6 months", reason: "Postpone period." },
      { id: "seizure_recent", text: "First seizure within 3 months (known cause) or 6 months (unknown cause)", reason: "Postpone period." },
      { id: "stroke_recent", text: "Stroke within the last 6 months", reason: "May not be able to offer; depends on type." },
      { id: "suicide_attempt_recent", text: "Single suicide attempt within the last 2 years", reason: "Postpone period." },
      { id: "pregnancy_complications", text: "Currently pregnant with complications (eclampsia, pre-eclampsia, gestational diabetes) — current or prior", reason: "Postpone." },
      { id: "copd_recent", text: "COPD with oxygen use or hospitalization within the last year", reason: "Postpone." },
      { id: "a1c_high", text: "Diabetes A1c above 10", reason: "Decline/postpone screen." },
      { id: "diabetes_complications", text: "Significant diabetes complications (kidney, eye, nerve, vascular)", reason: "Decline/postpone screen." },
      { id: "schizophrenia_recent", text: "Schizophrenia with less than 1 year of stability", reason: "Possible consideration after 1 year stability." }
    ],

    /* ---- Decline / specialist-review triggers ------------------------ */
    declineTriggers: [
      { id: "alcohol_active", text: "Current alcohol abuse, or abstinence under 2 years", reason: "Banner decline list." },
      { id: "drug_use_recent", text: "Non-marijuana drug use within the last 3 years, or multiple relapses", reason: "Banner decline list." },
      { id: "dementia", text: "Alzheimer's disease or dementia", reason: "All cases declined." },
      { id: "cirrhosis", text: "Cirrhosis of the liver", reason: "All cases declined." },
      { id: "defibrillator", text: "Automatic implantable cardioverter-defibrillator", reason: "Decline list." },
      { id: "hiv", text: "HIV-positive", reason: "Most likely decline." },
      { id: "renal_failure", text: "Chronic kidney failure or dialysis", reason: "Decline list." },
      { id: "quadriplegia", text: "Quadriplegia", reason: "Most likely decline." },
      { id: "stroke_severe", text: "Severe stroke — impaired cognition, wheelchair, or ADL assistance needed; multiple strokes", reason: "Decline list." },
      { id: "suicide_multiple", text: "Multiple suicide attempts", reason: "Decline list." },
      { id: "transplant", text: "Most transplant recipients", reason: "Decline unless limited exceptions with underwriter contact." },
      { id: "bankruptcy_active", text: "Bankruptcy not discharged (Chapter 7) or Chapter 13 without plan / payments under 2 years", reason: "Decline until resolved." },
      { id: "criminal_active", text: "Currently in jail, awaiting trial, on probation/parole, organized crime/terrorism connection, or multiple/major convictions", reason: "Decline list." },
      { id: "adl_dependence", text: "Assistance needed with medications, bathing, dressing, eating, toileting, transferring, or continence", reason: "Strong decline/specialist-review trigger." },
      { id: "facility_care", text: "Nursing/skilled-care or psychiatric facility residence, hospice, or home-health care", reason: "Strong decline/specialist-review trigger." },
      { id: "wheelchair", text: "Chronic wheelchair dependence due to illness or disability", reason: "Strong decline/specialist-review trigger." },
      { id: "oxygen_use", text: "Oxygen use", reason: "Decline list." }
    ],

    /* ---- Evidence / workflow ----------------------------------------- */
    evidence: {
      apsConditions: [
        "Cancer / malignant tumors", "Diabetes", "Heart (cardiac) disease", "Heart or blood vessel surgery",
        "Stroke / TIA / cerebral vascular disease", "COPD / emphysema", "Kidney disease", "Liver disease",
        "Mental-health disorders (exception: mild anxiety on one medication)", "Substance abuse/dependence",
        "Blood disorders", "Brain tumor", "Embolism / thrombosis / DVT", "Inflammatory bowel disease",
        "Multiple sclerosis", "Muscular dystrophy", "Pancreatic disease", "Paralysis", "Rheumatoid arthritis",
        "Systemic lupus", "Cognitive disorders", "Intestinal bleeding", "Hereditary cancer syndrome"
      ],
      apsAlwaysOver60: "An APS is always required for applicants over age 60.",
      ageAmount: [
        { band: "20-40", requirements: "APM, BU", note: "" },
        { band: "41-50", requirements: "APM, BU", note: "" },
        { band: "51-60", requirements: "APM, BU", note: "EKG at amounts over $2,000,000. ProBNP when amount > $1,000,000." },
        { band: "61-70", requirements: "APS, BU", note: "EKG at amounts over $2,000,000. ProBNP when amount > $250,000. APS always required." },
        { band: "71+", requirements: "APS, DAQ", note: "Daily Activities Questionnaire required. APS always required." }
      ],
      specialLabs: [
        { lab: "ProBNP", when: "Ages 51-60 with amount > $1,000,000; ages > 60 with amount > $250,000" },
        { lab: "PSA", when: "Males age 50 and over" },
        { lab: "CEA", when: "Ages > 50, all amounts; ages ≤ 50 with amount > $5,000,000" }
      ],
      acceleratedUW: {
        eligibility: "Ages 20-60 up to $5,000,000; ages 61-70 up to $500,000 (APS required).",
        note: "Applicant disclosures, prescription history, claims data and third-party data determine instant-decision eligibility."
      },
      temporaryCoverage: "Temporary coverage exists only if the exact carrier receipt conditions are met — never because the app gives a favorable estimate. Banner: policy delivered, first premium paid while insured is alive, no material change in health/habits."
    },

    /* ---- Financial justification (income multipliers) ---------------- */
    financial: {
      incomeMultipliers: [
        { ageMin: 0,  ageMax: 29, multiplier: 40 },
        { ageMin: 30, ageMax: 39, multiplier: 35 },
        { ageMin: 40, ageMax: 49, multiplier: 25 },
        { ageMin: 50, ageMax: 59, multiplier: 20 },
        { ageMin: 60, ageMax: 64, multiplier: 10 },
        { ageMin: 65, ageMax: 70, multiplier: 5 },
        { ageMin: 71, ageMax: 200, multiplier: 3 }
      ],
      note: "Income factors may be modified case-by-case. Age 71+ employed applicants considered individually with small multipliers. Total in-force + applied-for coverage with all carriers must be financially justified."
    },

    /* ---- Credit (possible, never auto-applied) ----------------------- */
    credit: {
      note: "Banner one-class credit may apply when the only adverse factor is build, blood pressure, family history, or cholesterol/HDL ratio. Requires 3 of 7 credit criteria — flagged for review, not auto-applied."
    },

    classInfo: {
      preferred_plus: {
        name: "Preferred Plus Non-Tobacco",
        meaning: "Preliminary indication of the lowest overall mortality risk in the disclosed profile.",
        color: "#0e7a5f"
      },
      preferred: {
        name: "Preferred Non-Tobacco",
        meaning: "Very favorable risk; minor, stable, well-controlled history may be acceptable.",
        color: "#1b9a7a"
      },
      standard_plus: {
        name: "Standard Plus Non-Tobacco",
        meaning: "Slightly above-average risk; controlled chronic conditions may be acceptable.",
        color: "#3b82b0"
      },
      standard: {
        name: "Standard Non-Tobacco",
        meaning: "Average insurable risk; health or lifestyle factors do not meet preferred thresholds.",
        color: "#4a6fa5"
      },
      table: {
        name: "Table-rated (substandard)",
        meaning: "Coverage may be available at a higher premium because medical or lifestyle risk appears above standard. Banner: Table 1-12, based on Standard Plus rates. Tables are not available with Preferred classes.",
        color: "#b8860b"
      },
      flat_extra: {
        name: "Flat extra",
        meaning: "An added charge may apply for a specific, measurable risk (often aviation, avocation, or certain medical circumstances).",
        color: "#c2691b"
      },
      postpone: {
        name: "Postpone / pre-review",
        meaning: "A decision should wait for stability, completed testing, recovery, or additional records.",
        color: "#8a5fb8"
      },
      decline: {
        name: "Specialist review / likely decline",
        meaning: "Severe impairment, serious active disease, substantial ADL dependence, facility care, or other major concern needs carrier direction.",
        color: "#b3364a"
      }
    }
  },

  /* ======================================================================
   * FORESTERS — Your Term / Advantage Plus II / SMART UL
   * (secondary carrier mapping; non-medical eligibility screen + class)
   * ==================================================================== */
  foresters: {
    id: "foresters",
    name: "Foresters",
    company: "Foresters Financial (The Independent Order of Foresters)",
    guide: {
      title: "Underwriting Guide — Your Term, Advantage Plus II, Strong Foundation and SMART UL",
      version: "506305 US (04/26)",
      note: "Final action is the decision of the Underwriter based on all circumstances; similar impairments can receive different final actions."
    },

    nicotine: {
      classes: [
        { klass: "preferred_plus", lookbackYears: 5, label: "Preferred Plus Non-Tobacco" },
        { klass: "preferred", lookbackYears: 3, label: "Preferred Non-Tobacco" },
        { klass: "standard_plus", lookbackYears: 1, label: "Standard Plus Non-Tobacco" },
        { klass: "standard", lookbackYears: 1, label: "Standard Non-Tobacco" }
      ],
      tobaccoLookbackMonths: 12,
      tobaccoPlus: "Tobacco Plus: nicotine use within the past year AND meets all Preferred Plus criteria; ≤ 1 pack per day.",
      cigarException: "Cigar use qualifies for non-tobacco Standard/Standard Plus/Preferred (not Preferred Plus) when admitted up front, urine negative for nicotine, ≤ 1 cigar/month up to 12/year.",
      nonMedNicotine: {
        strongFoundation: "Strong Foundation non-med: no cigarettes in past 12 months; cigar, pipe, chewing tobacco, patches, vape pens, marijuana and substitutes allowed.",
        termSmartUl: "SMART UL / Your Term / Advantage Plus II non-med: no tobacco or nicotine product in past 12 months; marijuana allowed, but no vape pens (nicotine or non-nicotine)."
      }
    },

    /* Fully-underwritten max weights (lbs) per class */
    build: {
      chart: {
        56: { pp: 118, p: 125, sp: 143, std: 162 },
        57: { pp: 122, p: 130, sp: 150, std: 168 },
        58: { pp: 126, p: 135, sp: 155, std: 174 },
        59: { pp: 130, p: 137, sp: 160, std: 180 },
        60: { pp: 144, p: 152, sp: 167, std: 186 },
        61: { pp: 149, p: 158, sp: 175, std: 193 },
        62: { pp: 152, p: 162, sp: 180, std: 199 },
        63: { pp: 157, p: 166, sp: 185, std: 206 },
        64: { pp: 161, p: 172, sp: 190, std: 211 },
        65: { pp: 166, p: 178, sp: 195, std: 219 },
        66: { pp: 170, p: 182, sp: 200, std: 226 },
        67: { pp: 176, p: 190, sp: 205, std: 233 },
        68: { pp: 180, p: 195, sp: 210, std: 240 },
        69: { pp: 184, p: 200, sp: 215, std: 247 },
        70: { pp: 190, p: 205, sp: 222, std: 254 },
        71: { pp: 196, p: 210, sp: 227, std: 261 },
        72: { pp: 202, p: 220, sp: 234, std: 269 },
        73: { pp: 206, p: 225, sp: 242, std: 276 },
        74: { pp: 211, p: 230, sp: 247, std: 284 },
        75: { pp: 216, p: 240, sp: 252, std: 292 },
        76: { pp: 221, p: 244, sp: 258, std: 299 },
        77: { pp: 227, p: 251, sp: 264, std: 307 },
        78: { pp: 244, p: 260, sp: 270, std: 315 },
        79: { pp: 249, p: 265, sp: 276, std: 323 },
        80: { pp: 254, p: 270, sp: 281, std: 332 },
        81: { pp: 259, p: 273, sp: 285, std: 340 }
      },
      rules: {
        minHeightIn: 56,
        maxHeightIn: 81,
        chartMinWeight: 74,
        weightReduction: "Full credit for weight loss only when stable 12 months; otherwise half credit (add back 50% of lost pounds). Weight change due to illness or unknown reason -> likely decline."
      }
    },

    /* BP thresholds by age band per class */
    bp: {
      preferred_plus:   [{ ageMin: 18, ageMax: 59, sys: 135, dia: 85 }, { ageMin: 60, ageMax: 69, sys: 145, dia: 85 }, { ageMin: 70, ageMax: 200, sys: 150, dia: 90 }],
      preferred:        [{ ageMin: 18, ageMax: 59, sys: 140, dia: 85 }, { ageMin: 60, ageMax: 69, sys: 140, dia: 90 }, { ageMin: 70, ageMax: 200, sys: 155, dia: 90 }],
      standard_plus:    [{ ageMin: 18, ageMax: 59, sys: 145, dia: 90 }, { ageMin: 60, ageMax: 69, sys: 150, dia: 90 }, { ageMin: 70, ageMax: 200, sys: 160, dia: 90 }],
      tobacco_plus:     [{ ageMin: 18, ageMax: 59, sys: 145, dia: 90 }, { ageMin: 60, ageMax: 69, sys: 150, dia: 90 }, { ageMin: 70, ageMax: 200, sys: 155, dia: 90 }]
    },

    /* Total cholesterol by age band per class (min untreated 130) */
    cholesterol: {
      minUntreated: 130,
      total: {
        preferred_plus:   [{ ageMin: 18, ageMax: 60, max: 230 }, { ageMin: 61, ageMax: 70, max: 240 }, { ageMin: 71, ageMax: 200, max: 250 }],
        preferred:        [{ ageMin: 18, ageMax: 60, max: 250 }, { ageMin: 61, ageMax: 70, max: 280 }, { ageMin: 71, ageMax: 200, max: 280 }],
        standard_plus:    [{ ageMin: 18, ageMax: 60, max: 300 }, { ageMin: 61, ageMax: 70, max: 300 }, { ageMin: 71, ageMax: 200, max: 300 }],
        tobacco_plus:     [{ ageMin: 18, ageMax: 60, max: 300 }, { ageMin: 61, ageMax: 70, max: 300 }, { ageMin: 71, ageMax: 200, max: 300 }]
      },
      ratio: {
        preferred_plus:   [{ ageMin: 18, ageMax: 60, max: 5.0 }, { ageMin: 61, ageMax: 70, max: 4.5 }, { ageMin: 71, ageMax: 200, max: 4.0 }],
        preferred:        [{ ageMin: 18, ageMax: 60, max: 5.5 }, { ageMin: 61, ageMax: 70, max: 6.0 }, { ageMin: 71, ageMax: 200, max: 6.5 }],
        standard_plus:    [{ ageMin: 18, ageMax: 60, max: 6.5 }, { ageMin: 61, ageMax: 70, max: 7.0 }, { ageMin: 71, ageMax: 200, max: 7.5 }],
        tobacco_plus:     [{ ageMin: 18, ageMax: 60, max: 6.5 }, { ageMin: 61, ageMax: 70, max: 7.0 }, { ageMin: 71, ageMax: 200, max: 7.5 }]
      }
    },

    driving: {
      preferred_plus:   { duiCleanYears: 5, maxViolations: 1, violationsYears: 5 },
      preferred:        { duiCleanYears: 5, maxViolations: 2, violationsYears: 3 },
      standard_plus:    { duiCleanYears: 5, maxViolations: 2, violationsYears: 3 },
      standard:         { duiCleanYears: 2, maxViolations: 4, violationsYears: 2 },
      tobacco_plus:     { duiCleanYears: 5, maxViolations: 1, violationsYears: 5 }
    },

    familyHistory: {
      mapping: { none: "preferred_plus", parent: "standard_plus", parent_sibling: "standard_plus", multiple: "standard" },
      preferred_plus:   { text: "No death of a parent before age 65 due to CAD, CVD or cancer." },
      preferred:        { text: "No death of a parent before age 65 due to CAD, CVD or cancer." },
      standard_plus:    { text: "No death of a parent before age 60 due to CAD, CVD or cancer." },
      tobacco_plus:     { text: "No death of a parent before age 65 due to CAD, CVD or cancer." }
    },

    medical: {
      preferredCeilingNote: "Preferred Plus / Preferred / Standard Plus / Tobacco Plus all require no history of cancer or significant health impairment.",
      nonMedDeclines: [
        "ADL assistance required", "AIDS / HIV positive", "Alzheimer's / dementia", "Cirrhosis of liver",
        "Congestive heart failure", "CVA / stroke / TIA", "Cystic fibrosis", "Down's syndrome",
        "Drug use (other than marijuana)", "Emphysema / COPD (APII & SMART UL)", "Heart disease (MI, CAD, angina)",
        "Heart surgery/procedure", "Kidney disease (chronic)", "Leukemia", "Liver disease", "Multiple sclerosis",
        "Nursing home / skilled-nursing / psychiatric facility resident", "Oxygen use", "Pacemaker",
        "Paralysis (paraplegia / quadriplegia)", "Parkinson's disease", "PVD / PAD", "Suicide attempt",
        "Wheelchair use due to chronic illness/disease"
      ],
      declines: [
        "Alcoholism within 5 years", "Aneurysm", "Autism", "Cancer other than basal cell / completed >10 years ago without recurrence",
        "Chronic bronchitis", "Circulatory surgery", "CVA / Stroke / TIA", "Dementia", "Down's syndrome",
        "Drug use other than marijuana", "Emphysema / COPD (Advantage Plus II / SMART UL)", "Heart disease",
        "Heart valve disease/surgery", "Hemophilia", "Hepatitis B or C", "Hodgkin's disease",
        "Insulin-treated diabetes or diabetes with complications (APII/Your Term/SMART UL)", "Kidney disease (chronic)",
        "Leukemia", "Liver disease", "Lupus (systemic)", "Marfan's syndrome", "Mitral stenosis/insufficiency",
        "Muscular dystrophy", "Nursing/psychiatric facility resident", "Oxygen use", "Pacemaker", "Paralysis",
        "Parkinson's disease", "PVD/PAD", "Sarcoidosis (pulmonary)", "Spina bifida", "Suicide attempt",
        "Wheelchair use (chronic illness)", "Aortic stenosis / insufficiency", "Arrhythmia", "Artery blockage"
      ],
      /* Substance-abuse-treatment ceilings by recovery duration (Foresters:
         alcoholism within 5 years decline; after 5 years without relapse and no current use — accept) */
      substanceTiers: { declineYears: 5, tiers: [{ minYears: 5, klass: "standard" }, { minYears: 0, klass: "table" }] },
      comboUninsurable: [
        "Chronic kidney disease with high blood pressure",
        "Depressive and/or anxiety problems in combination with alcohol abuse",
        "Diabetes in combination with CAD, CVD, or kidney disease"
      ],
      /* condition id -> decline screen (non-medical impairment guide) */
      medicalDeclinesMap: {
        hiv: "AIDS / HIV positive — decline.",
        dementia: "Alzheimer's / dementia — decline.",
        liver_disease: "Cirrhosis of liver / liver disease — decline.",
        heart_disease: "Congestive heart failure, heart surgery, pacemaker, valve disease, arrhythmia — decline.",
        cad: "Heart disease (MI, CAD, angina, angioplasty, bypass) — decline.",
        stroke: "CVA / stroke / TIA — decline.",
        copd: "COPD / emphysema / chronic bronchitis — decline (AP II & SMART UL; Strong Foundation mild COPD may be acceptable).",
        kidney_disease: "Chronic kidney disease — decline.",
        other_cancer: "Cancer other than basal cell, or treatment not completed >10 years ago without recurrence — decline.",
        leukemia: "Leukemia — decline.",
        transplant: "Organ transplant — decline.",
        paralysis: "Paralysis (paraplegia / quadriplegia) — decline.",
        seizures: "Epilepsy/seizures — decline unless controlled on meds, no seizures for 2 years, no complications.",
        bipolar: "Bipolar disorder / schizophrenia / severe depression — decline.",
        schizophrenia: "Schizophrenia / severe mental illness — decline.",
        autism: "Autism — decline (non-medical)."
      },
      medicalAcceptMap: {
        skin_cancer: "Basal cell carcinoma (skin) — accept.",
        asthma: "Mild/moderate asthma — accept; severe with hospitalization — decline.",
        mvp: "'Innocent' heart murmur, no symptoms, no treatment — accept.",
        substance_treatment: "Alcoholism within 5 years — decline; after 5 years without relapse and no current use — accept.",
        sleep_apnea: "Sleep apnea treated and controlled — accept.",
        dysplastic_nevi: "Reviewed individually."
      },
      diabetesNonMed: {
        accept: "Type 2 diabetes treated with non-insulin medication or diet, good control, non-smoker or <1 pack/day, no diabetic complications — accept (rating worksheet for build+diabetes).",
        decline: "Type 1 or Type 2 treated with insulin, poor control, or complications (heart, kidney, peripheral vascular, neuropathy, retinopathy) — decline."
      }
    },

    evidence: {
      ageAmountNote: "Non-medical limits: Your Term $400k (18-55) / $150k (56-80). SMART UL & Advantage Plus II $400k (16-55) / $150k (56-75). Strong Foundation $500k standard / $300k substandard (18-55); $250k / $150k (56-80).",
      adlq: "Activities of Daily Living Questionnaire required at ages 75+.",
      acceleratedUW: "Issue ages 18-60 up to $2,000,000; 61-65 up to $1,000,000 (Your Term, SMART UL, Advantage Plus II).",
      temporaryCoverage: "TIA: ages 16 days-70, face amounts up to $1,000,000 applied for; must truthfully answer 'No' to the 3 TIA questions and pay first-month premium; maximum payout lesser of face amount or $500,000."
    },

    financial: {
      incomeMultipliers: [
        { ageMin: 18, ageMax: 35, multiplier: 30 },
        { ageMin: 36, ageMax: 45, multiplier: 25 },
        { ageMin: 46, ageMax: 55, multiplier: 20 },
        { ageMin: 56, ageMax: 60, multiplier: 15 },
        { ageMin: 61, ageMax: 70, multiplier: 10 },
        { ageMin: 71, ageMax: 200, multiplier: "IC" }
      ],
      note: "Earned income = salary, commissions, bonuses (not investment, interest, retirement, or rental income). Estate protection and non-income-earning spouse considered individually."
    },

    /* No one-class credit is published in the current Foresters guides. */
    credit: null,

    classInfo: {
      preferred_plus: { name: "Preferred Plus Non-Tobacco", meaning: "No nicotine in past 5 years; meets all Preferred Plus criteria.", color: "#0e7a5f" },
      preferred: { name: "Preferred Non-Tobacco", meaning: "No nicotine in past 3 years; meets all Preferred criteria.", color: "#1b9a7a" },
      standard_plus: { name: "Standard Plus Non-Tobacco", meaning: "No nicotine in past year; meets Standard Plus criteria.", color: "#3b82b0" },
      standard: { name: "Standard Non-Tobacco", meaning: "No nicotine in past year; does not meet preferred criteria.", color: "#4a6fa5" },
      tobacco_plus: { name: "Tobacco Plus", meaning: "Nicotine use within the past year AND meets all Preferred Plus criteria; ≤ 1 pack per day.", color: "#b8860b" },
      table: { name: "Substandard / rated", meaning: "Extra premium or exclusions for conditions otherwise not insurable at standard.", color: "#b8860b" },
      postpone: { name: "Postponed", meaning: "Wait for stability, completed testing, or additional records (e.g., cancer 1+ years, CAD minimum 6 months, uninvestigated symptoms).", color: "#8a5fb8" },
      decline: { name: "Decline / specialist review", meaning: "Impairment outside current guidelines; some combinations of impairments are uninsurable.", color: "#b3364a" }
    }
  },

  /* ======================================================================
   * TRANSAMERICA — Trendsetter Super / Trendsetter LB, FFIUL II/IUL, FCIUL II/IUL
   * (third carrier mapping; BMI-based build, blended charts)
   * ==================================================================== */
  transamerica: {
    id: "transamerica",
    name: "Transamerica",
    company: "Transamerica Life Insurance Company",
    guide: {
      title: "A Field Guide to Underwriting: Trendsetter Super, Trendsetter LB, Transamerica Financial Foundation IUL II/IUL, Financial Choice IUL II/IUL",
      version: "03/25",
      note: "Rate classes shown are not guaranteed but are a best-case scenario. Actual offer is subject to underwriting and may vary by age, date of diagnosis, and severity."
    },

    /* ---- Nicotine ----------------------------------------------------- */
    nicotine: {
      classes: [
        { klass: "preferred_plus", lookbackMonths: 60, label: "Preferred Plus / Preferred Elite (no tobacco in 5 years)" },
        { klass: "preferred", lookbackMonths: 24, label: "Preferred Nonsmoker / Preferred Plus (no tobacco in 2 years)" },
        { klass: "standard_plus", lookbackMonths: 24, label: "Standard Plus / Preferred (no tobacco in 2 years)" },
        { klass: "standard", lookbackMonths: 24, label: "Standard Nonsmoker / Nontobacco (no tobacco in 2 years)" }
      ],
      tobaccoLookbackMonths: 24,
      tobaccoDefinition: "Tobacco usage is any tobacco product (cigarettes, cigars, chewing tobacco, nicotine patch/lozenge/gum, e-cigarettes, vapes with or without nicotine) within the past 24 months.",
      cigarException: {
        note: "Incidental cigar usage is available for non-tobacco classes subject to: admitted on the application, home-office specimen negative for cotinine, and no more than 1 cigar per month."
      }
    },

    /* ---- Build: blended BMI chart (sex-neutral), by age band ---------- */
    build: {
      type: "bmi",
      bmiBands: [
        {
          label: "Ages 16-59",
          ageMax: 59,
          bands: [
            { min: 0,      max: 16,      klass: "decline",        label: "≤ 16" },
            { min: 16.0001, max: 17,    klass: "standard",        label: "16.0001-17" },
            { min: 17.0001, max: 28,    klass: "preferred_plus",  label: "17.0001-28" },
            { min: 28.0001, max: 30,    klass: "preferred",       label: "28.0001-30" },
            { min: 30.0001, max: 32,    klass: "standard_plus",   label: "30.0001-32" },
            { min: 32.0001, max: 35,    klass: "standard",        label: "32.0001-35" },
            { min: 35.0001, max: 37,    klass: "table", table: "A", label: "35.0001-37 (Table A)" },
            { min: 37.0001, max: 39,    klass: "table", table: "B", label: "37.0001-39 (Table B)" },
            { min: 39.0001, max: 41,    klass: "table", table: "C", label: "39.0001-41 (Table C)" },
            { min: 41.0001, max: 42,    klass: "table", table: "D", label: "41.0001-42 (Table D)" },
            { min: 42.0001, max: 43,    klass: "table", table: "E", label: "42.0001-43 (Table E)" },
            { min: 43.0001, max: 44,    klass: "table", table: "F", label: "43.0001-44 (Table F)" },
            { min: 44.0001, max: 46,    klass: "table", table: "H", label: "44.0001-46 (Table H)" },
            { min: 46.0001, max: 999,   klass: "decline",        label: "> 46" }
          ]
        },
        {
          label: "Ages 60+",
          ageMin: 60,
          bands: [
            { min: 0,      max: 16,      klass: "decline",          label: "≤ 16" },
            { min: 16.0001, max: 18,    klass: "standard",          label: "16.0001-18 (individual consideration)" },
            { min: 18.0001, max: 28,    klass: "preferred_plus",    label: "18.0001-28" },
            { min: 28.0001, max: 30,    klass: "preferred",         label: "28.0001-30" },
            { min: 30.0001, max: 32,    klass: "standard_plus",     label: "30.0001-32" },
            { min: 32.0001, max: 35,    klass: "standard",          label: "32.0001-35" },
            { min: 35.0001, max: 37,    klass: "table", table: "A", label: "35.0001-37 (Table A)" },
            { min: 37.0001, max: 39,    klass: "table", table: "B", label: "37.0001-39 (Table B)" },
            { min: 39.0001, max: 41,    klass: "table", table: "C", label: "39.0001-41 (Table C)" },
            { min: 41.0001, max: 42,    klass: "table", table: "D", label: "41.0001-42 (Table D)" },
            { min: 42.0001, max: 43,    klass: "table", table: "E", label: "42.0001-43 (Table E)" },
            { min: 43.0001, max: 44,    klass: "table", table: "F", label: "43.0001-44 (Table F)" },
            { min: 44.0001, max: 46,    klass: "table", table: "H", label: "44.0001-46 (Table H)" },
            { min: 46.0001, max: 999,   klass: "decline",           label: "> 46" }
          ]
        }
      ],
      rules: {
        note: "Blended (sex-neutral) BMI chart. BMI is the rating rule for build — not a height/weight lookup. BMI ≤ 16 or > 46 → decline. Trendsetter LB band classes differ slightly in naming (Preferred Elite, Preferred Plus/Preferred Tobacco)."
      }
    },

    /* ---- Blood pressure (with or without treatment) ------------------ */
    bp: {
      preferred_plus:   [{ ageMin: 0, ageMax: 70, sys: 135, dia: 85 }, { ageMin: 71, ageMax: 200, sys: 145, dia: 85 }],
      preferred:        [{ ageMin: 0, ageMax: 70, sys: 145, dia: 85 }, { ageMin: 71, ageMax: 200, sys: 150, dia: 90 }],
      standard_plus:    [{ ageMin: 0, ageMax: 70, sys: 148, dia: 88 }, { ageMin: 71, ageMax: 200, sys: 152, dia: 88 }],
      standard:         null
    },
    bpTreatmentNote: "Preferred Plus: through age 49 without treatment; ages 50-80 with treatment if readings fit; 81+ without treatment. Preferred / Standard Plus: with or without treatment.",

    /* ---- Cholesterol / HDL ------------------------------------------- */
    cholesterol: {
      total: {
        preferred_plus: 230,
        preferred: 260,
        standard_plus: 300
      },
      ratio: {
        preferred_plus: [{ ageMin: 0, ageMax: 70, max: 5.0 }, { ageMin: 71, ageMax: 200, max: 5.5 }],
        preferred:      [{ ageMin: 0, ageMax: 70, max: 5.5 }, { ageMin: 71, ageMax: 200, max: 6.0 }],
        standard_plus:  [{ ageMin: 0, ageMax: 70, max: 6.2 }, { ageMin: 71, ageMax: 200, max: 6.7 }],
        standard:       [{ ageMin: 0, ageMax: 70, max: 7.0 }, { ageMin: 71, ageMax: 200, max: 7.5 }]
      },
      note: "Total cholesterol criteria are published for preferred classes; Standard Nonsmoker has no published cholesterol ceiling. Ratio ceilings: Standard 7.0 (≤70) / 7.5 (71+)."
    },

    /* ---- Driving (DUI/reckless + MVR violations) --------------------- */
    driving: {
      preferred_plus:   { duiCleanYears: 5, maxViolations: 2, violationsYears: 3, note: "No DUI/reckless in past 5 years; no more than 1 serious violation in past 3 years and none in past 12 months; up to 2 minor violations within the last year." },
      preferred:        { maxViolations: 1, violationsYears: 3, note: "No DUI criterion published; no more than 1 serious violation in past 3 years." },
      standard_plus:    null,
      standard:         { duiCleanYears: 5, maxViolations: 2, violationsYears: 3, note: "No DUI/reckless in past 5 years; no more than 1 serious violation in past 3 years; up to 2 minor violations within the last year." }
    },

    /* ---- Family history ---------------------------------------------- */
    familyHistory: {
      mapping: { none: "preferred_plus", parent: "standard_plus", parent_sibling: "standard_plus", multiple: "standard" },
      preferred_plus: { text: "No death in parent or sibling prior to age 60 from cardiovascular disease or cancer (breast, ovarian, melanoma, prostate, colon)." },
      preferred:      { text: "No death in parent or sibling prior to age 60 from cardiovascular disease or listed cancers." },
      standard_plus:  { text: "No more than one parent or sibling death prior to age 60 from cardiovascular disease or listed cancers." },
      standard:       null
    },

    /* Substance-abuse-treatment ceilings by recovery duration (Transamerica:
       preferred classes require no history at any time; Standard Plus none in 10 yrs; Standard none in 7 yrs) */
    substanceTiers: { declineYears: 2, tiers: [{ minYears: 10, klass: "standard_plus" }, { minYears: 7, klass: "standard" }, { minYears: 0, klass: "table" }] },

    /* Conditions that exclude the preferred classes (preferred requires
       no heart/vascular disease, diabetes, or cancer — some skin cancers excepted) */
    medicalStandardCap: ["diabetes", "cad", "heart_disease", "stroke", "other_cancer", "kidney_disease"],
    /* Impairment-table declines, keyed to catalog condition ids */
    autoDeclineIds: ["hiv", "dementia", "schizophrenia", "bipolar", "liver_disease", "transplant", "paralysis"],
    autoDeclineSevereIds: ["heart_disease", "kidney_disease", "other_cancer", "stroke"],

    medicalCeilings: [
      { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "preferred_plus", when: "well controlled; impairment table lists anxiety as insurable at preferred" }], worse: "Severity, treatment, and hospitalization history reviewed individually." },
      { id: "depression", name: "Depression", ceilings: [{ klass: "preferred_plus", when: "mild and well controlled; suicide attempt more than 2 years ago may still be standard" }], worse: "Suicide attempt within 2 years → postpone screen." },
      { id: "asthma", name: "Asthma", ceilings: [{ klass: "preferred_plus", when: "mild/controlled; listed as insurable at preferred" }], worse: "Severe or hospitalized asthma reviewed individually." },
      { id: "sleep_apnea", name: "Sleep apnea", ceilings: [{ klass: "preferred_plus", when: "treated and controlled" }] },
      { id: "hypertension", name: "High blood pressure", ceilings: [{ klass: "preferred_plus", when: "readings within class limits, with or without treatment" }], note: "Treatment alone does not prevent preferred consideration." },
      { id: "high_cholesterol", name: "High cholesterol", ceilings: [{ klass: "preferred_plus", when: "total and ratio within class limits, with or without treatment" }] },
      { id: "skin_cancer", name: "Skin cancer (basal / squamous, non-melanoma)", ceilings: [{ klass: "preferred_plus", when: "non-melanoma skin cancer" }] },
      { id: "other_cancer", name: "Other cancer history", ceilings: [{ klass: "standard", when: "cancer (internal organ) caps at Standard; preferred classes require no cancer history" }], postpone: "Cancer undergoing treatment — postpone/decline until treatment complete.", decline: "Terminal illness — decline." },
      { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard", when: "preferred classes require no diabetes history — Standard Nonsmoker at best" }], decline: "Insulin use or complications may affect living-benefit riders; base rating individual consideration.", note: "Diabetes with insulin use is on the living-benefit coverage exclusion list." },
      { id: "cad", name: "Coronary artery disease", ceilings: [{ klass: "standard", when: "preferred classes require no heart or vascular disease" }], postpone: "Recent heart attack within 6 months." },
      { id: "heart_disease", name: "Heart disease (CHF, cardiomyopathy, valve, device)", ceilings: [{ klass: "standard", when: "preferred classes require no heart or vascular disease" }], decline: "Cardiomyopathy, CHF, pacemaker, or heart transplant — decline or specialist review." },
      { id: "stroke", name: "Stroke / TIA", ceilings: [{ klass: "standard", when: "preferred classes require no heart or vascular disease" }], decline: "CVA/stroke is on the living-benefit exclusion list; base rating individual consideration." },
      { id: "seizures", name: "Seizures / epilepsy", ceilings: [{ klass: "preferred_plus", when: "epilepsy (age 3+) listed as insurable; controlled with treatment" }] },
      { id: "substance_treatment", name: "Alcohol/drug treatment history", ceilings: [{ klass: "standard_plus", when: "no history or treatment in past 10 years (Standard Plus); 7 years (Standard); preferred classes require none at any time" }], decline: "Alcoholism — decline." },
      { id: "bipolar", name: "Bipolar disorder", ceilings: [], decline: "Bipolar disorder listed in the decline column of the impairment table." },
      { id: "schizophrenia", name: "Schizophrenia", ceilings: [], decline: "Schizophrenia / psychosis — decline." },
      { id: "hiv", name: "HIV / AIDS", ceilings: [], decline: "AIDS — decline." },
      { id: "dementia", name: "Alzheimer's / dementia", ceilings: [], decline: "Alzheimer's disease / dementia — decline." },
      { id: "liver_disease", name: "Liver disease", ceilings: [], decline: "Cirrhosis — decline." },
      { id: "kidney_disease", name: "Kidney disease", ceilings: [{ klass: "standard", when: "stable kidney history; preferred classes require no significant impairment" }], decline: "Kidney failure / dialysis — decline." },
      { id: "transplant", name: "Organ transplant", ceilings: [], decline: "Heart, lung, or liver transplant — decline." },
      { id: "paralysis", name: "Paralysis", ceilings: [], decline: "Spinal cord injury / paralysis — decline." },
      { id: "copd", name: "COPD / emphysema / chronic bronchitis", ceilings: [{ klass: "preferred_plus", when: "emphysema/COPD listed as insurable (preferred may be possible); severity reviewed" }] },
      { id: "mvp", name: "Mitral valve prolapse / insufficiency", ceilings: [{ klass: "preferred_plus", when: "MVP listed as insurable; no significant insufficiency" }], worse: "Mitral stenosis reviewed separately." },
      { id: "osteoporosis", name: "Osteoporosis", ceilings: [{ klass: "preferred_plus", when: "no complications" }] },
      { id: "autism", name: "Autism", ceilings: [{ klass: "standard", when: "individual consideration" }] },
      { id: "dysplastic_nevi", name: "Dysplastic nevi", ceilings: [{ klass: "preferred_plus", when: "no melanoma history; surveillance screening may be required" }], worse: "Melanoma (less than 2, including in situ) — preferred may still be available." },
      { id: "cimt", name: "Carotid imaging (CIMT)", ceilings: [{ klass: "preferred_plus", when: "reviewed individually" }] }
    ],

    /* ---- Postpone triggers (shared gates, Transamerica flavor) ------- */
    postponeTriggers: [
      { id: "pending_test", text: "Pending test, referral, surgery, or evaluation with unknown results", reason: "Uninvestigated outcome can matter more than known history." },
      { id: "recent_hospitalization", text: "Hospitalization or advised hospitalization within the past 4 months", reason: "Insufficient stability." },
      { id: "recent_surgery", text: "Surgery performed or recommended within the past 4 months with unfinished/unknown results", reason: "Insufficient stability." },
      { id: "active_symptom", text: "Uninvestigated active symptom under first-time evaluation", reason: "Uninvestigated symptom." },
      { id: "cancer_treatment", text: "Cancer undergoing treatment", reason: "Postpone until treatment complete." },
      { id: "mi_recent", text: "Heart attack within the last 6 months", reason: "Postpone period." },
      { id: "suicide_attempt_recent", text: "Suicide attempt within the last 2 years", reason: "After 2 years, standard may be possible." },
      { id: "pregnancy_complications", text: "Current or complicated pregnancy", reason: "Postpone to 3 months postpartum." }
    ],

    /* ---- Decline / specialist-review triggers ------------------------ */
    declineTriggers: [
      { id: "hiv", text: "AIDS / HIV-positive", reason: "Impairment table — decline." },
      { id: "dementia", text: "Alzheimer's disease / dementia", reason: "Impairment table — decline." },
      { id: "alcohol_active", text: "Alcoholism (current or recent)", reason: "Impairment table — decline." },
      { id: "drug_use_recent", text: "Drug abuse (non-marijuana, recent or multiple relapses)", reason: "Decline screen." },
      { id: "bipolar", text: "Bipolar disorder", reason: "Impairment table — decline." },
      { id: "schizophrenia", text: "Schizophrenia / psychosis", reason: "Impairment table — decline." },
      { id: "cirrhosis", text: "Cirrhosis of the liver", reason: "Impairment table — decline." },
      { id: "cardiomyopathy", text: "Cardiomyopathy / CHF / pacemaker", reason: "Impairment table — decline." },
      { id: "renal_failure", text: "Kidney failure / dialysis", reason: "Impairment table — decline." },
      { id: "transplant", text: "Heart, lung, or liver transplant", reason: "Impairment table — decline." },
      { id: "paralysis", text: "Spinal cord injury / paralysis", reason: "Impairment table — decline." },
      { id: "terminal", text: "Terminal illness", reason: "Impairment table — decline." },
      { id: "adl_dependence", text: "Assistance needed with activities of daily living", reason: "Impacted ADLs — decline." },
      { id: "facility_care", text: "Facility / hospice / home-health care or chronic wheelchair use", reason: "Strong specialist-review trigger." }
    ],

    /* ---- Evidence / workflow ----------------------------------------- */
    evidence: {
      apsConditions: [
        "Cancer", "Diabetes", "Heart (cardiac) disease", "Cerebrovascular disease", "COPD",
        "Kidney disease", "Liver disease", "Mental-health disorders", "Substance abuse/dependence",
        "Multiple sclerosis", "Parkinson's disease", "Muscular dystrophy", "Rheumatoid arthritis", "Lupus"
      ],
      note: "Transamerica orders all requirements. Digital underwriting (iGO e-App) can produce a decision within minutes; applicants receiving a digital decision are not reconsidered for a better class.",
      cognitiveScreen: "Minnesota Cognitive Acuity Screen (CS) required at age 70+ for face amounts $100,000 and higher; face-to-face CS for LTC rider applicants 70+.",
      fluidless: "Highlighted age/amount cells may qualify for fluidless processing (no blood/urine) — verify against the current age-and-face-amount chart.",
      temporaryCoverage: "Follow Transamerica receipt rules; the estimate does not establish temporary coverage.",
      apsGuidelines: "APS: not routine to age 50 up to $1M (for cause only); ages 61-69 with $1M-$3M preferred classes — within last 5 years with established PCP; 70+ always required."
    },

    /* ---- Financial justification ------------------------------------- */
    financial: {
      incomeMultipliers: [
        { ageMin: 18, ageMax: 35, multiplier: 30 },
        { ageMin: 36, ageMax: 45, multiplier: 25 },
        { ageMin: 46, ageMax: 50, multiplier: 20 },
        { ageMin: 51, ageMax: 55, multiplier: 15 },
        { ageMin: 56, ageMax: 65, multiplier: 10 },
        { ageMin: 66, ageMax: 70, multiplier: 5 },
        { ageMin: 71, ageMax: 200, multiplier: "IC" }
      ],
      premiumToIncome: "Premium-to-income: ≤ 15% for annual income under $30,000; ≤ 20% for income of $30,001 and above.",
      note: "Income = salary, bonuses, commissions, and deferred compensation (excludes investment income). High-net-worth applicants may be considered beyond the formula with cover letter and financial evidence. IRS Form 4506-C required at $5M+."
    },

    /* No one-class credit is published in the Transamerica field guide. */
    credit: null,

    classInfo: {
      preferred_plus: { name: "Preferred Plus / Preferred Elite", meaning: "No tobacco in past 5 years; no heart/vascular disease, diabetes, or cancer (except some skin cancers); BMI 17-28 (ages 16-59).", color: "#0e7a5f" },
      preferred: { name: "Preferred Nonsmoker / Preferred Plus", meaning: "No tobacco in past 2 years; meets preferred criteria (BMI 28-30; BP ≤145/85; chol ≤260; ratio ≤5.5).", color: "#1b9a7a" },
      standard_plus: { name: "Standard Plus / Preferred", meaning: "Meets Standard Plus criteria (BMI 30-32; BP ≤148/88; chol ≤300; ratio ≤6.2).", color: "#3b82b0" },
      standard: { name: "Standard Nonsmoker / Nontobacco", meaning: "Average insurable risk; no ratable impairments for the standard class requirement.", color: "#4a6fa5" },
      table: { name: "Table-rated (A-H)", meaning: "BMI or impairment outside Standard — Table A through H; premiums calculated from standard rates.", color: "#b8860b" },
      postpone: { name: "Postpone / pre-review", meaning: "Wait for stability, completed testing, or recovery (e.g., cancer treatment complete, heart attack 6 months, suicide attempt 2 years).", color: "#8a5fb8" },
      decline: { name: "Decline / specialist review", meaning: "Impairment listed as decline in the field guide, or outside current eligibility — carrier direction required.", color: "#b3364a" }
    }
  },

  /* ======================================================================
   * MUTUAL OF OMAHA — United of Omaha Life Insurance Company
   * "Underwriting Guidelines — Life Insurance Brokerage" (417212_0120,
   * as of January 2020), term and permanent products.
   * ==================================================================== */
  mutual_of_omaha: {
    id: "mutual_of_omaha",
    name: "Mutual of Omaha",
    company: "United of Omaha Life Insurance Company (a Mutual of Omaha company)",
    guide: {
      title: "Underwriting Guidelines — Life Insurance (Brokerage), For Term and Permanent Products",
      version: "417212_0120 (January 2020)",
      note: "United of Omaha uses age last birthday (advantage to the applicant). Unisex build charts. Fit underwriting credit program: up to 2 table credits (3 characteristics = 1 credit; 5 = 2 credits) for ages 18-75, $100K-$5M, non-tobacco, base rating Table 4 or less — best final class is Standard; excludes flat extras, current rateable substance abuse, CAD before age 50, stroke/rateable cancer, and Type 1 diabetes. Express simplified lanes (TLE/GULE/IULE, ages 18-70) are separate and decline many impairments that fully underwritten review may still rate."
    },

    /* ---- Nicotine ----------------------------------------------------- */
    nicotine: {
      classes: [
        { klass: "preferred_plus", lookbackMonths: 36, label: "Preferred Plus Non-Tobacco (no nicotine 36 months)" },
        { klass: "preferred", lookbackMonths: 24, label: "Preferred Non-Tobacco (no nicotine 24 months)" },
        { klass: "standard_plus", lookbackMonths: 12, label: "Standard Plus Non-Tobacco (no nicotine 12 months)" },
        { klass: "standard", lookbackMonths: 12, label: "Standard Non-Tobacco (no nicotine 12 months)" }
      ],
      tobaccoLookbackMonths: 12,
      tobaccoDefinition: "Non-nicotine rates require no tobacco or nicotine use in any form (gum, patch, cigar, vaping, e-cigarettes, hookah) within one year prior to application. Best tobacco class is Preferred Tobacco.",
      cigarException: {
        note: "Occasional celebratory cigar — up to 24 cigars per year — may qualify for non-tobacco rates with a negative urinalysis test (Preferred Plus, Preferred & Standard Plus are all available with negative HOS).",
        maxPerMonth: 2,
        maxPerYear: 24
      },
      marijuana: "History of and current experimental, occasional, or intermittent marijuana use is allowed for Preferred and Standard Plus (ages 18+); CBD oil allowed if no debits for chronic pain. Marijuana impairment line: Preferred to Decline depending on frequency."
    },

    /* ---- Build: unisex height/weight chart, with published tables ---- */
    /* Columns: Preferred Plus, Preferred, Standard Plus, Standard, then
       Table 1 (+25) through Table 12 (+300) per the build chart (p. 22-23). */
    build: {
      chart: {
        56:  { pp: 125, p: 144, sp: 153, stdCredit: 158, std: 158, t1: 170, t2: 184, t3: 190, t4: 197, t5: 204, t6: 212, t8: 221, t10: 230, t12: 240 },
        57:  { pp: 131, p: 150, sp: 160, stdCredit: 165, std: 165, t1: 176, t2: 189, t3: 195, t4: 202, t5: 209, t6: 216, t8: 225, t10: 234, t12: 244 },
        58:  { pp: 135, p: 155, sp: 165, stdCredit: 170, std: 170, t1: 182, t2: 194, t3: 201, t4: 208, t5: 214, t6: 222, t8: 231, t10: 240, t12: 249 },
        59:  { pp: 141, p: 160, sp: 170, stdCredit: 176, std: 176, t1: 187, t2: 199, t3: 207, t4: 214, t5: 220, t6: 228, t8: 237, t10: 245, t12: 254 },
        60:  { pp: 146, p: 166, sp: 177, stdCredit: 184, std: 184, t1: 193, t2: 205, t3: 213, t4: 220, t5: 226, t6: 235, t8: 244, t10: 253, t12: 262 },
        61:  { pp: 152, p: 173, sp: 185, stdCredit: 191, std: 191, t1: 199, t2: 211, t3: 218, t4: 226, t5: 233, t6: 242, t8: 250, t10: 259, t12: 269 },
        62:  { pp: 158, p: 179, sp: 190, stdCredit: 197, std: 197, t1: 205, t2: 215, t3: 223, t4: 232, t5: 239, t6: 248, t8: 257, t10: 266, t12: 277 },
        63:  { pp: 164, p: 184, sp: 195, stdCredit: 203, std: 203, t1: 213, t2: 220, t3: 228, t4: 238, t5: 246, t6: 255, t8: 264, t10: 275, t12: 284 },
        64:  { pp: 169, p: 189, sp: 200, stdCredit: 209, std: 209, t1: 221, t2: 225, t3: 235, t4: 245, t5: 252, t6: 261, t8: 270, t10: 281, t12: 292 },
        65:  { pp: 174, p: 194, sp: 205, stdCredit: 215, std: 215, t1: 226, t2: 231, t3: 242, t4: 251, t5: 259, t6: 268, t8: 277, t10: 286, t12: 299 },
        66:  { pp: 180, p: 200, sp: 210, stdCredit: 222, std: 222, t1: 232, t2: 239, t3: 248, t4: 258, t5: 268, t6: 276, t8: 285, t10: 293, t12: 308 },
        67:  { pp: 185, p: 205, sp: 215, stdCredit: 228, std: 228, t1: 239, t2: 245, t3: 254, t4: 265, t5: 275, t6: 284, t8: 293, t10: 303, t12: 316 },
        68:  { pp: 189, p: 209, sp: 220, stdCredit: 235, std: 235, t1: 246, t2: 251, t3: 262, t4: 274, t5: 283, t6: 291, t8: 300, t10: 312, t12: 324 },
        69:  { pp: 195, p: 215, sp: 225, stdCredit: 242, std: 242, t1: 254, t2: 258, t3: 270, t4: 282, t5: 291, t6: 299, t8: 309, t10: 319, t12: 331 },
        70:  { pp: 200, p: 221, sp: 232, stdCredit: 250, std: 250, t1: 262, t2: 266, t3: 278, t4: 289, t5: 300, t6: 307, t8: 316, t10: 327, t12: 340 },
        71:  { pp: 206, p: 227, sp: 237, stdCredit: 258, std: 258, t1: 269, t2: 274, t3: 287, t4: 298, t5: 307, t6: 315, t8: 325, t10: 339, t12: 349 },
        72:  { pp: 211, p: 232, sp: 244, stdCredit: 265, std: 265, t1: 275, t2: 281, t3: 292, t4: 305, t5: 315, t6: 322, t8: 333, t10: 348, t12: 356 },
        73:  { pp: 217, p: 239, sp: 252, stdCredit: 271, std: 271, t1: 282, t2: 289, t3: 300, t4: 313, t5: 322, t6: 330, t8: 340, t10: 355, t12: 365 },
        74:  { pp: 222, p: 244, sp: 257, stdCredit: 279, std: 279, t1: 289, t2: 296, t3: 308, t4: 321, t5: 331, t6: 339, t8: 349, t10: 366, t12: 374 },
        75:  { pp: 228, p: 250, sp: 262, stdCredit: 285, std: 285, t1: 296, t2: 303, t3: 317, t4: 329, t5: 339, t6: 348, t8: 358, t10: 376, t12: 383 },
        76:  { pp: 233, p: 255, sp: 268, stdCredit: 292, std: 292, t1: 301, t2: 311, t3: 325, t4: 338, t5: 348, t6: 357, t8: 367, t10: 385, t12: 394 },
        77:  { pp: 239, p: 261, sp: 274, stdCredit: 298, std: 298, t1: 307, t2: 319, t3: 334, t4: 347, t5: 357, t6: 366, t8: 376, t10: 393, t12: 402 },
        78:  { pp: 246, p: 268, sp: 280, stdCredit: 307, std: 307, t1: 313, t2: 328, t3: 345, t4: 358, t5: 366, t6: 375, t8: 385, t10: 405, t12: 413 },
        79:  { pp: 252, p: 274, sp: 286, stdCredit: 313, std: 313, t1: 320, t2: 336, t3: 354, t4: 367, t5: 375, t6: 384, t8: 394, t10: 413, t12: 422 },
        80:  { pp: 258, p: 280, sp: 294, stdCredit: 320, std: 320, t1: 327, t2: 345, t3: 363, t4: 376, t5: 385, t6: 395, t8: 405, t10: 422, t12: 431 },
        81:  { pp: 264, p: 287, sp: 302, stdCredit: 326, std: 326, t1: 335, t2: 352, t3: 372, t4: 385, t5: 395, t6: 406, t8: 415, t10: 435, t12: 444 },
        82:  { pp: 270, p: 294, sp: 310, stdCredit: 334, std: 334, t1: 343, t2: 359, t3: 382, t4: 395, t5: 407, t6: 418, t8: 427, t10: 444, t12: 462 }
      },
      tableBands: [
        { key: "t1", table: 1 }, { key: "t2", table: 2 }, { key: "t3", table: 3 }, { key: "t4", table: 4 },
        { key: "t5", table: 5 }, { key: "t6", table: 6 }, { key: "t8", table: 8 }, { key: "t10", table: 10 }, { key: "t12", table: 12 }
      ],
      rules: {
        minHeightIn: 56,
        maxHeightIn: 82,
        chartMinWeight: 89,
        halfInchRounding: "Half-inch measurements round up to the next inch.",
        applyWeightLossAdjustment: false,
        weightLossAdjustment: "Weight stability is reviewed; significant recent weight change (gain or loss) — manual underwriting review.",
        lowBuildReview: "Weight below chart minimum or BMI below 18.5 -> manual underwriting review.",
        belowChartMin: 18.5,
        aboveStandard: "Weight above Table 12 maximum -> manual underwriting review (do not guess beyond the published table ladder).",
        note: "Unisex build chart with published table ratings: above Standard, build supports Table 1 (+25 lb) through Table 12 (+300 lb) directly from the chart. Fit program table credits may improve the final table rating."
      }
    },

    /* ---- Blood pressure (class criteria, p. 18-20) ------------------ */
    bp: {
      preferred_plus:   { sys: 140, dia: 85 },
      preferred:        { sys: 145, dia: 90 },
      standard_plus:    { sys: 150, dia: 90 },
      standard:         null
    },
    bpTreatmentNote: "Treatment allowed with good control for Preferred Plus / Preferred / Standard Plus (guide thresholds are stated as < 140/85, < 145/90, < 150/90). Above 150/90 — substandard / cardiovascular review; the guide publishes no higher Standard threshold.",

    /* ---- Cholesterol (class criteria, p. 18-20) ---------------------- */
    cholesterol: {
      totalMax: 300,
      ratio: {
        preferred_plus: 5.0,
        preferred: 6.0,
        standard_plus: 7.0,
        standard: null
      },
      note: "Average of 3 cholesterols over the past 12 months when available. Total cholesterol cannot exceed 300 for preferred classes. Treatment for cholesterol does not exclude Preferred Plus / Preferred / Standard Plus. (Strength page lists Standard Plus ratio < 7.5; per-class criteria page 20 lists < 7.0 — the criteria page is used.)"
    },

    /* ---- Driving (class criteria) ------------------------------------ */
    driving: {
      preferred_plus:   { duiCleanYears: 5, violationsYears: 0, note: "No convictions for DWI, DUI or reckless driving within the last five years and otherwise not rateable." },
      preferred:        { duiCleanYears: 5, violationsYears: 0, note: "No convictions for DWI, DUI or reckless driving within the last five years and otherwise not rateable." },
      standard_plus:    { duiCleanYears: 5, violationsYears: 0, note: "No convictions for DWI, DUI or reckless driving within the last five years and otherwise not rateable." },
      standard:         null
    },

    /* ---- Family history ---------------------------------------------- */
    familyHistory: {
      mapping: { none: "preferred_plus", parent: "preferred", parent_sibling: "standard_plus", multiple: "standard" },
      disregardAge: 60,
      preferred_plus: { text: "No death of a parent prior to age 60 due to cancer or heart disease. (Family history does not apply at age 60 or older, or for gender-specific cancers of the opposite sex; applies to deaths, not disease; deaths due to diabetes can qualify.)" },
      preferred:      { text: "No death of a parent prior to age 60 due to cancer or heart disease; with good risk factors and a negative cardiac workup appropriate for age, one cardiac death is allowed." },
      standard_plus:  { text: "One death of a parent prior to age 60 due to heart disease allowed." },
      standard:       { text: "More than one parent death prior to age 60 from cancer or heart disease — below Standard Plus criteria." }
    },

    /* Alcohol & drug class criteria: allowed after 15 / 10 / 5 years for
       Preferred Plus / Preferred / Standard Plus. Impairment table: alcoholism
       treatment postponed 2 years then Standard-Table 8; cocaine/drug addiction
       postponed 3 years then Standard-Table 8. */
    substanceTiers: { declineYears: 2, tiers: [{ minYears: 15, klass: "preferred_plus" }, { minYears: 10, klass: "preferred" }, { minYears: 5, klass: "standard_plus" }, { minYears: 0, klass: "standard" }] },

    /* Preferred classes require no history of CAD, diabetes, or cancer
       (basal cell and superficial squamous cell skin cancer allowed). */
    medicalStandardCap: ["diabetes", "cad", "heart_disease", "stroke", "other_cancer", "kidney_disease"],

    /* Impairment-table conditions that are decline screens when current */
    autoDeclineIds: ["dementia", "schizophrenia", "hiv"],
    autoDeclineSevereIds: ["heart_disease", "kidney_disease", "liver_disease"],

    /* Carrier-specific model overrides for engine-computed conditions.
       best = the best-case (most favorable) class; the engine floors the
       computed ceiling at this class. */
    conditionModels: {
      anxiety: { best: "standard" },       // impairment: mild/well-controlled = Standard
      depression: { best: "standard" },    // impairment: controlled w/ medication = Standard-Table 3
      asthma: { best: "preferred" },       // strengths: mild asthma may be Preferred
      bipolar: { best: "table" },          // impairment: stable = Table 2-8
      other_cancer: { waitYears: 5, afterCeiling: "table" }  // postponed 2-5 yrs, then individual consideration
    },

    /* Type 1 diabetes -> Table 2-8; Type 2 -> Standard-Table 8 (impairment table) */
    diabetes: { type1Ceiling: "table", type2Ceiling: "standard" },

    /* Hazardous occupation / avocation class criteria (p. 18-20):
       Preferred Plus — no hazardous occupation/avocation/sport in last 5 years;
       Preferred — none in last 2 years; Standard Plus — flat extras allowed. */
    avocation: {
      currentHazardousText: "Hazardous occupation/avocation disclosed — Preferred classes require no hazardous occupation, avocation, or sport (Preferred Plus: 5 years, Preferred: 2 years); Standard Plus allows flat extras. Aviation, diving, and climbing have published flat-extra schedules (e.g., private pilots with aviation exclusion may qualify for preferred classes; scuba <100 ft certified may qualify for all preferred classes).",
      cleanText: "No hazardous occupation or avocation disclosed."
    },

    medicalCeilings: [
      { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "standard", when: "mild or well controlled" }], worse: "Others — Standard to Table 4." },
      { id: "depression", name: "Depression", ceilings: [{ klass: "standard", when: "controlled with medication" }], worse: "Standard to Table 3; suicide attempt — single attempt over 1 year $5/M flat extra, over 5 years Standard, multiple attempts decline." },
      { id: "bipolar", name: "Bipolar disorder", ceilings: [{ klass: "table", table: 2, when: "stable (best case Table 2)" }], worse: "Stable — Table 2 to 8." },
      { id: "schizophrenia", name: "Schizophrenia", ceilings: [], decline: "Not listed in the published impairment table — carrier pre-screen / specialist review required." },
      { id: "substance_treatment", name: "Alcohol/drug treatment history", ceilings: [{ klass: "preferred_plus", when: "alcohol & drug allowed after 15 years (Preferred Plus), 10 years (Preferred), 5 years (Standard Plus)" }], worse: "Alcoholism treatment, no current use, postponed 2 years then Standard-Table 8; cocaine / drug addiction postponed 3 years then Standard-Table 8.", decline: "Current excessive alcohol use — decline." },
      { id: "hypertension", name: "High blood pressure", ceilings: [{ klass: "preferred_plus", when: "readings within class limits, treatment allowed with good control" }], note: "Treatment for hypertension does not exclude Preferred Plus / Preferred / Standard Plus. Controlled hypertension (impairment table) — Standard." },
      { id: "high_cholesterol", name: "High cholesterol", ceilings: [{ klass: "preferred_plus", when: "ratio within class limits; treatment allowed; total cholesterol ≤ 300" }], note: "Treatment for cholesterol does not exclude the preferred classes. Controlled hyperlipidemia (impairment table) — Standard." },
      { id: "cad", name: "Coronary artery disease / angina", ceilings: [{ klass: "table", table: 2, when: "stable angina with favorable cardiac evaluation (best case Table 2)" }], postpone: "Recent heart event or unstable presentation — postpone for stability.", worse: "Angina Table 2-8; unstable angina under age 40 — decline; myocardial infarction over age 40 — Table 4 to decline." },
      { id: "heart_disease", name: "Heart disease (CHF, cardiomyopathy, valve, device)", ceilings: [{ klass: "table", table: 4, when: "myocardial infarction over age 40 or significant heart history (best case Table 4)" }], postpone: "Recent event within the stability window.", decline: "Cardiomyopathy, chronic congestive heart failure, or end-stage heart disease — decline.", worse: "CHF/cardiomyopathy — decline; heart attack (MI) over 40 — Table 4 to decline; pacemaker (no other heart disease, 3+ months, over 40) — Table 2-4." },
      { id: "stroke", name: "Stroke / TIA", ceilings: [{ klass: "table", table: 4, when: "single event, no complications, stable 1+ years (best case Table 4 plus flat)" }], decline: "Multiple strokes or severe residual disability — decline.", worse: "Stroke — 1 year since event, Table 4 plus flat extra to decline; TIA — single event over 6 months Table 2-4, multiple events over 1 year Table 4-8." },
      { id: "asthma", name: "Asthma", ceilings: [{ klass: "preferred", when: "mild (strengths: 'Mild Asthma clients may be eligible for Preferred')" }], worse: "Mild intermittent — Standard; persistent — Table 2 to decline depending on severity." },
      { id: "copd", name: "COPD / emphysema / chronic bronchitis", ceilings: [{ klass: "standard", when: "mild chronic bronchitis" }], worse: "COPD — Standard to Table 8; chronic severe — Table 4 to decline; emphysema — Standard to Table 8." },
      { id: "sleep_apnea", name: "Sleep apnea", ceilings: [{ klass: "preferred", when: "mild with verified c-PAP usage (strengths)" }], worse: "Successfully treated — Standard to Table 3." },
      { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard", when: "Type 2, onset after age 20 (impairment: Standard to Table 8)" }], worse: "Type 1 — Table 2 to 8; complications or A1c > 10 — decline/postpone screen." },
      { id: "kidney_disease", name: "Kidney disease", ceilings: [{ klass: "standard", when: "stable chronic nephritis with good renal function (Standard to Table 4)" }], decline: "Renal failure, dialysis, or poor renal function — decline.", worse: "Polycystic kidney disease with normal function — Table 2-8; abnormal function — decline." },
      { id: "liver_disease", name: "Liver disease", ceilings: [{ klass: "standard", when: "controlled chronic hepatitis (Standard to Decline)" }], decline: "Confirmed cirrhosis — decline.", worse: "Chronic hepatitis — Standard to Decline; esophageal varices — decline." },
      { id: "hiv", name: "HIV / AIDS", ceilings: [], decline: "Not addressed in the published impairment table — carrier pre-screen / specialist review required." },
      { id: "dementia", name: "Alzheimer's / dementia", ceilings: [], decline: "Alzheimer's disease / senile dementia — decline." },
      { id: "seizures", name: "Seizures / epilepsy", ceilings: [{ klass: "table", table: 2, when: "epilepsy (best case Table 2)" }], worse: "Epilepsy / convulsions — Table 2 to 8." },
      { id: "autism", name: "Autism", ceilings: [{ klass: "standard", when: "mild, independent functioning — individual consideration" }] },
      { id: "skin_cancer", name: "Skin cancer (basal / squamous)", ceilings: [{ klass: "preferred_plus", when: "basal cell or superficial squamous cell skin cancer (allowed for preferred classes per class criteria)" }], worse: "Impairment line: basal cell carcinoma, maximum 4 excisions, complete resolution — Standard; deeper or recurrent presentations rate lower." },
      { id: "other_cancer", name: "Other cancer history", ceilings: [{ klass: "table", when: "resolved 5+ years — individual consideration" }], postpone: "Most malignancies postponed 2-5 years — postpone until the wait-out period completes.", decline: "Active/undergoing treatment, recurrence, or multiple cancers — carrier direction.", worse: "Most malignancies — postponed 2-5 years, then individual consideration." },
      { id: "osteoporosis", name: "Osteoporosis", ceilings: [{ klass: "standard", when: "impairment table lists osteoporosis as Standard" }] },
      { id: "mvp", name: "Mitral valve prolapse", ceilings: [{ klass: "standard", when: "functional murmur, no significant insufficiency" }], worse: "Otherwise — Standard to Table 8." },
      { id: "cimt", name: "Carotid imaging (CIMT)", ceilings: [{ klass: "standard", when: "individual consideration" }] },
      { id: "transplant", name: "Organ transplant", ceilings: [{ klass: "table", table: 6, when: "single renal transplant, no complications after 1 year, over age 20 (best case Table 6)" }], worse: "Heart/lung/liver transplant or complications — carrier direction." },
      { id: "paralysis", name: "Paralysis", ceilings: [{ klass: "table", table: 8, when: "paraplegia — individual consideration" }], decline: "Quadriplegia — decline." }
    ],

    /* ---- Postpone triggers (MOO flavor) ------------------------------ */
    postponeTriggers: [
      { id: "pending_test", text: "Pending test, referral, surgery, or evaluation with unknown results", reason: "Uninvestigated outcome can matter more than known history." },
      { id: "recent_hospitalization", text: "Hospitalization or advised hospitalization within the past 4 months", reason: "Insufficient stability." },
      { id: "recent_surgery", text: "Surgery performed or recommended within the past 4 months with unfinished/unknown results", reason: "Insufficient stability." },
      { id: "active_symptom", text: "Uninvestigated active symptom under first-time evaluation", reason: "Uninvestigated symptom." },
      { id: "cancer_waitout", text: "Cancer diagnosed/treated within the 2-5 year wait-out period", reason: "Most malignancies postponed 2-5 years." },
      { id: "gastric_bypass_recent", text: "Gastric bypass within the past year", reason: "Postponed 1 year, then Table 2-4." },
      { id: "diabetes_complications", text: "Significant diabetes complications (kidney, eye, nerve, vascular)", reason: "Decline/postpone screen." },
      { id: "a1c_high", text: "Most recent A1c above 10", reason: "Poor control — decline/postpone screen." },
      { id: "pregnancy_complications", text: "Currently pregnant with gestational diabetes or complications", reason: "Postpone (gestational diabetes while pregnant — postpone)." },
      { id: "suicide_attempt_recent", text: "Suicide attempt within the past year", reason: "Single attempt over 1 year — $5/M flat extra; over 5 years — Standard." }
    ],

    /* ---- Decline / specialist-review triggers ------------------------ */
    declineTriggers: [
      { id: "hiv", text: "HIV / AIDS", reason: "Not addressed in the published impairment table — specialist review." },
      { id: "dementia", text: "Alzheimer's disease / dementia", reason: "Impairment table — decline." },
      { id: "alcohol_active", text: "Current excessive alcohol use", reason: "Impairment table — decline." },
      { id: "drug_use_recent", text: "Drug abuse (non-marijuana, recent)", reason: "Postponed 3 years, then Standard-Table 8." },
      { id: "cirrhosis", text: "Cirrhosis of the liver", reason: "Impairment table — decline." },
      { id: "cardiomyopathy", text: "Cardiomyopathy / chronic CHF", reason: "Impairment table — decline." },
      { id: "renal_failure", text: "Renal failure / dialysis / poor renal function", reason: "Impairment table — decline." },
      { id: "quadriplegia", text: "Quadriplegia", reason: "Impairment table — decline." },
      { id: "suicide_multiple", text: "Multiple suicide attempts", reason: "Impairment table — decline." },
      { id: "adl_dependence", text: "Assistance needed with activities of daily living", reason: "Specialist review / decline screen." },
      { id: "facility_care", text: "Facility / hospice / home-health care or chronic wheelchair use", reason: "Strong specialist-review trigger." },
      { id: "criminal_active", text: "Current criminal activity or pending charges", reason: "Eligibility screen." },
      { id: "bankruptcy_active", text: "Active bankruptcy proceedings", reason: "Financial eligibility screen." },
      { id: "oxygen_use", text: "Oxygen use", reason: "Specialist review." }
    ],

    /* ---- Evidence / workflow ----------------------------------------- */
    evidence: {
      apsAge: 66,
      apsConditions: [
        "Cancer", "Diabetes", "Heart (cardiac) disease", "Stroke / TIA", "COPD / emphysema",
        "Sleep apnea", "Seizure disorders", "Crohn's disease / ulcerative colitis", "Hepatitis B or C",
        "Liver disease / cirrhosis", "Kidney disease / renal insufficiency", "Organ transplant",
        "Mental-health disorders", "Substance abuse/dependence", "Suicide attempt", "Multiple sclerosis",
        "Muscular dystrophy", "Parkinson's disease", "Paralysis", "Rheumatoid arthritis", "Lupus",
        "Cognitive disorders", "Blood disorders"
      ],
      amountRules: [
        { ageMin: 18, ageMax: 70, amountMin: 100000, items: ["Paramedical exam + blood/urine + Rx (pharmaceutical) check"] },
        { ageMin: 18, ageMax: 45, amountMin: 100000, items: ["MVR (motor vehicle report)"] },
        { ageMin: 46, ageMax: 70, amountMin: 1000001, items: ["MVR (motor vehicle report)"] },
        { ageMin: 71, ageMax: 200, amountMin: 500000, items: ["MVR (motor vehicle report)"] },
        { ageMin: 66, ageMax: 200, amountMin: 1, items: ["APS (attending physician statement)"] },
        { ageMin: 71, ageMax: 200, amountMin: 100000, items: ["BNP (NT-Pro BNP, part of the blood profile)", "PHI (personal history interview)", "Senior Assessment"] },
        { ageMin: 61, ageMax: 65, amountMin: 5000001, items: ["EKG"] },
        { ageMin: 66, ageMax: 200, amountMin: 2000001, items: ["EKG"] },
        { ageMin: 18, ageMax: 200, amountMin: 5000001, items: ["Inspection report (face amounts $5,000,001+)"] },
        { ageMin: 18, ageMax: 200, amountMin: 100000, items: ["Signed HIV consent form (face amount $100,000+)"] },
        { ageMin: 65, ageMax: 200, amountMin: 1000000, items: ["Statement of Policyowner Intent + Premium Funding & Acknowledgement form"] }
      ],
      acceleratedUw: { ageMin: 18, ageMax: 55, amountMin: 100000, amountMax: 1000000, note: "Accelerated Underwriting (Term Life Answers) ages 18-55, $100,000-$1,000,000; Express simplified lanes (TLE/GULE/IULE) available with separate eligibility." },
      note: "Paramedical exam, blood/urine, Rx check and MVR per the age/amount grid (p. 16-17); APS from age 66; BNP, PHI and Senior Assessment from age 71; EKG at higher ages/amounts. APS may not be needed for treated hypertension or treated cholesterol when class is Preferred Plus through Standard, age 65 and under, face amount $2,000,000 or less. Requirements are good for up to one year through age 65 with a fully completed application.",
      temporaryCoverage: "TIA (term/UL, to $1,000,000, all 6 eligibility questions no) or Conditional Receipt (Express, to $100,000; $40,000 Living Promise) — coverage exists only when the exact receipt conditions are met."
    },

    /* ---- Financial justification ------------------------------------- */
    financial: {
      incomeMultipliers: [
        { ageMin: 18, ageMax: 40, multiplier: 25 },
        { ageMin: 41, ageMax: 50, multiplier: 20 },
        { ageMin: 51, ageMax: 55, multiplier: 15 },
        { ageMin: 56, ageMax: 65, multiplier: 10 },
        { ageMin: 66, ageMax: 200, multiplier: 7 }
      ],
      premiumToIncome: "No published premium-to-income ceiling in the brokerage guide; justification is via income replacement, estate conservation, and ownership rules.",
      note: "Income replacement: 25X (ages 20-40), 20X (41-50), 15X (51-55), 10X (56-65), 7X (66+) — generally not considered over age 66 unless actively at work. Non-working spouse: generally up to $2,000,000 (equal to the breadwinner's in-force + applied-for). Estate conservation: up to 50% of projected estate value. Key person: 5-10X earned income. Creditor: up to 75% of a secured loan. Charitable giving: ~10X annual contribution. Tax returns and 3rd-party verified financials may be required above $5,000,000."
    },

    /* The Fit program reduces table ratings (up to 2 credits, best final
       class Standard) — evaluated separately, never auto-applied here. */
    credit: null,

    classInfo: {
      preferred_plus: { name: "Preferred Plus Non-Tobacco", meaning: "No nicotine 36 months; no parent death <60 (cancer/heart); BP <140/85; ratio <5.0; no CAD/diabetes/cancer history; no hazardous activities in 5 years.", color: "#0e7a5f" },
      preferred: { name: "Preferred Non-Tobacco", meaning: "No nicotine 24 months; BP <145/90; ratio <6.0; one cardiac parent death allowed with favorable workup; no hazardous activities in 2 years.", color: "#1b9a7a" },
      standard_plus: { name: "Standard Plus Non-Tobacco", meaning: "No nicotine 12 months; BP <150/90; ratio <7.0; one parent heart-disease death <60 allowed; flat extras allowed for avocations.", color: "#3b82b0" },
      standard: { name: "Standard Non-Tobacco", meaning: "Average insurable risk; meets non-nicotine qualification (no nicotine 12 months).", color: "#4a6fa5" },
      table: { name: "Table-rated (Table 1-12)", meaning: "Build above Standard (Table 1 +25 lb through Table 12 +300 lb) or an impairment with a published table range — premium from standard rates.", color: "#b8860b" },
      postpone: { name: "Postpone / pre-review", meaning: "Wait for stability or wait-out (cancer 2-5 years, alcoholism treatment 2 years, drug/cocaine 3 years, gastric bypass 1 year, recent events).", color: "#8a5fb8" },
      decline: { name: "Decline / specialist review", meaning: "Impairment listed as decline (CHF, cardiomyopathy, cirrhosis, dialysis, dementia, sickle cell, quadriplegia) or outside the published ranges — carrier direction required.", color: "#b3364a" }
    }
  },

  /* ======================================================================
   * F&G QUANTUM — Fidelity & Guaranty Life Insurance Company
   * "Underwriting Guidelines — F&G Quantum" (ADV5691, 07-2025)
   * Fully underwritten term/UL-style product; ages 0-60, $50K-$1M face.
   * ==================================================================== */
  fg_quantum: {
    id: "fg_quantum",
    name: "F&G Quantum",
    company: "Fidelity & Guaranty Life Insurance Company (F&G)",
    guide: {
      title: "Underwriting Guidelines — F&G Quantum",
      version: "ADV5691 (07-2025)",
      note: "Quantum eligibility: issue ages 0-60, minimum $50,000, maximum $500,000 (ages 0-17) / $1,000,000 (18-60); total in-force + applied with F&G over $1,000,000 requires another product. No internal or external replacements allowed. Underwriting runs from the application plus electronic databases (MIB on all applications, RX/lab/medical-claims history, MVR as needed, ID verification) — a paramedical exam will not improve the rate class. Residents of all 50 US states; Puerto Rico and US territories not eligible. The AMAM simplified-issue products (Express Term, Home Certainty, Term Made Simple, Dignity Solutions) are separate lanes and are not modeled here."
    },

    /* ---- Nicotine ----------------------------------------------------- */
    nicotine: {
      classes: [
        { klass: "preferred_plus", lookbackMonths: 24, label: "Preferred Non-Tobacco (no tobacco use past 2 years)" },
        { klass: "standard", lookbackMonths: 12, label: "Non-Tobacco (no tobacco use past 1 year)" }
      ],
      tobaccoLookbackMonths: 12,
      tobaccoDefinition: "No tobacco use, including nicotine substitutes, e-cigarettes, and vaping, within the last 24 months for Preferred Non-Tobacco or 12 months for Non-Tobacco; the applicant must not test positive for nicotine in urine or saliva. Preferred Tobacco and Tobacco classes are available.",
      cigarException: {
        note: "Occasional cigar use may qualify for Non-Tobacco rates if fully disclosed on the application (no frequency published in the guide — verify with underwriting).",
        maxPerMonth: 1,
        maxPerYear: 12
      },
      marijuana: "Marijuana use less than 4 times per week and no more than 4 grams per week is acceptable; daily marijuana use is a decline. Occupations involving the production, processing, or sale of marijuana are a decline."
    },

    /* ---- Build: sex-specific chart with Preferred / Standard columns ---
       Adult minimum weights and Table D (200%) maximums are sex-neutral. */
    build: {
      chart: {
        56:  { male: { pp: 166, std: 183 }, female: { pp: 152, std: 167 }, min: 74, tableMax: 198 },
        57:  { male: { pp: 170, std: 187 }, female: { pp: 155, std: 171 }, min: 77, tableMax: 205 },
        58:  { male: { pp: 174, std: 191 }, female: { pp: 157, std: 173 }, min: 79, tableMax: 212 },
        59:  { male: { pp: 178, std: 196 }, female: { pp: 160, std: 176 }, min: 82, tableMax: 220 },
        60:  { male: { pp: 182, std: 200 }, female: { pp: 163, std: 179 }, min: 85, tableMax: 227 },
        61:  { male: { pp: 186, std: 205 }, female: { pp: 166, std: 183 }, min: 88, tableMax: 235 },
        62:  { male: { pp: 190, std: 209 }, female: { pp: 169, std: 186 }, min: 91, tableMax: 243 },
        63:  { male: { pp: 196, std: 216 }, female: { pp: 174, std: 191 }, min: 94, tableMax: 251 },
        64:  { male: { pp: 202, std: 222 }, female: { pp: 179, std: 197 }, min: 97, tableMax: 259 },
        65:  { male: { pp: 207, std: 228 }, female: { pp: 183, std: 201 }, min: 100, tableMax: 267 },
        66:  { male: { pp: 213, std: 234 }, female: { pp: 189, std: 208 }, min: 103, tableMax: 275 },
        67:  { male: { pp: 217, std: 239 }, female: { pp: 193, std: 212 }, min: 106, tableMax: 284 },
        68:  { male: { pp: 223, std: 245 }, female: { pp: 198, std: 218 }, min: 109, tableMax: 292 },
        69:  { male: { pp: 228, std: 251 }, female: { pp: 202, std: 222 }, min: 112, tableMax: 301 },
        70:  { male: { pp: 235, std: 259 }, female: { pp: 208, std: 229 }, min: 115, tableMax: 310 },
        71:  { male: { pp: 241, std: 265 }, female: { pp: 214, std: 235 }, min: 119, tableMax: 319 },
        72:  { male: { pp: 248, std: 273 }, female: { pp: 221, std: 243 }, min: 122, tableMax: 328 },
        73:  { male: { pp: 253, std: 278 }, female: { pp: 225, std: 248 }, min: 126, tableMax: 337 },
        74:  { male: { pp: 260, std: 286 }, female: { pp: 232, std: 255 }, min: 129, tableMax: 346 },
        75:  { male: { pp: 267, std: 294 }, female: { pp: 237, std: 261 }, min: 133, tableMax: 355 },
        76:  { male: { pp: 276, std: 304 }, female: { pp: 246, std: 271 }, min: 136, tableMax: 365 },
        77:  { male: { pp: 284, std: 312 }, female: { pp: 253, std: 278 }, min: 140, tableMax: 375 },
        78:  { male: { pp: 293, std: 322 }, female: { pp: 261, std: 287 }, min: 143, tableMax: 385 },
        79:  { male: { pp: 301, std: 331 }, female: { pp: 268, std: 295 }, min: 147, tableMax: 394 },
        80:  { male: { pp: 308, std: 341 }, female: { pp: 274, std: 308 }, min: 151, tableMax: 405 },
        81:  { male: { pp: 315, std: 349 }, female: { pp: 282, std: 316 }, min: 154, tableMax: 415 },
        82:  { male: { pp: 325, std: 359 }, female: { pp: 288, std: 326 }, min: 157, tableMax: 425 },
        83:  { male: { pp: 336, std: 369 }, female: { pp: 293, std: 336 }, min: 160, tableMax: 427 },
        84:  { male: { pp: 345, std: 378 }, female: { pp: 298, std: 345 }, min: 164, tableMax: 440 }
      },
      rules: {
        minHeightIn: 56,
        maxHeightIn: 84,
        chartMinWeight: 74,
        halfInchRounding: "Half-inch measurements round up to the next inch.",
        applyWeightLossAdjustment: false,
        ageAddLbs: { ageMin: 51, ageMax: 60, add: 5, note: "For ages 51-60, add 5 pounds to the build-chart thresholds (and to the adult minimum/maximum weights)." },
        weightLossAdjustment: "Weight stability is reviewed; significant recent weight change (gain or loss) — manual underwriting review.",
        lowBuildReview: "Weight below the adult minimum for height, or below the 5th-percentile growth chart for juveniles, -> manual underwriting review.",
        belowChartMin: 18.5,
        aboveStandard: "Weight above the Table D (200%) maximum for height -> manual underwriting review; substandard ratings run through Table D/4.",
        note: "Sex-specific build chart (Preferred / Standard columns); for ages 51-60 add 5 lb. Above Standard but within the adult maximum (Table D 200%) -> substandard rating through Table D. Juvenile build uses WHO/CDC growth-chart percentiles (not modeled)."
      }
    },

    /* ---- Blood pressure (age bands; treatment allowed if the 2-year
           average meets parameters) ---------------------------------- */
    bp: {
      preferred_plus:   [{ ageMin: 18, ageMax: 50, sys: 150, dia: 90 }, { ageMin: 51, ageMax: 60, sys: 160, dia: 95 }],
      preferred:        null,
      standard_plus:    null,
      standard:         [{ ageMin: 18, ageMax: 50, sys: 155, dia: 95 }, { ageMin: 51, ageMax: 60, sys: 160, dia: 95 }]
    },
    bpTreatmentNote: "Treatment for high blood pressure may be allowed as long as the current and historical readings averaged over the last two years meet the stated parameters.",

    /* ---- Cholesterol (age bands; treatment allowed if 2-yr average OK) */
    cholesterol: {
      total: {
        preferred_plus: [{ ageMin: 18, ageMax: 50, max: 260 }, { ageMin: 51, ageMax: 60, max: 280 }],
        standard:      [{ ageMin: 18, ageMax: 60, max: 300 }]
      },
      ratio: {
        preferred_plus: [{ ageMin: 18, ageMax: 60, max: 7 }],
        standard:      [{ ageMin: 18, ageMax: 60, max: 8 }]
      },
      note: "Cholesterol treatment accepted as long as the current and historical levels averaged over the last two years meet the parameter. Preferred: total 260 (18-50) / 280 (51-60), ratio 7; Standard: total 300 or less, ratio 8."
    },

    /* ---- Driving ------------------------------------------------------ */
    driving: {
      preferred_plus:   { maxViolations3yr: 2, cleanYears: 5, note: "No more than 2 moving violations in 3 years; no DWI/DUI offenses within 5 years." },
      preferred:        null,
      standard_plus:    null,
      standard:         { maxViolations3yr: 0, cleanYears: 5, note: "No rateable violations (a rateable violation takes the case below Standard)." }
    },
    drivingDeclineNote: "Non-medical declines: driving without a valid license; suspended or revoked driver's license; DUI/DWI/reckless driving in the last 5 years.",

    /* ---- Family history ---------------------------------------------- */
    familyHistory: {
      mapping: { none: "preferred_plus", parent: "preferred_plus", parent_sibling: "standard", multiple: "standard" },
      preferred_plus: { text: "No more than 1 death due to coronary artery or cancer disease prior to age 60 (parents/siblings). Breast, ovarian, and prostate cancer family history may be disregarded in applicants of the opposite gender." },
      preferred:      { text: "No more than 1 death due to coronary artery or cancer disease prior to age 60 (parents/siblings)." },
      standard_plus:  { text: "Family history is not applicable to the Standard class." },
      standard:       { text: "Family history is not applicable to the Standard class." }
    },

    /* Preferred medical history: no diabetes, heart disease, alcohol or
       substance abuse, or listed cancers. Drug use within 5 years = decline. */
    medicalStandardCap: ["diabetes", "cad", "heart_disease", "other_cancer", "substance_treatment"],
    autoDeclineIds: ["hiv", "dementia", "schizophrenia", "liver_disease", "kidney_disease", "transplant", "paralysis", "copd"],
    autoDeclineSevereIds: ["heart_disease", "stroke"],

    drugDeclineYears: 5,
    drugRecoveryTiers: [{ minYears: 5, klass: "standard" }],
    substanceTiers: { declineYears: 5, tiers: [{ minYears: 5, klass: "standard" }, { minYears: 0, klass: "table" }] },

    conditionModels: {
      anxiety: { best: "standard" },
      depression: { best: "standard" },
      asthma: { best: "standard" },
      sleep_apnea: { best: "standard" },
      bipolar: { best: "table" },
      other_cancer: { declineWithinYears: 10, afterCeiling: "table" }
    },

    /* Diabetes: Type 1 or Type 2 with A1c of 7 or above within the last year,
       or with neuropathy/retinopathy/kidney/heart disease or stroke history, = decline. */
    diabetes: { type1Ceiling: "table", type2Ceiling: "standard", a1cDeclineMin: 7 },

    /* Aviation/avocation: Preferred allows flat extra ratings; Standard
       requires no rateable activity — so hazardous activities do not cap
       Preferred, they add a flat extra. */
    avocation: {
      classCap: "preferred_plus",
      currentHazardousText: "Hazardous occupation/avocation disclosed — F&G Preferred allows flat-extra ratings for aviation/avocation; the Standard class requires no rateable activity. Flat-extra schedules are reviewed by underwriting.",
      cleanText: "No hazardous occupation or avocation disclosed."
    },

    medicalCeilings: [
      { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "standard", when: "controlled, no hospitalization, no time lost from work (acceptable list)" }], worse: "Controlled, well-followed, stable and no comorbid impairment." },
      { id: "depression", name: "Depression", ceilings: [{ klass: "standard", when: "other than bipolar, no hospitalization, no time lost from work (acceptable list)" }], worse: "Mental disorder requiring 2+ medications, hospitalization, or disability — decline." },
      { id: "bipolar", name: "Bipolar disorder", ceilings: [{ klass: "table", table: 4, when: "stable on limited treatment — individual consideration (decline list applies to bipolar requiring 2+ medications, hospitalization, or disability)" }], worse: "Decline list: mental disorder requiring treatment with two or more medications, hospitalization, or disability." },
      { id: "schizophrenia", name: "Schizophrenia", ceilings: [], decline: "Mental disorder including schizophrenia requiring treatment with two or more medications, hospitalization, or disability — decline." },
      { id: "substance_treatment", name: "Alcohol/drug treatment history", ceilings: [{ klass: "standard", when: "drug use more than 5 years ago; no history of alcohol or substance abuse for Preferred" }], worse: "Alcohol abuse — decline; drug use within the last 5 years — decline; chronic opioid or narcotic use — decline." },
      { id: "hypertension", name: "High blood pressure", ceilings: [{ klass: "preferred_plus", when: "readings within class limits (treatment allowed if 2-year average meets parameters)" }], note: "Hypertension other than pulmonary hypertension is on the acceptable list." },
      { id: "high_cholesterol", name: "High cholesterol", ceilings: [{ klass: "preferred_plus", when: "total and ratio within class limits (treatment allowed if 2-year average meets parameters)" }], note: "Hyperlipidemia is on the acceptable list." },
      { id: "cad", name: "Coronary artery disease / angina", ceilings: [{ klass: "table", table: 4, when: "stable older history — individual consideration" }], postpone: "Heart attack, bypass, angioplasty, or valve procedure within the last 5 years — decline screen until 5 years post-event.", worse: "Heart surgery, bypass, angioplasty, valve repair/replacement, or heart attack/MI in the last 5 years, or at any time in combination with tobacco use, diabetes, or stroke — decline." },
      { id: "heart_disease", name: "Heart disease (CHF, cardiomyopathy, valve, device)", ceilings: [{ klass: "table", table: 4, when: "stable older history — individual consideration" }], postpone: "Heart attack/surgery within the last 5 years — decline screen.", decline: "Heart surgery, bypass, angioplasty, valve repair/replacement, or MI within the last 5 years (or at any time with tobacco, diabetes, or stroke) — decline.", worse: "Aneurysm, cardiomyopathy, or CHF — decline screen." },
      { id: "stroke", name: "Stroke / TIA", ceilings: [{ klass: "table", table: 4, when: "single TIA more than 6 months ago, age 46 and up (acceptable list)" }], postpone: "Stroke/CVA within the last 5 years, or two or more TIAs — decline screen.", worse: "Stroke or CVA within the last 5 years, or two or more TIAs — decline." },
      { id: "asthma", name: "Asthma", ceilings: [{ klass: "standard", when: "mild, well followed, controlled & stable (acceptable list)" }], worse: "Asthma in applicants under age 6 — decline; respiratory disorders (emphysema, COPD, tuberculosis, sarcoidosis) — decline." },
      { id: "copd", name: "COPD / emphysema / chronic bronchitis", ceilings: [], decline: "Respiratory disorder including emphysema, COPD, tuberculosis, or sarcoidosis — decline." },
      { id: "sleep_apnea", name: "Sleep apnea", ceilings: [{ klass: "standard", when: "treated (acceptable list)" }] },
      { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard", when: "Type 2 with A1c below 7 in the last year and no complications (preferred requires no diabetes history)" }], worse: "Type 1 or Type 2 with A1c of 7 or above within the last year, or with neuropathy, retinopathy, kidney or heart disease, or stroke history — decline." },
      { id: "kidney_disease", name: "Kidney disease", ceilings: [], decline: "Kidney disease including polycystic kidney disease, chronic kidney disease, dialysis, or kidney transplant — decline." },
      { id: "liver_disease", name: "Liver disease", ceilings: [], decline: "Liver disorder including hepatitis and cirrhosis — decline." },
      { id: "hiv", name: "HIV / AIDS", ceilings: [], decline: "HIV/AIDS — decline." },
      { id: "dementia", name: "Alzheimer's / dementia", ceilings: [], decline: "Brain disorder including Alzheimer's, dementia, Huntington's disease, or cognitive impairment — decline." },
      { id: "seizures", name: "Seizures / epilepsy", ceilings: [{ klass: "standard", when: "diagnosed more than 5 years ago, not more than 1 seizure in the past year, compliant with medication" }], decline: "Epilepsy/seizures diagnosed within the last 5 years — decline." },
      { id: "autism", name: "Autism", ceilings: [{ klass: "standard", when: "autism without a comorbid mental-health diagnosis — individual consideration" }], decline: "Autism in applicants under age 2, or autism at any age with another mental-health diagnosis — decline." },
      { id: "skin_cancer", name: "Skin cancer (basal / squamous)", ceilings: [{ klass: "preferred_plus", when: "basal cell carcinoma (certain skin cancer history may qualify for Preferred)" }], worse: "Cancer other than basal cell diagnosed or treated within the last 10 years — decline; leukemia or other blood disorders within 10 years — decline." },
      { id: "other_cancer", name: "Other cancer history", ceilings: [{ klass: "table", when: "diagnosed/treated more than 10 years ago — individual consideration" }], decline: "Cancer (except basal cell) diagnosed or treated within the last 10 years — decline.", worse: "Cancer (except basal cell) within the last 10 years — decline; leukemia or other blood disorders within 10 years — decline." },
      { id: "osteoporosis", name: "Osteoporosis", ceilings: [{ klass: "standard", when: "acceptable list (no comorbid impairment, mild, controlled & stable)" }] },
      { id: "mvp", name: "Mitral valve prolapse", ceilings: [{ klass: "standard", when: "acceptable list (mitral valve prolapse without significant insufficiency)" }] },
      { id: "cimt", name: "Carotid imaging (CIMT)", ceilings: [{ klass: "standard", when: "individual consideration" }] },
      { id: "transplant", name: "Organ transplant", ceilings: [], decline: "Organ transplant candidate or recipient — decline." },
      { id: "paralysis", name: "Paralysis", ceilings: [], decline: "Paralysis — decline." }
    ],

    /* ---- Postpone triggers (F&G flavor) ------------------------------ */
    postponeTriggers: [
      { id: "pending_test", text: "Pending test, referral, surgery, or evaluation with unknown results", reason: "Uninvestigated outcome can matter more than known history." },
      { id: "recent_hospitalization", text: "Hospitalization or advised hospitalization within the past 4 months", reason: "Insufficient stability." },
      { id: "recent_surgery", text: "Surgery performed or recommended within the past 4 months with unfinished/unknown results", reason: "Insufficient stability." },
      { id: "active_symptom", text: "Uninvestigated active symptom under first-time evaluation", reason: "Uninvestigated symptom." },
      { id: "cancer_waitout", text: "Cancer diagnosed/treated within the 10-year decline window", reason: "Cancer except basal cell within 10 years — decline screen." },
      { id: "gastric_bypass_recent", text: "Gastric bypass within the past year", reason: "Gastric bypass within the last year — decline screen; more than 1 year after surgery is acceptable." },
      { id: "diabetes_complications", text: "Diabetes with complications (neuropathy, retinopathy, kidney or heart disease, or stroke history)", reason: "Decline screen." },
      { id: "a1c_high", text: "Most recent A1c at or above 7 within the last year", reason: "Decline screen (F&G decline threshold is A1c 7+, stricter than the app's generic gate)." },
      { id: "pregnancy_complications", text: "Currently pregnant with gestational diabetes or pre-eclampsia", reason: "Decline list." }
    ],

    /* ---- Decline / specialist-review triggers ------------------------ */
    declineTriggers: [
      { id: "hiv", text: "HIV / AIDS", reason: "Decline list." },
      { id: "dementia", text: "Alzheimer's / dementia / brain disorder", reason: "Decline list." },
      { id: "alcohol_active", text: "Alcohol abuse", reason: "Decline list." },
      { id: "drug_use_recent", text: "Drug use within the last 5 years or daily marijuana use", reason: "Decline list." },
      { id: "kidney_disease", text: "Kidney disease (polycystic, CKD, dialysis, transplant)", reason: "Decline list." },
      { id: "liver_disease", text: "Liver disorder (hepatitis, cirrhosis)", reason: "Decline list." },
      { id: "transplant", text: "Organ transplant candidate or recipient", reason: "Decline list." },
      { id: "quadriplegia", text: "Paralysis", reason: "Decline list." },
      { id: "respiratory", text: "Respiratory disorder (emphysema, COPD, TB, sarcoidosis)", reason: "Decline list." },
      { id: "adl_dependence", text: "Assistance needed with activities of daily living", reason: "Specialist review / decline screen." },
      { id: "facility_care", text: "Facility / hospice / home-health care or chronic wheelchair use", reason: "Strong specialist-review trigger." },
      { id: "criminal_active", text: "Currently in prison, on probation/parole, or released within the last 12 months", reason: "Non-medical decline list." },
      { id: "bankruptcy_active", text: "Active bankruptcy proceedings", reason: "Financial eligibility screen." },
      { id: "oxygen_use", text: "Oxygen use", reason: "Specialist review." },
      { id: "driving_no_license", text: "Driving without a valid license, or suspended/revoked license", reason: "Non-medical decline list." }
    ],

    /* ---- Evidence / workflow ----------------------------------------- */
    evidence: {
      apsAge: 200,
      genericGrid: false,
      apsConditions: [
        "Cancer", "Diabetes", "Heart (cardiac) disease", "Stroke / TIA", "COPD / emphysema",
        "Kidney disease", "Liver disease", "Mental-health disorders", "Substance abuse/dependence",
        "Multiple sclerosis", "Parkinson's disease", "Muscular dystrophy", "Rheumatoid arthritis", "Lupus",
        "Organ transplant", "Paralysis", "HIV", "Sleep apnea", "Seizure disorders"
      ],
      acceleratedUw: { ageMin: 18, ageMax: 60, amountMin: 50000, amountMax: 1000000, note: "Quantum is underwritten from the application plus electronic databases (MIB on all applications; RX, lab and medical-claims history; MVR as needed; ID verification tools; phone interview as needed). A paramedical exam will not improve the rate class." },
      note: "MIB is ordered on all applications. RX, lab and medical-claims databases are routinely checked. MVR and phone interviews may be ordered as needed. ID verification tools are used; proof of identity may be required. Thorough, accurate application details — including a complete prescription list with the reason for each medication — help avoid additional requirements.",
      temporaryCoverage: "No temporary coverage is described in the Quantum guide; the estimate does not establish coverage."
    },

    /* ---- Financial justification ------------------------------------- */
    financial: {
      incomeMultipliers: [
        { ageMin: 18, ageMax: 29, multiplier: 30 },
        { ageMin: 30, ageMax: 39, multiplier: 30 },
        { ageMin: 40, ageMax: 44, multiplier: 25 },
        { ageMin: 45, ageMax: 49, multiplier: 20 },
        { ageMin: 50, ageMax: 54, multiplier: 15 },
        { ageMin: 55, ageMax: 59, multiplier: 12 },
        { ageMin: 60, ageMax: 60, multiplier: 10 }
      ],
      maxFace: 1000000,
      premiumToIncome: "Acceptable ratio of premium to income (net worth based): up to 25% below $5M net worth; up to 40% from $5M to $10M; up to 65% above $10M.",
      note: "Income replacement factors: 30X (20-39), 25X (40-44), 20X (45-49), 15X (50-54), 12X (55-59), 10X (60). Non-working spouse: maximum $300,000 per primary insured, not to exceed the wage earner's in-force coverage. Total in-force and applied-for coverage over $1,000,000 requires application and underwriting on another product. Juveniles: up to 50% of the parent's coverage, maximum $1,000,000 per primary insured."
    },

    /* No credit program is published in the Quantum guide. */
    credit: null,

    classInfo: {
      preferred_plus: { name: "Preferred Non-Tobacco", meaning: "No tobacco 2 years; no rateable medical conditions; no diabetes/heart disease/alcohol or substance abuse/listed cancer history; ≤2 moving violations and no DUI in 5 years; BP ≤150/90 (18-50), chol ≤260, ratio ≤7; family: ≤1 early coronary/cancer death.", color: "#0e7a5f" },
      preferred: { name: "Non-Tobacco (Standard-equivalent)", meaning: "No tobacco 1 year; meets Standard criteria. F&G publishes only Preferred Non-Tobacco and Non-Tobacco as the non-tobacco classes.", color: "#1b9a7a" },
      standard_plus: { name: "Non-Tobacco", meaning: "F&G publishes no Standard Plus class; Non-Tobacco (Standard) is the second non-tobacco class.", color: "#3b82b0" },
      standard: { name: "Non-Tobacco", meaning: "No tobacco 1 year; no rateable conditions (Standard class, ages 0-17; Non-Tobacco for adults).", color: "#4a6fa5" },
      table: { name: "Substandard (Table A-D / 4)", meaning: "Substandard ratings through Table D/4 — build above Standard within the Table D maximum, or an impairment reviewed individually.", color: "#b8860b" },
      postpone: { name: "Postpone / pre-review", meaning: "Wait for stability or wait-out (cancer 10 years, gastric bypass 1 year, heart event 5 years, epilepsy 5 years) or pending workup.", color: "#8a5fb8" },
      decline: { name: "Decline / specialist review", meaning: "On the Quantum decline lists (cancer within 10 years, diabetes with A1c 7+, HIV, dementia, kidney/liver disease, respiratory disorder, etc.) — carrier direction required.", color: "#b3364a" }
    }
  }
};

/* ======================================================================
 * Medication reference dictionary
 * ----------------------------------------------------------------------
 * Maps common prescription medications (generic + brand aliases) to the
 * conditions in the interview catalog. Used to cross-check disclosed
 * medications against disclosed conditions and to surface carrier APS
 * triggers from the prescription record. Single mapping per medication
 * (most common indication); the mismatch flag is advisory — confirm with
 * the applicant, never a diagnosis.
 * ==================================================================== */
const MEDICATION_MAP = [
  { condition: "diabetes", name: "Diabetes", apsLabel: "Diabetes", aliases: ["metformin", "glucophage", "fortamet", "glumetza", "glipizide", "glucotrol", "glyburide", "diabeta", "glimepiride", "amaryl", "pioglitazone", "actos", "rosiglitazone", "sitagliptin", "januvia", "saxagliptin", "onglyza", "linagliptin", "tradjenta", "dapagliflozin", "farxiga", "empagliflozin", "jardiance", "canagliflozin", "invokana", "semaglutide", "ozempic", "rybelsus", "liraglutide", "victoza", "dulaglutide", "trulicity", "exenatide", "byetta", "insulin", "lantus", "levemir", "humalog", "novolog", "novolin", "humulin", "toujeo", "tresiba", "apidra", "basaglar", "acarbose", "precose", "repaglinide", "prandin"] },
  { condition: "high_cholesterol", name: "High cholesterol", apsLabel: "High cholesterol", aliases: ["atorvastatin", "lipitor", "rosuvastatin", "crestor", "simvastatin", "zocor", "pravastatin", "pravachol", "lovastatin", "mevacor", "fluvastatin", "lescol", "pitavastatin", "livalo", "ezetimibe", "zetia", "vytorin", "fenofibrate", "tricor", "gemfibrozil", "lopid", "niacin", "evolocumab", "repatha", "alirocumab", "praluent", "bempedoic", "nexletol", "cholestyramine", "questran", "colesevelam", "welchol"] },
  { condition: "hypertension", name: "High blood pressure", apsLabel: "High blood pressure", aliases: ["lisinopril", "prinivil", "zestril", "enalapril", "vasotec", "ramipril", "altace", "losartan", "cozaar", "valsartan", "diovan", "irbesartan", "avapro", "olmesartan", "benicar", "candesartan", "atacand", "telmisartan", "micardis", "amlodipine", "norvasc", "nifedipine", "procardia", "adalat", "diltiazem", "cardizem", "verapamil", "calan", "metoprolol", "lopressor", "toprol", "atenolol", "tenormin", "carvedilol", "coreg", "propranolol", "inderal", "bisoprolol", "zebeta", "hydrochlorothiazide", "hctz", "chlorthalidone", "hydralazine", "apresoline", "clonidine", "catapres", "doxazosin", "cardura", "terazosin", "hytrin", "aliskiren", "tekturna"] },
  { condition: "heart_disease", name: "Heart disease", apsLabel: "Heart (cardiac) disease", aliases: ["digoxin", "lanoxin", "warfarin", "coumadin", "jantoven", "apixaban", "eliquis", "rivaroxaban", "xarelto", "edoxaban", "savaysa", "dabigatran", "pradaxa", "amiodarone", "pacerone", "cordarone", "sotalol", "betapace", "dofetilide", "tikosyn", "ivabradine", "corlanor", "entresto", "sacubitril", "eplerenone", "inspra", "dronedarone", "multaq", "furosemide", "lasix", "spironolactone", "aldactone", "torsemide", "demadex", "bumetanide", "bumex"] },
  { condition: "cad", name: "Coronary artery disease", apsLabel: "Heart (cardiac) disease", aliases: ["nitroglycerin", "nitrostat", "nitrolingual", "isosorbide", "isordil", "imdur", "monoket", "ranolazine", "ranexa", "clopidogrel", "plavix", "ticagrelor", "brilinta", "prasugrel", "effient"] },
  { condition: "asthma", name: "Asthma", apsLabel: "Asthma", aliases: ["albuterol", "ventolin", "proair", "proventil", "salmeterol", "serevent", "formoterol", "foradil", "symbicort", "advair", "levalbuterol", "xopenex", "montelukast", "singulair", "zafirlukast", "fluticasone", "flovent", "beclomethasone", "qvar", "mometasone", "asmanex", "ciclesonide", "alvesco", "ipratropium", "atrovent"] },
  { condition: "copd", name: "COPD", apsLabel: "COPD", aliases: ["tiotropium", "spiriva", "umeclidinium", "incruse", "glycopyrrolate", "roflumilast", "daliresp", "theophylline", "theo-24", "uniphyl"] },
  { condition: "sleep_apnea", name: "Sleep apnea", apsLabel: "Sleep apnea", aliases: ["modafinil", "provigil", "armodafinil", "nuvigil", "solriamfetol", "sunosi", "pitolisant", "wakix"] },
  { condition: "kidney_disease", name: "Kidney disease", apsLabel: "Kidney disease", aliases: ["epogen", "procrit", "aranesp", "mircera", "erythropoietin", "cinacalcet", "sensipar", "sevelamer", "renagel", "renvela", "lanthanum", "fosrenol", "calcitriol", "rocaltrol", "paricalcitol", "zemplar", "doxercalciferol", "hectorol", "lokelma", "patiromer", "veltassa"] },
  { condition: "liver_disease", name: "Liver disease", apsLabel: "Liver disease", aliases: ["ursodiol", "actigall", "ocaliva", "obeticholic", "lactulose", "cephulac", "rifaximin", "xifaxan", "peginterferon", "pegasys", "ribavirin", "copegus", "sofosbuvir", "sovaldi", "ledipasvir", "harvoni", "mavyret", "entecavir", "baraclude", "adefovir", "hepsera"] },
  { condition: "hiv", name: "HIV", apsLabel: "Blood disorders", aliases: ["tenofovir", "viread", "truvada", "descovy", "emtricitabine", "efavirenz", "sustiva", "dolutegravir", "tivicay", "bictegravir", "darunavir", "prezista", "atazanavir", "reyataz", "raltegravir", "isentress", "elvitegravir", "rilpivirine", "cabotegravir", "lamivudine", "epivir", "abacavir", "ziagen", "nevirapine", "viramune", "kaletra", "maraviroc"] },
  { condition: "dementia", name: "Alzheimer's / dementia", apsLabel: "Cognitive disorders", aliases: ["donepezil", "aricept", "memantine", "namenda", "namzaric", "rivastigmine", "exelon", "galantamine", "razadyne"] },
  { condition: "seizures", name: "Seizures / epilepsy", apsLabel: "Cognitive disorders", aliases: ["levetiracetam", "keppra", "lamotrigine", "lamictal", "carbamazepine", "tegretol", "phenytoin", "dilantin", "valproate", "depakote", "topiramate", "topamax", "gabapentin", "neurontin", "pregabalin", "lyrica", "oxcarbazepine", "trileptal", "lacosamide", "vimpat", "ethosuximide", "zarontin", "zonisamide", "zonegran"] },
  { condition: "depression", name: "Depression", apsLabel: "Mental-health disorders", aliases: ["sertraline", "zoloft", "fluoxetine", "prozac", "escitalopram", "lexapro", "citalopram", "celexa", "paroxetine", "paxil", "venlafaxine", "effexor", "duloxetine", "cymbalta", "bupropion", "wellbutrin", "mirtazapine", "remeron", "trazodone", "desyrel", "amitriptyline", "elavil", "nortriptyline", "pamelor", "desvenlafaxine", "pristiq", "vilazodone", "vortioxetine", "trintellix", "fluvoxamine", "phenelzine", "tranylcypromine"] },
  { condition: "anxiety", name: "Anxiety", apsLabel: "Mental-health disorders", aliases: ["alprazolam", "xanax", "lorazepam", "ativan", "clonazepam", "klonopin", "diazepam", "valium", "buspirone", "buspar", "hydroxyzine", "vistaril", "atarax"] },
  { condition: "bipolar", name: "Bipolar disorder", apsLabel: "Mental-health disorders", aliases: ["lithium", "eskalith", "lithobid", "olanzapine", "zyprexa", "quetiapine", "seroquel", "risperidone", "risperdal", "aripiprazole", "abilify", "ziprasidone", "geodon", "lurasidone", "latuda", "cariprazine", "vraylar", "asenapine", "saphris", "paliperidone", "invega", "haloperidol", "haldol", "chlorpromazine", "thorazine"] },
  { condition: "schizophrenia", name: "Schizophrenia", apsLabel: "Mental-health disorders", aliases: ["clozapine", "clozaril"] },
  { condition: "substance_treatment", name: "Alcohol / drug treatment history", apsLabel: "Substance abuse/dependence", aliases: ["naltrexone", "revia", "vivitrol", "buprenorphine", "subutex", "suboxone", "methadone", "dolophine", "disulfiram", "antabuse", "acamprosate", "campral", "naloxone", "narcan"] },
  { condition: "osteoporosis", name: "Osteoporosis", apsLabel: "Osteoporosis", aliases: ["alendronate", "fosamax", "risedronate", "actonel", "ibandronate", "boniva", "zoledronic", "reclast", "zometa", "denosumab", "prolia", "teriparatide", "forteo", "raloxifene", "evista", "calcitonin", "miacalcin", "romosozumab", "evenity", "abaloparatide", "tymlos"] },
  { condition: "other_cancer", name: "Cancer history", apsLabel: "Cancer", aliases: ["imatinib", "gleevec", "trastuzumab", "herceptin", "rituximab", "anastrozole", "arimidex", "letrozole", "femara", "tamoxifen", "nolvadex", "exemestane", "aromasin", "leuprolide", "lupron", "abiraterone", "zytiga", "enzalutamide", "xtandi", "capecitabine", "xeloda", "temozolomide", "temodar", "bevacizumab", "avastin"] },
  { condition: "transplant", name: "Organ transplant", apsLabel: "Transplant", aliases: ["tacrolimus", "prograf", "envarsus", "cyclosporine", "neoral", "sandimmune", "gengraf", "mycophenolate", "cellcept", "myfortic", "sirolimus", "rapamune", "everolimus", "belatacept", "nulojix", "azathioprine", "imuran"] }
];

/* Shared master-outcome labels used by the engine output */
const MASTER_OUTCOMES = {
  elite_nt: { label: "Elite NT", meaning: "Best-case non-tobacco risk — maps to Preferred Plus where available." },
  preferred_nt: { label: "Preferred NT", meaning: "Favorable non-tobacco risk — maps to Preferred." },
  standard_plus_nt: { label: "Standard Plus NT", meaning: "Near-standard, controlled risk." },
  standard_nt: { label: "Standard NT", meaning: "Average insurable non-tobacco risk." },
  preferred_tobacco: { label: "Preferred Tobacco", meaning: "Otherwise favorable risk with nicotine use." },
  standard_tobacco: { label: "Standard Tobacco", meaning: "Average risk with nicotine use." },
  table: { label: "Table-rated", meaning: "Offer with increased premium." },
  flat_extra: { label: "Flat extra", meaning: "Added charge for a specific measurable risk." },
  postpone: { label: "Postpone / pre-review", meaning: "Potentially insurable later — wait for stability, treatment, or records." },
  decline: { label: "Likely decline / specialist review", meaning: "Outside current likely eligibility; refer to impaired-risk specialist or alternate product/carrier." }
};
