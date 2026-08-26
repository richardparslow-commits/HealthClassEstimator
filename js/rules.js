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
  }
};

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
