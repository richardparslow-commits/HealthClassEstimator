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
  "manual_review",    // 6 — key data missing/conflicting: review before estimating
  "postpone",         // 7
  "decline"           // 8
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
    eligibility: {
      products: "Banner Life term and permanent portfolio; William Penn products exclusively in New York",
      issueAges: "All issue ages through age 70 (maximum issue age 70)",
      maxIssueAge: 70,
      faceRange: "All coverage amounts — Horizon digital application (pending applications up to $1,000,000 per applicant)",
      residency: "49 states + DC (Banner Life); William Penn exclusively in New York",
      notes: [
        "Horizon digital application / Accelerated Underwriting: ages 20-60 to $5,000,000; ages 61-70 to $500,000 with APS required.",
        "One-class credit review may improve build, blood-pressure, family-history, or cholesterol/HDL findings (3 of 7 credit criteria).",
        "Total in-force + applied-for coverage with all carriers must be financially justified."
      ],
      charts: [
        { product: "Banner Life term & permanent (Horizon digital app)", ages: "All issue ages through 70", face: "All coverage amounts; NY via William Penn" }
      ],
      chartNote: "The field guide publishes no per-product age/face charts — eligibility is all issue ages through 70 at all coverage amounts."
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

    /* ---- Hazardous occupation / avocation (flat-extra lane) ----------- */
    avocation: {
      currentHazardousText: "Hazardous occupation/avocation disclosed — Banner: Preferred Plus requires no flat-extra premium; Preferred may allow a flat extra (flat extras may be added to a Preferred base class, excluding skydiving); otherwise the best class is Standard Plus with a flat extra. Auto racing and mountaineering/climbing are rated on the details (vehicle/engine, course, altitude, difficulty).",
      aviationFlatExtra: {
        baseClass: "preferred",
        text: "Aviation exposure disclosed — Banner: flat extras may be added to a Preferred base class for general aviation (excluding skydiving) assuming the profile otherwise qualifies; Preferred Plus may be available for pilots of major airlines flying in the U.S. and Canada without other aviation exposure, or with an Aviation Exclusion Rider (AER) for other aviation activities. Private pilots over age 70 require an aviation exclusion rider. Otherwise the best class is Standard Plus with a flat extra."
      },
      flatExtra: {
        baseClass: "preferred",
        text: "Hazardous avocation/aviation disclosed — Banner: Preferred is the best class available with a flat extra (Preferred Plus requires no flat-extra premium); flat extras may be added to a Preferred base class (excluding skydiving), otherwise the best class is Standard Plus with a flat extra."
      },
      scubaPreferredPlusText: "Recreational scuba disclosed — Banner: Preferred Plus may be available when the dives do not exceed 100 feet, the applicant is PADI/NAUI/SSI certified and dives with a dive master or instructor, open-water dives only, no participation in wreck, salvage, ice or cave diving, and no medical impairment adversely affecting safety or mortality.",
      cleanText: "No hazardous occupation or avocation disclosed."
    },

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
      auExcludesReplacement: true,
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
    /* The modeled Foresters non-medical guides publish no occupation/avocation
       lane — the underwriting guide notes only that final action is the
       Underwriter's decision based on all circumstances. Hazardous activities
       are therefore reviewed case-by-case: conservative Standard ceiling. */
    avocationNoLaneText: "Hazardous occupation/avocation disclosed — the modeled Foresters non-medical guides publish no specific avocation lane; final action is the Underwriter's decision based on all circumstances — conservative Standard ceiling pending review.",
    eligibility: {
      products: "Your Term, Advantage Plus II, SMART UL, Strong Foundation",
      issueAges: "0-80 by product (non-medical lanes)",
      maxIssueAge: 80,
      faceRange: "Non-med issue limits by age and product — e.g., Your Term $400,000 (18-55) / $150,000 (56-80); Strong Foundation $500,000 (18-55) / $250,000 (56-80); SMART UL & AP II $400,000 (16-55) / $150,000 (56-75)",
      residency: "US",
      notes: [
        "Non-medical lanes: no cigarettes in the past 12 months — cigar, pipe, chewing tobacco, vape pens, marijuana and substitutes allowed on Strong Foundation.",
        "Preferred rates are only available on fully underwritten plans.",
        "Advantage Plus II 10/20-year term riders have their own maximum benefit amounts by issue age."
      ],
      charts: [
        { product: "Your Term (non-medical)", ages: "18-80", face: "To $400,000 (18-55) / $150,000 (56-80)" },
        { product: "Strong Foundation (non-medical)", ages: "18-80", face: "To $500,000 (18-55) / $250,000 (56-80); substandard to $300,000 / $150,000" },
        { product: "SMART UL / Advantage Plus II (non-medical)", ages: "0-75", face: "To $400,000 (16-55); $150,000 (0-15 and 56-75)" },
        { product: "PlanRight whole life (separate lane)", ages: "By plan (Medical Reference Guide 503461 US 11/19)", face: "Its own min/Preferred/Standard/Basic build chart; CHF any history = not eligible" }
      ]
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


    /* ---- PlanRight whole-life lane (Medical Reference Guide 503461 US 11/19) ------
       PlanRight is a separate simplified-issue whole-life lane with its own build
       chart and medication-based medical reference. Outside the chart's minimum or
       maximum weight (or height range) — declined. Any history of congestive heart
       failure — regardless of when diagnosed or treated — is not eligible for
       PlanRight. Not modeled as a class; the estimate reflects the non-medical
       term/UL lanes and the PlanRight rules surface as lane guidance. ---------- */
    planright: {
      note: "PlanRight whole life is a separate simplified-issue lane (Medical Reference Guide 503461 US 11/19). Insurance is declined if the Proposed Insured is outside the minimum or maximum weight for their height, or below/above the chart's height range. Any history of congestive heart failure — regardless of when diagnosed or treated — is not eligible for PlanRight. Not modeled as a class — the estimate reflects the non-medical term/UL lanes.",
      buildChart: {
        56: { min: 74, pref: 201, std: 216, basic: 232 },
        57: { min: 77, pref: 208, std: 223, basic: 239 },
        58: { min: 80, pref: 215, std: 230, basic: 246 },
        59: { min: 83, pref: 222, std: 237, basic: 253 },
        60: { min: 86, pref: 229, std: 245, basic: 262 },
        61: { min: 89, pref: 237, std: 253, basic: 271 },
        62: { min: 92, pref: 246, std: 262, basic: 280 },
        63: { min: 95, pref: 253, std: 269, basic: 288 },
        64: { min: 98, pref: 260, std: 278, basic: 297 },
        65: { min: 101, pref: 268, std: 286, basic: 306 },
        66: { min: 104, pref: 275, std: 294, basic: 315 },
        67: { min: 107, pref: 284, std: 304, basic: 325 },
        68: { min: 110, pref: 292, std: 313, basic: 334 },
        69: { min: 113, pref: 299, std: 321, basic: 343 },
        70: { min: 117, pref: 308, std: 330, basic: 353 },
        71: { min: 121, pref: 316, std: 339, basic: 362 },
        72: { min: 125, pref: 325, std: 348, basic: 372 },
        73: { min: 129, pref: 333, std: 356, basic: 381 },
        74: { min: 133, pref: 341, std: 366, basic: 391 },
        75: { min: 137, pref: 349, std: 373, basic: 399 },
        76: { min: 142, pref: 357, std: 382, basic: 409 },
        77: { min: 147, pref: 365, std: 392, basic: 419 },
        78: { min: 152, pref: 373, std: 406, basic: 434 },
        79: { min: 159, pref: 381, std: 413, basic: 442 },
        80: { min: 162, pref: 389, std: 421, basic: 450 },
        81: { min: 167, pref: 397, std: 430, basic: 460 }
      },
      buildNote: "Minimum weight applies to all PlanRight plans; maximum weights by class: Preferred / Standard / Basic. Outside the chart's minimum/maximum weight or height range — declined.",
      chfRule: "Any history of congestive heart failure (CHF) — regardless of when diagnosed or treated — is not eligible for PlanRight.",
      drugRules: {
        nephropathy: ["aranesp", "auryxia", "calcifediol", "calcitriol", "calcium acetate", "ferric citrate", "fosrenol", "hectorol", "doxercalciferol", "kuvan", "phoslo", "renagel", "sensipar", "triferic", "velphoro", "zemplar"],
        neuropathy: ["gabapentin", "gralise", "lyrica", "neurontin", "pregabalin"],
        diabetes: ["actos", "amaryl", "avandamet", "avandaryl", "avandia", "basaglar", "byetta", "farxiga", "fortamet", "glimepiride", "glipizide", "glucophage", "glucotrol", "glucovance", "glyburide", "glynase", "glyset", "glyxambi", "humalog", "humulin", "invokana", "janumet", "januvia", "jardiance", "lantus", "levemir", "metformin", "novolin", "novolog", "onglyza", "prandin", "precose", "starlix", "toujeo", "tradjenta", "tresiba", "trulicity", "victoza"],
        listA: ["accupril", "accuretic", "quinaretic", "aceon", "altace", "ramipril", "lotrel", "exforge", "azor", "atacand", "avalide", "avapro", "irbesartan", "benazepril", "lotensin", "benicar", "capoten", "captopril", "cozaar", "losartan", "diovan", "valsartan", "enalapril", "vasotec", "fosinopril", "monopril", "hyzaar", "lexxel", "lisinopril", "prinivil", "zestril", "micardis", "telmisartan", "prestalia", "twynsta", "valturna"],
        listB: ["ziac", "bisoprolol", "zebeta", "byvalson", "carvedilol", "coreg", "coreg cr", "metoprolol", "lopressor", "toprol xl"],
        listC: ["aldactazide", "aldactone", "carospir", "spironolactone", "bumetanide", "bumex", "demadex", "torsemide", "edecrin", "eplerenone", "inspra", "ethacrynic acid", "furosemide", "lasix", "sodium edecrin"]
      },
      drugRulesNote: "Medications from the nephropathy list AND the diabetes list within the past 2 years → Basic death benefit. Medications from the neuropathy list AND the diabetes list within the past 2 years → Basic death benefit. Medications from List A (ACE/ARB nephropathy agents) AND List B (beta-blockers) AND List C (diuretics) at the same time → not eligible for coverage.",
      medicalReference: [
        "CHF — any history: not eligible for PlanRight.",
        "Nephropathy or neuropathy PLUS diabetes medications (within past 2 years): Basic death benefit.",
        "List A + List B + List C medications simultaneously: not eligible for coverage.",
        "Full benefit-eligibility is set per medication by the alphabetical drug list in the Medical Reference Guide; the drug lists are not exhaustive and off-label uses are considered by the underwriter."
      ]
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
    eligibility: {
      products: "Trendsetter Super, Trendsetter LB, Financial Choice IUL (I/II), Financial Foundation IUL (I/II) and TFLIC equivalents",
      issueAges: "0-85 by product and band (Trendsetter LB band one $25,000-$99,000 not available ages 18-22)",
      maxIssueAge: 85,
      faceRange: "Band-based, minimum from $25,000; IRS 4506-C required at $5,000,000+; cover letters recommended at $10,000,000+",
      residency: "US residents; non-US residents via International Underwriting (no fluidless processing)",
      notes: [
        "Digital underwriting (iGO e-App) can decide within minutes; digital decisions are not reconsidered for a better class.",
        "CS (cardiac/stroke profile) required at age 70 for face amounts $100,000 and higher.",
        "Blended (sex-neutral) BMI chart — BMI is the build rule, not a height/weight lookup."
      ],
      charts: [
        { product: "Trendsetter Super / Trendsetter LB", ages: "18-85", face: "$25,000-$10,000,000+ by band (LB band one $25K-$99,999 not available ages 18-22)" },
        { product: "Financial Choice IUL (I/II)", ages: "0-85", face: "$250,000-$10,000,000+ by band" },
        { product: "Financial Foundation IUL (I/II) & TFLIC equivalents", ages: "0-85", face: "$25,000-$10,000,000+ by band" },
        { product: "Final Expense Solutions (separate lane — Immediate / 10-Pay / Easy)", ages: "0-85 (Easy Solution 18-80)", face: "$1,000-$50,000 by age band (0-55: $50K; 56-65: $40K; 66-75: $30K; 76-85: $25K); Easy $25K max" }
      ]
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

    /* ---- Hazardous occupation / avocation (p. 19 Lifestyle & Health
       History table) ----
       Two published rows: (1) Private aviation — preferred classes may be
       offered with or without a ratable aviation flat extra; (2) Avocation
       (hazardous) — a prohibited list (aeronautics: hang gliding, ultralight,
       soaring, skydiving, ballooning; power racing, competitive vehicles,
       mountain climbing, rodeos, competitive skiing; scuba/skin diving deeper
       than 75 feet) is "individual consideration on a case-by-case basis —
       may or may not be eligible"; preferred classes require no participation
       in the listed activities. */
    avocation: {
      classCap: "standard",
      currentHazardousText: "Hazardous avocation disclosed — Transamerica's prohibited-avocation list (aeronautics: hang gliding, ultralight, soaring, skydiving, ballooning; power racing, competitive vehicles, mountain climbing, rodeos, competitive skiing; scuba/skin diving deeper than 75 feet) is individual consideration on a case-by-case basis — may or may not be eligible; conservative Standard ceiling pending underwriter review.",
      aviationFlatExtra: {
        baseClass: "preferred",
        text: "Aviation exposure disclosed — Transamerica: private aviation may be offered with or without a ratable aviation flat extra at the Preferred classes (published flat-extra lane); other hazardous avocations from the prohibited list are individual consideration."
      },
      cleanText: "No hazardous occupation or avocation disclosed."
    },

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
      { id: "cimt", name: "Carotid imaging (CIMT)", ceilings: [{ klass: "preferred_plus", when: "reviewed individually" }] },
      { id: "ptsd", name: "Post-traumatic stress disorder (PTSD)", ceilings: [{ klass: "standard", when: "PTSD — treated, stable (impairment table: depression row)" }], worse: "PTSD with self-harm/suicide or substance use — review under mental-health rules." },
      { id: "major_depression", name: "Major depressive disorder", ceilings: [{ klass: "standard", when: "controlled with medication (depression row)" }], worse: "Standard to Table 3; single suicide attempt over 1 year $5/M flat extra." },
      { id: "migraine", name: "Migraine / headache", ceilings: [{ klass: "standard", when: "migraine or tension headache (impairment table)" }], worse: "Migraine — Standard; severe or not investigated — Table to decline." },
      { id: "chronic_fatigue", name: "Chronic fatigue syndrome", ceilings: [{ klass: "standard", when: "chronic fatigue syndrome (impairment table)" }] },
      { id: "rem_sleep_disorder", name: "REM sleep behavior disorder", ceilings: [{ klass: "standard", when: "reviewed under sleep/neuro" }] },
      { id: "hypothyroidism", name: "Thyroid disorder", ceilings: [{ klass: "preferred_plus", when: "controlled thyroid disorder (impairment table)" }], worse: "Thyroid disorder — Standard to Table 6 depending on control." },
      { id: "hypogonadism", name: "Hypogonadism / low testosterone", ceilings: [{ klass: "preferred_plus", when: "controlled on testosterone therapy" }] },
      { id: "erectile_dysfunction", name: "Erectile dysfunction", ceilings: [{ klass: "preferred_plus", when: "ED only, no cardiac event" }], worse: "ED with underlying cardiovascular disease — review the cardiac history." },
      { id: "pacemaker_icd", name: "Cardiac pacemaker / ICD", ceilings: [{ klass: "table", table: 2, when: "pacemaker, no other heart disease, 3+ months, over 40 (best case Table 2)" }], worse: "Pacemaker — Table 2-4; defibrillator — decline/specialist review." },
      { id: "heart_valve_prosthesis", name: "Heart valve prosthesis", ceilings: [{ klass: "table", table: 4, when: "heart valve surgery (impairment table)" }], worse: "Heart valve surgery — Table 4 to decline." },
      { id: "intracranial_aneurysm_clip", name: "Intracranial aneurysm clip", ceilings: [{ klass: "table", when: "stable, long-standing clip — individual review" }] },
      { id: "vp_shunt", name: "VP / CSF shunt", ceilings: [{ klass: "standard", when: "stable shunt, no recent revision" }] },
      { id: "neurostimulator", name: "Neurostimulator", ceilings: [{ klass: "standard", when: "reviewed on the underlying condition" }] },
      { id: "cochlear_implant", name: "Cochlear implant", ceilings: [{ klass: "standard", when: "sensory device — not rateable" }] },
      { id: "drug_infusion_pump", name: "Drug infusion pump", ceilings: [{ klass: "standard", when: "reviewed on the underlying condition" }] },
      { id: "ocular_monitoring", name: "Ocular monitoring system", ceilings: [{ klass: "standard", when: "monitoring device — reviewed on the underlying condition" }] }
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
      genericGrid: false,
      /* Age-and-face-amount requirement charts (p. 7-9): one grid per
         product. Cells list requirement codes; an empty cell means none
         routinely required. With no product selected, the evidence list
         shows the union across the three product grids for the applicant's
         age and face amount — the exact set depends on the product. */
      requirementGrids: [
      {
        products: "Trendsetter Super / Trendsetter LB",
        ages: [[18,40],[41,45],[46,55],[56,60],[61,70],[71,75],[76,80]],
        rows: [
          { min: 25000, max: 50000, cells: [[],[],[],[],[],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"]] },
          { min: 50001, max: 99999, cells: [[],[],[],[],["V","BCP","HOS"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"]] },
          { min: 100000, max: 249999, cells: [["MVR"],[],[],["V","BCP","HOS"],["V","BCP","HOS"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"]] },
          { min: 250000, max: 500000, cells: [["MVR"],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"]] },
          { min: 500001, max: 1000000, cells: [["MVR"],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","CS","PFS","MVR"]] },
          { min: 1000001, max: 2000000, cells: [["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 2000001, max: 3500000, cells: [["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 3500001, max: 5000000, cells: [["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 5000001, max: 10000000, cells: [["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 10000001, max: 999999999, cells: [["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"]] },
        ]
      },
      {
        products: "Financial Choice IUL",
        ages: [[0,17],[18,40],[41,45],[46,55],[56,60],[61,70],[71,75],[76,80],[81,85]],
        rows: [
          { min: 250000, max: 500000, cells: [[],["MVR"],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"]] },
          { min: 500001, max: 1000000, cells: [[],["MVR"],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"]] },
          { min: 1000001, max: 2000000, cells: [[],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","PFS","CS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 2000001, max: 3500000, cells: [[],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 3500001, max: 5000000, cells: [[],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","CS","PFS","MVR","IR"],["V","BCP","HOS","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"]] },
          { min: 5000001, max: 10000000, cells: [[],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"]] },
          { min: 10000001, max: 999999999, cells: [[],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"]] },
        ]
      },
      {
        products: "Financial Foundation IUL / II",
        ages: [[0,17],[18,40],[41,45],[46,55],[56,60],[61,70],[71,75],[76,80],[81,85]],
        rows: [
          { min: 25000, max: 50000, cells: [[],["MVR"],[],[],[],["V","BCP","HOS"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"]] },
          { min: 50001, max: 75000, cells: [[],["MVR"],[],[],[],["V","BCP","HOS"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"]] },
          { min: 75001, max: 99999, cells: [[],["MVR"],[],[],["V","BCP","HOS"],["V","BCP","HOS"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"]] },
          { min: 100000, max: 249999, cells: [[],["MVR"],[],[],["V","BCP","HOS"],["V","BCP","HOS"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"]] },
          { min: 250000, max: 500000, cells: [[],["MVR"],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"]] },
          { min: 500001, max: 1000000, cells: [[],["MVR"],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"],["V","BCP","HOS","CS","MVR"]] },
          { min: 1000001, max: 2000000, cells: [[],["MVR"],["MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 2000001, max: 3500000, cells: [[],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","PFS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","CS","PFS","MVR"],["V","BCP","HOS","ECG","CS","PFS","MVR"]] },
          { min: 3500001, max: 5000000, cells: [[],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","CS","PFS","MVR","IR"],["V","BCP","HOS","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"]] },
          { min: 5000001, max: 10000000, cells: [[],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","PFS","MVR","IR"],["V","BCP","HOS","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"]] },
          { min: 10000001, max: 999999999, cells: [[],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"],["V","BCP","HOS","ECG","CS","PFS","MVR","IR"]] },
        ]
      },
      ],
      apsConditions: [
        "Cancer", "Diabetes", "Heart (cardiac) disease", "Cerebrovascular disease", "COPD",
        "Kidney disease", "Liver disease", "Mental-health disorders", "Substance abuse/dependence",
        "Multiple sclerosis", "Parkinson's disease", "Muscular dystrophy", "Rheumatoid arthritis", "Lupus"
      ],
      note: "Transamerica orders all requirements. Age-and-face-amount charts (p. 7-9) for Trendsetter Super/LB, Financial Choice IUL, and Financial Foundation IUL/II list Vitals, BCP, HOS, MVR, CS, PFS, ECG, and IR by band; with no product selected, the evidence checklist shows the union across the three charts for the applicant's age and face amount — the exact set depends on the product (e.g., the Financial Choice IUL grid differs from Trendsetter's). Trendsetter LB band one ($25,000-$99,999) is not available for ages 18-22. Digital underwriting (iGO e-App) can produce a decision within minutes; applicants receiving a digital decision are not reconsidered for a better class.",
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


    /* ---- Final Expense Solutions lane (Live Smart portfolio) -------------------
       Immediate Solution / 10-Pay Solution / Easy Solution — simplified-issue
       final-expense whole life, ages 0-85, face $1,000-$50,000 by age band
       (Easy Solution ages 18-80 to $25,000, graded benefit). Decisions are
       Preferred / Standard / Graded / Decline — no table ratings; any nicotine
       use within 12 months receives a tobacco rating. The Adult Single Condition
       Decision Chart assigns each condition/lifestyle factor a rating; four or
       more Standard/Graded conditions decline. Not modeled as a class — the
       estimate reflects the term/IUL lane and the FE rules surface as lane
       guidance. ----------------------------------------------------------------- */
    feLane: {
      note: "Transamerica Final Expense Solutions (Immediate Solution, 10-Pay Solution, Easy Solution) is a separate simplified-issue final-expense whole-life lane — ages 0-85, face $1,000-$50,000 by age band (Easy Solution ages 18-80, $25,000 max, graded benefit; Immediate Solution & 10-Pay issue 0-85). Decisions are Preferred / Standard / Graded / Decline with no table ratings; any nicotine use within the last 12 months receives a tobacco rating. Not modeled as a class — the estimate reflects the term/IUL lane.",
      products: "Immediate Solution (level premiums to age 121), 10-Pay Solution (level 10 years), Easy Solution (graded death benefit, ages 18-80)",
      issueAges: "0-85 (Immediate & 10-Pay); 18-80 (Easy Solution)",
      maxIssueAge: 85,
      faceBands: [
        { ages: "0-55", max: 50000 },
        { ages: "56-65", max: 40000 },
        { ages: "66-75", max: 30000 },
        { ages: "76-85", max: 25000 }
      ],
      tobaccoLookbackMonths: 12,
      activityCredit: "Activity Credit (adults 18+, applies only to adults): routine physical activity 3+ days per week for at least 10 consecutive minutes each time — walking the dog, gardening, mowing, manual labor, jogging, elliptical, rowing, stationary bike, weights, or similar. Can improve build-only Standard to Preferred, and a single Standard-rated respiratory (COPD, black lung, chronic bronchitis), stroke/TIA, or recent-hospitalization condition to Preferred.",
      buildChart: {
        53: { min: 74, pref: 159, std: 179, graded: 191 },
        54: { min: 77, pref: 165, std: 186, graded: 199 },
        55: { min: 80, pref: 172, std: 193, graded: 206 },
        56: { min: 83, pref: 178, std: 200, graded: 214 },
        57: { min: 86, pref: 184, std: 207, graded: 221 },
        58: { min: 89, pref: 191, std: 215, graded: 229 },
        59: { min: 92, pref: 198, std: 222, graded: 237 },
        60: { min: 95, pref: 204, std: 230, graded: 245 },
        61: { min: 98, pref: 211, std: 238, graded: 254 },
        62: { min: 102, pref: 218, std: 246, graded: 262 },
        63: { min: 105, pref: 225, std: 254, graded: 270 },
        64: { min: 108, pref: 233, std: 262, graded: 279 },
        65: { min: 112, pref: 240, std: 270, graded: 288 },
        66: { min: 115, pref: 247, std: 278, graded: 297 },
        67: { min: 119, pref: 255, std: 287, graded: 306 },
        68: { min: 122, pref: 263, std: 295, graded: 315 },
        69: { min: 126, pref: 270, std: 304, graded: 325 },
        70: { min: 129, pref: 278, std: 313, graded: 334 },
        71: { min: 133, pref: 286, std: 322, graded: 344 },
        72: { min: 137, pref: 294, std: 331, graded: 353 },
        73: { min: 141, pref: 303, std: 341, graded: 363 },
        74: { min: 145, pref: 311, std: 350, graded: 373 },
        75: { min: 149, pref: 320, std: 360, graded: 384 },
        76: { min: 152, pref: 328, std: 369, graded: 394 },
        77: { min: 157, pref: 337, std: 379, graded: 404 },
        78: { min: 161, pref: 346, std: 389, graded: 415 },
        79: { min: 165, pref: 355, std: 399, graded: 426 },
        80: { min: 169, pref: 364, std: 409, graded: 436 },
        81: { min: 173, pref: 373, std: 419, graded: 447 },
        82: { min: 177, pref: 382, std: 430, graded: 459 },
        83: { min: 182, pref: 391, std: 440, graded: 470 },
        84: { min: 186, pref: 401, std: 451, graded: 481 }
      },
      buildNote: "Adult height/weight chart — rate classes are the best possible decision for height/weight alone, before any medical conditions or lifestyle factors. Minimum weight = BMI > 18.5; Preferred maximum = BMI < 40; Standard maximum = BMI < 45; Graded maximum = BMI < 48. If build exceeds the graded maximum — no coverage available.",
      declineScreens: [
        "AIDS / HIV / ARC",
        "Alcoholism or alcohol abuse — diagnosed, treated, or advised within the past 2 years",
        "ALS (Lou Gehrig's disease) or other motor neuron disease",
        "Alzheimer's / dementia / memory loss / cognitive disorders",
        "Amputation other than due to accident or trauma",
        "Assisted living / long-term care facility / home healthcare — current",
        "Bone marrow transplant (including donor stem cells)",
        "Cancer other than basal cell — onset within 2 years, metastatic, recurrent, multiple, or metastasis to lymph nodes",
        "Cerebral palsy",
        "Cystic fibrosis",
        "Diabetic coma",
        "Down syndrome",
        "Driving — DUI/DWI/OWI/reckless within 2 years, or multiple offenses within 5 years",
        "Drug use/abuse (including prescription drugs) within 2 years",
        "Employment in the cannabis industry or a cannabis-related business",
        "Felony conviction/no contest — within 3 years, or multiple offenses within 10 years",
        "Gaucher's disease",
        "Hospice",
        "Hunter syndrome / Huntington's disease / Niemann-Pick disease / Pompe disease / Wilson's disease / Wiskott-Aldrich syndrome",
        "Incarceration — current",
        "Mental incapacity / mental retardation",
        "Oxygen use",
        "Parole/probation — currently or within 2 years",
        "Pulmonary fibrosis",
        "Sickle cell anemia",
        "Suicide attempt within 2 years",
        "Surgery advised or planned requiring general anesthesia",
        "Terminal illness (death expected within 18 months)",
        "Transplant recipient — organ or stem cell",
        "Wasting syndrome"
      ],
      decisionNote: "Preferred requires ALL medical conditions, lifestyle factors, and height/weight Preferred. Standard: all conditions Preferred with lifestyle/build Standard, or one Standard condition with Preferred build. Graded: one Graded condition (or two Standard conditions, or all lifestyle/build Graded) with conditions Preferred or better. Decline: any single Decline-rated condition or lifestyle factor, Decline build, or four or more Standard/Graded conditions."
    },
    /* No one-class credit is published in the Transamerica field guide. */
    credit: null,

    classInfo: {
      preferred_plus: { name: "Preferred Plus / Preferred Elite", meaning: "No tobacco in past 5 years; no heart/vascular disease, diabetes, or cancer (except some skin cancers); BMI 17-28 (ages 16-59).", color: "#0e7a5f" },
      preferred: { name: "Preferred Nonsmoker / Preferred Plus", meaning: "No tobacco in past 2 years; meets preferred criteria (BMI 28-30; BP ≤145/85; chol ≤260; ratio ≤5.5).", color: "#1b9a7a" },
      standard_plus: { name: "Standard Plus / Preferred", meaning: "Meets Standard Plus criteria (BMI 30-32; BP ≤148/88; chol ≤300; ratio ≤6.2).", color: "#3b82b0" },
      standard: { name: "Standard Nonsmoker / Nontobacco", meaning: "Average insurable risk; no ratable impairments for the standard class requirement.", color: "#4a6fa5" },
      flat_extra: { name: "Preferred + flat extra", meaning: "Private aviation may be offered with or without a ratable aviation flat extra at the Preferred classes (published flat-extra lane); the flat extra is added to the base class premium.", color: "#c2691b" },
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
    eligibility: {
      products: "Term Life Answers, Term Life Express (TLE), Guaranteed UL Express (GULE), Indexed UL Express (IULE), whole life, Children's Whole Life, Living Promise",
      issueAges: "18-70+ by product (Express simplified lanes 18-60)",
      faceRange: "Accelerated UW $100,000-$1,000,000 (ages 18-55); Express $25,000-$300,000; jumbo limits to $65,000,000 (ages ≤80)",
      residency: "US (United of Omaha)",
      notes: [
        "Age last birthday (advantage to the applicant); unisex build charts.",
        "Fit program: up to 2 table credits for ages 18-75, $100K-$5M, non-tobacco — best final class is Standard.",
        "Express simplified lanes decline many impairments that fully underwritten review may still rate."
      ],
      charts: [
        { product: "Term Life Answers (accelerated UW)", ages: "18-55", face: "$100,000-$1,000,000" },
        { product: "TLE / GULE / IULE (Express lanes)", ages: "18-60", face: "$25,000-$300,000 (combined maximum by age)" },
        { product: "Fully underwritten term / permanent", ages: "18-80+", face: "Through $5,000,000+; jumbo limits to $65,000,000 (ages ≤80)" },
        { product: "Children's Whole Life", ages: "0-17", face: "Generally to $100,000 — not over 50% of the lesser parent's in-force coverage" }
      ]
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
      currentHazardousText: "Hazardous occupation/avocation disclosed — MOO prefers clean avocation history (Preferred Plus: none in 5 years; Preferred: none in 2 years); Standard Plus allows flat extras. Ratings depend on the type of avocation and details; hazardous avocations rate above Standard Plus.",
      aviationFlatExtra: {
        baseClass: "standard_plus",
        text: "Aviation exposure disclosed — MOO: aviation is not allowable as a private pilot or crewmember unless an aviation exclusion is taken; with the exclusion, Standard Plus is the best class with flat extras. Commercial pilots for regularly scheduled passenger airlines can qualify for all Preferred classes, and private pilots with an Aviation Exclusion Rider (AER) may qualify for Preferred Plus / Preferred / Standard Plus; certain private pilots (ages 30-70, 1,000+ total hours, 50-250 flying hours annually, IFR/ATP rating, no FAA violations in 5 years) qualify for Preferred and Standard Plus without a rider."
      },
      flatExtra: {
        baseClass: "standard_plus",
        text: "Hazardous avocation/aviation disclosed — MOO: Standard Plus is the best class with flat extras when the profile otherwise qualifies; hazardous avocations and aviation without an exclusion rate accordingly."
      },
      scubaPreferredPlusText: "Recreational scuba disclosed — MOO: Preferred classes may be available when the dive does not exceed 100 feet and is limited to a vacation or other occasional occurrence (certified, open-water, no wreck/salvage/ice/cave diving); otherwise reviewed under avocation guidelines.",
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
      { id: "paralysis", name: "Paralysis", ceilings: [{ klass: "table", table: 8, when: "paraplegia — individual consideration" }], decline: "Quadriplegia — decline." },
      { id: "ptsd", name: "Post-traumatic stress disorder (PTSD)", ceilings: [{ klass: "standard", when: "PTSD — treated, stable (impairment table: depression row)" }], worse: "PTSD with self-harm/suicide or substance use — review under mental-health rules." },
      { id: "major_depression", name: "Major depressive disorder", ceilings: [{ klass: "standard", when: "controlled with medication (depression row)" }], worse: "Standard to Table 3; single suicide attempt over 1 year $5/M flat extra." },
      { id: "migraine", name: "Migraine / headache", ceilings: [{ klass: "standard", when: "migraine or tension headache (impairment table)" }], worse: "Migraine — Standard; severe or not investigated — Table to decline." },
      { id: "chronic_fatigue", name: "Chronic fatigue syndrome", ceilings: [{ klass: "standard", when: "chronic fatigue syndrome (impairment table)" }] },
      { id: "rem_sleep_disorder", name: "REM sleep behavior disorder", ceilings: [{ klass: "standard", when: "reviewed under sleep/neuro" }] },
      { id: "hypothyroidism", name: "Thyroid disorder", ceilings: [{ klass: "standard", when: "not on the simplified impairment list — conservative review" }] },
      { id: "hypogonadism", name: "Hypogonadism / low testosterone", ceilings: [{ klass: "preferred_plus", when: "controlled on testosterone therapy" }] },
      { id: "erectile_dysfunction", name: "Erectile dysfunction", ceilings: [{ klass: "preferred_plus", when: "ED only, no cardiac event" }], worse: "ED with underlying cardiovascular disease — review the cardiac history." },
      { id: "pacemaker_icd", name: "Cardiac pacemaker / ICD", ceilings: [{ klass: "standard", when: "listed on the common-impairment list — may be an adjusted benefit or decline; stable device reviewed individually" }], worse: "Defibrillator — decline/specialist review." },
      { id: "heart_valve_prosthesis", name: "Heart valve prosthesis", ceilings: [{ klass: "table", when: "heart surgery — reviewed under coronary/heart disease rows" }] },
      { id: "intracranial_aneurysm_clip", name: "Intracranial aneurysm clip", ceilings: [{ klass: "standard", when: "stable, long-standing clip — individual review" }] },
      { id: "vp_shunt", name: "VP / CSF shunt", ceilings: [{ klass: "standard", when: "stable shunt, no recent revision" }] },
      { id: "neurostimulator", name: "Neurostimulator", ceilings: [{ klass: "standard", when: "reviewed on the underlying condition" }] },
      { id: "cochlear_implant", name: "Cochlear implant", ceilings: [{ klass: "standard", when: "sensory device — not rateable" }] },
      { id: "drug_infusion_pump", name: "Drug infusion pump", ceilings: [{ klass: "standard", when: "reviewed on the underlying condition" }] },
      { id: "ocular_monitoring", name: "Ocular monitoring system", ceilings: [{ klass: "standard", when: "monitoring device — reviewed on the underlying condition" }] }
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
      flat_extra: { name: "Flat extra", meaning: "Added charge for a specific measurable risk — MOO: Standard Plus allows flat extras for hazardous avocations/aviation; published flat-extra schedules for aviation, diving, and climbing.", color: "#c2691b" },
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
      note: "Quantum eligibility: issue ages 0-60, minimum $50,000, maximum $500,000 (ages 0-17) / $1,000,000 (18-60); total in-force + applied with F&G over $1,000,000 requires another product. No internal or external replacements allowed. Underwriting runs from the application plus electronic databases (MIB on all applications, RX/lab/medical-claims history, MVR as needed, ID verification) — a paramedical exam will not improve the rate class. Residents of all 50 US states; Puerto Rico and US territories not eligible. American Amicable's simplified-issue products (Express Term, Term Made Simple, Dignity Solutions) are separate lanes modeled under the 'amam' ruleset."
    },
    eligibility: {
      products: "F&G Quantum (term and IUL); American Amicable's simplified-issue products are separate lanes modeled under the 'amam' ruleset",
      issueAges: "0-60",
      maxIssueAge: 60,
      faceRange: "Minimum $50,000; maximum $500,000 (ages 0-17) / $1,000,000 (18-60)",
      residency: "All 50 US states; Puerto Rico and US territories not eligible",
      notes: [
        "No internal or external replacements allowed.",
        "Total in-force + applied coverage over $1,000,000 requires application and underwriting on another product.",
        "Underwritten from the application plus electronic databases — a paramedical exam will not improve the rate class."
      ],
      charts: [
        { product: "F&G Quantum (term & IUL)", ages: "0-60", face: "$50,000-$500,000 (ages 0-17) / $1,000,000 (18-60)" }
      ]
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
      marijuana: "Marijuana use less than 4 times per week and no more than 4 grams per week is acceptable; daily marijuana use is a decline. Occupations involving the production, processing, or sale of marijuana are a decline.",
      marijuanaDailyDecline: true
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
      currentHazardousText: "Hazardous occupation/avocation disclosed — F&G Preferred allows flat-extra ratings for aviation/avocation; the Standard class requires no rateable activity. Flat-extra schedules are reviewed by underwriting.",
      flatExtra: {
        baseClass: "preferred",
        text: "Hazardous avocation/aviation disclosed — F&G: Preferred is the best class available at the appropriate flat-extra rating (Preferred Plus requires no rateable activity); flat-extra schedules are reviewed by underwriting."
      },
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
      totalLineCap: 1000000,
      noReplacements: true,
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
      flat_extra: { name: "Flat extra", meaning: "Added charge for a specific measurable risk — F&G: Preferred may be available for certain aviation/avocation activities at the appropriate flat-extra rating; schedules reviewed by underwriting.", color: "#c2691b" },
      postpone: { name: "Postpone / pre-review", meaning: "Wait for stability or wait-out (cancer 10 years, gastric bypass 1 year, heart event 5 years, epilepsy 5 years) or pending workup.", color: "#8a5fb8" },
      decline: { name: "Decline / specialist review", meaning: "On the Quantum decline lists (cancer within 10 years, diabetes with A1c 7+, HIV, dementia, kidney/liver disease, respiratory disorder, etc.) — carrier direction required.", color: "#b3364a" }
    }
  },

  /* ====================================================================
   * F&G PATHSETTER — Fidelity & Guaranty Life Insurance Company
   * "F&G Pathsetter Agent Guide" (IUL; company underwriting standards per
   * the F&G Quantum guidelines, ADV5691, 07-2025). Issue ages 0-80.
   * ==================================================================== */
  fg_pathsetter: {
    id: "fg_pathsetter",
    name: "F&G Pathsetter",
    company: "Fidelity & Guaranty Life Insurance Company (F&G)",
    guide: {
      title: "F&G Pathsetter Agent Guide",
      version: "(IUL; company underwriting standards per ADV5691, 07-2025)",
      note: "Pathsetter eligibility: issue ages 0-80, minimum $50,000, through Table H (300%) with retention $1,000,000, automatic reinsurance binding to $10,000,000, jumbo limit $20,000,000. Exam-Free Underwriting for ages 0-60 through $1,000,000 (MIB, MVR, credit/public-records, RX/lab/medical-claims databases, InstantID — a paramedical exam will not improve the rate class); above those ages/amounts, paramedical + HOS/blood (+ EKG at 71+ or higher amounts) are ordered. Applicants who do not qualify for Preferred or Standard may be approved at Express Standard Tobacco / Express Standard Non-Tobacco rates without medical requirements; Express Standard is also used when individuals 45-60 have not seen a medical professional in the previous 3 years. Impairment specifics follow F&G company standards (Quantum guidelines, ADV5691). Non-working spouse: maximum $1,000,000 per primary insured, not to exceed the wage earner's in-force coverage. Large case ($2,000,000+ face or $20,000+ planned annual premium): Large Case Transmittal form + illustration required."
    },
    eligibility: {
      products: "F&G Pathsetter (IUL; company underwriting standards per ADV5691)",
      issueAges: "0-80",
      maxIssueAge: 80,
      faceRange: "Minimum $50,000; retention $1,000,000; automatic reinsurance binding to $10,000,000; jumbo $20,000,000; tables through H (300%)",
      residency: "US",
      notes: [
        "Exam-Free underwriting ages 0-60 through $1,000,000 — no paramedical; a paramedical exam will not improve the rate class.",
        "Express Standard rates for applicants who don't qualify for Preferred or Standard (and ages 45-60 with no medical visit in the previous 3 years).",
        "Large case ($2,000,000+ face or $20,000+ planned annual premium): Large Case Transmittal form + illustration required."
      ],
      charts: [
        { product: "F&G Pathsetter (IUL)", ages: "0-80", face: "$50,000-$20,000,000 — retention $1M; auto-reinsurance binding to $10M; jumbo $20M; tables through H (300%)" },
        { product: "Exam-Free lane", ages: "0-60", face: "Through $1,000,000" }
      ]
    },

    /* ---- Nicotine ----------------------------------------------------- */
    nicotine: {
      classes: [
        { klass: "preferred_plus", lookbackMonths: 24, label: "Preferred Non-Tobacco (no tobacco use past 2 years)" },
        { klass: "standard", lookbackMonths: 12, label: "Non-Tobacco (no tobacco use past 1 year)" }
      ],
      tobaccoLookbackMonths: 12,
      tobaccoDefinition: "No tobacco use, including nicotine substitutes, e-cigarettes, and vaping, within the last 24 months for Preferred Non-Tobacco or 12 months for Non-Tobacco; the applicant must not test positive for nicotine in urine or saliva. Misrepresentation of the tobacco use question is treated as significant misrepresentation.",
      cigarException: {
        note: "Occasional cigar use may qualify for Non-Tobacco rates if fully disclosed on the application (no frequency published in the guide — verify with underwriting).",
        maxPerMonth: 1,
        maxPerYear: 12
      },
      marijuana: "Marijuana use less than 4 times per week and no more than 4 grams per week is acceptable; daily marijuana use is a decline. Occupations involving the production, processing, or sale of marijuana are a decline.",
      marijuanaDailyDecline: true
    },

    /* ---- Build: sex-specific chart with Preferred / Standard columns ---
       Adult minimum weights and Table H (300%) maximums per page 14. */
    build: {
      chart: {
        56:  { male: { pp: 166, std: 183 }, female: { pp: 152, std: 167 }, min: 74, tableMax: 207 },
        57:  { male: { pp: 170, std: 187 }, female: { pp: 155, std: 171 }, min: 77, tableMax: 214 },
        58:  { male: { pp: 174, std: 191 }, female: { pp: 157, std: 173 }, min: 79, tableMax: 222 },
        59:  { male: { pp: 178, std: 196 }, female: { pp: 160, std: 176 }, min: 82, tableMax: 230 },
        60:  { male: { pp: 182, std: 200 }, female: { pp: 163, std: 179 }, min: 85, tableMax: 238 },
        61:  { male: { pp: 186, std: 205 }, female: { pp: 166, std: 183 }, min: 88, tableMax: 246 },
        62:  { male: { pp: 190, std: 209 }, female: { pp: 169, std: 186 }, min: 91, tableMax: 254 },
        63:  { male: { pp: 196, std: 216 }, female: { pp: 174, std: 191 }, min: 94, tableMax: 262 },
        64:  { male: { pp: 202, std: 222 }, female: { pp: 179, std: 197 }, min: 97, tableMax: 270 },
        65:  { male: { pp: 207, std: 228 }, female: { pp: 183, std: 201 }, min: 100, tableMax: 279 },
        66:  { male: { pp: 213, std: 234 }, female: { pp: 189, std: 208 }, min: 103, tableMax: 288 },
        67:  { male: { pp: 217, std: 239 }, female: { pp: 193, std: 212 }, min: 106, tableMax: 296 },
        68:  { male: { pp: 223, std: 245 }, female: { pp: 198, std: 218 }, min: 109, tableMax: 305 },
        69:  { male: { pp: 228, std: 251 }, female: { pp: 202, std: 222 }, min: 112, tableMax: 314 },
        70:  { male: { pp: 235, std: 259 }, female: { pp: 208, std: 229 }, min: 115, tableMax: 324 },
        71:  { male: { pp: 241, std: 265 }, female: { pp: 214, std: 235 }, min: 119, tableMax: 333 },
        72:  { male: { pp: 248, std: 273 }, female: { pp: 221, std: 243 }, min: 122, tableMax: 342 },
        73:  { male: { pp: 253, std: 278 }, female: { pp: 225, std: 248 }, min: 126, tableMax: 352 },
        74:  { male: { pp: 260, std: 286 }, female: { pp: 232, std: 255 }, min: 129, tableMax: 362 },
        75:  { male: { pp: 267, std: 294 }, female: { pp: 237, std: 261 }, min: 133, tableMax: 372 },
        76:  { male: { pp: 276, std: 304 }, female: { pp: 246, std: 271 }, min: 136, tableMax: 382 },
        77:  { male: { pp: 284, std: 312 }, female: { pp: 253, std: 278 }, min: 140, tableMax: 392 },
        78:  { male: { pp: 293, std: 322 }, female: { pp: 261, std: 287 }, min: 143, tableMax: 402 },
        79:  { male: { pp: 301, std: 331 }, female: { pp: 268, std: 295 }, min: 147, tableMax: 412 },
        80:  { male: { pp: 308, std: 341 }, female: { pp: 274, std: 308 }, min: 151, tableMax: 423 },
        81:  { male: { pp: 315, std: 349 }, female: { pp: 282, std: 316 }, min: 154, tableMax: 433 },
        82:  { male: { pp: 325, std: 359 }, female: { pp: 288, std: 326 }, min: 157, tableMax: 443 },
        83:  { male: { pp: 336, std: 369 }, female: { pp: 293, std: 336 }, min: 160, tableMax: 454 },
        84:  { male: { pp: 345, std: 378 }, female: { pp: 298, std: 345 }, min: 164, tableMax: 465 }
      },
      rules: {
        minHeightIn: 56,
        maxHeightIn: 84,
        chartMinWeight: 74,
        halfInchRounding: "Half-inch measurements round up to the next inch.",
        applyWeightLossAdjustment: false,
        ageAddLbs: [
          { ageMin: 51, ageMax: 65, add: 5, note: "For ages 51-65, add 5 pounds to the build-chart thresholds." },
          { ageMin: 66, ageMax: 200, add: 10, note: "For ages 66 and up, add 10 pounds to the build-chart thresholds." }
        ],
        weightLossAdjustment: "Weight stability is reviewed; significant recent weight change (gain or loss) — manual underwriting review.",
        lowBuildReview: "Weight below the adult minimum for height, or below the 5th-percentile growth chart for juveniles, -> manual underwriting review.",
        belowChartMin: 18.5,
        aboveStandard: "Weight above the Table H (300%) maximum for height -> manual underwriting review; substandard ratings run through Table H.",
        tableCeilingLabel: "substandard (through Table H / 300%)",
        tableCeilingRating: "H",
        note: "Sex-specific build chart (Preferred / Standard columns, ages 16-50); add 5 lb at ages 51-65 and 10 lb at 66+. Above Standard but within the adult maximum (Table H 300%) -> substandard rating through Table H. Juvenile build uses WHO/CDC growth-chart percentiles (not modeled)."
      }
    },
    /* ---- Blood pressure (age bands; treatment allowed if the 2-year
           average meets parameters) ---------------------------------- */
    bp: {
      preferred_plus:   [{ ageMin: 18, ageMax: 50, sys: 150, dia: 90 }, { ageMin: 51, ageMax: 65, sys: 160, dia: 95 }, { ageMin: 66, ageMax: 200, sys: 160, dia: 95 }],
      preferred:        null,
      standard_plus:    null,
      standard:         [{ ageMin: 18, ageMax: 50, sys: 155, dia: 95 }, { ageMin: 51, ageMax: 65, sys: 160, dia: 95 }, { ageMin: 66, ageMax: 200, sys: 165, dia: 95 }]
    },
    bpTreatmentNote: "Treatment for high blood pressure may be allowed as long as the current and historical readings averaged over the last two years meet the stated parameters.",

    /* ---- Cholesterol (age bands; treatment allowed if 2-yr average OK) */
    cholesterol: {
      total: {
        preferred_plus: [{ ageMin: 18, ageMax: 50, max: 260 }, { ageMin: 51, ageMax: 65, max: 280 }, { ageMin: 66, ageMax: 200, max: 300 }],
        standard:      [{ ageMin: 18, ageMax: 50, max: 300 }, { ageMin: 51, ageMax: 65, max: 300 }, { ageMin: 66, ageMax: 200, max: 300 }]
      },
      ratio: {
        preferred_plus: [{ ageMin: 18, ageMax: 200, max: 7 }],
        standard:      [{ ageMin: 18, ageMax: 200, max: 8 }]
      },
      note: "Cholesterol treatment accepted as long as the current and historical levels averaged over the last two years meet the parameter. Preferred: total 260 (18-50) / 280 (51-65) / 300 (66+), ratio 7; Standard: total up to 300 (band ranges 261-300 / 281-300 / 300), ratio 8."
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
       substance abuse, or listed cancers. Drug use within 5 years = decline.
       Impairment specifics follow F&G company standards (Quantum guidelines,
       ADV5691) — see the shared lists below the RULES object. */
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

    /* Aviation/avocation: Preferred allows flat-extra ratings for certain
       aviation/avocation activities; the Standard class requires no rateable
       activity — so hazardous activities do not cap Preferred, they add a
       flat extra. */
    avocation: {
      currentHazardousText: "Hazardous occupation/avocation disclosed — F&G Preferred allows flat-extra ratings for aviation/avocation; the Standard class requires no rateable activity. Flat-extra schedules are reviewed by underwriting.",
      flatExtra: {
        baseClass: "preferred",
        text: "Hazardous avocation/aviation disclosed — F&G: Preferred is the best class available at the appropriate flat-extra rating (Preferred Plus requires no rateable activity); flat-extra schedules are reviewed by underwriting."
      },
      cleanText: "No hazardous occupation or avocation disclosed."
    },

    /* Shared F&G company lists (medicalCeilings, postponeTriggers,
       declineTriggers) are assigned below the RULES object. */
    /* __PATH_SHARED__ */

    /* ---- Evidence / workflow ----------------------------------------- */
    evidence: {
      apsAge: 70,
      genericGrid: false,
      apsConditions: [
        "Cancer", "Diabetes", "Heart (cardiac) disease", "Stroke / TIA", "COPD / emphysema",
        "Kidney disease", "Liver disease", "Mental-health disorders", "Substance abuse/dependence",
        "Multiple sclerosis", "Parkinson's disease", "Muscular dystrophy", "Rheumatoid arthritis", "Lupus",
        "Organ transplant", "Paralysis", "HIV", "Sleep apnea", "Seizure disorders"
      ],
      amountRules: [
        { ageMin: 0, ageMax: 60, amountMin: 50000, amountMax: 1000000, items: ["Exam-Free Underwriting (MIB, InstantID, MVR, RX/lab/medical-claims databases, credit/public-records)"] },
        { ageMin: 0, ageMax: 17, amountMin: 500001, items: ["APS (attending physician statement)"] },
        { ageMin: 18, ageMax: 40, amountMin: 3000001, items: ["APS (attending physician statement)"] },
        { ageMin: 41, ageMax: 60, amountMin: 2000001, items: ["APS (attending physician statement)"] },
        { ageMin: 61, ageMax: 69, amountMin: 1000001, items: ["APS (attending physician statement)"] },
        { ageMin: 70, ageMax: 200, amountMin: 1, items: ["APS (attending physician statement)"] },
        { ageMin: 61, ageMax: 80, amountMin: 50000, items: ["Paramedical exam + HOS/blood"] },
        { ageMin: 18, ageMax: 80, amountMin: 1000001, items: ["Paramedical exam + HOS/blood"] },
        { ageMin: 71, ageMax: 80, amountMin: 50000, items: ["EKG"] },
        { ageMin: 51, ageMax: 80, amountMin: 1000001, items: ["EKG"] },
        { ageMin: 41, ageMax: 80, amountMin: 2000001, items: ["EKG"] },
        { ageMin: 18, ageMax: 200, amountMin: 2000000, items: ["Telephone interview + Large Case Transmittal form (ADMIN 5481) + illustration"] },
        { ageMin: 0, ageMax: 17, amountMin: 1, items: ["Juvenile: up to 50% of parent's coverage (max $1,000,000); growth-chart build; parents' coverage details required"] }
      ],
      acceleratedUw: { ageMin: 0, ageMax: 60, amountMin: 50000, amountMax: 1000000, note: "Exam-Free Underwriting for ages 0-60 through $1,000,000: MIB, MVR, credit/public-records insurance report, RX/lab/medical-claims databases, and InstantID. A paramedical exam should not be ordered and will not improve the rate class." },
      note: "Requirements by age and face amount (p. 16-17): Exam-Free Underwriting for ages 0-60 through $1,000,000; APS thresholds by age/amount (0-17 >$500K; 18-40 >$3M; 41-60 >$2M; 61-69 >$1M; 70+ all amounts); paramedical + HOS/blood from age 61 or above $1,000,000; EKG at 71+ or above $1M (51+) / $2M (41+); telephone interview + Large Case Transmittal at $2,000,000+.",
      temporaryCoverage: "F&G's liability under the Conditional Receipt is limited to $500,000 subject to its terms — coverage exists only when the exact receipt conditions are met."
    },

    /* ---- Financial justification ------------------------------------- */
    financial: {
      incomeMultipliers: [
        { ageMin: 20, ageMax: 40, multiplier: 30 },
        { ageMin: 41, ageMax: 50, multiplier: 25 },
        { ageMin: 51, ageMax: 65, multiplier: 15 },
        { ageMin: 66, ageMax: 70, multiplier: 10 },
        { ageMin: 71, ageMax: 200, multiplier: 5 }
      ],
      premiumToIncome: "Acceptable ratio of premium to income (net worth based): up to 25% at or below $5M net worth; up to 40% above $5M to $10M; up to 60% above $10M.",
      note: "Income replacement: 30X (20-40), 25X (41-50), 15X (51-65), 10X (66-70), 5X (71+). Large case: $2,000,000+ face or $20,000+ planned annual premium requires the Large Case Transmittal form + F&G illustration. Non-working spouse: maximum $1,000,000 per primary insured, not to exceed the wage earner's in-force coverage; over that, underwriting consultation. Juveniles: up to 50% of parent's coverage, maximum $1,000,000 per primary insured. STOLI contracts will not be issued."
    },

    /* No credit program is published in the Pathsetter guide. */
    credit: null,

    classInfo: {
      preferred_plus: { name: "Preferred Non-Tobacco", meaning: "No tobacco 2 years; no ratable conditions; no diabetes/heart disease/alcohol or substance abuse/listed cancer history; ≤2 moving violations and no DUI in 5 years; BP ≤150/90 (18-50), chol ≤260, ratio ≤7; family: ≤1 early coronary/cancer death.", color: "#0e7a5f" },
      preferred: { name: "Non-Tobacco (Standard-equivalent)", meaning: "No tobacco 1 year; meets Standard criteria. F&G publishes only Preferred Non-Tobacco and Non-Tobacco as the non-tobacco classes.", color: "#1b9a7a" },
      standard_plus: { name: "Non-Tobacco", meaning: "F&G publishes no Standard Plus class; Non-Tobacco (Standard) is the second non-tobacco class.", color: "#3b82b0" },
      standard: { name: "Non-Tobacco", meaning: "No tobacco 1 year; no rateable conditions. Applicants who do not qualify for Preferred or Standard may be approved at Express Standard Tobacco / Express Standard Non-Tobacco rates without medical requirements.", color: "#4a6fa5" },
      table: { name: "Substandard (through Table H / 300%)", meaning: "Substandard ratings through Table H (300%) — build above Standard within the Table H maximum, or an impairment reviewed individually.", color: "#b8860b" },
      flat_extra: { name: "Flat extra", meaning: "Added charge for a specific measurable risk — F&G: Preferred may be available for certain aviation/avocation activities at the appropriate flat-extra rating; schedules reviewed by underwriting.", color: "#c2691b" },
      postpone: { name: "Postpone / pre-review", meaning: "Wait for stability or wait-out (cancer 10 years, gastric bypass 1 year, heart event 5 years, epilepsy 5 years) or pending workup.", color: "#8a5fb8" },
      decline: { name: "Decline / specialist review", meaning: "On the F&G decline lists (cancer within 10 years, diabetes with A1c 7+, HIV, dementia, kidney/liver disease, respiratory disorder, etc.) — carrier direction required.", color: "#b3364a" }
    }
  }
};

/* F&G Pathsetter defers impairment specifics to F&G company standards,
 * published in the Quantum underwriting guidelines (ADV5691, 07-2025) — the
 * Pathsetter agent guide lists the same Preferred exclusions and decline
 * philosophy. Share the Quantum medical/impairment lists by reference so the
 * two F&G products stay in sync. */
CARRIER_RULES.fg_pathsetter.medicalCeilings = CARRIER_RULES.fg_quantum.medicalCeilings;
CARRIER_RULES.fg_pathsetter.postponeTriggers = CARRIER_RULES.fg_quantum.postponeTriggers;
CARRIER_RULES.fg_pathsetter.declineTriggers = CARRIER_RULES.fg_quantum.declineTriggers;

/* ====================================================================
 * NATIONAL LIFE GROUP — National Life Insurance Company / Life
 * Insurance Company of the Southwest (LSW)
 * "Life Insurance Underwriting Guide" (TC102228(0319)P, March 2019).
 * Products: LSW/NL Flex Life II, LSW/NL Term, TotalSecure, Advantage 79,
 * LifeCycle, LifeBuilder, Income Builder, Protector Life, Peaklife IUL.
 * ==================================================================== */
CARRIER_RULES.national_life = {
  id: "national_life",
  name: "National Life Group",
  company: "National Life Insurance Company / Life Insurance Company of the Southwest (LSW)",
  guide: {
    title: "Life Insurance Underwriting Guide",
    version: "TC102228(0319)P (March 2019)",
    note: "National Life Group (National Life Insurance Co / Life Insurance Company of the Southwest) term, whole life and IUL products. Three underwriting lanes: full medical/financial underwriting (blood profile, urinalysis, paramedical exam, EKG as required); Streamlined Underwriting (face $250,000 or less, age 65 and under — MIB, prescription database, MVR, no medical testing; Verified Standard NT / Express Standard NT / Standard Tobacco classes); and EZ-Underwriting accelerated (ages 18-60 through $1,000,000, ages 61-65 through $250,000 — MIB, prescription database, LexisNexis Risk Classifier, best class may be available with no medical requirements). Applicants age 60 and over must have routine health care with a physical within the last 24 months or the case is declined. If declined by another carrier within the last year, a quick quote is required. IOLI/SOLI (investor/stranger-owned life insurance) is not accepted. Final expense is not a stand-alone product — up to $100,000 of final-expense need may be considered as part of overall need."
  },
  eligibility: {
    products: "LSW/NL Flex Life II, LSW/NL Term, TotalSecure, Advantage 79, LifeCycle, LifeBuilder, Income Builder, Protector Life, Peaklife IUL",
    issueAges: "18-70+ (Mature Assessment at 70+)",
    faceRange: "Streamlined to $250,000 (age ≤65); EZ-Underwriting to $1,000,000 (18-60) / $250,000 (61-65); large case $10,000,000+",
    residency: "US (LSW not authorized in New York)",
    notes: [
      "Elite / Preferred / Select / Verified Standard NT classes with 60/36/12-month tobacco lookbacks.",
      "Age 60+ requires routine health care with a physical within the last 24 months — otherwise declined.",
      "Income replacement not applicable at ages 70+; final expense up to $100,000 as part of overall need."
    ],
    charts: [
      { product: "Streamlined Underwriting lane (all products)", ages: "18-65", face: "Through $250,000" },
      { product: "EZ-Underwriting lane (all products)", ages: "18-60 (61-65 to $250K)", face: "Through $1,000,000" },
      { product: "Full underwriting (LSW/NL Flex Life II, Term, TotalSecure, etc.)", ages: "18-70+", face: "Large case $10,000,000+; product-specific grids in the Life Underwriting Requirements" }
    ],
    chartNote: "The underwriting guide's age/face structure is lane-based (Streamlined / EZ / full) rather than per-product."
  },

  /* ---- Nicotine ----------------------------------------------------- */
  nicotine: {
    classes: [
      { klass: "preferred_plus", lookbackMonths: 60, label: "Elite Preferred Non-Tobacco (no tobacco/nicotine of any kind in 60 months)" },
      { klass: "preferred", lookbackMonths: 36, label: "Preferred Non-Tobacco (no tobacco/nicotine in 36 months)" },
      { klass: "standard_plus", lookbackMonths: 12, label: "Select Non-Tobacco (no tobacco/nicotine in 12 months)" },
      { klass: "standard", lookbackMonths: 12, label: "Verified Standard Non-Tobacco" }
    ],
    tobaccoLookbackMonths: 12,
    tobaccoDefinition: "No use of tobacco or nicotine-containing products of any kind (cigarettes, cigars, chewing tobacco, pipe, nicotine gum, nicotine patch, e-cigarettes/vaping) within 60 months for Elite, 36 months for Preferred, or 12 months for Select/Verified Standard; current lab testing negative for nicotine. Preferred Tobacco and Standard Tobacco classes are available for tobacco users.",
    cigarException: {
      note: "Occasional cigar use may qualify for non-tobacco rates if fully disclosed (no frequency published — verify with underwriting).",
      maxPerMonth: 1,
      maxPerYear: 12
    },
    marijuana: "Daily marijuana use is a decline; drug use within the last three years is a decline. Occasional use reviewed case by case.",
    marijuanaDailyDecline: true
  },

  /* ---- Build: six-column unisex height/weight chart ------------------
     Columns: Elite / Preferred / Select / Standard / Express Std 1
     (substandard to 200%) / Express Std 2 (225-300%). */
  build: {
    chart: {
      56: { pp: 120, p: 133, sp: 145, std: 167, es1: 189, es2: 207, min: 83 },
      57: { pp: 125, p: 138, sp: 151, std: 173, es1: 196, es2: 214, min: 86 },
      58: { pp: 129, p: 143, sp: 156, std: 179, es1: 203, es2: 222, min: 89 },
      59: { pp: 134, p: 148, sp: 161, std: 185, es1: 210, es2: 230, min: 92 },
      60: { pp: 138, p: 153, sp: 167, std: 191, es1: 217, es2: 238, min: 95 },
      61: { pp: 143, p: 158, sp: 173, std: 198, es1: 224, es2: 246, min: 98 },
      62: { pp: 148, p: 163, sp: 178, std: 205, es1: 232, es2: 254, min: 102 },
      63: { pp: 152, p: 168, sp: 184, std: 211, es1: 239, es2: 262, min: 105 },
      64: { pp: 157, p: 174, sp: 190, std: 218, es1: 247, es2: 270, min: 108 },
      65: { pp: 162, p: 179, sp: 196, std: 225, es1: 255, es2: 279, min: 112 },
      66: { pp: 167, p: 185, sp: 202, std: 232, es1: 263, es2: 288, min: 115 },
      67: { pp: 172, p: 190, sp: 208, std: 239, es1: 271, es2: 296, min: 119 },
      68: { pp: 177, p: 196, sp: 215, std: 246, es1: 279, es2: 305, min: 122 },
      69: { pp: 183, p: 202, sp: 221, std: 253, es1: 287, es2: 314, min: 126 },
      70: { pp: 188, p: 208, sp: 227, std: 261, es1: 296, es2: 324, min: 129 },
      71: { pp: 194, p: 214, sp: 234, std: 268, es1: 304, es2: 333, min: 133 },
      72: { pp: 199, p: 220, sp: 241, std: 276, es1: 313, es2: 342, min: 137 },
      73: { pp: 205, p: 226, sp: 247, std: 284, es1: 322, es2: 352, min: 141 },
      74: { pp: 211, p: 232, sp: 254, std: 292, es1: 330, es2: 362, min: 145 },
      75: { pp: 216, p: 239, sp: 261, std: 299, es1: 339, es2: 371, min: 148 },
      76: { pp: 222, p: 245, sp: 268, std: 308, es1: 349, es2: 381, min: 152 },
      77: { pp: 228, p: 252, sp: 275, std: 316, es1: 358, es2: 392, min: 156 },
      78: { pp: 234, p: 258, sp: 282, std: 324, es1: 367, es2: 402, min: 161 },
      79: { pp: 240, p: 265, sp: 290, std: 332, es1: 377, es2: 412, min: 165 },
      80: { pp: 246, p: 272, sp: 297, std: 341, es1: 386, es2: 423, min: 169 }
    },
    rules: {
      minHeightIn: 56,
      maxHeightIn: 80,
      chartMinWeight: 83,
      halfInchRounding: "Half-inch measurements round up to the next inch.",
      applyWeightLossAdjustment: false,
      weightLossAdjustment: "Weight stability is reviewed; significant recent weight change — manual underwriting review.",
      lowBuildReview: "Weight below the chart minimum for height -> manual underwriting review.",
      belowChartMin: 18.5,
      aboveStandard: "Above the Express Standard 2 maximum for height (BMI 46.5+) — manual underwriting review.",
      tableBands: [
        { key: "es1", label: "Express Standard NT 1 (substandard to 200%)", table: 4 },
        { key: "es2", label: "Express Standard NT 2 (substandard 225-300%)", table: 8 }
      ],
      note: "Six-column unisex chart: Elite (BMI 18.5-27.1), Preferred (27.1-29.9), Select (29.9-32.7), Standard (32.7-37.5), Express Standard 1 (37.5-42.5), Express Standard 2 (42.5-46.5). Above Standard: nonsmoker with substandard rating to 200% -> Express Standard NT 1; 225-300% -> Express Standard NT 2. Other factors (age, disproportionate body measurements) may affect the final decision."
    }
  },

  /* ---- Blood pressure (12-month average; one drug treatment OK) ------ */
  bp: {
    preferred_plus:   { sys: 135, dia: 85 },
    preferred:        { sys: 140, dia: 90 },
    standard_plus:    { sys: 150, dia: 90 },
    standard:         null
  },
  bpTreatmentNote: "Blood pressure treatment acceptable if treated by only one drug and the current reading with a 12-month average meets the class limit.",

  /* ---- Cholesterol (ratio with 65+ age band; one drug treatment OK) -- */
  cholesterol: {
    total: {
      preferred_plus: 260,
      preferred:      280,
      standard_plus:  300
    },
    ratio: {
      preferred_plus: [{ ageMin: 18, ageMax: 64, max: 4.5 }, { ageMin: 65, ageMax: 200, max: 5.0 }],
      preferred:      [{ ageMin: 18, ageMax: 64, max: 5.5 }, { ageMin: 65, ageMax: 200, max: 6.0 }],
      standard_plus:  [{ ageMin: 18, ageMax: 64, max: 6.5 }, { ageMin: 65, ageMax: 200, max: 7.0 }]
    },
    note: "Cholesterol treatment acceptable if treated by only one drug and the ratio is maintained for 12 months. Elite: total <=260, ratio 4.5 (5.0 at 65+); Preferred: total <=280, ratio 5.5 (6.0 at 65+); Select: total <=300, ratio 6.5 (7.0 at 65+)."
  },

  /* ---- Driving ------------------------------------------------------ */
  driving: {
    preferred_plus:   { maxViolations3yr: 1, cleanYears: 5, note: "No reckless driving or alcohol-related moving violation within 5 years; no license suspension within 3 years; no more than 1 moving violation in the last 3 years." },
    preferred:        { maxViolations3yr: 2, cleanYears: 5, note: "No reckless driving or alcohol-related moving violation within 5 years; no license suspension within 3 years; no more than 2 moving violations in the last 3 years." },
    standard_plus:    { maxViolations3yr: 3, cleanYears: 5, note: "No reckless driving or alcohol-related moving violation within 5 years; no license suspension within 3 years; no more than 3 moving violations in the last 3 years." },
    standard:         null
  },
  drivingDeclineNote: "Uninsurable: driver's license currently suspended or revoked; single DUI within the last year or multiple DUIs with any within the last 5 years.",

  /* ---- Family history (disregarded at age 65+; gender-specific cancers
         disregarded for the opposite gender) ------------------------- */
  familyHistory: {
    mapping: { none: "preferred_plus", parent: "standard_plus", parent_sibling: "standard", multiple: "standard" },
    disregardAge: 65,
    preferred_plus: { text: "No parental family history of death from coronary artery disease or cancer prior to age 65; criteria does not apply if the applicant has reached 65 or for gender-specific cancers in the opposite gender." },
    preferred:      { text: "No parental family history of death from coronary artery disease or cancer prior to age 60; does not apply at 60+ or for opposite-gender cancers." },
    standard_plus:  { text: "Parental family history of no more than one death from coronary artery disease or cancer prior to age 60; does not apply at 60+ or for opposite-gender cancers." },
    standard:       { text: "Family history is not a Standard-class criterion." }
  },

  /* Elite/Preferred exclude personal history of coronary artery disease,
     hepatitis B/C, diabetes, melanoma or cancer (except skin cancer in situ). */
  medicalStandardCap: ["cad", "diabetes", "other_cancer", "liver_disease", "heart_disease"],
  autoDeclineIds: ["hiv", "dementia", "schizophrenia", "liver_disease", "kidney_disease", "transplant", "paralysis", "copd", "md"],
  autoDeclineSevereIds: ["heart_disease", "stroke"],

  drugDeclineYears: 3,
  drugRecoveryTiers: [{ minYears: 5, klass: "standard" }],
  substanceTiers: { declineYears: 3, tiers: [{ minYears: 5, klass: "standard" }, { minYears: 0, klass: "table" }] },

  conditionModels: {
    anxiety: { best: "standard" },
    depression: { best: "standard" },
    asthma: { best: "standard" },
    sleep_apnea: { best: "standard" },
    bipolar: { best: "table" },
    other_cancer: { declineWithinYears: 5, afterCeiling: "table" }
  },

  /* Diabetes: uncontrolled (A1c 10+) or with complications (amputation,
     retinopathy, kidney/vascular disease) or juvenile onset (<20) -> decline. */
  diabetes: { type1Ceiling: "table", type2Ceiling: "standard", a1cDeclineMin: 10, juvenileOnsetDeclineAge: 20 },

  /* Aviation/avocation: Elite/Preferred/Select all exclude ratable aviation,
     hazardous avocation or occupation (commercial pilots of major US carriers
     and holiday scuba diving are not ratable). A hazardous activity therefore
     caps below Select — at the Verified Standard class. */
  avocation: {
    classCap: "standard",
    currentHazardousText: "Hazardous occupation/avocation disclosed — Elite, Preferred and Select all exclude ratable aviation, hazardous avocation or occupation (major-US-carrier commercial pilots and holiday scuba diving excepted); the case is capped at Verified Standard pending underwriter review.",
    cleanText: "No hazardous occupation or avocation disclosed."
  },

  medicalCeilings: [
    { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "standard", when: "mild (probable action: no rating)" }], worse: "Depression/mental disorder requiring hospitalization or disability in the last year — decline." },
    { id: "depression", name: "Depression", ceilings: [{ klass: "standard", when: "no rating to moderate rating depending on severity" }], worse: "Mental disorder/PTSD requiring hospitalization or disability in the last year — decline." },
    { id: "bipolar", name: "Bipolar disorder", ceilings: [{ klass: "table", table: 6, when: "individual consideration (psychosis/schizophrenia Table 6 to decline)" }], worse: "Psychosis — Table 6 to Decline." },
    { id: "schizophrenia", name: "Schizophrenia / psychosis", ceilings: [{ klass: "table", table: 6, when: "stable — Table 6 to Decline" }], worse: "Psychosis — Table 6 to Decline." },
    { id: "substance_treatment", name: "Alcohol/drug treatment history", ceilings: [{ klass: "standard", when: "alcoholism with total abstinence >2 years; drug abuse with total abstinence 5 years" }], worse: "Alcohol treatment within the last 2 years or drug use within the last 3 years (or daily marijuana) — decline." },
    { id: "hypertension", name: "High blood pressure", ceilings: [{ klass: "preferred_plus", when: "well controlled within class limits (one drug treatment acceptable)" }], note: "High blood pressure (well controlled) — no rating." },
    { id: "high_cholesterol", name: "High cholesterol", ceilings: [{ klass: "preferred_plus", when: "total and ratio within class limits (one drug treatment acceptable)" }], note: "Cholesterol treatment acceptable if ratio maintained 12 months." },
    { id: "cad", name: "Coronary artery disease / angina", ceilings: [{ klass: "table", table: 6, when: "current stable angina — Table 6 to Decline" }], postpone: "Angioplasty, bypass or MI within the last 6 months; or in combination with diabetes, stroke, or continued tobacco use — decline screen.", worse: "Angioplasty/bypass/MI in the last 6 months, or in combination with diabetes/stroke/continued tobacco use — decline." },
    { id: "heart_disease", name: "Heart disease (CHF, cardiomyopathy, valve, device)", ceilings: [{ klass: "table", table: 4, when: "cardiomyopathy resolved >3 years — Table 4 to Decline; heart attack depends on age/severity" }], postpone: "Heart surgery within 6 months, heart valve surgery within 1 year, or valve replacement within the last year — decline screen.", decline: "Heart surgery within 6 months or in combination with diabetes or stroke history; valve replacement within the last year — decline.", worse: "Congestive heart failure — Table 6 to Decline; defibrillator/ventricular tachycardia — decline." },
    { id: "stroke", name: "Stroke / TIA", ceilings: [{ klass: "table", table: 4, when: "stroke after one year with full recovery — Table 4 at best; TIA with no residuals — no rating to moderate" }], postpone: "CVA within one year, or with history of diabetes or cardiac history — decline screen.", worse: "CVA within one year or with diabetes/cardiac history — decline." },
    { id: "asthma", name: "Asthma", ceilings: [{ klass: "standard", when: "depends on age, attacks and medications — no rating to decline" }], worse: "Severe/uncontrolled asthma — decline." },
    { id: "copd", name: "COPD / emphysema / chronic bronchitis", ceilings: [{ klass: "table", table: 2, when: "COPD — Table 2 to Decline; chronic bronchitis — no rating to decline" }], decline: "COPD/emphysema severe (on oxygen or disabling) or with current tobacco use — decline.", worse: "Emphysema — Table 4 to Decline." },
    { id: "sleep_apnea", name: "Sleep apnea", ceilings: [{ klass: "standard", when: "consistent CPAP use — possible Standard" }] },
    { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard", when: "controlled, no complications, adult onset — no rating to decline depending on onset and control" }], postpone: "Uncontrolled (A1c 10+) or with complications (amputation, retinopathy, kidney or vascular disease) or with cardiac/stroke/morbid obesity — decline screen.", worse: "Uncontrolled A1c 10+, complications, or juvenile onset (diagnosed prior to age 20) — decline." },
    { id: "kidney_disease", name: "Kidney disease", ceilings: [], decline: "Kidney dialysis, chronic renal failure, or polycystic kidney disease — decline." },
    { id: "liver_disease", name: "Liver disease", ceilings: [{ klass: "table", table: 4, when: "hepatitis B/C treated and resolved — Table 4 to Decline" }], decline: "Cirrhosis of the liver — decline." },
    { id: "hiv", name: "HIV / AIDS", ceilings: [], decline: "HIV positive/AIDS — decline." },
    { id: "dementia", name: "Alzheimer's / dementia / cognitive impairment", ceilings: [], decline: "Alzheimer's disease, dementia or cognitive impairment — decline." },
    { id: "seizures", name: "Seizures / epilepsy", ceilings: [{ klass: "standard", when: "petit mal with no attack in one year; grand mal with no attack in one year — no rating to moderate" }], postpone: "Epilepsy/seizures diagnosed within one year — decline screen.", worse: "Epilepsy/seizures diagnosed within one year — decline." },
    { id: "skin_cancer", name: "Skin cancer (basal / squamous / melanoma)", ceilings: [{ klass: "standard", when: "basal cell removed — usually Standard; squamous cell removed — possible Standard; melanoma — possible Standard" }] },
    { id: "other_cancer", name: "Other cancer history", ceilings: [{ klass: "table", when: "breast cancer after 3 years — possible flat extra to decline; internal organ cancer beyond the 3-5 year window — individual consideration" }], decline: "Current cancer treatment, or certain internal organ cancer diagnosed within the past 3-5 years — decline (call for quote with specifics).", worse: "Cancer treatment current, or internal organ cancer within 3-5 years — decline." },
    { id: "osteoporosis", name: "Osteoporosis", ceilings: [{ klass: "standard", when: "not listed — no rating typical" }] },
    { id: "mvp", name: "Mitral valve prolapse", ceilings: [{ klass: "standard", when: "no rating to decline depending on findings" }] },
    { id: "multiple_sclerosis", name: "Multiple sclerosis", ceilings: [{ klass: "table", table: 2, when: "not progressive or disabling — Table 2 to Decline" }], worse: "MS if disabling or progressive — decline." },
    { id: "parkinsons", name: "Parkinson's disease", ceilings: [{ klass: "table", table: 3, when: "Table 3 to Decline" }], worse: "Parkinson's if disabling — decline." },
    { id: "transplant", name: "Organ transplant", ceilings: [], decline: "Organ transplant, awaiting or recipient — decline." },
    { id: "paralysis", name: "Paralysis", ceilings: [{ klass: "table", table: 6, when: "paraplegic — Table 6 to Decline" }], worse: "Quadriplegic — highly rated to Decline." },
    { id: "md", name: "Muscular dystrophy", ceilings: [], decline: "Muscular dystrophy — decline." }
  ],

  /* ---- Postpone triggers (National Life flavor) ---------------------- */
  postponeTriggers: [
    { id: "pending_test", text: "Pending test, referral, surgery, or evaluation with unknown results", reason: "Uninvestigated outcome can matter more than known history." },
    { id: "recent_hospitalization", text: "Hospitalization or advised hospitalization within the past 4 months", reason: "Insufficient stability." },
    { id: "recent_surgery", text: "Surgery performed or recommended within the past 4 months with unfinished/unknown results", reason: "Insufficient stability." },
    { id: "active_symptom", text: "Uninvestigated active symptom under first-time evaluation", reason: "Uninvestigated symptom." },
    { id: "cancer_waitout", text: "Cancer diagnosed/treated within the 3-5 year decline window", reason: "Cancer treatment current or internal organ cancer within 3-5 years — decline screen." },
    { id: "gastric_bypass_recent", text: "Gastric bypass within the past six months", reason: "Uninsurable list: gastric bypass within six months." },
    { id: "diabetes_complications", text: "Diabetes with complications (amputation, retinopathy, kidney or vascular disease) or with cardiac/stroke history or morbid obesity", reason: "Decline screen." },
    { id: "a1c_high", text: "Most recent A1c at or above 10 within the last year", reason: "Decline screen (National Life threshold is A1c 10+)." },
    { id: "heart_recent", text: "Heart attack, angioplasty, bypass, or heart/valve surgery within the last 6-12 months", reason: "Decline screen until stability." },
    { id: "suicide_recent", text: "Suicide attempt within the last year (or more than one attempt within two years)", reason: "Decline screen." },
    { id: "mental_hospitalization", text: "Mental disorder/PTSD requiring hospitalization or disability within the last year", reason: "Decline screen." },
    { id: "pregnancy_complications", text: "Currently pregnant with gestational diabetes, toxemia, eclampsia, or pre-eclampsia", reason: "Reconsider at six weeks post partum." },
    { id: "cva_recent", text: "Stroke within the last year, or with diabetes or cardiac history", reason: "Decline screen." },
    { id: "epilepsy_recent", text: "Epilepsy/seizures diagnosed within the last year", reason: "Decline screen." }
  ],

  /* ---- Decline / specialist-review triggers ------------------------- */
  declineTriggers: [
    { id: "hiv", text: "HIV / AIDS", reason: "Uninsurable list." },
    { id: "dementia", text: "Alzheimer's / dementia / cognitive impairment", reason: "Uninsurable list." },
    { id: "alcohol_active", text: "Alcohol treatment within the last 2 years", reason: "Uninsurable list." },
    { id: "drug_use_recent", text: "Drug use within the last 3 years or daily marijuana use", reason: "Uninsurable list." },
    { id: "kidney_disease", text: "Kidney dialysis, chronic renal failure, or polycystic kidney disease", reason: "Uninsurable list." },
    { id: "liver_disease", text: "Cirrhosis of the liver", reason: "Uninsurable list." },
    { id: "transplant", text: "Organ transplant, awaiting or recipient", reason: "Uninsurable list." },
    { id: "quadriplegia", text: "Quadriplegia", reason: "Uninsurable list." },
    { id: "respiratory", text: "COPD/emphysema severe (on oxygen or disabling) or with current tobacco use", reason: "Uninsurable list." },
    { id: "aneurysm", text: "Abdominal aortic aneurysm, present or surgically corrected within the past 6 months", reason: "Uninsurable list." },
    { id: "heart_surgery_recent", text: "Angioplasty/bypass/MI within 6 months, heart surgery within 6 months, valve replacement within 1 year", reason: "Uninsurable list." },
    { id: "cva_recent", text: "CVA (stroke) within one year or with diabetes/cardiac history", reason: "Uninsurable list." },
    { id: "epilepsy_recent", text: "Epilepsy/seizures diagnosed within one year", reason: "Uninsurable list." },
    { id: "suicide_recent", text: "Suicide attempt within the last year or more than one within two years", reason: "Uninsurable list." },
    { id: "adl_dependence", text: "Assistance needed with activities of daily living", reason: "Specialist review / decline screen." },
    { id: "facility_care", text: "Facility / hospice / home-health care or chronic wheelchair use", reason: "Strong specialist-review trigger." },
    { id: "criminal_active", text: "Charged with a felony; misdemeanor with probation/parole not released for one full year", reason: "Uninsurable list." },
    { id: "bankruptcy_active", text: "Chapter 7 bankruptcy not discharged", reason: "Uninsurable list." },
    { id: "oxygen_use", text: "Oxygen use", reason: "Specialist review." },
    { id: "driving_no_license", text: "Driver's license currently suspended or revoked", reason: "Uninsurable list." },
    { id: "disabled", text: "Disabled for most non-musculoskeletal impairments (SSDI/DI for depression, PTSD, or other medical issues)", reason: "Uninsurable list." },
    { id: "no_routine_care", text: "Age 60+ without routine health care and a physical within the last 24 months", reason: "Uninsurable list: otherwise declined." },
    { id: "pregnancy_complications", text: "Current pregnancy with gestational diabetes, toxemia, eclampsia, or pre-eclampsia", reason: "Uninsurable list; reconsider at six weeks post partum." }
  ],

  /* ---- Evidence / workflow ----------------------------------------- */
  evidence: {
    apsAge: 200,
    apsConditions: [
      "Cancer", "Diabetes", "Heart (cardiac) disease", "Stroke / TIA", "COPD / emphysema",
      "Kidney disease", "Liver disease", "Mental-health disorders", "Substance abuse/dependence",
      "Multiple sclerosis", "Parkinson's disease", "Muscular dystrophy", "Rheumatoid arthritis", "Lupus",
      "Organ transplant", "Paralysis", "HIV", "Sleep apnea", "Seizure disorders", "Autoimmune disease"
    ],
    amountRules: [
      { ageMin: 0, ageMax: 17, amountMin: 1, items: ["Juvenile (0-19): application; coverage based on head-of-household parent coverage; siblings similarly insured; >$1M on a child needs underwriter consultation"] },
      { ageMin: 18, ageMax: 65, amountMin: 1, amountMax: 250000, items: ["Application (no medical testing — Streamlined/EZ lane)"] },
      { ageMin: 18, ageMax: 60, amountMin: 250001, amountMax: 1000000, items: ["EZ-Underwriting — application only (MIB, Milliman IntelliScript prescription database, LexisNexis Risk Classifier)"] },
      { ageMin: 66, ageMax: 69, amountMin: 1, amountMax: 250000, items: ["Exam, blood profile, urine"] },
      { ageMin: 56, ageMax: 69, amountMin: 250001, amountMax: 500000, items: ["Exam, blood profile, urine"] },
      { ageMin: 61, ageMax: 69, amountMin: 500001, amountMax: 1000000, items: ["Exam, blood profile, urine"] },
      { ageMin: 18, ageMax: 65, amountMin: 1000001, amountMax: 2000000, items: ["Exam, blood profile, urine"] },
      { ageMin: 66, ageMax: 69, amountMin: 1000001, amountMax: 2000000, items: ["Exam, blood profile, urine", "APS"] },
      { ageMin: 18, ageMax: 69, amountMin: 2000001, amountMax: 5000000, items: ["Exam, blood profile, urine", "APS", "Personal Financial Questionnaire (form 1392)", "Electronic Inspection Report"] },
      { ageMin: 18, ageMax: 69, amountMin: 5000001, items: ["Exam, blood profile, urine, EKG", "APS", "Personal Financial Questionnaire (form 1392)", "Electronic Inspection Report", "Income verification (4506T/W2/1099)"] },
      { ageMin: 70, ageMax: 200, amountMin: 1, items: ["Exam, blood profile, urine, EKG, Mature Assessment", "APS"] },
      { ageMin: 70, ageMax: 200, amountMin: 5000001, items: ["Third Party Verified Financial Statement"] },
      { ageMin: 18, ageMax: 69, amountMin: 10000000, items: ["Third Party Verified Financial Statement"] }
    ],
    acceleratedUw: { ageMin: 18, ageMax: 60, amountMin: 1, amountMax: 1000000, note: "EZ-Underwriting ages 18-60 through $1,000,000 (and 61-65 through $250,000): MIB, Milliman IntelliScript prescription database, LexisNexis Risk Classifier — the best class may be available without medical requirements." },
    note: "Full medical underwriting (blood profile, urinalysis, paramedical exam, EKG, Mature Assessment at 70+) per the age/amount grid; APS on all applications $2,000,001+. Streamlined lane: face $250,000 or less and age 65 and under (MIB, prescription database, MVR — no medical testing). Financial requirements: PFQ + E-inspection at $2M+; income verification at $10M+; third-party verified financials at $10M (18-69) / $5M (70+). MIB, Milliman IntelliScript prescription database, MVR and electronic inspection are cross-referenced on all applications.",
    temporaryCoverage: "Temporary coverage is not described in the guide; the estimate does not establish coverage."
  },

  /* ---- Financial justification ------------------------------------- */
  financial: {
    incomeMultipliers: [
      { ageMin: 18, ageMax: 30, multiplier: 40 },
      { ageMin: 31, ageMax: 40, multiplier: 35 },
      { ageMin: 41, ageMax: 50, multiplier: 25 },
      { ageMin: 51, ageMax: 60, multiplier: 15 },
      { ageMin: 61, ageMax: 65, multiplier: 10 },
      { ageMin: 66, ageMax: 69, multiplier: 5 }
    ],
    premiumToIncome: "Family insurance premium should not exceed 10% of annual income; above that, additional financial documentation may be requested.",
    note: "Income replacement factors (earned income only): 40X (18-30), 35X (31-40), 25X (41-50), 15X (51-60), 10X (61-65), 5X (66-69). Income replacement is not applicable at ages 70+. Final expense: no stand-alone product; up to $100,000 may be considered as part of overall need. Juveniles (0-19): based on the head-of-household parent's coverage or what a $100/month permanent premium buys; siblings similarly insured; NY rules: 25% of parent coverage at ages 0-4, 50% at 5-14."
  },

  /* No credit program is published in the National Life guide. */
  credit: null,

  classInfo: {
    preferred_plus: { name: "Elite Preferred Non-Tobacco", meaning: "No tobacco/nicotine 60 months; no family CHD/cancer death <65; BP 135/85 or better; chol <=260, ratio 4.5 (5.0 at 65+); no CAD/hepatitis B-C/diabetes/melanoma/cancer history; no alcohol/drug history; no ratable avocation.", color: "#0e7a5f" },
    preferred: { name: "Preferred Non-Tobacco", meaning: "No tobacco/nicotine 36 months; no family CHD/cancer death <60; BP 140/90; chol <=280, ratio 5.5 (6.0 at 65+); no CAD/hepatitis/diabetes/melanoma/cancer history; no alcohol/drug treatment in 10 years.", color: "#1b9a7a" },
    standard_plus: { name: "Select Non-Tobacco", meaning: "No tobacco/nicotine 12 months; <=1 family CHD/cancer death <60; BP 150/90; chol <=300, ratio 6.5 (7.0 at 65+); no currently ratable medical history.", color: "#3b82b0" },
    standard: { name: "Verified Standard Non-Tobacco", meaning: "Standard risks, non-tobacco; the platform for substandard illustrations (ratings added on top).", color: "#4a6fa5" },
    table: { name: "Express Standard (substandard)", meaning: "Nonsmoker with substandard rating to 200% -> Express Standard NT 1; 225-300% -> Express Standard NT 2 (quick-underwriting classes; Living Benefit riders not available on ES2).", color: "#b8860b" },
    postpone: { name: "Postpone / pre-review", meaning: "Wait for stability or wait-out (cancer 3-5 years, gastric bypass 6 months, heart event 6-12 months, epilepsy 1 year, CVA 1 year) or pending workup.", color: "#8a5fb8" },
    decline: { name: "Decline / specialist review", meaning: "On the uninsurable list (current cancer treatment, A1c 10+ or juvenile-onset diabetes, HIV, dementia, cirrhosis, dialysis, transplant, severe COPD, etc.) — carrier direction required.", color: "#b3364a" }
  }
};

/* ======================================================================
   * AMERICAN AMICABLE — American-Amicable Life Insurance Company of Texas /
   * Occidental Life Insurance Company of North Carolina / Pioneer American /
   * Pioneer Security Life
   * Sources (updated 12/24 - 1/25 editions):
   *  - "Express Term Agent Guide" (3405, 12/24) — level term to age 95 with
   *    10/20/25/30-yr level premium periods (+ Return of Premium), simplified
   *    issue, NOT GUARANTEED ISSUE, underwritten standard through Table 4.
   *  - "Term Made Simple Agent Guide" (1/25) — 10/15/20/30-yr level term,
   *    Preferred Non-Tobacco / Standard Non-Tobacco / Standard Tobacco
   *    classes, accept/reject (no table ratings).
   *  - "Dignity Solutions Agent Guide" (12/24) — final-expense whole life,
   *    ages 50-85, Immediate / Graded / Return-of-Premium plan tiers.
   *  - Express Term Prescription Reference Guide + QFSP RX Guide (medication
   *    cross-check conditions).
   * All products check the simplified application, MIB, a pharmaceutical
   * (prescription) facility, and an MVR; a telephone interview is required by
   * age and amount (mandatory at age 65+ on Term Made Simple).
   * ==================================================================== */
CARRIER_RULES.amam = {
    id: "amam",
    name: "American Amicable",
    company: "American-Amicable Life Insurance Company of Texas / Occidental Life Insurance Company of North Carolina / Pioneer American / Pioneer Security Life",
    guide: {
      title: "Express Term & Term Made Simple Agent Guides (American Amicable / Occidental)",
      version: "Express Term 3405 (12/24) · Term Made Simple (1/25) · Dignity Solutions (12/24)",
      note: "American Amicable's simplified-issue products are underwritten standard through Table 4 on an accept/reject basis — no table ratings are offered (a Table 1-4 risk is issued at Standard rates; above Table 4 is not eligible). Eligibility is based on the simplified application, MIB, a pharmaceutical (prescription) facility check, an MVR, and a telephone interview by age and amount (mandatory at age 65+ on Term Made Simple). These 12/24 and 1/25 editions update the prior 01/20 / 02/20 guides. Dignity Solutions (final-expense whole life, ages 50-85) is a separate lane modeled in eligibility and evidence."
    },
    eligibility: {
      products: "Express Term (level term to 95: 10/20/25/30-yr periods, + Return of Premium), Term Made Simple (level term to 95: 10/15/20/30-yr); Dignity Solutions final-expense whole life (50-85) and Home Certainty mortgage-protection term (20-75) are separate lanes",
      issueAges: "Express Term: 18-75 (10-yr), 18-65 (20-yr), 18-60 (25-yr), 18-55 (30-yr); ROP: 20-yr 18-60, 25-yr 18-55, 30-yr 18-50. TMS: 10-yr 18-75, 15-yr 18-70, 20-yr 18-65, 30-yr 18-55. Dignity: 50-85",
      maxIssueAge: 75,
      faceRange: "Express Term: $25,000 minimum ($25/mo premium), $500,000 maximum (18-45) / $300,000 (46-75). TMS: $50,000 minimum, $500,000 maximum. Dignity: $2,500 minimum, $50,000 maximum (Immediate 50-75) / $25,000 (76-85 and Graded/ROP)",
      residency: "US — products not approved in all states (check the State Approval Grid on the company website)",
      notes: [
        "Simplified issue, NOT GUARANTEED ISSUE: underwritten standard through Table 4 on an accept/reject basis — no table ratings are offered; above Table 4 is not eligible.",
        "MIB check, pharmaceutical (prescription) facility check and MVR on all applications; telephone interview by age/amount (TMS: mandatory 65+; Express Term: per the non-med limits chart).",
        "Third-party premium payor (other than the insured, spouse, business, or business partner) is NOT accepted when the insured is age 30 or older; ages 18-29 parent payor allowed with extra requirements.",
        "Re-applying: two policies with the Company within 12 months, or three or more lapsed / not-taken / surrendered / canceled policies in five years — new applications are not processed."
      ],
      charts: [
        { product: "Express Term (10/20/25/30-yr + ROP)", ages: "18-75 by term length (18-50 for 30-yr ROP)", face: "$25,000-$500,000 (18-45); $25,000-$300,000 (46-75)" },
        { product: "Term Made Simple (10/15/20/30-yr)", ages: "18-75 by term length (18-55 for 30-yr)", face: "$50,000-$500,000" },
        { product: "Dignity Solutions (final expense — separate lane)", ages: "50-85", face: "$2,500-$50,000 (Immediate 50-75); $25,000 max (76-85, Graded, ROP)" },
        { product: "Home Certainty (mortgage-protection term — separate lane)", ages: "20-75 by term (10/15/20/25/30-yr)", face: "$25,000-$300,000" }
      ],
      chartNote: "Express Term and Term Made Simple share the same simplified-issue build chart (minimum weight, Table-2 and Table-4 maximums) and the same Preferred build chart (unisex). Dignity Solutions uses its own three-plan build chart (Immediate / Graded / Return of Premium). Home Certainty (mortgage-protection term) shares the Express Term build family."
    },

    /* ---- Nicotine ----------------------------------------------------- */
    nicotine: {
      classes: [
        { klass: "preferred", lookbackMonths: 36, label: "Preferred Non-Tobacco (no tobacco/nicotine in 36 months)" },
        { klass: "standard", lookbackMonths: 12, label: "Standard Non-Tobacco (no tobacco/nicotine in 12 months)" }
      ],
      tobaccoLookbackMonths: 12,
      tobaccoDefinition: "The application asks: 'During the past 12 months have you used tobacco in any form (excluding occasional cigar or pipe use)?' Tobacco in any form includes cigarettes, electronic cigarettes (e-cigs), vaping, chewing tobacco, cigars, pipes, snuff, nicotine patch/gum/aerosol/inhaler, hookah pipe, clove, bidis cigarettes, and oral nicotine pouches. Preferred Non-Tobacco additionally requires no tobacco or nicotine use in the past 36 months.",
      cigarException: {
        note: "Occasional cigar or pipe use is excluded from the tobacco question; frequency is not published in the guide — verify with underwriting. Tobacco answers must match the prescription database, medical records, and MIB.",
        maxPerMonth: 1,
        maxPerYear: 12
      },
      marijuana: "The guides publish no marijuana policy — review under the simplified-issue accept/reject rules and the underlying condition (distributor look-back guidance treats marijuana case by case)."
    },

    /* ---- Build: Express Term / TMS simplified-issue chart --------------
       Columns: minimum weight (below = not eligible), Table 2 maximum
       (Standard), Table 4 maximum (ceiling — above = not eligible). The
       Preferred build chart (4'8\"-6'7\") sets the Preferred band. Accept/
       reject: no table ratings; any medical condition combined with build
       exceeding Table 2 = not eligible. */
    build: {
      chart: {
        58: { min: 86, std: 199, tableMax: 199, pp: 154, p: 154, sp: 182, stdCredit: 182 },
        59: { min: 88, std: 205, tableMax: 205, pp: 160, p: 160, sp: 188, stdCredit: 188 },
        60: { min: 90, std: 212, tableMax: 212, pp: 165, p: 165, sp: 195, stdCredit: 195 },
        61: { min: 93, std: 220, tableMax: 220, pp: 171, p: 171, sp: 201, stdCredit: 201 },
        62: { min: 95, std: 227, tableMax: 227, pp: 177, p: 177, sp: 208, stdCredit: 208 },
        63: { min: 99, std: 234, tableMax: 234, pp: 182, p: 182, sp: 215, stdCredit: 215 },
        64: { min: 101, std: 242, tableMax: 242, pp: 188, p: 188, sp: 221, stdCredit: 221 },
        65: { min: 104, std: 249, tableMax: 249, pp: 194, p: 194, sp: 228, stdCredit: 228 },
        66: { min: 106, std: 257, tableMax: 257, pp: 200, p: 200, sp: 235, stdCredit: 235 },
        67: { min: 110, std: 265, tableMax: 265, pp: 206, p: 206, sp: 243, stdCredit: 243 },
        68: { min: 113, std: 273, tableMax: 273, pp: 212, p: 212, sp: 250, stdCredit: 250 },
        69: { min: 117, std: 281, tableMax: 281, pp: 219, p: 219, sp: 257, stdCredit: 257 },
        70: { min: 120, std: 289, tableMax: 289, pp: 225, p: 225, sp: 265, stdCredit: 265 },
        71: { min: 125, std: 298, tableMax: 298, pp: 231, p: 231, sp: 272, stdCredit: 272 },
        72: { min: 129, std: 306, tableMax: 306, pp: 238, p: 238, sp: 280, stdCredit: 280 },
        73: { min: 133, std: 315, tableMax: 315, pp: 245, p: 245, sp: 288, stdCredit: 288 },
        74: { min: 136, std: 323, tableMax: 323, pp: 251, p: 251, sp: 296, stdCredit: 296 },
        75: { min: 140, std: 332, tableMax: 332, pp: 258, p: 258, sp: 304, stdCredit: 304 },
        76: { min: 143, std: 341, tableMax: 341, pp: 265, p: 265, sp: 312, stdCredit: 312 },
        77: { min: 146, std: 350, tableMax: 350, pp: 272, p: 272, sp: 320, stdCredit: 320 },
        78: { min: 149, std: 359, tableMax: 359, pp: 279, p: 279, sp: 329, stdCredit: 329 },
        79: { min: 153, std: 368, tableMax: 368, pp: 287, p: 287, sp: 337, stdCredit: 337 },
        80: { min: 157, std: 378, tableMax: 378, sp: 346, stdCredit: 346 },
        81: { min: 160, std: 387, tableMax: 387, sp: 355, stdCredit: 355 }
      },
      rules: {
        minHeightIn: 58,
        maxHeightIn: 81,
        belowChartMin: 0,
        applyWeightLossAdjustment: false,
        belowChartDecline: true,
        noPreferredPlus: true,
        noStandardPlus: true,
        noTables: true,
        conditionTable2Decline: true,
        halfInchRounding: "Half-inch measurements round up to the next inch.",
        weightLossAdjustment: "No weight-loss adjustment is published — current height/weight per the chart.",
        lowBuildReview: "Below the chart minimum for height -> not eligible (accept/reject). Heights below 4'10\" or above 6'9\" -> contact the home office.",
        aboveStandard: "Above the Table 4 maximum for height -> not eligible (accept/reject; no table ratings).",
        note: "Simplified-issue chart: minimum weight (below = not eligible), Table 2 maximum (Standard), Table 4 maximum (ceiling). Preferred band per the separate Preferred chart (4'8\"-6'7\"). Underwritten standard through Table 4 on an accept/reject basis — a Table 1-4 risk is issued at Standard rates; above Table 4 is not eligible. Any medical condition combined with build exceeding Table 2 is not eligible."
      }
    },

    /* ---- Blood pressure ------------------------------------------------
       The impairment guide rates by medication history, not readings: 'HTN —
       controlled with two or fewer medications' -> Standard; uncontrolled or
       three or more medications -> decline. TMS Preferred excludes BP
       medication within 10 years (with an exception for one controlled factor).
       The app captures readings, not med history, so the numeric bands below
       are conservative placeholders mirroring simplified-issue practice — the
       med-count rules are enforced through the hypertension condition (Standard
       ceiling) and the hypertension decline screen. */
    bp: {
      preferred_plus: { sys: 135, dia: 85 },
      preferred: { sys: 140, dia: 90 },
      standard_plus: null,
      standard: { sys: 155, dia: 95 }
    },
    bpTreatmentNote: "Impairment guide: 'Hypertension — controlled with two or fewer medications, provide current BP reading history' -> Standard; uncontrolled or requiring three or more medications to control -> decline (accept/reject). TMS Preferred excludes BP medication within the past 10 years (exception may be considered for one controlled factor).",

    /* ---- Cholesterol ---------------------------------------------------
       Guide: 'Cholesterol — controlled with medication' -> Standard; TMS
       Preferred excludes cholesterol medication within 10 years. Numeric bands
       are conservative placeholders (the guide publishes none); the medication
       rules are enforced through the high-cholesterol condition. */
    cholesterol: {
      total: { preferred_plus: 240, preferred: 260, standard: 300 },
      ratio: { preferred_plus: 5.5, preferred: 6, standard: 8 },
      note: "The guide publishes no numeric cholesterol limits ('Cholesterol — controlled with medication' -> Standard; TMS Preferred excludes cholesterol medication within 10 years). Conservative thresholds mirror simplified-issue practice; readings beyond them are reviewed (refer to home office)."
    },

    /* ---- Driving ------------------------------------------------------ */
    driving: {
      preferred_plus: { maxViolations3yr: 2, cleanYears: 5, note: "No preferred driving criteria are published; the impairment guide declines only serious patterns (3+ violations, DUI, suspension)." },
      preferred: null,
      standard_plus: null,
      standard: null
    },
    drivingDeclineNote: "Impairment guide — Decline: within the past three years an alcohol/drug-related infraction, two or more accidents, or three or more driving violations (or any combination); license currently suspended or revoked.",

    /* ---- Family history ----------------------------------------------- */
    familyHistory: {
      mapping: { none: "preferred_plus", parent: "preferred_plus", parent_sibling: "standard", multiple: "standard" },
      preferred_plus: { text: "TMS Preferred: no more than one family member (father, mother, brother, sister) died before age 60 from breast, colon, intestinal, or prostate cancer or from cardiovascular disease." },
      preferred: { text: "TMS Preferred: no more than one family member died before age 60 from the listed cancers or cardiovascular disease." },
      standard: { text: "Impairment guide: a natural parent or sibling with diabetes, kidney disease, major organ transplant, or heart/cerebrovascular disease/internal cancer before age 60 -> Standard for LIFE (Decline for the Critical Illness Rider)." }
    },

    /* Express Term / TMS impairment guide: hazardous avocations within the
       past two years -> Standard; other pilots flying for pay and student
       pilots -> Decline; scheduled-airline commercial pilots and private
       pilots with more than 100 solo hours -> Standard. */
    avocation: {
      classCap: "standard",
      currentHazardousText: "Hazardous occupation/avocation disclosed — Express Term / TMS impairment guide: hazardous avocations participated in within the past two years -> Standard (Preferred not available); DIR/AODIR riders are declined for hazardous avocations (exclusion rider considered). Scheduled-airline commercial pilots and private pilots with more than 100 solo hours -> Standard; other pilots flying for pay and student pilots -> Decline.",
      cleanText: "No hazardous occupation or avocation disclosed."
    },

    /* ---- Medical ceilings (impairment guide) -------------------------- */
    medicalCeilings: [
      { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "standard", when: "anxiety, one medication, situational in nature — Standard" }], worse: "Major depression, bipolar disorder, or schizophrenia — decline." },
      { id: "depression", name: "Depression", ceilings: [{ klass: "standard", when: "anxiety, one medication, situational in nature — Standard" }], worse: "Major depression, bipolar disorder, or schizophrenia — decline." },
      { id: "bipolar", name: "Bipolar disorder", ceilings: [], decline: "Bi-polar disorder — medically diagnosed, treated, or taken medication -> decline." },
      { id: "schizophrenia", name: "Schizophrenia", ceilings: [], decline: "Schizophrenia / major mental or nervous disorder -> decline." },
      { id: "substance_treatment", name: "Alcohol/drug treatment history", ceilings: [{ klass: "standard", when: "alcoholism with four or more years since abstaining; drug treatment four years or more with no usage since" }], worse: "Alcoholism within four years of abstaining, or illegal drug use / treatment within the past four years — decline." },
      { id: "hypertension", name: "High blood pressure", ceilings: [{ klass: "standard", when: "controlled with two or fewer medications" }], worse: "Uncontrolled, or three or more medications to control — decline." },
      { id: "high_cholesterol", name: "High cholesterol", ceilings: [{ klass: "standard", when: "controlled with medication" }] },
      { id: "cad", name: "Coronary artery disease / angina", ceilings: [], decline: "Angina / heart disease — medically diagnosed, treated, or taken medication -> decline.", postpone: "Angioplasty or stent — impairment guide: decline until reviewed." },
      { id: "heart_disease", name: "Heart disease (CHF, cardiomyopathy, valve, device)", ceilings: [], decline: "Heart disease/disorder including heart attack, coronary artery disease, angina, heart murmur, arrhythmia, pacemaker, valve replacement, cardiomyopathy — decline.", postpone: "Cardiac surgery or hospitalization — decline until stable." },
      { id: "stroke", name: "Stroke / TIA", ceilings: [], decline: "Stroke/CVA — medically diagnosed, treated, or taken medication -> decline.", postpone: "TIA — after six months with no residuals -> Standard; combined with tobacco use -> decline." },
      { id: "asthma", name: "Asthma", ceilings: [{ klass: "standard", when: "mild, occasional, brief episodes, allergic, seasonal; moderate (more than one episode a month)" }], decline: "Severe asthma, hospitalization or ER visit in the past 12 months, maintenance steroid use, or combined with tobacco use — decline." },
      { id: "copd", name: "COPD / emphysema / chronic bronchitis", ceilings: [], decline: "COPD, emphysema, or chronic bronchitis — medically diagnosed, treated, or taken medication -> decline.", postpone: "Acute bronchitis — recovered -> Standard." },
      { id: "sleep_apnea", name: "Sleep apnea", ceilings: [{ klass: "standard", when: "not combined with overweight, poorly controlled HBP, COPD, or heart arrhythmia" }], worse: "Combined with a history of overweight, poorly controlled high blood pressure, COPD, or heart arrhythmia — decline." },
      { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard", when: "controlled with oral medications" }], decline: "Combined with overweight, gout, retinopathy, or protein in urine; diagnosed prior to age 35; tobacco use in the past 12 months; or insulin use — decline." },
      { id: "kidney_disease", name: "Kidney disease", ceilings: [], decline: "Kidney disease — dialysis, insufficiency, failure, nephrectomy, polycystic kidney disease, or transplant recipient -> decline." },
      { id: "liver_disease", name: "Liver disease", ceilings: [], decline: "Cirrhosis of the liver, liver impairments, hepatitis B or C (medicated), or hepatomegaly — decline." },
      { id: "hiv", name: "HIV / AIDS", ceilings: [], decline: "HIV positive / AIDS — decline." },
      { id: "dementia", name: "Alzheimer's / dementia", ceilings: [], decline: "Alzheimer's disease / dementia — medically diagnosed, treated, or taken medication -> decline." },
      { id: "seizures", name: "Seizures / epilepsy", ceilings: [{ klass: "standard", when: "petit mal" }], worse: "All other seizures / epilepsy — decline." },
      { id: "skin_cancer", name: "Skin cancer (basal / squamous)", ceilings: [{ klass: "standard", when: "basal or squamous cell skin carcinoma, isolated occurrence" }] },
      { id: "other_cancer", name: "Other cancer history", ceilings: [{ klass: "standard", when: "eight years since surgery, diagnosis, or last treatment, no recurrence or additional occurrence" }], decline: "All other cancer / melanoma — decline (8-year clear rule; basal or squamous isolated occurrence -> Standard).", postpone: "Cancer diagnosed/treated within the 8-year window — decline screen." },
      { id: "transplant", name: "Organ transplant", ceilings: [], decline: "Organ or bone marrow transplant recipient, or on the waiting list — decline." },
      { id: "paralysis", name: "Paralysis", ceilings: [], decline: "Paralysis including paraplegia and quadriplegia — decline." },
      { id: "ptsd", name: "Post-traumatic stress disorder (PTSD)", ceilings: [{ klass: "standard", when: "PTSD — treated, stable, no self-harm or substance use (QTP criteria)" }], worse: "PTSD with self-harm/suicide history or alcohol use — below accepted criteria." },
      { id: "major_depression", name: "Major depressive disorder", ceilings: [{ klass: "standard", when: "major depression — treated, no hospitalization or disability (QTP criteria)" }], worse: "Major depression with hospitalization, disability, or substance use — decline." },
      { id: "migraine", name: "Migraine / headache", ceilings: [{ klass: "standard", when: "migraine fully investigated and controlled" }], decline: "Migraine severe or not investigated — decline (Home Certainty impairment guide)." },
      { id: "chronic_fatigue", name: "Chronic fatigue syndrome", ceilings: [{ klass: "standard", when: "chronic fatigue syndrome — reviewed individually" }] },
      { id: "rem_sleep_disorder", name: "REM sleep behavior disorder", ceilings: [{ klass: "standard", when: "REM sleep disorder — reviewed under sleep/neuro" }] },
      { id: "hypothyroidism", name: "Hypothyroidism", ceilings: [{ klass: "standard", when: "hypothyroidism controlled, diagnosed >6 months ago (QTP criteria)" }] },
      { id: "hypogonadism", name: "Hypogonadism / low testosterone", ceilings: [{ klass: "preferred_plus", when: "controlled on testosterone therapy" }] },
      { id: "erectile_dysfunction", name: "Erectile dysfunction", ceilings: [{ klass: "preferred_plus", when: "ED only, no cardiac event" }], worse: "ED with underlying cardiovascular disease — review the cardiac history." },
      { id: "pacemaker_icd", name: "Cardiac pacemaker / ICD", ceilings: [], decline: "Pacemaker or defibrillator implant — decline (Home Certainty impairment guide)." },
      { id: "heart_valve_prosthesis", name: "Heart valve prosthesis", ceilings: [], decline: "Mechanical/metal heart valve — reviewed under heart disease; anticoagulation required — table/specialist review." },
      { id: "intracranial_aneurysm_clip", name: "Intracranial aneurysm clip", ceilings: [{ klass: "table", when: "stable, long-standing clip — individual review" }] },
      { id: "vp_shunt", name: "VP / CSF shunt", ceilings: [{ klass: "standard", when: "stable shunt, no recent revision" }] },
      { id: "neurostimulator", name: "Neurostimulator", ceilings: [{ klass: "standard", when: "spinal cord stimulator — reviewed on the underlying condition" }] },
      { id: "cochlear_implant", name: "Cochlear implant", ceilings: [{ klass: "standard", when: "sensory device — not rateable" }] },
      { id: "drug_infusion_pump", name: "Drug infusion pump", ceilings: [{ klass: "standard", when: "pump — reviewed on the underlying condition" }] },
      { id: "ocular_monitoring", name: "Ocular monitoring system", ceilings: [{ klass: "standard", when: "monitoring device — reviewed on the underlying condition" }] }
    ],

    /* ---- Postpone triggers ------------------------------------------- */
    postponeTriggers: [
      { id: "pending_test", text: "Diagnostic testing, surgery, or hospitalization recommended within the past 12 months with results not received or not completed", reason: "Impairment guide: not eligible until completed — postpone / pre-review; resubmit once results are available." }
    ],

    /* ---- Decline / not-eligible triggers ------------------------------ */
    declineTriggers: [
      { id: "alcohol_active", text: "Current alcohol abuse, or alcoholism with less than four years since abstaining", reason: "Express Term/TMS impairment guide." },
      { id: "drug_use_recent", text: "Illegal drug use or drug-abuse treatment within the past four years", reason: "Express Term/TMS impairment guide." },
      { id: "criminal_active", text: "Convicted of a felony or misdemeanor within the past five years; probation or parole within the past six months", reason: "Express Term/TMS impairment guide." },
      { id: "amam_third_party_payor", text: "Third-party premium payor with the insured age 30 or older", reason: "Applications with a third-party payor (other than the insured, spouse, business, or business partner) are not accepted at ages 30+." },
      { id: "amam_heart", text: "Heart disease / disorder — heart attack, coronary artery disease, angina, heart murmur, arrhythmia, angioplasty, bypass, pacemaker, valve replacement, or cardiomyopathy", reason: "Express Term/TMS impairment guide — decline." },
      { id: "amam_stroke", text: "Stroke / CVA — medically diagnosed, treated, or taken medication", reason: "Express Term/TMS impairment guide — decline." },
      { id: "amam_copd", text: "COPD / emphysema / chronic bronchitis", reason: "Express Term/TMS impairment guide — decline." },
      { id: "amam_paralysis", text: "Paralysis including paraplegia and quadriplegia", reason: "Express Term/TMS impairment guide — decline." },
      { id: "amam_liver", text: "Liver impairments / hepatomegaly (and cirrhosis, hepatitis B/C, via the liver condition)", reason: "Express Term/TMS impairment guide — decline." },
      { id: "dementia", text: "Alzheimer's disease or dementia", reason: "Express Term/TMS impairment guide — decline." },
      { id: "hiv", text: "HIV positive / AIDS", reason: "Express Term/TMS impairment guide — decline." },
      { id: "cirrhosis", text: "Cirrhosis of the liver", reason: "Express Term/TMS impairment guide — decline." },
      { id: "renal_failure", text: "Kidney disease — dialysis, insufficiency, failure, nephrectomy, polycystic kidney disease, or transplant recipient", reason: "Express Term/TMS impairment guide — decline." },
      { id: "transplant", text: "Organ or bone marrow transplant recipient, or on the waiting list", reason: "Express Term/TMS impairment guide — decline." },
      { id: "suicide_multiple", text: "Suicide attempt — medically diagnosed, treated, or taken medication (the app captures multiple attempts via the suicide-history flag)", reason: "Express Term/TMS impairment guide — decline." },
      { id: "oxygen_use", text: "Oxygen use", reason: "Impairment guide — decline screen." },
      { id: "adl_dependence", text: "Assistance needed with activities of daily living", reason: "Impairment guide — decline screen." },
      { id: "facility_care", text: "Facility / hospice / home-health care or nursing home confinement", reason: "Impairment guide — decline screen." },
      { id: "wheelchair", text: "Chronic wheelchair dependence due to illness or disability", reason: "Impairment guide — decline screen." }
    ],

    drugDeclineYears: 4,
    drugRecoveryTiers: [{ minYears: 4, klass: "standard" }],
    substanceTiers: { declineYears: 4, tiers: [{ minYears: 4, klass: "standard" }, { minYears: 0, klass: "table" }] },

    conditionModels: {
      anxiety: { best: "standard" },
      depression: { best: "standard" },
      bipolar: { best: "table" },
      other_cancer: { declineWithinYears: 8, afterCeiling: "standard" }
    },

    /* Diabetes: controlled with oral medications -> Standard; insulin use,
       tobacco use in the past 12 months, onset before age 35, or combined
       with overweight/gout/retinopathy/protein -> decline. */
    diabetes: { type1Ceiling: "standard", type2Ceiling: "standard", a1cDeclineMin: 10, juvenileOnsetDeclineAge: 35 },

    /* ---- Dignity Solutions final-expense lane (ages 50-85) ------------ */
    dignity: {
      note: "Dignity Solutions (simplified-issue final-expense whole life, ages 50-85) is a separate lane: the plan tier is set by eight yes/no health questions — Immediate Death Benefit (all questions No), Graded Death Benefit (yes to question 8), Return of Premium Death Benefit (yes to any of questions 4-7), and NO coverage if any of questions 1-3 is answered yes. Maximum face: $50,000 (Immediate, ages 50-75) / $25,000 (76-85 and for Graded/ROP); minimum $2,500. Its own three-plan build chart applies. Not modeled as a class — the estimate reflects the simplified-issue term lane.",
      buildChart: {
        53: { immed: 173, graded: "174-180", rop: "181-190", immedMin: 82, ropMin: "77-81" },
        54: { immed: 180, graded: "182-188", rop: "189-198", immedMin: 84, ropMin: "79-83" },
        55: { immed: 187, graded: "189-196", rop: "197-206", immedMin: 86, ropMin: "81-85" },
        56: { immed: 197, graded: "198-204", rop: "205-214", immedMin: 88, ropMin: "83-87" },
        57: { immed: 204, graded: "205-212", rop: "213-222", immedMin: 90, ropMin: "85-89" },
        58: { immed: 211, graded: "212-220", rop: "221-230", immedMin: 92, ropMin: "87-91" },
        59: { immed: 218, graded: "219-228", rop: "229-238", immedMin: 94, ropMin: "89-93" },
        60: { immed: 225, graded: "226-236", rop: "237-246", immedMin: 96, ropMin: "91-95" },
        61: { immed: 233, graded: "234-244", rop: "245-254", immedMin: 99, ropMin: "94-98" },
        62: { immed: 241, graded: "242-252", rop: "253-262", immedMin: 101, ropMin: "96-100" },
        63: { immed: 248, graded: "249-260", rop: "261-271", immedMin: 105, ropMin: "100-104" },
        64: { immed: 256, graded: "257-268", rop: "269-280", immedMin: 107, ropMin: "102-106" },
        65: { immed: 264, graded: "265-276", rop: "277-288", immedMin: 110, ropMin: "105-109" },
        66: { immed: 273, graded: "274-285", rop: "286-297", immedMin: 112, ropMin: "107-111" },
        67: { immed: 281, graded: "282-294", rop: "295-306", immedMin: 116, ropMin: "111-115" },
        68: { immed: 289, graded: "290-303", rop: "304-316", immedMin: 119, ropMin: "114-118" },
        69: { immed: 298, graded: "299-312", rop: "313-325", immedMin: 123, ropMin: "118-122" },
        70: { immed: 307, graded: "308-321", rop: "322-335", immedMin: 126, ropMin: "121-125" },
        71: { immed: 315, graded: "316-330", rop: "331-344", immedMin: 131, ropMin: "126-130" },
        72: { immed: 324, graded: "325-339", rop: "340-354", immedMin: 135, ropMin: "130-134" },
        73: { immed: 334, graded: "335-349", rop: "350-364", immedMin: 139, ropMin: "134-138" },
        74: { immed: 343, graded: "344-359", rop: "360-374", immedMin: 142, ropMin: "137-141" },
        75: { immed: 352, graded: "353-368", rop: "369-384", immedMin: 146, ropMin: "141-145" },
        76: { immed: 361, graded: "362-378", rop: "379-394", immedMin: 149, ropMin: "144-148" },
        77: { immed: 370, graded: "371-388", rop: "389-404", immedMin: 152, ropMin: "147-151" },
        78: { immed: 379, graded: "380-398", rop: "399-414", immedMin: 156, ropMin: "151-155" },
        79: { immed: 388, graded: "389-408", rop: "409-424", immedMin: 160, ropMin: "155-159" },
        80: { immed: 397, graded: "398-418", rop: "419-434", immedMin: 164, ropMin: "159-163" },
        81: { immed: 406, graded: "407-428", rop: "429-440", immedMin: 168, ropMin: "162-167" }
      },
      noCoverage: [
        "Assistance with bathing, dressing, eating, or toileting", "Amputation caused by disease", "Bed confinement",
        "Current cancer or a history of metastatic cancer", "Home health care", "Hospice care", "Currently hospitalized",
        "Nursing facility confinement", "Oxygen use", "Chronic wheelchair use due to illness or disease",
        "Congestive heart failure", "Alzheimer's disease / dementia", "ALS (Lou Gehrig's disease)", "Kidney dialysis advised",
        "Liver failure", "Mental incapacity", "Organ transplant advised", "Respiratory failure", "Terminal illness / end-stage disease", "HIV / AIDS"
      ],
      ropTriggers: [
        "Diabetes with retinopathy, nephropathy, or neuropathy", "Insulin before age 50", "Insulin shock or diabetic coma",
        "Chronic kidney disease / kidney failure / renal insufficiency", "Cancer — more than one occurrence, or any cancer within 2 years",
        "Heart attack / angina / angioplasty / heart surgery / bypass within 2 years", "Stroke / TIA / lupus / COPD / hepatitis C / cirrhosis / pancreatitis within 2 years",
        "Pacemaker or defibrillator within 2 years", "Oxygen required within 2 years", "Alcohol or drug abuse within 2 years",
        "Pending diagnostic testing, surgery, or hospitalization within 2 years"
      ],
      gradedTriggers: [
        "3-year windows of the ROP conditions", "Aneurysm, angioplasty, circulatory/heart surgery, CABG within 3 years",
        "Multiple sclerosis, muscular dystrophy, Parkinson's disease, seizures, or paralysis within 3 years", "Ulcerative colitis within 3 years", "Liver disease treated within 3 years"
      ]
    },
    /* ---- Home Certainty lane (mortgage-protection term) ------------------------
       Home Certainty is a simplified-issue mortgage-protection term plan (level
       term to age 95 with 10/15/20/25/30-year level premium periods; ROP for the
       20/25/30-year periods). A current mortgage is required regardless of when
       taken or refinanced. Shares the Express Term simplified-issue build family
       and the same application workflow. Not modeled as a class. ------------ */
    homeCertainty: {
      note: "Home Certainty is a simplified-issue mortgage-protection term plan (level term to age 95, 10/15/20/25/30-year level premium periods, Return of Premium for the 20/25/30-year periods) — a current mortgage is required regardless of when it was taken or refinanced. Issue ages 20-75 by term (10-yr 20-75; 15-yr 20-65; 20-yr 20-60; 25-yr 20-55; 30-yr 20-50); minimum $25,000 face or $25/month premium; maximum $300,000. Shares the Express Term build chart and application workflow. Not modeled as a class — the estimate reflects the simplified-issue term lane.",
      products: "Home Certainty level term to age 95 (10/15/20/25/30-yr) + Return of Premium (20/25/30-yr)",
      issueAges: "20-75 by term: 10-yr 20-75; 15-yr 20-65; 20-yr 20-60; 25-yr 20-55; 30-yr 20-50",
      maxIssueAge: 75,
      minIssueAge: 20,
      faceRange: "$25,000 minimum (or $25/month premium) — $300,000 maximum",
      mortgageRequirement: "A current mortgage is required to be eligible, regardless of the date originally taken or refinanced; co-applicants on the mortgage/deed may each be eligible if both have lived in the home for a minimum of 3 months.",
      buildFamily: "Shares the Express Term / Term Made Simple simplified-issue build chart (minimum weight, Table-2 and Table-4 maximums) and Preferred chart (unisex)."
    },


    /* ---- Evidence / workflow ----------------------------------------- */
    evidence: {
      apsAge: 200,
      genericGrid: false,
      apsConditions: [
        "High blood pressure", "Diabetes", "Asthma", "COPD / emphysema / chronic bronchitis", "Congestive heart failure (CHF)",
        "Angina", "Stroke / heart or circulatory disease", "Cancer", "AIDS / HIV", "Bi-polar / schizophrenia",
        "Parkinson's disease", "Multiple sclerosis", "Kidney dialysis", "Organ / tissue transplant", "Seizures",
        "Blood clot / deep vein thrombosis", "Gout", "Alcohol / drugs"
      ],
      amountRules: [
        { ageMin: 18, ageMax: 55, amountMin: 25000, items: ["Express Term: no telephone interview required at ages 18-55 (required only if the Critical Illness Rider at 100% acceleration is applied for)"] },
        { ageMin: 56, ageMax: 65, amountMin: 25000, amountMax: 100000, items: ["Telephone interview required only if the Critical Illness Rider at 100% acceleration is applied for (Express Term ages 56-65)"] },
        { ageMin: 66, ageMax: 75, amountMin: 25000, items: ["Telephone interview required (Express Term ages 66-75, all amounts)"] },
        { ageMin: 65, ageMax: 75, amountMin: 50000, items: ["Term Made Simple: telephone interview required for all proposed insureds ages 65 and above"] },
        { ageMin: 18, ageMax: 200, amountMin: 25000, items: ["MIB check", "Pharmaceutical (prescription) facility check", "MVR"] }
      ],
      acceleratedUw: { ageMin: 18, ageMax: 75, amountMin: 25000, amountMax: 500000, note: "Mobile application decision engine: a point-of-sale underwriting decision appears on screen within seconds — approved as applied for (firm), telephone interview needed, refer to home office, or not eligible for coverage." },
      note: "Simplified-issue workflow: the simplified application, MIB, a pharmaceutical (prescription) facility check, and an MVR on every application; a telephone interview by age and amount (Express Term non-med limits: none at 18-55, 56-65 only for CIR at 100% up to $100,000, 66-75 at all amounts; Term Made Simple: mandatory at age 65+). Underwriting reserves the right to request medical records. Auto-declines should not be submitted — conditions on the impairment-guide decline list, or build outside the chart, are not eligible. The Express Term Prescription Reference Guide maps medications to plan eligibility (HTN controlled with 2 or fewer medications; diabetes — see the impairment criteria).",
      temporaryCoverage: "Temporary or conditional coverage exists only under the exact terms of the conditional receipt (premium paid, no material change in health) — never because the app gives a favorable estimate."
    },

    /* ---- Financial justification ------------------------------------- */
    financial: {
      incomeMultipliers: [],
      note: "The guides publish no income-multiplier schedule — the application requests annual salary and total coverage in force, and the face amount is reviewed individually. Maximum face: Express Term $500,000 (18-45) / $300,000 (46-75); Term Made Simple $500,000; Dignity Solutions $50,000 (Immediate 50-75) / $25,000 (76-85, Graded, ROP). Third-party premium payor is not accepted at ages 30+.",
      maxFace: 500000
    },

    /* No credit program is published in the American Amicable guides. */
    credit: null,

    classInfo: {
      preferred_plus: { name: "Preferred Non-Tobacco", meaning: "The best American Amicable class (no Preferred Plus is published). See Preferred Non-Tobacco.", color: "#0e7a5f" },
      preferred: { name: "Preferred Non-Tobacco", meaning: "No tobacco or nicotine in 36 months; 'no' to the Preferred criteria (no BP/cholesterol medication within 10 years, no diabetes/cancer/cardiac history within 10 years, no alcohol/drug treatment in 10 years, no more than one early family death, no more than two moving violations and no DUI in 5 years, no felony/misdemeanor in 5 years); within the Preferred build chart.", color: "#1b9a7a" },
      standard_plus: { name: "Standard Non-Tobacco", meaning: "No Standard Plus class — American Amicable issues Standard on an accept/reject basis.", color: "#3b82b0" },
      standard: { name: "Standard Non-Tobacco", meaning: "No tobacco or nicotine in 12 months; standard risk through Table 4 — issued at Standard rates on an accept/reject basis (no table ratings; above Table 4 is not eligible).", color: "#4a6fa5" },
      table: { name: "Not offered (accept/reject)", meaning: "No table ratings — a Table 1-4 risk is issued at Standard rates; above Table 4 is not eligible.", color: "#b8860b" },
      postpone: { name: "Postpone / pre-review", meaning: "Not eligible until completed — e.g., diagnostic testing, surgery, or hospitalization recommended within the past 12 months with results pending. Resubmit once results are available.", color: "#8a5fb8" },
      decline: { name: "Decline / not eligible", meaning: "On the Express Term / TMS impairment-guide decline list (heart disease, stroke, COPD, cancer within 8 years, diabetes with insulin/tobacco/early onset/complications, HIV, dementia, cirrhosis, kidney failure, transplant, paralysis, criminal history within 5 years, uncontrolled BP, etc.) — do not submit; carrier direction required.", color: "#b3364a" }
    }
  };

/* ======================================================================
 * JOHN HANCOCK — Simple Term with Vitality (simplified issue, ages 20-60)
 * Source: "Simple Term with Vitality Underwriting Guide", LIFE-9415 (4/23)
 * ==================================================================== */
CARRIER_RULES.john_hancock = {
  id: "john_hancock",
  name: "John Hancock",
  company: "John Hancock Life Insurance Company (U.S.A.) / John Hancock Life Insurance Company of New York",
  guide: {
    title: "Simple Term with Vitality Underwriting Guide",
    version: "LIFE-9415 (4/23)",
    note: "Simplified-issue level term with the John Hancock Vitality program. Eligibility is set by the simplified application plus database checks (MIB, MVR, prescription history, identification). Any nicotine, tobacco, or smoking-cessation product use within the past 12 months renders the tobacco risk class. John Hancock may conduct a post-issue quality review; a policy may be rescinded for material misrepresentation."
  },
  eligibility: {
    products: "Simple Term with Vitality (level term with the Vitality program — the only product available through this lane)",
    issueAges: "20-60",
    minIssueAge: 20,
    maxIssueAge: 60,
    faceRange: "Up to $500,000; no replacement of in-force coverage",
    residency: "US citizens and permanent residents (green card) only; ITIN holders are not eligible",
    notes: [
      "Not eligible: DUI/DWI conviction within 5 years; currently suspended/revoked license within the past 12 months; permanently disabled and receiving benefits; any criminal record.",
      "Disqualifying occupations include astronaut, bridge worker, celebrity, diplomat, embassy personnel, explosive handler, fishing, foreign aid worker, foreign journalist, government official, oil worker, mining, professional car racing, professional diver, professional athlete, steeplejack, structural steel or iron worker.",
      "The following medical conditions are not eligible: AIDS/HIV; Alzheimer's/dementia/cognitive impairment/memory loss; coronary disorder or vascular disease (including stroke, heart attack, stent, cardiomyopathy); peripheral vascular disease; cancer (excluding basal/squamous cell skin cancer and Stage 0 melanoma in situ); history of treatment for alcohol or substance abuse (or advised to discontinue/limit use); cirrhosis; kidney disease or failure; COPD (including emphysema); degenerative neurological disease (Parkinson's, MS, muscular dystrophy); psychosis, schizophrenia, or attempted suicide; organ transplant recipient; family history of Huntington's disease or polycystic kidney disease; diagnostic testing recommended but not completed; diagnostic testing completed or recommended in the past three months; diabetes with complications."
    ],
    charts: [
      { product: "Simple Term with Vitality", ages: "20-60", face: "Up to $500,000; no replacement of in-force coverage" }
    ],
    chartNote: "Maximum build per the BMI 43 chart (BMI 39 for people living with diabetes). Applicants above the chart are not eligible."
  },
  nicotine: {
    classes: [
      { klass: "preferred", lookbackMonths: 12, label: "Non-Tobacco (no nicotine/tobacco/cessation products in 12 months)" }
    ],
    tobaccoLookbackMonths: 12,
    tobaccoDefinition: "The application asks about nicotine, tobacco, and smoking-cessation products (including vaping/e-cigarettes — even 0 mg nicotine — and Chantix). Using any of these within the past 12 months renders the tobacco risk class.",
    cigarException: null,
    marijuana: "Not addressed in the guide — review under the simplified-issue rules (marijuana rated separately from tobacco)."
  },
  build: {
    /* Maximum weight per height (BMI 43). Below the maximum = no build cap
       (the class criteria are qualitative); above = not eligible. */
    chart: {
      56: { min: 95, pp: 192, p: 192, sp: 192, stdCredit: 192, std: 192 },
      57: { min: 97, pp: 199, p: 199, sp: 199, stdCredit: 199, std: 199 },
      58: { min: 99, pp: 206, p: 206, sp: 206, stdCredit: 206, std: 206 },
      59: { min: 101, pp: 213, p: 213, sp: 213, stdCredit: 213, std: 213 },
      60: { min: 103, pp: 220, p: 220, sp: 220, stdCredit: 220, std: 220 },
      61: { min: 106, pp: 228, p: 228, sp: 228, stdCredit: 228, std: 228 },
      62: { min: 109, pp: 235, p: 235, sp: 235, stdCredit: 235, std: 235 },
      63: { min: 112, pp: 243, p: 243, sp: 243, stdCredit: 243, std: 243 },
      64: { min: 116, pp: 251, p: 251, sp: 251, stdCredit: 251, std: 251 },
      65: { min: 119, pp: 258, p: 258, sp: 258, stdCredit: 258, std: 258 },
      66: { min: 123, pp: 266, p: 266, sp: 266, stdCredit: 266, std: 266 },
      67: { min: 127, pp: 275, p: 275, sp: 275, stdCredit: 275, std: 275 },
      68: { min: 130, pp: 283, p: 283, sp: 283, stdCredit: 283, std: 283 },
      69: { min: 134, pp: 291, p: 291, sp: 291, stdCredit: 291, std: 291 },
      70: { min: 138, pp: 300, p: 300, sp: 300, stdCredit: 300, std: 300 },
      71: { min: 142, pp: 308, p: 308, sp: 308, stdCredit: 308, std: 308 },
      72: { min: 146, pp: 317, p: 317, sp: 317, stdCredit: 317, std: 317 },
      73: { min: 150, pp: 326, p: 326, sp: 326, stdCredit: 326, std: 326 },
      74: { min: 154, pp: 335, p: 335, sp: 335, stdCredit: 335, std: 335 },
      75: { min: 158, pp: 344, p: 344, sp: 344, stdCredit: 344, std: 344 },
      76: { min: 162, pp: 353, p: 353, sp: 353, stdCredit: 353, std: 353 },
      77: { min: 167, pp: 363, p: 363, sp: 363, stdCredit: 363, std: 363 },
      78: { min: 171, pp: 372, p: 372, sp: 372, stdCredit: 372, std: 372 },
      79: { min: 176, pp: 382, p: 382, sp: 382, stdCredit: 382, std: 382 },
      80: { min: 180, pp: 391, p: 391, sp: 391, stdCredit: 391, std: 391 },
      81: { min: 184, pp: 401, p: 401, sp: 401, stdCredit: 401, std: 401 },
      82: { min: 189, pp: 411, p: 411, sp: 411, stdCredit: 411, std: 411 }
    },
    rules: {
      minHeightIn: 56,
      maxHeightIn: 82,
      belowChartMin: 0,
      applyWeightLossAdjustment: false,
      belowChartDecline: true,
      noPreferredPlus: true,
      noStandardPlus: true,
      noTables: true,
      halfInchRounding: "Half-inch measurements round up to the next inch.",
      weightLossAdjustment: "No weight-loss adjustment is published — current height/weight per the chart.",
      lowBuildReview: "No minimum weight is published for this product.",
      aboveStandard: "Applicants above the BMI 43 maximum (BMI 39 for people living with diabetes) are not eligible for Simple Term with Vitality.",
      note: "Simple Term with Vitality build: maximum weight per height at BMI 43 (BMI 39 for people living with well-controlled Type II diabetes). Within the chart = no build cap; the Preferred / Standard / Select class criteria are qualitative (medications, MVR, disability)."
    }
  },
  bp: {
    preferred_plus: { sys: 140, dia: 90 },
    preferred: { sys: 150, dia: 90 },
    standard_plus: null,
    standard: { sys: 160, dia: 95 }
  },
  bpTreatmentNote: "No numeric BP limits are published for Simple Term with Vitality — the class criteria are qualitative ('Hypertension on one medication over age 35' is acceptable for Preferred). Thresholds above are conservative placeholders for guidance only.",
  cholesterol: {
    total: { preferred_plus: 260, preferred: 280, standard: 300 },
    ratio: { preferred_plus: 6, preferred: 6.5, standard: 8 },
    note: "No numeric cholesterol limits are published for Simple Term with Vitality — class criteria are qualitative. Thresholds above are conservative placeholders for guidance only."
  },
  driving: {
    preferred_plus: { maxViolations3yr: 2, cleanYears: 5, note: "Preferred: maximum of 2 moving violations in the past 2 years (MVR check)." },
    preferred: null,
    standard_plus: null,
    standard: null
  },
  drivingDeclineNote: "Not eligible for Simple Term with Vitality: DUI/DWI conviction within five years; currently suspended or revoked driver's license within the past 12 months.",
  familyHistory: {
    mapping: { none: "preferred_plus", parent: "preferred_plus", parent_sibling: "preferred_plus", multiple: "preferred_plus" },
    preferred_plus: { text: "Family history of Huntington's disease or polycystic kidney disease is a disqualifier for Simple Term with Vitality (not captured by the app's cardiovascular family-history question — verify explicitly)." }
  },
  diabetes: { type1Ceiling: "standard", type2Ceiling: "standard", juvenileOnsetDeclineAge: 40, a1cDeclineMin: 10, note: "Select class accepts Type I diabetics over age 40 and Type II diabetics diagnosed after age 30, without serious risk factors or complications. Type I under 40, diabetics who smoke, and diabetes with complications are not eligible." },
  medicalCeilings: [
    { id: "hiv", name: "HIV / AIDS", decline: "HIV or AIDS — not eligible for Simple Term with Vitality." },
    { id: "dementia", name: "Alzheimer's / dementia", decline: "Alzheimer's, dementia, cognitive impairment, or memory loss — not eligible." },
    { id: "copd", name: "COPD / emphysema", decline: "COPD (including emphysema) — not eligible." },
    { id: "parkinsons", name: "Parkinson's disease", decline: "Degenerative neurological disease (Parkinson's, MS, muscular dystrophy) — not eligible." },
    { id: "multiple_sclerosis", name: "Multiple sclerosis", decline: "Degenerative neurological disease (Parkinson's, MS, muscular dystrophy) — not eligible." },
    { id: "md", name: "Muscular dystrophy", decline: "Degenerative neurological disease (Parkinson's, MS, muscular dystrophy) — not eligible." },
    { id: "kidney_disease", name: "Kidney disease / failure", decline: "Kidney disease or failure — not eligible." },
    { id: "liver_disease", name: "Cirrhosis / liver disease", decline: "Cirrhosis of the liver — not eligible." },
    { id: "transplant", name: "Organ transplant", decline: "Organ transplant recipient — not eligible." },
    { id: "paralysis", name: "Paralysis", decline: "Paralysis is not listed among the Simple Term disqualifiers — verify with the simplified application." },
    { id: "stroke", name: "Stroke / vascular disease", decline: "Coronary disorder or vascular disease including stroke — not eligible." },
    { id: "cad", name: "Coronary artery disease", decline: "Coronary disorder or vascular disease including heart attack, stent placement, or cardiomyopathy — not eligible." },
    { id: "heart_disease", name: "Heart disease", decline: "Coronary disorder or vascular disease including heart attack, stent placement, or cardiomyopathy — not eligible." },
    { id: "peripheral_vascular", name: "Peripheral vascular disease", decline: "Peripheral vascular disease — not eligible." },
    { id: "schizophrenia", name: "Schizophrenia / psychosis", decline: "Psychosis, schizophrenia, or attempted suicide — not eligible." },
    { id: "other_cancer", name: "Cancer", ceilings: [{ klass: "decline" }], decline: "Cancer (including malignant melanoma, lymphoma, brain tumor, leukemia — excluding basal/squamous cell skin cancer and Stage 0 melanoma in situ) — not eligible." },
    { id: "skin_cancer", name: "Basal / squamous cell skin cancer", ceilings: [{ klass: "preferred_plus" }], decline: "Melanoma (beyond Stage 0 in-situ) is not eligible; basal/squamous cell skin cancer is acceptable." },
    { id: "substance_treatment", name: "Alcohol / substance abuse treatment", decline: "History of treatment for alcohol or substance abuse, or advised to discontinue/limit use by a medical professional — not eligible." },
    { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "preferred" }] },
    { id: "depression", name: "Depression", ceilings: [{ klass: "preferred" }] },
    { id: "asthma", name: "Asthma", ceilings: [{ klass: "preferred_plus" }], decline: "Asthma treated with one medication (excluding oral steroids) is acceptable for Preferred." },
    { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard" }], decline: "Type I diabetics under age 40, diabetics who smoke, and diabetes with complications or serious risk factors are not eligible; Type I over 40 and Type II diagnosed after 30 without serious risk factors are accepted at Select." }
  ],
  conditionModels: {
    other_cancer: { declineWithinYears: 999, waitYears: 0, afterCeiling: "decline" }
  },
  autoDeclineIds: ["hiv", "dementia", "copd", "parkinsons", "multiple_sclerosis", "md", "kidney_disease", "liver_disease", "transplant", "stroke", "cad", "heart_disease", "schizophrenia", "substance_treatment"],
  declineTriggers: [
    { id: "criminal_active", text: "Criminal record — not eligible for Simple Term with Vitality", reason: "Eligibility: 'History of criminal record' disqualifies." },
    { id: "driving_dui_recent", text: "DUI/DWI conviction within five years — not eligible", reason: "Eligibility disqualifier." },
    { id: "jh_pending_test", text: "Diagnostic testing recommended but not completed — not eligible", reason: "Eligibility disqualifier." },
    { id: "jh_occupation", text: "Disqualifying occupation — not eligible for Simple Term with Vitality", reason: "Eligibility: disqualifying occupations list." },
    { id: "facility_care", text: "Permanently disabled / facility care — not eligible", reason: "Eligibility: 'Permanently disabled (receiving benefits)' disqualifies." }
  ],
  postponeTriggers: [],
  evidence: {
    apsAge: 60,
    genericGrid: false,
    apsConditions: [
      "Coronary disorder or vascular disease", "Cancer", "Diabetes", "COPD", "Kidney disease", "Cirrhosis / liver disease",
      "Degenerative neurological disease", "Psychosis / schizophrenia", "Substance abuse", "HIV / AIDS", "Organ transplant", "Peripheral vascular disease"
    ],
    amountRules: [],
    acceleratedUw: { ageMin: 20, ageMax: 60, amountMin: 0, amountMax: 500000, note: "Simplified issue: the application plus database checks (MIB, MVR, prescription history check, identification) determine the offer. No paramedical exam is used for this product." },
    note: "Simple Term with Vitality is underwritten from the simplified application plus database checks: Medical Information Bureau (MIB), Motor Vehicle Registration (MVR), prescription history check, and identification. A post-issue quality review may request medical records; a policy may be rescinded for material misrepresentation. Any nicotine, tobacco, or smoking-cessation product within the past 12 months renders the tobacco risk class.",
    temporaryCoverage: "Temporary or conditional coverage exists only under the exact terms of the conditional receipt — never because the app gives a favorable estimate."
  },
  financial: {
    incomeMultipliers: [],
    note: "Coverage is limited to $500,000 and may not replace in-force coverage. No income-multiplier schedule is published for this product.",
    maxFace: 500000
  },
  credit: null,
  classInfo: {
    preferred_plus: { name: "Preferred", meaning: "No Preferred Plus is published for Simple Term with Vitality — Preferred is the best class.", color: "#0e7a5f" },
    preferred: { name: "Preferred", meaning: "Healthier BMI, prescriptions without significant mortality impact (e.g., asthma on one medication excluding oral steroids, hypertension on one medication over age 35), and no more than 2 moving violations in the past 2 years.", color: "#0e7a5f" },
    standard_plus: { name: "Standard", meaning: "Average risk — includes full-time workers receiving military or own-occupation disability, Stage 0 melanoma accepted, and single-fill medications without other chronic-disease indications.", color: "#3b82b0" },
    standard: { name: "Select", meaning: "Most lenient class — accepts Type I diabetics over age 40 and Type II diabetics diagnosed after age 30 without serious risk factors; declining factors include Type I under 40, diabetics who smoke, suspended license, DUI/reckless driving, or excessive moving violations.", color: "#4a6fa5" },
    table: { name: "Not offered", meaning: "Simple Term with Vitality offers Preferred / Standard / Select only — no table ratings; applicants above the class criteria are not eligible.", color: "#b8860b" },
    postpone: { name: "Postpone / pre-review", meaning: "Diagnostic testing recommended but not completed, or testing completed/recommended within the past three months — not eligible until resolved.", color: "#8a5fb8" },
    decline: { name: "Not eligible / decline", meaning: "On the Simple Term disqualifier list (DUI/DWI within 5 years, suspended license, criminal record, permanent disability, disqualifying occupation, HIV, dementia, coronary/vascular disease, cancer, COPD, cirrhosis, kidney disease, diabetes with complications, etc.).", color: "#b3364a" }
  }
};

/* ======================================================================
 * AMERICO — Eagle Select final expense (simplified issue, ages 40-85)
 * Source: "Eagle Select Final Expense Agent Guide" 24-275-1 (03/25) and
 * "Eagle Select Underwriting Tips" 24-275-5 (11/24)
 * ==================================================================== */
CARRIER_RULES.americo = {
  id: "americo",
  name: "Americo",
  company: "Americo Financial Life and Annuity Insurance Company (Americo), Kansas City, MO",
  guide: {
    title: "Eagle Select Final Expense Agent Guide + Underwriting Tips",
    version: "24-275-1 (03/25) · 24-275-5 (11/24)",
    note: "Final-expense whole life (Eagle Select 1 / 2 / 3 tiers) with 100% instant-decision eApplication. The application's health questions plus third-party services (MIB, prescriptions, medical information) generate the offer — Eagle Select 1, 2, 3, or decline. Not all medical questions are knock-out questions. A non-nicotine classification requires no nicotine products (including vaping/e-cigarettes, patches, gum, lozenges, and oral pouches) for at least 24 months. The Quit Smoking Advantage lets smokers receive non-nicotine rates for the first three policy years."
  },
  eligibility: {
    products: "Eagle Select 1 / 2 / 3 final expense whole life (Policy Series 311/312/413)",
    issueAges: "Eagle Select 1 & 2 non-nicotine: 40-85; Eagle Select 1 nicotine: 40-85; Eagle Select 2 nicotine: 40-75; Eagle Select 3: 40-75",
    minIssueAge: 40,
    maxIssueAge: 85,
    faceRange: "Minimum $5,000; maximum $40,000 (Eagle Select 1 & 2) / $25,000 (Eagle Select 3)",
    residency: "Authorized in DC and all states except NY",
    notes: [
      "Knock-out conditions: organ/tissue transplant, multiple sclerosis, systemic lupus, ALS, Alzheimer's/dementia, Huntington's disease, brain tumor, Parkinson's disease, amputation due to disease, liver disease, leukemia.",
      "Declinable if any of the following occurred in the last 12 months: assistance with activities of daily living (bathing, toileting, dressing) due to a debilitating disease or being bed-bound; hospice care; supplemental oxygen; dependence on a wheelchair or motorized mobility device; advised to undergo tests/surgery/hospitalization not yet completed, or awaiting a diagnosis/test results, or currently hospitalized.",
      "Tier logic: respiratory condition + nicotine → Eagle Select 2 Nicotine; stroke/TIA + nicotine → decline ES1, best ES2 Nicotine; heart disease + nicotine → ES2 Nicotine; any 2 of heart disease / diabetes / stroke-TIA (non-nicotine) → ES2 Non-nicotine; peripheral vascular disease + diabetes → ES2; PVD + nicotine → ES2 Nicotine; single diabetes complication → ES2; smoking with diabetes/heart/respiratory disease → ES2 Smoker."
    ],
    charts: [
      { product: "Eagle Select 1 & 2", ages: "40-85 (non-nicotine); nicotine 40-75 for ES2", face: "$5,000-$40,000" },
      { product: "Eagle Select 3 (graded)", ages: "40-75", face: "$5,000-$25,000" }
    ],
    chartNote: "Single build range per height (minimum to maximum weight). Outside the range — not eligible."
  },
  nicotine: {
    classes: [
      { klass: "preferred", lookbackMonths: 24, label: "Non-Nicotine (no nicotine products in 24 months)" }
    ],
    tobaccoLookbackMonths: 24,
    tobaccoDefinition: "A non-nicotine classification applies to anyone who has not used nicotine products (including but not limited to cigarettes, cigars, pipes, chewing tobacco, snuff, alternative nicotine delivery devices such as nicotine gum or lozenges, patches, e-cigarettes, or any device used to vaporize liquid nicotine) for at least 24 months.",
    cigarException: null,
    marijuana: "Not addressed in the Eagle Select guides — review under the health questions and third-party data."
  },
  build: {
    /* Single range (minimum-maximum) per height. Below the minimum or above
       the maximum — not eligible. */
    chart: {
      56: { min: 79, pp: 189, p: 189, sp: 189, stdCredit: 189, std: 189 },
      57: { min: 81, pp: 196, p: 196, sp: 196, stdCredit: 196, std: 196 },
      58: { min: 84, pp: 203, p: 203, sp: 203, stdCredit: 203, std: 203 },
      59: { min: 87, pp: 210, p: 210, sp: 210, stdCredit: 210, std: 210 },
      60: { min: 90, pp: 217, p: 217, sp: 217, stdCredit: 217, std: 217 },
      61: { min: 93, pp: 224, p: 224, sp: 224, stdCredit: 224, std: 224 },
      62: { min: 96, pp: 232, p: 232, sp: 232, stdCredit: 232, std: 232 },
      63: { min: 99, pp: 239, p: 239, sp: 239, stdCredit: 239, std: 239 },
      64: { min: 102, pp: 247, p: 247, sp: 247, stdCredit: 247, std: 247 },
      65: { min: 106, pp: 255, p: 255, sp: 255, stdCredit: 255, std: 255 },
      66: { min: 109, pp: 263, p: 263, sp: 263, stdCredit: 263, std: 263 },
      67: { min: 112, pp: 271, p: 271, sp: 271, stdCredit: 271, std: 271 },
      68: { min: 116, pp: 279, p: 279, sp: 279, stdCredit: 279, std: 279 },
      69: { min: 119, pp: 287, p: 287, sp: 287, stdCredit: 287, std: 287 },
      70: { min: 122, pp: 296, p: 296, sp: 296, stdCredit: 296, std: 296 },
      71: { min: 126, pp: 304, p: 304, sp: 304, stdCredit: 304, std: 304 },
      72: { min: 130, pp: 313, p: 313, sp: 313, stdCredit: 313, std: 313 },
      73: { min: 133, pp: 322, p: 322, sp: 322, stdCredit: 322, std: 322 },
      74: { min: 137, pp: 331, p: 331, sp: 331, stdCredit: 331, std: 331 },
      75: { min: 141, pp: 340, p: 340, sp: 340, stdCredit: 340, std: 340 },
      76: { min: 144, pp: 349, p: 349, sp: 349, stdCredit: 349, std: 349 },
      77: { min: 148, pp: 358, p: 358, sp: 358, stdCredit: 358, std: 358 },
      78: { min: 152, pp: 367, p: 367, sp: 367, stdCredit: 367, std: 367 },
      79: { min: 156, pp: 377, p: 377, sp: 377, stdCredit: 377, std: 377 }
    },
    rules: {
      minHeightIn: 56,
      maxHeightIn: 79,
      belowChartMin: 0,
      applyWeightLossAdjustment: false,
      belowChartDecline: true,
      noPreferredPlus: true,
      noStandardPlus: false,
      noTables: true,
      halfInchRounding: "Half-inch measurements round up to the next inch.",
      weightLossAdjustment: "No weight-loss adjustment is published — current height/weight per the chart.",
      lowBuildReview: "Below the chart minimum for height — not eligible.",
      aboveStandard: "Above the chart maximum for height — not eligible.",
      note: "Eagle Select build: a single acceptable range (minimum-maximum) per height. Within the range the tier is set by the health questions; outside the range the applicant is not eligible."
    }
  },
  bp: {
    preferred_plus: { sys: 160, dia: 100 },
    preferred: { sys: 170, dia: 105 },
    standard_plus: null,
    standard: { sys: 180, dia: 110 }
  },
  bpTreatmentNote: "Eagle Select final expense is underwritten from the health questions plus third-party data — BP readings are not a published input. Bands above are generous placeholders so readings never override the health-question tiering.",
  cholesterol: {
    total: { preferred_plus: 320, preferred: 340, standard: 360 },
    ratio: { preferred_plus: 8, preferred: 9, standard: 10 },
    note: "Cholesterol is not a published input for Eagle Select — thresholds above are generous placeholders."
  },
  driving: {
    preferred_plus: { maxViolations3yr: 99, cleanYears: 0, note: "Driving history is not a published Eagle Select input — the health questions and third-party data drive the offer." },
    preferred: null,
    standard_plus: null,
    standard: null
  },
  drivingDeclineNote: "Driving history is not a published Eagle Select input.",
  /* Eagle Select is an instant-decision health-question product — the agent
     guides publish no occupation/avocation lane. Hazardous activities are
     not screened by the published questions; conservative Standard ceiling
     until underwriting/third-party data confirms. */
  avocationNoLaneText: "Hazardous occupation/avocation disclosed — the Eagle Select agent guides publish no occupation/avocation lane (instant-decision, health-question-driven product); conservative Standard ceiling until third-party data and underwriting confirm.",
  familyHistory: {
    mapping: { none: "preferred_plus", parent: "preferred_plus", parent_sibling: "preferred_plus", multiple: "preferred_plus" },
    preferred_plus: { text: "Family history is not a published Eagle Select input (Huntington's disease is a knock-out condition — verify explicitly)." }
  },
  diabetes: { type1Ceiling: "standard", type2Ceiling: "standard", complicationsCeiling: "standard", juvenileOnsetDeclineAge: 0, a1cDeclineMin: 10, note: "Eagle Select tiering: a single complication associated with a diabetes diagnosis → Eagle Select 2; smoking with diabetes → Eagle Select 2 Smoker; diabetes is not a knock-out condition on its own." },
  medicalCeilings: [
    { id: "hiv", name: "HIV / AIDS", decline: "HIV/AIDS is not listed among the Eagle Select knock-out conditions — verify with the health questions and third-party data." },
    { id: "dementia", name: "Alzheimer's / dementia", decline: "Alzheimer's or dementia — knock-out condition." },
    { id: "multiple_sclerosis", name: "Multiple sclerosis", decline: "Multiple sclerosis — knock-out condition." },
    { id: "parkinsons", name: "Parkinson's disease", decline: "Parkinson's disease — knock-out condition." },
    { id: "liver_disease", name: "Liver disease", decline: "Liver disease — knock-out condition." },
    { id: "transplant", name: "Organ/tissue transplant", decline: "Organ or tissue transplant — knock-out condition." },
    { id: "paralysis", name: "Paralysis / amputation due to disease", decline: "Amputation due to disease — knock-out condition." },
    { id: "lupus", name: "Systemic lupus", decline: "Systemic lupus — knock-out condition." },
    { id: "other_cancer", name: "Cancer", ceilings: [{ klass: "decline" }], decline: "Leukemia and brain tumors are knock-out conditions; other cancers are assessed by the health questions and third-party data (the published list is not exhaustive — treat any cancer history as a decline screen)." },
    { id: "skin_cancer", name: "Skin cancer", ceilings: [{ klass: "standard" }] },
    { id: "heart_disease", name: "Heart disease", ceilings: [{ klass: "standard" }], decline: "Heart disease with nicotine use — best available class is Eagle Select 2 Nicotine (declines Eagle Select 1)." },
    { id: "cad", name: "Coronary artery disease", ceilings: [{ klass: "standard" }] },
    { id: "stroke", name: "Stroke / TIA", ceilings: [{ klass: "standard" }], decline: "Stroke or TIA with nicotine use — declines Eagle Select 1; best class is Eagle Select 2 Nicotine." },
    { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard" }] },
    { id: "copd", name: "COPD / respiratory disease", ceilings: [{ klass: "standard" }], decline: "Respiratory condition with nicotine use — best available class is Eagle Select 2 Nicotine." },
    { id: "asthma", name: "Asthma", ceilings: [{ klass: "standard" }] },
    { id: "kidney_disease", name: "Kidney disease", ceilings: [{ klass: "standard" }] }
  ],
  conditionModels: {
    other_cancer: { declineWithinYears: 999, waitYears: 0, afterCeiling: "decline" }
  },
  autoDeclineIds: ["dementia", "multiple_sclerosis", "parkinsons", "liver_disease", "transplant", "lupus"],
  declineTriggers: [
    { id: "transplant", text: "Organ or tissue transplant — Eagle Select knock-out", reason: "Eagle Select knock-out conditions." },
    { id: "dementia", text: "Alzheimer's or dementia — Eagle Select knock-out", reason: "Eagle Select knock-out conditions." },
    { id: "es_pending", text: "Pending tests/surgery/hospitalization or awaiting diagnosis — declinable within the last 12 months", reason: "Eagle Select 12-month declinable list." },
    { id: "facility_care", text: "Hospice, nursing facility, or home health care — declinable within the last 12 months", reason: "Eagle Select 12-month declinable list." },
    { id: "adl_dependence", text: "Assistance with ADLs (bathing, toileting, dressing) due to a debilitating disease or bed-bound — declinable", reason: "Eagle Select 12-month declinable list." },
    { id: "wheelchair", text: "Dependence on a wheelchair or motorized mobility device — declinable", reason: "Eagle Select 12-month declinable list." },
    { id: "oxygen_use", text: "Supplemental oxygen use — declinable", reason: "Eagle Select 12-month declinable list." }
  ],
  postponeTriggers: [],
  evidence: {
    apsAge: 200,
    genericGrid: false,
    apsConditions: [
      "Organ/tissue transplant", "Multiple sclerosis", "Systemic lupus", "ALS", "Alzheimer's or dementia", "Huntington's disease",
      "Brain tumor", "Parkinson's disease", "Amputation due to disease", "Liver disease", "Leukemia", "Heart disease", "Diabetes", "Stroke or TIA", "Peripheral vascular disease", "Respiratory disease"
    ],
    amountRules: [
      { ageMin: 40, ageMax: 200, amountMin: 5000, items: ["100% instant-decision eApplication: MIB, prescription history, medical information, and other third-party services; decision in minutes."] }
    ],
    acceleratedUw: { ageMin: 40, ageMax: 85, amountMin: 5000, amountMax: 40000, note: "The eApplication generates the offer (Eagle Select 1 / 2 / 3 or decline) at point of sale using third-party data; additional underwriting questions may follow the initial answers." },
    note: "Eagle Select is underwritten from the streamlined electronic application: the health questions plus MIB, prescriptions, medical information, and other third-party services generate a preliminary decision in minutes. The offer is Eagle Select 1, Eagle Select 2, Eagle Select 3, or decline. The Quit Smoking Advantage provides non-nicotine rates for the first three policy years for smokers. The published knock-out list is not exhaustive; combinations of conditions can result in worse than listed decisions.",
    temporaryCoverage: "Temporary or conditional coverage exists only under the exact terms of the conditional receipt — never because the app gives a favorable estimate."
  },
  financial: {
    incomeMultipliers: [],
    note: "Face amounts: $5,000-$40,000 (Eagle Select 1 & 2), $5,000-$25,000 (Eagle Select 3). No income-multiplier schedule is published for this final-expense product.",
    maxFace: 40000
  },
  credit: null,
  classInfo: {
    preferred_plus: { name: "Eagle Select 1", meaning: "No Preferred Plus is published — Eagle Select 1 is the best tier (level death benefit).", color: "#0e7a5f" },
    preferred: { name: "Eagle Select 1", meaning: "The best Eagle Select tier (level death benefit), offered when no knock-out conditions apply and build is within the chart.", color: "#0e7a5f" },
    standard_plus: { name: "Eagle Select 2", meaning: "Middle tier — offered when heart disease, diabetes, stroke/TIA, or peripheral vascular disease is present (with or without nicotine per the tier logic), or with nicotine use.", color: "#3b82b0" },
    standard: { name: "Eagle Select 2 / 3", meaning: "Health-question tiering sets the exact product: Eagle Select 2 (heart disease, diabetes, stroke/TIA, peripheral vascular disease, respiratory disease, or nicotine use) or Eagle Select 3 (graded benefit — years 1-2 pay premiums plus interest; year 3+ pays full face amount).", color: "#4a6fa5" },
    table: { name: "Not offered", meaning: "Eagle Select offers no table ratings — the offer is Eagle Select 1 / 2 / 3 or decline.", color: "#b8860b" },
    postpone: { name: "Postpone / pre-review", meaning: "Pending tests, surgery, or hospitalization (not yet completed) or awaiting diagnosis — declinable within the last 12 months; reapply once resolved.", color: "#8a5fb8" },
    decline: { name: "Declined", meaning: "On the Eagle Select knock-out list (transplant, MS, systemic lupus, ALS, Alzheimer's/dementia, Huntington's, brain tumor, Parkinson's, amputation due to disease, liver disease, leukemia) or a 12-month declinable (ADL assistance, hospice, oxygen, wheelchair dependence, pending care).", color: "#b3364a" }
  }
};

/* ======================================================================
 * QUILITY TERM PLUS — Legal & General America (simplified term)
 * Source: "Quility Term Plus Underwriting Guide" (effective 11/2024)
 * Products issued by Banner Life Insurance Company / William Penn (NY)
 * ==================================================================== */
CARRIER_RULES.quility = {
  id: "quility",
  name: "Quility Term Plus (LGA)",
  company: "Legal & General America — issued by Banner Life Insurance Company, Urbana, MD (William Penn in NY; QTP not available in NY)",
  guide: {
    title: "Quility Term Plus Underwriting Guide",
    version: "Effective 11/2024",
    note: "Simplified term from Legal & General America, designed for instant decisions (~70% of applicants) with 20% APS-free decisions within 24 hours. QTP offers Preferred Plus / Preferred / Standard Plus / Standard — no table ratings; risks above Standard are declined. Half of intentional weight loss over the last 12 months may be added to the current build to determine the final rate class. Two-year contestability and suicide provisions apply. The guide's accepted-condition list assumes standard or better rate class."
  },
  eligibility: {
    products: "Quility Term Plus (term; policy form ICC23-DTCV1)",
    issueAges: "Not published in the QTP underwriting guide — Banner Life (issuing company) standards apply",
    faceRange: "Not published in the guide — see the Banner-issued policy forms",
    residency: "Not available in New York (Banner Life products are not authorized in NY; William Penn is exclusive to NY)",
    notes: [
      "No table ratings — a risk above Standard is declined, not table-rated.",
      "Accepted (standard or better): rheumatoid arthritis (no steroids/methotrexate/immunosuppressants, age >30, no surgery or hospitalizations in 2 years), ulcerative colitis (>6 months, no complications), basal/squamous cell skin cancer (single, localized, follow-up complete), asthma (up to 1 medication, no steroids in the past year), atrial fibrillation (testing complete, ablation only), sleep apnea (no oxygen), aviation (major airline pilots US/Canada, or with an Aviation Exclusion Rider), scuba (up to 100 feet certified open water), marijuana (non-tobacco rates; no recent synthetic use), military reserves (no special forces), anxiety/depression/PTSD (up to 1 medication, well controlled, no hospitalization or suicide history), diabetes (non-insulin, A1c < 8, no complications, diagnosed over 40, 6 months to 5 years ago, follow-up in 2 years), hyperlipidemia (2 or fewer medications), hypertension (2 or fewer medications, no hospitalizations, normal BP in 2 years), MS (relapsing/remitting <3 episodes/year, diagnosed ≤35, current age <40 or >60, no Tysabri), seizures (none in 5 years, no hospitalization in 5 years), hypothyroidism (controlled).",
      "Declinable: any cancer in the last 10 years / current / recurrence or metastasis ever (exception: non-melanoma skin cancers); any liver or pancreatic disease; polycystic kidney disease; transplant recipients; kidney stones or any history of kidney failure; cystic fibrosis; any pending procedure or test; HIV/AIDS ever; bipolar disorder; any personality disorder; suicide attempt/ideation/self-harm in the last 10 years (or multiple attempts ever); psych hospitalization within 5 years or 3+ medications; substance abuse or treatment in the last 10 years (or polysubstance abuse ever); chronic pain on disability; history of aneurysm, hemophilia, Factor V Leiden with clot/anticoagulation/under 40, sickle cell with symptoms, ITP not stable; any history of peripheral vascular disease, congenital heart disorder, stroke/TIA (TIA consideration after 4 years), pulmonary fibrosis, pulmonary hypertension, coronary artery disease or angioplasty, cardiomyopathy, heart valve replacement, pacemaker or defibrillator implant; a-fib episode/treatment within 2 years or any procedure other than ablation; COPD with more than minimal symptoms; neurological disease (Parkinson's, ALS, Alzheimer's, dementia) ever; seizures diagnosed within 3 months or investigation not completed; diabetes diagnosed within 6 months, without follow-up in 24 months, under age 40, with complications, or uncontrolled (A1c); gastric bypass contemplated or completed within 6 months; BMI less than 18 or over 43."
    ],
    charts: [
      { product: "Quility Term Plus", ages: "Per Banner-issued product (not published in the QTP guide)", face: "Per policy form" }
    ],
    chartNote: "Four-column build chart (Preferred Plus / Preferred / Standard Plus / Standard) with minimum weights. Above the Standard maximum, or BMI under 18 — not eligible (no table ratings)."
  },
  nicotine: {
    classes: [
      { klass: "preferred", lookbackMonths: 24, label: "Non-tobacco (24-month lookback per the issuing company's standards)" },
      { klass: "standard", lookbackMonths: 12, label: "Non-tobacco (12-month lookback)" }
    ],
    tobaccoLookbackMonths: 12,
    tobaccoDefinition: "The QTP guide publishes no explicit tobacco lookback — Banner Life (issuing company) standards apply: 12 months for the tobacco class, with preferred non-tobacco classes at 24+ months. Marijuana use is rated at non-tobacco rates, with the rate class based on frequency and type (CBD, synthetic, oil-based vs. dry vaping); recent synthetic marijuana use is declined.",
    cigarException: null,
    marijuana: "Non-tobacco rates; rate class based on frequency and type (such as CBD, synthetic, oil-based vs. dry vaping etc.). No recent synthetic marijuana use."
  },
  build: {
    chart: {
      58: { min: 89, pp: 134, p: 155, sp: 196, stdCredit: 205, std: 205 },
      59: { min: 92, pp: 139, p: 160, sp: 203, stdCredit: 212, std: 212 },
      60: { min: 95, pp: 144, p: 166, sp: 209, stdCredit: 220, std: 220 },
      61: { min: 98, pp: 149, p: 171, sp: 216, stdCredit: 227, std: 227 },
      62: { min: 101, pp: 153, p: 177, sp: 224, stdCredit: 235, std: 235 },
      63: { min: 104, pp: 158, p: 183, sp: 231, stdCredit: 242, std: 242 },
      64: { min: 108, pp: 164, p: 188, sp: 238, stdCredit: 250, std: 250 },
      65: { min: 111, pp: 169, p: 194, sp: 246, stdCredit: 258, std: 258 },
      66: { min: 115, pp: 174, p: 200, sp: 253, stdCredit: 266, std: 266 },
      67: { min: 118, pp: 179, p: 207, sp: 261, stdCredit: 274, std: 274 },
      68: { min: 122, pp: 185, p: 213, sp: 269, stdCredit: 282, std: 282 },
      69: { min: 125, pp: 190, p: 219, sp: 277, stdCredit: 291, std: 291 },
      70: { min: 129, pp: 196, p: 225, sp: 285, stdCredit: 299, std: 299 },
      71: { min: 133, pp: 201, p: 232, sp: 293, stdCredit: 308, std: 308 },
      72: { min: 136, pp: 207, p: 239, sp: 302, stdCredit: 317, std: 317 },
      73: { min: 140, pp: 213, p: 245, sp: 310, stdCredit: 325, std: 325 },
      74: { min: 144, pp: 219, p: 252, sp: 319, stdCredit: 334, std: 334 },
      75: { min: 148, pp: 225, p: 259, sp: 327, stdCredit: 344, std: 344 },
      76: { min: 152, pp: 231, p: 266, sp: 336, stdCredit: 353, std: 353 },
      77: { min: 156, pp: 237, p: 273, sp: 345, stdCredit: 362, std: 362 },
      78: { min: 160, pp: 243, p: 280, sp: 354, stdCredit: 372, std: 372 },
      79: { min: 164, pp: 249, p: 287, sp: 363, stdCredit: 381, std: 381 },
      80: { min: 168, pp: 256, p: 295, sp: 372, stdCredit: 391, std: 391 },
      81: { min: 173, pp: 262, p: 302, sp: 382, stdCredit: 401, std: 401 },
      82: { min: 177, pp: 268, p: 309, sp: 391, stdCredit: 411, std: 411 },
      83: { min: 181, pp: 275, p: 317, sp: 401, stdCredit: 421, std: 421 }
    },
    rules: {
      minHeightIn: 58,
      maxHeightIn: 83,
      belowChartMin: 18,
      applyWeightLossAdjustment: true,
      belowChartDecline: true,
      noTables: true,
      halfInchRounding: "Half-inch measurements round up to the next inch.",
      weightLossAdjustment: "Half of intentional weight loss (diet, exercise, or medication) over the last 12 months may be added to the current build to determine the final rate class (e.g., a 5'8\" client who lost 40 lb and now weighs 185 lb may be underwritten at 205 lb).",
      lowBuildReview: "BMI less than 18 — declinable.",
      aboveStandard: "Above the Standard maximum — not eligible (QTP offers no table ratings).",
      note: "QTP build chart: Preferred Plus / Preferred / Standard Plus / Standard maximums by height. No table ratings — risks above Standard are declined. BMI less than 18 or over 43 is declinable."
    }
  },
  bp: {
    preferred_plus: { sys: 140, dia: 90 },
    preferred: { sys: 150, dia: 90 },
    standard_plus: null,
    standard: { sys: 160, dia: 95 }
  },
  bpTreatmentNote: "Accepted: hypertension with 2 or fewer medications, no hospitalizations, and normal blood pressure in the past 2 years. No numeric limits are published — thresholds above are conservative placeholders for guidance only.",

  /* ---- Hazardous occupation / avocation (p. 4-5 Accepted conditions) ----
     QTP publishes two avocation acceptances: aviation (major airline pilots
     flying in the US and Canada, or with an Aviation Exclusion Rider) and
     certified recreational scuba to 100 feet (no wreck/salvage/ice/cave
     diving). Both assume standard or better — QTP offers no table ratings.
     Anything off the accepted list is not published and is capped
     conservatively at Standard pending review. */
  avocation: {
    classCap: "standard",
    currentHazardousText: "Hazardous occupation/avocation disclosed — Quility's accepted-conditions list covers aviation (major airline pilots flying in the US and Canada, or with an Aviation Exclusion Rider) and certified recreational scuba to 100 feet; other hazardous avocations are not published — conservative Standard ceiling until underwriting confirms.",
    cleanText: "No hazardous occupation or avocation disclosed."
  },
  cholesterol: {
    total: { preferred_plus: 260, preferred: 280, standard: 300 },
    ratio: { preferred_plus: 6, preferred: 6.5, standard: 8 },
    note: "Accepted: hyperlipidemia with 2 or fewer medications and favorable cholesterol/ratio values. No numeric limits are published — thresholds above are conservative placeholders for guidance only."
  },
  driving: {
    preferred_plus: { maxViolations3yr: 4, cleanYears: 3, note: "No more than 4 moving violations in the past 3 years; no DWI/DUI or reckless/negligent driving; no license revocation or suspension in the past 3 years." },
    preferred: null,
    standard_plus: null,
    standard: null
  },
  drivingDeclineNote: "Declinable: more than 4 moving violations within 3 years; multiple DUI/DWIs within 10 years; any DUI/DWI, reckless/negligent driving, or license revocation/suspension within 2 years.",
  familyHistory: {
    mapping: { none: "preferred_plus", parent: "preferred_plus", parent_sibling: "preferred_plus", multiple: "preferred_plus" },
    preferred_plus: { text: "Family history is not a QTP input (the declinable list does not include family history)." }
  },
  diabetes: { type1Ceiling: "standard", type2Ceiling: "standard", a1cDeclineMin: 8, juvenileOnsetDeclineAge: 40, note: "Accepted: non-insulin diabetes with good blood-sugar control (A1c less than 8), no complications, diagnosed over age 40, diagnosed more than 6 months and less than 5 years ago, with doctor follow-up in the past 2 years. Declinable: diagnosed within 6 months, no follow-up in 24 months, under age 40, complications, or uncontrolled blood sugar/A1c." },
  medicalCeilings: [
    { id: "hiv", name: "HIV / AIDS", decline: "History of HIV/AIDS (ever) — declinable." },
    { id: "dementia", name: "Alzheimer's / dementia", decline: "Neurological disease (Parkinson's, ALS, Alzheimer's, dementia) ever — declinable." },
    { id: "parkinsons", name: "Parkinson's disease", decline: "Neurological disease (Parkinson's, ALS, Alzheimer's, dementia) ever — declinable." },
    { id: "multiple_sclerosis", name: "Multiple sclerosis", ceilings: [{ klass: "standard" }], decline: "MS accepted only with relapsing/remitting course, less than 3 episodes per year, diagnosed at age 35 or less, current age under 40 or over 60, and no Tysabri use." },
    { id: "copd", name: "COPD", decline: "COPD with more than minimal/occasional symptoms, requiring oxygen, disabled, hospitalized, or with tobacco use — declinable." },
    { id: "kidney_disease", name: "Kidney disease", decline: "Any polycystic kidney disease, kidney stones, or any history of kidney failure — declinable." },
    { id: "liver_disease", name: "Liver / pancreatic disease", decline: "Any liver or pancreatic disease (acute pancreatitis may be considered if the occurrence was more than 1 year ago) — declinable." },
    { id: "transplant", name: "Transplant recipient", decline: "Transplant recipients — declinable." },
    { id: "heart_disease", name: "Heart disease", decline: "Any history of coronary artery disease or angioplasty, cardiomyopathy, heart valve replacement, pacemaker or defibrillator implant — declinable." },
    { id: "cad", name: "Coronary artery disease", decline: "Any history of coronary artery disease or angioplasty — declinable." },
    { id: "stroke", name: "Stroke / TIA", decline: "Any history of stroke; TIA considered after 4 years — declinable." },
    { id: "seizures", name: "Seizures / epilepsy", ceilings: [{ klass: "standard" }], decline: "Seizures diagnosed within 3 months, or full investigation not completed — declinable." },
    { id: "bipolar", name: "Bipolar disorder", decline: "Any bipolar disorder — declinable." },
    { id: "schizophrenia", name: "Schizophrenia", decline: "Psych conditions with hospitalization within 5 years, multiple hospitalizations, 3 or more medications, or inability to work — declinable." },
    { id: "substance_treatment", name: "Substance abuse", decline: "Any substance abuse or treatment in the last 10 years; any history of polysubstance abuse or relapse (ever) — declinable." },
    { id: "other_cancer", name: "Cancer", ceilings: [{ klass: "decline" }], decline: "Any cancer in the last 10 years, current treatment, or history of recurrence or metastasis (ever) — declinable. Exception: non-melanoma skin cancers." },
    { id: "skin_cancer", name: "Non-melanoma skin cancer", ceilings: [{ klass: "preferred" }], decline: "Basal and squamous cell skin cancers are the exception to the 10-year cancer rule — single occurrence, localized, follow-up complete." },
    { id: "asthma", name: "Asthma", ceilings: [{ klass: "preferred" }] },
    { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard" }], decline: "Diabetes diagnosed within 6 months, without physician follow-up in the last 24 months, under age 40, with complications, or with uncontrolled blood sugar or A1c (8+) — declinable." },
    { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "preferred_plus" }], decline: "Anxiety: no history of hospitalization, suicide attempts, or substance abuse; up to 1 medication; well controlled for at least 6 months; no anti-psychotic medications." },
    { id: "depression", name: "Depression", ceilings: [{ klass: "preferred_plus" }], decline: "Depression: up to 1 medication, no other mental/nervous condition, no substance abuse, no suicide attempts, no hospitalization, employed/no time off work." },
    { id: "sleep_apnea", name: "Sleep apnea", ceilings: [{ klass: "preferred" }], decline: "Sleep apnea with daily symptoms, non-compliance with treatment, or oxygen use — declinable." },
    { id: "lupus", name: "Lupus", decline: "Any systemic lupus — declinable." },
    { id: "peripheral_vascular", name: "Peripheral vascular disease", decline: "Any history of peripheral vascular disease — declinable." },
    { id: "ptsd", name: "Post-traumatic stress disorder (PTSD)", ceilings: [{ klass: "preferred_plus" }], decline: "PTSD accepted only with no history of self-harm or suicide attempt and no alcohol use — otherwise declinable." },
    { id: "major_depression", name: "Major depressive disorder", ceilings: [{ klass: "preferred_plus" }], decline: "Major depression: up to 1 medication, no other mental/nervous condition, no substance abuse, no suicide attempts, no hospitalization, employed/no time off work." },
    { id: "migraine", name: "Migraine / headache", ceilings: [{ klass: "preferred" }], decline: "Migraine with full evaluation completed; not investigated or severe — declinable." },
    { id: "hypothyroidism", name: "Hypothyroidism", ceilings: [{ klass: "preferred" }], decline: "Hypothyroidism accepted when controlled, diagnosed more than 6 months ago, no complications." },
    { id: "hypogonadism", name: "Hypogonadism / low testosterone", ceilings: [{ klass: "preferred_plus" }] },
    { id: "erectile_dysfunction", name: "Erectile dysfunction", ceilings: [{ klass: "preferred_plus" }] },
    { id: "chronic_fatigue", name: "Chronic fatigue syndrome", ceilings: [{ klass: "standard" }] },
    { id: "rem_sleep_disorder", name: "REM sleep behavior disorder", ceilings: [{ klass: "standard" }] },
    { id: "pacemaker_icd", name: "Cardiac pacemaker / ICD", decline: "Any heart valve replacement, pacemaker, or defibrillator implant — declinable." },
    { id: "heart_valve_prosthesis", name: "Heart valve prosthesis", decline: "Any heart valve replacement — declinable." },
    { id: "intracranial_aneurysm_clip", name: "Intracranial aneurysm clip", ceilings: [{ klass: "standard" }] },
    { id: "vp_shunt", name: "VP / CSF shunt", ceilings: [{ klass: "standard" }] },
    { id: "neurostimulator", name: "Neurostimulator", ceilings: [{ klass: "standard" }] },
    { id: "cochlear_implant", name: "Cochlear implant", ceilings: [{ klass: "standard" }] },
    { id: "drug_infusion_pump", name: "Drug infusion pump", ceilings: [{ klass: "standard" }] },
    { id: "ocular_monitoring", name: "Ocular monitoring system", ceilings: [{ klass: "standard" }] }
  ],
  conditionModels: {
    other_cancer: { declineWithinYears: 10, waitYears: 0, afterCeiling: "decline" }
  },
  autoDeclineIds: ["hiv", "dementia", "parkinsons", "copd", "kidney_disease", "liver_disease", "transplant", "heart_disease", "cad", "stroke", "bipolar", "schizophrenia", "substance_treatment", "lupus", "peripheral_vascular"],
  declineTriggers: [
    { id: "criminal_active", text: "History of felony, currently on probation/parole, outstanding fines/restitution, in jail, or awaiting trial — declinable", reason: "QTP declinable non-medical conditions." },
    { id: "driving_dui_recent", text: "DUI/DWI, reckless/negligent driving, or license revocation/suspension within 2 years — declinable", reason: "QTP declinable non-medical conditions." },
    { id: "q_gastric", text: "Gastric bypass or banding contemplated or completed within 6 months — declinable", reason: "QTP declinable non-medical conditions." },
    { id: "pending_test", text: "Any pending procedure or test (recommended by a medical professional) not yet completed, including a pending diagnosis under observation or investigation — declinable", reason: "QTP declinable medical conditions." }
  ],
  postponeTriggers: [],
  evidence: {
    apsAge: 60,
    genericGrid: false,
    apsConditions: [
      "Cancer", "Diabetes", "Coronary artery disease", "Stroke", "COPD", "Liver or pancreatic disease", "Kidney disease", "HIV/AIDS",
      "Multiple sclerosis", "Bipolar disorder", "Substance abuse", "Peripheral vascular disease", "Neurological disease", "Seizures"
    ],
    amountRules: [],
    acceleratedUw: { ageMin: 20, ageMax: 200, amountMin: 0, amountMax: 500000, note: "Designed for instant decisions on about 70% of applicants and 20% APS-free decisions within 24 hours." },
    note: "QTP is a faster, more transactional product: instant decisions for ~70% of applicants, 20% APS-free within 24 hours. Underwritten and issued by Banner Life Insurance Company (William Penn in NY; QTP not available in NY). Two-year contestability and suicide provisions apply. Allowable payors: the proposed insured, spouse, or fiancé; owners can include the insured, spouse, parent/grandparent (full-time student, coverage under $100,000), or fiancé/domestic partner with shared expenses; beneficiaries include parents, spouse/ex-spouse, fiancé, domestic partner, child, sibling, niece/nephew, and estate.",
    temporaryCoverage: "Temporary or conditional coverage exists only under the exact terms of the conditional receipt — never because the app gives a favorable estimate."
  },
  financial: {
    incomeMultipliers: [],
    note: "No income-multiplier schedule is published in the QTP guide — financial justification follows the Banner-issued policy requirements.",
    maxFace: 500000
  },
  credit: null,
  classInfo: {
    preferred_plus: { name: "Preferred Plus", meaning: "Best QTP class — within the Preferred Plus build column and meeting the accepted-condition criteria at standard or better.", color: "#0e7a5f" },
    preferred: { name: "Preferred", meaning: "Favorable risk within the Preferred build column.", color: "#1b9a7a" },
    standard_plus: { name: "Standard Plus", meaning: "Near-standard risk within the Standard Plus build column.", color: "#3b82b0" },
    standard: { name: "Standard", meaning: "Average risk within the Standard build column — the maximum class offered. Risks above Standard are declined (no table ratings).", color: "#4a6fa5" },
    table: { name: "Not offered", meaning: "QTP offers no table ratings — a risk above Standard is declined, not table-rated.", color: "#b8860b" },
    postpone: { name: "Postpone / pre-review", meaning: "Pending procedure or test not yet completed, or a diagnosis under observation — declinable until resolved.", color: "#8a5fb8" },
    decline: { name: "Declined", meaning: "On the QTP declinable list (any cancer in 10 years, HIV, liver/pancreatic disease, CAD/angioplasty, stroke, bipolar, substance abuse in 10 years, felony/probation, BMI under 18 or over 43, more than 4 violations, DUI within 2 years, etc.).", color: "#b3364a" }
  }
};

/* ======================================================================
 * COREBRIDGE — SimpliNow Legacy SIWL (+ American General GIWL lane)
 * Source: "SimpliNow Legacy Simplified Issue Whole Life Underwriting
 * Guide" AGLC201453 (04/24); GIWL Agent Guide AGLC200472 (12/24)
 * ==================================================================== */
CARRIER_RULES.corebridge = {
  id: "corebridge",
  name: "Corebridge (AGL)",
  company: "American General Life Insurance Company (AGL), Houston, TX — a Corebridge Financial company",
  guide: {
    title: "SimpliNow Legacy Simplified Issue Whole Life Underwriting Guide + GIWL Agent Guide",
    version: "AGLC201453 REV0424 · AGLC200472 REV1224",
    note: "SimpliNow Legacy is a simplified-issue whole life final-expense product (instant underwriting decisions, no underwriters) for applicants ages 50-80. The underwriting guidelines table assigns Level / Graded / Decline decisions by condition and time frame. Two death benefit designs: SimpliNow Legacy Max (level) and SimpliNow Legacy (graded — 110% of premiums paid in years 1-2, full face after two years). American General also offers Guaranteed Issue Whole Life (GIWL, ages 50-80, $5,000-$25,000, no health questions, graded benefit years 1-2) as a separate lane. Not available to foreign nationals or non-resident aliens — US citizens and green card holders only. Not available in NY."
  },
  eligibility: {
    products: "SimpliNow Legacy / SimpliNow Legacy Max simplified issue whole life; American General GIWL (guaranteed issue) is a separate lane",
    issueAges: "50-80 (SimpliNow Legacy and GIWL)",
    minIssueAge: 50,
    maxIssueAge: 80,
    faceRange: "Per policy form (GIWL: $5,000-$25,000; total GIWL per person capped at $25,000, one policy per 12-month period)",
    residency: "US citizens and green card holders only; foreign nationals and non-resident aliens are not eligible; not available in NY",
    notes: [
      "Level benefit (SimpliNow Legacy Max): full death benefit in all years. Graded benefit (SimpliNow Legacy): 110% of premiums paid in years 1-2, full face after two years.",
      "Decline (ever): Alzheimer's/dementia, myelodysplastic syndrome, bone marrow transplant, Huntington's disease, ALS, HIV/AIDS/ARC, advanced or end-stage renal disease or in need of dialysis, liver cirrhosis, mental incapacity, suicide attempt (ever), sickle cell anemia, paraplegia/quadriplegia, organ transplant, metastatic or recurrent cancer (Stage III/IV), declined for life insurance within the last 12 months.",
      "Decline (time frame): most cancers within 24 months (leukemia, liver, lung, lymphoma, ovarian, pancreas, sarcoma, stomach, esophageal, head/neck, multiple myeloma, carcinoid, brain within 24 months); stroke within 12 months; TIA within 6 months; diabetes A1c 10+; hospitalization for diabetes within 24 months; diabetes with prior stroke or coronary disease (ever); narcotics without a prescription within 24 months; driving while impaired within 24 months; felony within 24 months; currently incarcerated.",
      "Graded: multiple sclerosis, Parkinson's, bladder/bone cancer within 48 months, Stage II cancers within 48 months, diabetes A1c 8.7-9.9, COPD (non-tobacco, not hospitalized in 24 months), lupus, bipolar within 48 months, schizophrenia (ever), substance abuse within 24 months, connective tissue disorder, unexplained weight loss within 12 months.",
      "Level: Stage I cancers within 48 months (breast, cervical, colon/rectum/anus, endometrial, kidney/ureter, melanoma, prostate, testicular, thyroid), arthritis within 48 months, diabetes A1c 8.6 or less (not on insulin), angina treated with medication (24 months, non-tobacco), CAD with angioplasty/stenting or bypass (24 months, non-tobacco), heart attack (24 months, non-tobacco), chronic atrial fibrillation on daily blood thinner."
    ],
    charts: [
      { product: "SimpliNow Legacy (graded)", ages: "50-80", face: "Per policy form" },
      { product: "SimpliNow Legacy Max (level)", ages: "50-80", face: "Per policy form" },
      { product: "American General GIWL (guaranteed issue — separate lane)", ages: "50-80", face: "$5,000-$25,000; no health questions" }
    ],
    chartNote: "Build chart (SimpliNow Legacy Max / level column): minimum and maximum weight per height. Outside the range — decline. The knockout questions separately screen a BMI below 22.5 as graded — eligible only for the graded death benefit, not a decline."
  },
  /* SimpliNow Legacy is an instant-decision knockout-question product — no
     occupation/avocation lane is published. Hazardous activities are not
     screened by the knockout list; conservative Standard ceiling. */
  avocationNoLaneText: "Hazardous occupation/avocation disclosed — the SimpliNow Legacy knockout questions publish no occupation/avocation lane (instant-decision product); conservative Standard ceiling pending the instant-decision screen.",
  nicotine: {
    classes: [
      { klass: "preferred", lookbackMonths: 24, label: "Non-Tobacco (24-month window used by the condition table for heart conditions)" }
    ],
    tobaccoLookbackMonths: 24,
    tobaccoDefinition: "The condition table differentiates 'Non-Tobacco' and 'Tobacco' outcomes within the 24-month window (e.g., angina 24 months & non-tobacco → Level; 24 months & tobacco → Graded). Tobacco use within 24 months is therefore treated as the tobacco risk class.",
    cigarException: null,
    marijuana: "Not addressed in the SIWL guide — review under the health questions and prescription data."
  },
  build: {
    /* SimpliNow Legacy Max (level benefit) column — minimum and maximum weight
       per height. Below the minimum or above the maximum — decline. */
    chart: {
      56: { min: 79, pp: 189, p: 189, sp: 189, stdCredit: 189, std: 189 },
      57: { min: 81, pp: 196, p: 196, sp: 196, stdCredit: 196, std: 196 },
      58: { min: 84, pp: 203, p: 203, sp: 203, stdCredit: 203, std: 203 },
      59: { min: 87, pp: 210, p: 210, sp: 210, stdCredit: 210, std: 210 },
      60: { min: 90, pp: 217, p: 217, sp: 217, stdCredit: 217, std: 217 },
      61: { min: 93, pp: 224, p: 224, sp: 224, stdCredit: 224, std: 224 },
      62: { min: 96, pp: 232, p: 232, sp: 232, stdCredit: 232, std: 232 },
      63: { min: 99, pp: 239, p: 239, sp: 239, stdCredit: 239, std: 239 },
      64: { min: 103, pp: 247, p: 247, sp: 247, stdCredit: 247, std: 247 },
      65: { min: 106, pp: 255, p: 255, sp: 255, stdCredit: 255, std: 255 },
      66: { min: 109, pp: 263, p: 263, sp: 263, stdCredit: 263, std: 263 },
      67: { min: 112, pp: 271, p: 271, sp: 271, stdCredit: 271, std: 271 },
      68: { min: 116, pp: 279, p: 279, sp: 279, stdCredit: 279, std: 279 },
      69: { min: 119, pp: 287, p: 287, sp: 287, stdCredit: 287, std: 287 },
      70: { min: 123, pp: 296, p: 296, sp: 296, stdCredit: 296, std: 296 },
      71: { min: 126, pp: 304, p: 304, sp: 304, stdCredit: 304, std: 304 },
      72: { min: 130, pp: 313, p: 313, sp: 313, stdCredit: 313, std: 313 },
      73: { min: 133, pp: 321, p: 321, sp: 321, stdCredit: 321, std: 321 },
      74: { min: 137, pp: 330, p: 330, sp: 330, stdCredit: 330, std: 330 },
      75: { min: 141, pp: 339, p: 339, sp: 339, stdCredit: 339, std: 339 },
      76: { min: 145, pp: 348, p: 348, sp: 348, stdCredit: 348, std: 348 },
      77: { min: 148, pp: 358, p: 358, sp: 358, stdCredit: 358, std: 358 },
      78: { min: 152, pp: 367, p: 367, sp: 367, stdCredit: 367, std: 367 },
      79: { min: 156, pp: 376, p: 376, sp: 376, stdCredit: 376, std: 376 },
      80: { min: 160, pp: 386, p: 386, sp: 386, stdCredit: 386, std: 386 },
      81: { min: 164, pp: 396, p: 396, sp: 396, stdCredit: 396, std: 396 },
      82: { min: 168, pp: 406, p: 406, sp: 406, stdCredit: 406, std: 406 }
    },
    rules: {
      minHeightIn: 56,
      maxHeightIn: 82,
      belowChartMin: 0,
      applyWeightLossAdjustment: false,
      belowChartDecline: true,
      noPreferredPlus: true,
      noStandardPlus: true,
      noTables: true,
      halfInchRounding: "Half-inch measurements round up to the next inch.",
      weightLossAdjustment: "Unexplained weight loss within the last 12 months → Graded decision (not an automatic decline).",
      lowBuildReview: "Below the chart minimum weight for height — not eligible (accept/reject). The SimpliNow Legacy knockout questions separately stipulate that a BMI below 22.5 results in the graded death benefit option, not a decline.",
      aboveStandard: "Above the chart maximum for height — decline.",
      note: "SimpliNow Legacy Max (level benefit) build chart: minimum and maximum weight per height. Outside the range — decline. The graded (SimpliNow Legacy) column is more permissive; the Level column is the best offer. The knockout questions screen lists a BMI below 22.5 as eligible only for the graded death benefit."
    }
  },
  bp: {
    preferred_plus: { sys: 160, dia: 100 },
    preferred: { sys: 170, dia: 105 },
    standard_plus: null,
    standard: { sys: 180, dia: 110 }
  },
  bpTreatmentNote: "SimpliNow Legacy is underwritten from the health questions and prescription data — BP readings are not a published input. Bands above are generous placeholders so readings never override the condition table.",
  cholesterol: {
    total: { preferred_plus: 320, preferred: 340, standard: 360 },
    ratio: { preferred_plus: 8, preferred: 9, standard: 10 },
    note: "Cholesterol is not a published SimpliNow Legacy input — thresholds above are generous placeholders."
  },
  driving: {
    preferred_plus: { maxViolations3yr: 99, cleanYears: 0, note: "Driving history is not a routine input; driving while impaired within 24 months and felony/DUI within 24 months are declines." },
    preferred: null,
    standard_plus: null,
    standard: null
  },
  drivingDeclineNote: "Decline: driving while impaired, intoxicated, or under the influence of drugs or alcohol within the last 24 months; felony, DUI, or arrest within the last 24 months; currently incarcerated in a prison or jail.",
  familyHistory: {
    mapping: { none: "preferred_plus", parent: "preferred_plus", parent_sibling: "preferred_plus", multiple: "preferred_plus" },
    preferred_plus: { text: "Family history is not a SimpliNow Legacy input." }
  },
  diabetes: { type1Ceiling: "standard", type2Ceiling: "standard", a1cDeclineMin: 10, juvenileOnsetDeclineAge: 0, note: "Diabetes A1c 8.6 or less (not on insulin) → Level; A1c 8.7-9.9 → Graded; A1c 10+ → Decline; hospitalization due to diabetes within 24 months → Decline; diabetes with prior stroke or coronary disease (ever) → Decline. Amputation due to diabetic complications (ever) → Decline." },
  medicalCeilings: [
    { id: "hiv", name: "HIV / AIDS", decline: "HIV, AIDS, or ARC — decline (ever)." },
    { id: "dementia", name: "Alzheimer's / dementia", decline: "Alzheimer's or dementia — decline (ever)." },
    { id: "multiple_sclerosis", name: "Multiple sclerosis", decline: "Multiple sclerosis — graded." },
    { id: "parkinsons", name: "Parkinson's disease", decline: "Parkinson's disease — graded." },
    { id: "lupus", name: "Lupus", decline: "Lupus — graded (within 48 months)." },
    { id: "bipolar", name: "Bipolar disorder", decline: "Bipolar (or manic-depressive) disorder — graded (within 48 months)." },
    { id: "schizophrenia", name: "Schizophrenia", decline: "Schizophrenia — graded (ever); hospitalized in the last 36 months — decline." },
    { id: "kidney_disease", name: "Kidney / renal disease", decline: "Advanced or end-stage renal disease or in need of dialysis — decline (ever); chronic kidney disease (including chronic renal insufficiency) — graded (within 48 months)." },
    { id: "liver_disease", name: "Liver disease", decline: "Liver cirrhosis — decline (ever); hepatitis B — graded (ever)." },
    { id: "transplant", name: "Organ transplant", decline: "Organ transplant or bone marrow transplant — decline (ever)." },
    { id: "paralysis", name: "Paralysis", decline: "Paraplegia or quadriplegia — decline (current)." },
    { id: "stroke", name: "Stroke / TIA", decline: "Stroke within 12 months — decline; stroke within 24 months — graded; recurrent episodes of TIA — decline (ever); TIA within 6 months — decline." },
    { id: "heart_disease", name: "Heart disease", decline: "Heart attack within 6 months — decline; within 24 months & non-tobacco — level; 24 months & tobacco — graded. Chronic atrial fibrillation — graded; on daily blood thinner — level." },
    { id: "cad", name: "Coronary artery disease", decline: "CAD with angioplasty/stenting or bypass within 6 months — decline; 24 months & non-tobacco — level; 24 months & tobacco — graded." },
    { id: "copd", name: "COPD / chronic bronchitis", decline: "Hospitalized more than once in the past 24 months — decline; non-tobacco, not hospitalized — graded; tobacco user — decline." },
    { id: "asthma", name: "Asthma", ceilings: [{ klass: "standard", when: "not individually tiered in the guide" }] },
    { id: "other_cancer", name: "Cancer", ceilings: [{ klass: "standard" }], decline: "Most cancers within 24 months — decline; Stage I cancers within 48 months — level; Stage II within 48 months — graded; metastatic or recurrent cancer (Stage III/IV) — decline (ever)." },
    { id: "skin_cancer", name: "Melanoma (skin/mole)", ceilings: [{ klass: "standard" }], decline: "Melanoma Stage I within 48 months — level; Stage II — graded." },
    { id: "substance_treatment", name: "Substance abuse", decline: "Narcotics without a prescription (amphetamines, hallucinogens, heroin, cocaine) within 24 months — decline; substance abuse (alcohol or drugs) within 24 months — graded." },
    { id: "anxiety", name: "Anxiety", ceilings: [{ klass: "standard" }] },
    { id: "depression", name: "Depression", ceilings: [{ klass: "standard" }] },
    { id: "diabetes", name: "Diabetes", ceilings: [{ klass: "standard" }], decline: "Diabetes A1c 10+ — decline; hospitalization due to diabetes within 24 months — decline; diabetes with prior stroke or coronary disease (ever) — decline; amputation due to diabetic complications (ever) — decline." }
  ],
  conditionModels: {
    other_cancer: { declineWithinYears: 2, waitYears: 0, afterCeiling: "standard" }
  },
  autoDeclineIds: ["hiv", "dementia", "transplant", "kidney_disease", "liver_disease", "paralysis"],
  autoDeclineSevereIds: ["schizophrenia", "stroke"],
  declineTriggers: [
    { id: "criminal_active", text: "Felony, DUI, or arrest within the last 24 months, or currently incarcerated — decline", reason: "SimpliNow Legacy condition table." },
    { id: "driving_dui_recent", text: "Driving while impaired, intoxicated, or under the influence of drugs or alcohol within the last 24 months — decline", reason: "SimpliNow Legacy condition table." },
    { id: "cs_pending", text: "Diagnostic testing recommended but not completed — decline", reason: "SimpliNow Legacy condition table (pending care resolves the outcome)." },
    { id: "suicide_multiple", text: "Suicide attempt (ever) — decline", reason: "SimpliNow Legacy condition table." },
    { id: "adl_dependence", text: "Assistance with ADLs due to a chronic or debilitating condition, bedridden, or confined to a skilled nursing/hospital facility — decline", reason: "SimpliNow Legacy condition table." },
    { id: "facility_care", text: "Home health care, hospice, or nursing home (currently or advised) — decline", reason: "SimpliNow Legacy condition table." },
    { id: "wheelchair", text: "Wheelchair or electric scooter dependence due to a debilitating condition — decline", reason: "SimpliNow Legacy condition table." },
    { id: "oxygen_use", text: "Require oxygen (other than for sleep apnea) — decline", reason: "SimpliNow Legacy condition table." },
    { id: "cs_terminal", text: "Terminal illness or expected to die within 12 months — decline", reason: "SimpliNow Legacy condition table." }
  ],
  postponeTriggers: [],
  rxDecline: [
    "clopidogrel", "ticagrelor", "prasugrel", "ranolazine", "isosorbide", "nitroglycerin", "roflumilast",
    "sacubitril", "ivabradine", "eplerenone", "dronabinol", "valbenazine", "treprostinil", "nintedanib",
    "pirfenidone", "pimavanserin", "donepezil", "memantine", "galantamine", "rivastigmine", "buprenorphine",
    "fentanyl", "morphine", "methadone", "disulfiram", "acamprosate", "naltrexone", "dabigatran", "warfarin",
    "apixaban", "rivaroxaban", "digoxin"
  ],
  rxDeclineNote: "Prescription medications that impact the death benefit (from the SimpliNow Legacy guide): Plavix/Brilinta/Effient (CAD, MI, stent, angioplasty, CABG with recent stroke/heart failure, diabetes, or tobacco), Ranexa/Imdur/ISMO/Nitrostat (angina), Daliresp/Trelegy/Breo (COPD with tobacco), Entresto/BiDil/Corlanor/Inspra (heart failure), Marinol, Ingrezza, Tyvaso/Remodulin/Uptravi/Ventavis/Flolan (pulmonary hypertension), Ofev/Esbriet (pulmonary fibrosis), Nuplazid, Aricept/Namenda/Razadyne/Exelon (dementia), Suboxone/fentanyl/morphine/methadone (opioid dependence), Antabuse/Campral/Vivitrol (alcohol), plus prostate-cancer drugs, low-blood-count drugs, cachexia drugs, and CKD drugs. The list is not comprehensive — additional medications or combinations may result in a decline.",
  evidence: {
    apsAge: 200,
    genericGrid: false,
    apsConditions: [
      "Cancer", "Diabetes", "Heart medical history, TIA, or strokes", "Coronary artery disease", "COPD", "Kidney, renal, or dialysis",
      "Liver", "HIV, AIDS, ARC", "Mental illness, suicide attempts, or any mental incapacity", "Organ transplant", "Alzheimer's or dementia"
    ],
    amountRules: [
      { ageMin: 50, ageMax: 200, amountMin: 0, items: ["Instant underwriting decision with no underwriters — electronic application with prescription data and third-party checks."] }
    ],
    acceleratedUw: { ageMin: 50, ageMax: 80, amountMin: 0, amountMax: 50000, note: "Instant decision eApplication; the underwriting guidelines table assigns Level / Graded / Decline per condition and time frame. Final decision is subject to underwriting; combinations of conditions can result in worse than listed decisions." },
    note: "SimpliNow Legacy offers instant underwriting decisions with no underwriters, based on the electronic application and prescription data. The condition table assigns Level / Graded / Decline decisions; the prescription list flags medications that impact the death benefit (most result in decline). GIWL (guaranteed issue, ages 50-80, $5,000-$25,000, no health questions, graded years 1-2) is a separate lane: applicants who cannot pass even the simplified health screen may still qualify for GIWL. Not available to foreign nationals; not available in NY.",
    temporaryCoverage: "Temporary or conditional coverage exists only under the exact terms of the conditional receipt — never because the app gives a favorable estimate."
  },
  financial: {
    incomeMultipliers: [],
    note: "No income-multiplier schedule is published for SimpliNow Legacy. GIWL aggregate: no more than $25,000 total GIWL per person, one policy per 12-month period.",
    maxFace: 50000
  },
  credit: null,
  classInfo: {
    preferred_plus: { name: "Level benefit (SimpliNow Legacy Max)", meaning: "No Preferred Plus is published — the Level benefit is the best offer (full death benefit in all years).", color: "#0e7a5f" },
    preferred: { name: "Level benefit (SimpliNow Legacy Max)", meaning: "Full death benefit in all years — the best SimpliNow Legacy offer, assigned when the condition table returns Level (e.g., Stage I cancers 48 months, diabetes A1c 8.6 or less not on insulin, heart conditions 24 months non-tobacco).", color: "#0e7a5f" },
    standard: { name: "Graded benefit (SimpliNow Legacy)", meaning: "110% of premiums paid in years 1-2, full face amount after two years — assigned when the condition table returns Graded (e.g., MS, Parkinson's, Stage II cancers, diabetes A1c 8.7-9.9, COPD non-tobacco, substance abuse within 24 months).", color: "#4a6fa5" },
    table: { name: "Not offered", meaning: "SimpliNow Legacy offers Level or Graded benefits only — no table ratings.", color: "#b8860b" },
    postpone: { name: "Postpone / pre-review", meaning: "Pending diagnostic testing, awaiting diagnosis, or declined for life insurance within the last 12 months — resolve before applying.", color: "#8a5fb8" },
    decline: { name: "Decline", meaning: "On the SimpliNow Legacy decline list (Alzheimer's/dementia, MDS, bone marrow transplant, Huntington's, ALS, HIV, end-stage renal/dialysis, cirrhosis, mental incapacity, suicide attempt ever, sickle cell, paraplegia/quadriplegia, organ transplant, metastatic cancer, most cancers within 24 months, stroke within 12 months, diabetes A1c 10+, etc.).", color: "#b3364a" }
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
