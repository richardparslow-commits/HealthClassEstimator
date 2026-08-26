"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, ".."); // repo root — portable across checkouts

const rules = fs.readFileSync(path.join(ROOT, "js/rules.js"), "utf8");
const engine = fs.readFileSync(path.join(ROOT, "js/engine.js"), "utf8");

const context = vm.createContext({ console, Date, JSON, Object, Math, Set, Number, String, Array });
vm.runInContext(rules + "\n" + engine + "\nglobalThis.__ENGINE = Engine;\nglobalThis.__CARRIERS = CARRIER_RULES;\nglobalThis.__CLASS_ORDER = CLASS_ORDER;", context, { filename: "combined.js" });
const Engine = context.__ENGINE;
const CARRIER_IDS = Object.keys(context.__CARRIERS);
const CLASS_ORDER = context.__CLASS_ORDER;

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

const base = {
  carrier: "banner", age: 35, sex: "male", state: "TX",
  faceAmount: 500000, income: 120000, existingCoverage: 0,
  policyPurpose: "income", replacement: "no", financing: "no",
  ownership: "personal", premiumPayor: "self",
  usedNicotine: false, nicotineEver: "no", nicotineQuitYears: "", nicotineLastUse: "",
  heightIn: 70, weightLb: 165,
  bpSys: 120, bpDia: 78, cholTotal: 190, cholHdl: 60,
  movingViolations3yr: 0, seriousDriving: false,
  occupationHazardous: "no", aviation: "no", hazardousSports: "no", foreignTravel: "no",
  militaryService: "no", foreignResidence: "no", doctorVisits: "yearly",
  criminalActive: false, paroleCurrent: "no", parolePast: "no",
  alcoholConcern: "no", drugAbuse: "no", marijuana: "none",
  conditions: [],
  medicationsText: "none",
  famCardio: "none",
  livingSetting: "home", mobility: "independent", adlAssistance: "no", homeHealth: false,
  pendingTests: "no", recentHospitalization: "no", recentSurgery: "no", activeSymptom: "no"
};

const scenarios = [];
function add(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(base));
  mutate(d);
  scenarios.push({ name, d, expect });
}

add("Healthy 35, clean profile", d => {}, { klass: "preferred_plus", tobacco: false });

add("Tobacco user (cigarettes, 3 mo ago), otherwise clean", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette";
}, { klass: "preferred_plus", tobacco: true });

add("Non-tobacco, used nicotine 30 months ago (vape)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(30); d.nicotineProduct = "vape";
}, { klass: "preferred", tobacco: false });

add("BP 138/88 caps at Preferred", d => { d.bpSys = 138; d.bpDia = 88; }, { klass: "preferred", tobacco: false });

add("BP 160/95 outside standard -> table", d => { d.bpSys = 160; d.bpDia = 95; }, { klass: "table", tobacco: false });

add("Diabetes onset 52, A1c 6.9, good control, NT", d => {
  d.age = 58;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 2, onsetAge: 52, a1c: 6.9, insulin: "no", complications: "no" }];
}, { klass: "standard_plus", tobacco: false });

add("Diabetes onset 40 (before 50) -> capped at standard", d => {
  d.age = 48;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 1, onsetAge: 40, a1c: 7.2, insulin: "no", complications: "no" }];
}, { klass: "standard", tobacco: false });

add("Diabetes A1c 10.5 -> decline screen", d => {
  d.conditions = [{ id: "diabetes", status: "current", severity: "severe", control: "poor", medCount: 2, onsetAge: 45, a1c: 10.5, insulin: "yes", complications: "yes" }];
}, { klass: "decline", tobacco: false });

add("Pending biopsy -> postpone", d => { d.pendingTests = "yes"; }, { klass: "postpone", tobacco: false });

add("Hazardous avocation clean -> Flat extra (Preferred base)", d => { d.occupationHazardous = "yes"; }, { klass: "flat_extra", tobacco: false, wantFlatBase: "preferred" });

add("Transplant -> Decline + APS Transplant evidence", d => { d.conditions = [{ id: "transplant", status: "current", severity: "moderate", control: "good" }]; }, { klass: "decline", tobacco: false, wantEvidence: ["APS: Transplant"] });

add("Paralysis -> Table + APS Paralysis evidence", d => { d.conditions = [{ id: "paralysis", status: "current", severity: "moderate", control: "good" }]; }, { klass: "table", tobacco: false, wantEvidence: ["APS: Paralysis"] });

add("Stroke mild -> Table + APS Stroke evidence", d => { d.conditions = [{ id: "stroke", status: "current", severity: "mild", control: "good" }]; }, { klass: "table", tobacco: false, wantEvidence: ["Stroke / TIA"] });

add("Dementia -> Decline + APS Cognitive evidence", d => { d.conditions = [{ id: "dementia", status: "current", severity: "moderate", control: "good" }]; }, { klass: "decline", tobacco: false, wantEvidence: ["Cognitive disorders"] });

add("Nursing facility resident -> decline screen", d => { d.livingSetting = "nursing"; }, { klass: "decline", tobacco: false });

add("ADL assistance -> decline screen", d => { d.adlAssistance = "yes"; }, { klass: "decline", tobacco: false });

add("Build above standard max (5'10, 320 lb) -> substandard review/table", d => { d.heightIn = 70; d.weightLb = 320; }, { klass: "table", tobacco: false });

add("Build in Preferred range (5'10, 205 lb) -> preferred", d => { d.heightIn = 70; d.weightLb = 205; }, { klass: "preferred", tobacco: false });

add("Family: parent CV death <60 caps at Preferred", d => { d.famCardio = "parent"; }, { klass: "preferred", tobacco: false });

add("Mild anxiety on 1 med -> Preferred Plus ceiling", d => {
  d.conditions = [{ id: "anxiety", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "preferred_plus", tobacco: false });

add("Depression resolved 2 yrs ago, no meds -> Preferred Plus", d => {
  d.conditions = [{ id: "depression", status: "resolved", severity: "mild", control: "good", medCount: 0, resolvedYears: 2 }];
}, { klass: "preferred_plus", tobacco: false });

add("Current alcohol abuse -> decline", d => { d.alcoholConcern = "active"; }, { klass: "decline", tobacco: false });

add("Criminal active (probation) -> decline", d => { d.criminalActive = true; }, { klass: "decline", tobacco: false });

add("Drug abuse 5 yrs ago -> substandard review (table)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 5; }, { klass: "table", tobacco: false });

add("Drug abuse 12 yrs ago, no relapse -> preferred", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 12; }, { klass: "preferred", tobacco: false });

add("3 moving violations -> Standard Plus", d => { d.movingViolations3yr = 3; }, { klass: "standard_plus", tobacco: false });

add("DUI 2 yrs ago -> Standard (clean 2yr)", d => { d.seriousDriving = true; d.seriousDrivingYears = 2; }, { klass: "standard", tobacco: false });

/* Regression: legacy state from before the checkPill switch stored
   seriousDriving as the string "no"; the engine must treat that exactly
   like false (a truthy "no" would tank every carrier to substandard). */
add("Stale string 'no' for seriousDriving behaves like false", d => { d.seriousDriving = "no"; d.seriousDrivingYears = ""; }, { klass: "preferred_plus", tobacco: false });

add("Stale string 'yes' for seriousDriving with years behaves like true", d => { d.seriousDriving = "yes"; d.seriousDrivingYears = 2; }, { klass: "standard", tobacco: false });

/* ---------- Foresters scenarios ---------- */
const fbase = JSON.parse(JSON.stringify(base));
fbase.carrier = "foresters";

function fadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(fbase));
  mutate(d);
  scenarios.push({ name: "[F] " + name, d, expect });
}

fadd("Healthy clean profile", d => {}, { klass: "preferred_plus", tobacco: false });

fadd("Tobacco user (cigarette) clean profile -> Tobacco Plus", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette";
}, { klass: "preferred_plus", tobacco: true });

fadd("Used nicotine 4 yrs ago -> Preferred NT (3yr lookback)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(48); d.nicotineProduct = "vape";
}, { klass: "preferred", tobacco: false });

fadd("BP 142/86 at age 45 -> Preferred (140/85 max for P at 18-59)", d => { d.bpSys = 142; d.bpDia = 86; }, { klass: "standard_plus", tobacco: false });

fadd("Cholesterol 240 at age 40 -> Preferred (250 max)", d => { d.cholTotal = 240; }, { klass: "preferred", tobacco: false });

fadd("Cholesterol 260 at age 40 -> Standard Plus (300 max)", d => { d.cholTotal = 260; }, { klass: "standard_plus", tobacco: false });

fadd("HIV -> decline screen", d => { d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

fadd("Dementia -> decline screen", d => { d.conditions = [{ id: "dementia", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

fadd("Insulin-treated diabetes -> decline (non-med)", d => {
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", onsetAge: 45, a1c: 7.1, insulin: "yes", complications: "no" }];
}, { klass: "decline", tobacco: false });

fadd("Non-insulin diabetes, good control -> no gate decline (accept, rating worksheet applies)", d => {
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", onsetAge: 52, a1c: 6.8, insulin: "no", complications: "no" }];
}, { klass: "preferred_plus", tobacco: false });

fadd("Cancer completed 12 yrs ago -> accept (no gate), no class cap", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 12, treatedWithin12mo: false, recurrence: false }];
}, { klass: "preferred_plus", tobacco: false });

fadd("3 moving violations -> Standard (SP requires <3)", d => { d.movingViolations3yr = 3; }, { klass: "standard", tobacco: false });

fadd("DUI 2 yrs ago -> Standard (decline only within 12 mo for single DUI)", d => { d.seriousDriving = true; d.seriousDrivingYears = 2; }, { klass: "standard", tobacco: false });

fadd("Build above Standard max (6'0, 300 lb) -> substandard review", d => { d.heightIn = 72; d.weightLb = 300; }, { klass: "table", tobacco: false });

/* ---------- Transamerica scenarios ---------- */
const tbase = JSON.parse(JSON.stringify(base));
tbase.carrier = "transamerica";

function tadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(tbase));
  mutate(d);
  scenarios.push({ name: "[T] " + name, d, expect });
}

tadd("Clean profile, BMI 24 -> Preferred Plus", d => { d.heightIn = 70; d.weightLb = 167; }, { klass: "preferred_plus", tobacco: false });

tadd("Tobacco user 3 mo ago, BMI 24 -> Preferred Tobacco", d => { d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette"; d.heightIn = 70; d.weightLb = 167; }, { klass: "preferred_plus", tobacco: true });

tadd("Quit nicotine 3 yrs ago -> Preferred (PP needs 5 yr)", d => { d.usedNicotine = true; d.nicotineLastUse = monthsAgo(36); d.nicotineProduct = "vape"; d.heightIn = 70; d.weightLb = 167; }, { klass: "preferred", tobacco: false });

tadd("BMI 28.4 -> Preferred", d => { d.heightIn = 70; d.weightLb = 198; }, { klass: "preferred", tobacco: false });

tadd("BMI 30.4 -> Standard Plus", d => { d.heightIn = 70; d.weightLb = 212; }, { klass: "standard_plus", tobacco: false });

tadd("BMI 32.8 -> Standard", d => { d.heightIn = 70; d.weightLb = 229; }, { klass: "standard", tobacco: false });

tadd("BMI 35.3 -> Table A", d => { d.heightIn = 70; d.weightLb = 246; }, { klass: "table", tobacco: false });

tadd("BMI 46.2 -> Decline", d => { d.heightIn = 70; d.weightLb = 322; }, { klass: "decline", tobacco: false });

tadd("BMI 15.5 -> Decline", d => { d.heightIn = 70; d.weightLb = 108; }, { klass: "decline", tobacco: false });

tadd("BP 140/88 at 40 -> Standard Plus", d => { d.heightIn = 70; d.weightLb = 167; d.bpSys = 140; d.bpDia = 88; }, { klass: "standard_plus", tobacco: false });

tadd("Cholesterol 240 -> Preferred", d => { d.heightIn = 70; d.weightLb = 167; d.cholTotal = 240; d.cholHdl = 55; }, { klass: "preferred", tobacco: false });

tadd("Diabetes non-insulin good control -> Standard (preferred classes exclude diabetes)", d => {
  d.heightIn = 70; d.weightLb = 167; d.age = 55;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 1, onsetAge: 52, a1c: 6.9, insulin: "no", complications: "no" }];
}, { klass: "standard", tobacco: false });

tadd("Other cancer resolved 5 yrs ago -> Standard cap", d => {
  d.heightIn = 70; d.weightLb = 167;
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 5, treatedWithin12mo: false, recurrence: false }];
}, { klass: "standard", tobacco: false });

tadd("Skin cancer basal -> Preferred Plus", d => {
  d.heightIn = 70; d.weightLb = 167;
  d.conditions = [{ id: "skin_cancer", status: "resolved", severity: "mild", control: "good", resolvedYears: 3 }];
}, { klass: "preferred_plus", tobacco: false });

tadd("HIV -> Decline", d => { d.heightIn = 70; d.weightLb = 167; d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

// Gate dedup regression: published decline text + auto-decline trigger must
// not both appear as separate list items (same condition id pushed twice).
tadd("HIV severe -> exactly one decline gate", d => { d.heightIn = 70; d.weightLb = 167; d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false, wantDeclineGates: 1 });
tadd("Dementia severe -> exactly one decline gate", d => { d.heightIn = 70; d.weightLb = 167; d.conditions = [{ id: "dementia", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false, wantDeclineGates: 1 });

tadd("Bipolar -> Decline (impairment table)", d => { d.heightIn = 70; d.weightLb = 167; d.conditions = [{ id: "bipolar", status: "current", severity: "mild", control: "good", stableYears: 6 }]; }, { klass: "decline", tobacco: false });

tadd("Parent CV death <60 -> Standard Plus (mapping)", d => { d.heightIn = 70; d.weightLb = 167; d.famCardio = "parent"; }, { klass: "standard_plus", tobacco: false });

tadd("DUI 2 yrs ago, clean violations -> Preferred (P has no DUI criterion)", d => { d.heightIn = 70; d.weightLb = 167; d.seriousDriving = true; d.seriousDrivingYears = 2; }, { klass: "preferred", tobacco: false });

tadd("Substance treatment 12 yrs ago -> Standard Plus (tiers)", d => {
  d.heightIn = 70; d.weightLb = 167;
  d.conditions = [{ id: "substance_treatment", status: "resolved", severity: "mild", control: "good", yearsSober: 12, relapse: false }];
}, { klass: "standard_plus", tobacco: false });

tadd("Mild anxiety 1 med -> Preferred Plus", d => {
  d.heightIn = 70; d.weightLb = 167;
  d.conditions = [{ id: "anxiety", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "preferred_plus", tobacco: false });

tadd("Atorvastatin without cholesterol disclosed -> mismatch, no APS (T list)", d => {
  d.heightIn = 70; d.weightLb = 167;
  d.medicationsText = "atorvastatin 20mg";
}, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 1, aps: 0 }, wantFlag: "undisclosed_meds" });

tadd("Sertraline with depression disclosed -> consistent, 1 APS (mental health)", d => {
  d.heightIn = 70; d.weightLb = 167;
  d.medicationsText = "sertraline";
  d.conditions = [{ id: "depression", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 1, undisclosed: 0, aps: 1 } });

tadd("BP-only adverse at Preferred -> NO credit (T has none)", d => {
  d.heightIn = 70; d.weightLb = 167; d.bpSys = 140; d.bpDia = 88; d.cholTotal = 180; d.cholHdl = 60;
}, { klass: "standard_plus", tobacco: false, noCredit: true });

tadd("Cholesterol-only adverse at Preferred -> NO credit (T has none)", d => {
  d.heightIn = 70; d.weightLb = 167; d.cholTotal = 240; d.cholHdl = 55;
}, { klass: "preferred", tobacco: false, noCredit: true });

add("BP-only adverse at Preferred (Banner) -> credit flagged", d => { d.bpSys = 138; d.bpDia = 88; }, { klass: "preferred", tobacco: false, wantCredit: true });

/* ---- Medication cross-check (Banner) ---- */
add("Metformin + lisinopril with diabetes disclosed -> consistent, 1 APS", d => {
  d.medicationsText = "metformin 500mg, lisinopril 10mg";
  d.conditions = [
    { id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 2, onsetAge: 52, a1c: 6.9, insulin: "no", complications: "no" },
    { id: "hypertension", status: "current", severity: "mild", control: "good", medCount: 1 }
  ];
}, { klass: "standard_plus", tobacco: false, wantMeds: { disclosed: 2, undisclosed: 0, aps: 1 } });

add("Metformin without diabetes disclosed -> mismatch flag + APS", d => {
  d.medicationsText = "metformin";
}, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 1, aps: 1 }, wantFlag: "undisclosed_meds" });

add("No medications field -> missing medication data", d => { d.medicationsText = ""; }, { klass: "preferred_plus", tobacco: false, wantMeds: { missing: true } });

add("'none' -> no matches, not missing", d => {}, { klass: "preferred_plus", tobacco: false, wantMeds: { missing: false, disclosed: 0, undisclosed: 0, aps: 0 } });

add("Unknown med name -> no match, no mismatch", d => { d.medicationsText = "levothyroxine 50mcg"; }, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 0, aps: 0 } });

/* ---------- Mutual of Omaha scenarios ---------- */
const mbase = JSON.parse(JSON.stringify(base));
mbase.carrier = "mutual_of_omaha";
mbase.occupationHazardous = "no";

function madd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(mbase));
  mutate(d);
  scenarios.push({ name: "[MOO] " + name, d, expect });
}

madd("Healthy clean profile", d => {}, { klass: "preferred_plus", tobacco: false });

madd("Tobacco user (cigarette) clean profile -> Preferred Tobacco", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette";
}, { klass: "preferred_plus", tobacco: true });

madd("Quit nicotine 30 months ago -> Preferred (PP needs 36, P needs 24)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(30); d.nicotineProduct = "vape";
}, { klass: "preferred", tobacco: false });

madd("BP 142/88 -> Preferred (PP <140/85, P <145/90)", d => { d.bpSys = 142; d.bpDia = 88; }, { klass: "preferred", tobacco: false });

madd("BP 152/92 -> beyond SP (<150/90) -> table", d => { d.bpSys = 152; d.bpDia = 92; }, { klass: "table", tobacco: false });

madd("Cholesterol 260/HDL 40 (ratio 6.5) -> Standard Plus (P <6, SP <7)", d => { d.cholTotal = 260; d.cholHdl = 40; }, { klass: "standard_plus", tobacco: false });

madd("Cholesterol 290/HDL 40 (ratio 7.25) -> above SP, no published Standard threshold -> Standard", d => { d.cholTotal = 290; d.cholHdl = 40; }, { klass: "standard", tobacco: false });

madd("Build 5'10, 205 lb -> Preferred", d => { d.heightIn = 70; d.weightLb = 205; }, { klass: "preferred", tobacco: false });

madd("Build 5'10, 235 lb -> Standard (chart 250 max)", d => { d.heightIn = 70; d.weightLb = 235; }, { klass: "standard", tobacco: false });

madd("Build 5'10, 270 lb -> Table 3 (T2 266, T3 278)", d => { d.heightIn = 70; d.weightLb = 270; }, { klass: "table", tobacco: false });

madd("Build 5'10, 345 lb -> above Table 12 -> substandard review", d => { d.heightIn = 70; d.weightLb = 345; }, { klass: "table", tobacco: false });

madd("Family: parent death <60 -> Preferred", d => { d.famCardio = "parent"; }, { klass: "preferred", tobacco: false });

madd("Family: parent death <60 but age 62 -> disregarded -> Preferred Plus", d => { d.age = 62; d.famCardio = "parent"; }, { klass: "preferred_plus", tobacco: false });

madd("Type 2 diabetes onset 52, A1c 6.9 -> Standard (impairment: Standard-Table 8)", d => {
  d.age = 58;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 2, onsetAge: 52, a1c: 6.9, insulin: "no", complications: "no" }];
}, { klass: "standard", tobacco: false });

madd("Type 1 diabetes onset 12 -> Table (impairment: Table 2-8)", d => {
  d.age = 30;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 2, onsetAge: 12, a1c: 7.5, insulin: "yes", complications: "no" }];
}, { klass: "table", tobacco: false });

madd("Mild anxiety, 1 med -> Standard (impairment: mild/well-controlled = Standard)", d => {
  d.conditions = [{ id: "anxiety", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "standard", tobacco: false });

madd("Depression controlled on med -> Standard", d => {
  d.conditions = [{ id: "depression", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "standard", tobacco: false });

madd("Mild asthma 1 med -> Preferred (strengths: mild may be Preferred)", d => {
  d.conditions = [{ id: "asthma", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "preferred", tobacco: false });

madd("Bipolar stable 6 yrs -> Table (impairment: stable = Table 2-8)", d => {
  d.conditions = [{ id: "bipolar", status: "current", severity: "mild", control: "good", stableYears: 6 }];
}, { klass: "table", tobacco: false });

madd("Other cancer resolved 3 yrs ago -> Postpone (wait-out 5 yrs)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 3, treatedWithin12mo: false, recurrence: false }];
}, { klass: "postpone", tobacco: false });

madd("Other cancer resolved 7 yrs ago -> Table (individual consideration)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 7, treatedWithin12mo: false, recurrence: false }];
}, { klass: "table", tobacco: false });

madd("Substance treatment 12 yrs ago -> Preferred (15/10/5 tiers)", d => {
  d.conditions = [{ id: "substance_treatment", status: "resolved", severity: "mild", control: "good", yearsSober: 12, relapse: false }];
}, { klass: "preferred", tobacco: false });

madd("Substance treatment 3 yrs ago -> Standard", d => {
  d.conditions = [{ id: "substance_treatment", status: "resolved", severity: "mild", control: "good", yearsSober: 3, relapse: false }];
}, { klass: "standard", tobacco: false });

madd("Hazardous avocation -> Flat extra (Standard Plus base)", d => { d.occupationHazardous = "yes"; }, { klass: "flat_extra", tobacco: false, wantFlatBase: "standard_plus" });

madd("Hazardous avocation + depression (Standard cap) -> Standard, no flat extra", d => { d.occupationHazardous = "yes"; d.conditions = [{ id: "depression", status: "current", severity: "moderate", control: "good" }]; }, { klass: "standard", tobacco: false, wantFlatExtra: false });

madd("Transplant -> Table (not decline) + APS Transplant evidence", d => { d.conditions = [{ id: "transplant", status: "current", severity: "moderate", control: "good" }]; }, { klass: "table", tobacco: false, wantEvidence: ["APS: Transplant"] });

madd("Paralysis -> Table + APS Paralysis evidence", d => { d.conditions = [{ id: "paralysis", status: "current", severity: "moderate", control: "good" }]; }, { klass: "table", tobacco: false, wantEvidence: ["APS: Paralysis"] });

madd("HIV -> decline screen (not in published table)", d => { d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

madd("Dementia -> decline screen", d => { d.conditions = [{ id: "dementia", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

madd("Cardiomyopathy/CHF -> decline screen", d => {
  d.conditions = [{ id: "heart_disease", status: "current", severity: "severe", control: "poor", cardiomyopathy: true }];
}, { klass: "decline", tobacco: false });

madd("Renal failure / dialysis -> decline screen", d => {
  d.conditions = [{ id: "kidney_disease", status: "current", severity: "severe", control: "poor" }];
  d.dialysis = true;
}, { klass: "decline", tobacco: false });

madd("Quadriplegia -> decline screen", d => {
  d.conditions = [{ id: "paralysis", status: "current", severity: "severe", control: "poor" }];
  d.paralysisType = "quadriplegia";
}, { klass: "decline", tobacco: false });

madd("Skin cancer basal cell -> Preferred Plus (allowed for preferred classes)", d => {
  d.conditions = [{ id: "skin_cancer", status: "resolved", severity: "mild", control: "good", resolvedYears: 3 }];
}, { klass: "preferred_plus", tobacco: false });

madd("BP-only adverse at Preferred -> NO credit (no one-class credit program)", d => {
  d.bpSys = 142; d.bpDia = 88;
}, { klass: "preferred", tobacco: false, noCredit: true });

madd("Metformin undisclosed -> mismatch + APS (Diabetes on MOO APS list)", d => {
  d.medicationsText = "metformin 500mg";
}, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 1, aps: 1 }, wantFlag: "undisclosed_meds" });

madd("Sertraline + depression disclosed -> consistent, 1 APS", d => {
  d.medicationsText = "sertraline";
  d.conditions = [{ id: "depression", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "standard", tobacco: false, wantMeds: { disclosed: 1, undisclosed: 0, aps: 1 } });

madd("Age 68, face 250K -> APS evidence required (66+)", d => {
  d.age = 68; d.faceAmount = 250000;
}, { klass: "preferred_plus", tobacco: false, wantEvidence: ["APS (attending physician statement)"] });

madd("Age 35, face 500K -> paramed + blood/urine + Rx + MVR", d => {
  d.age = 35; d.faceAmount = 500000;
}, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Paramedical exam + blood/urine + Rx (pharmaceutical) check", "MVR (motor vehicle report)"] });

madd("Income 120K age 35 -> multiplier 25X", d => { d.faceAmount = 2500000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 25, ok: true } });

madd("Income 120K age 35 face 4M -> exceeds 25X -> financial review", d => { d.faceAmount = 4000000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 25, ok: false } });

/* ---------- F&G Quantum scenarios ---------- */
const qbase = JSON.parse(JSON.stringify(base));
qbase.carrier = "fg_quantum";
qbase.occupationHazardous = "no";

function qadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(qbase));
  mutate(d);
  scenarios.push({ name: "[FG] " + name, d, expect });
}

qadd("Healthy clean profile -> Preferred Non-Tobacco", d => {}, { klass: "preferred_plus", tobacco: false });

qadd("Tobacco user (cigarette) clean profile -> Preferred Tobacco", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette";
}, { klass: "preferred_plus", tobacco: true });

qadd("Quit nicotine 18 months ago -> Non-Tobacco (needs 24 mo for Preferred)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(18); d.nicotineProduct = "vape";
}, { klass: "standard", tobacco: false });

qadd("Quit nicotine 30 months ago -> Preferred Non-Tobacco", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(30); d.nicotineProduct = "vape";
}, { klass: "preferred_plus", tobacco: false });

qadd("BP 152/92 at 35 -> Standard (PP 150/90, Std 155/95)", d => { d.bpSys = 152; d.bpDia = 92; }, { klass: "standard", tobacco: false });

qadd("BP 157/96 at 35 -> outside -> table", d => { d.bpSys = 157; d.bpDia = 96; }, { klass: "table", tobacco: false });

qadd("BP 158/94 at 55 -> Preferred (age 51-60: 160/95)", d => { d.age = 55; d.bpSys = 158; d.bpDia = 94; }, { klass: "preferred_plus", tobacco: false });

qadd("Cholesterol 270 at 35 -> Standard (PP 260, Std 300)", d => { d.cholTotal = 270; d.cholHdl = 50; }, { klass: "standard", tobacco: false });

qadd("Cholesterol 240/40 (ratio 6) at 35 -> Preferred", d => { d.cholTotal = 240; d.cholHdl = 40; }, { klass: "preferred_plus", tobacco: false });

qadd("Build male 5'10, 230 lb -> Preferred", d => { d.heightIn = 70; d.weightLb = 230; }, { klass: "preferred_plus", tobacco: false });

qadd("Build male 5'10, 240 lb -> Standard (male chart 235/259)", d => { d.heightIn = 70; d.weightLb = 240; }, { klass: "standard", tobacco: false });

qadd("Build female 5'4, 200 lb -> Table (female chart 179/197, max 259)", d => { d.sex = "female"; d.heightIn = 64; d.weightLb = 200; }, { klass: "table", tobacco: false });

qadd("Build male 5'10, 300 lb -> Table (max 310, Table D)", d => { d.heightIn = 70; d.weightLb = 300; }, { klass: "table", tobacco: false });

qadd("Build male 5'10, 320 lb -> above Table D -> substandard review", d => { d.heightIn = 70; d.weightLb = 320; }, { klass: "table", tobacco: false });

qadd("Age 55 male 5'10, 240 lb -> Preferred (51-60 add 5 lb)", d => { d.age = 55; d.heightIn = 70; d.weightLb = 240; }, { klass: "preferred_plus", tobacco: false });

qadd("Family: 1 parent death <60 -> Preferred (1 early death allowed)", d => { d.famCardio = "parent"; }, { klass: "preferred_plus", tobacco: false });

qadd("Family: parent + sibling deaths -> Standard (>1 early death)", d => { d.famCardio = "parent_sibling"; }, { klass: "standard", tobacco: false });

qadd("Type 2 diabetes A1c 6.5 -> Standard", d => {
  d.age = 50;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 1, onsetAge: 45, a1c: 6.5, insulin: "no", complications: "no" }];
}, { klass: "standard", tobacco: false });

qadd("Type 2 diabetes A1c 7.2 -> decline (F&G threshold is A1c 7+)", d => {
  d.age = 50;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 1, onsetAge: 45, a1c: 7.2, insulin: "no", complications: "no" }];
}, { klass: "decline", tobacco: false });

qadd("Type 1 diabetes onset 12, A1c 6.8 -> Table", d => {
  d.age = 30;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 2, onsetAge: 12, a1c: 6.8, insulin: "yes", complications: "no" }];
}, { klass: "table", tobacco: false });

qadd("Other cancer resolved 5 yrs ago -> decline (10-yr window)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 5, treatedWithin12mo: false, recurrence: false }];
}, { klass: "decline", tobacco: false });

qadd("Other cancer resolved 12 yrs ago -> Table (individual consideration)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 12, treatedWithin12mo: false, recurrence: false }];
}, { klass: "table", tobacco: false });

qadd("Mild anxiety 1 med -> Standard (acceptable, but Preferred requires no rateable conditions)", d => {
  d.conditions = [{ id: "anxiety", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "standard", tobacco: false });

qadd("Bipolar stable 6 yrs -> Table", d => {
  d.conditions = [{ id: "bipolar", status: "current", severity: "mild", control: "good", stableYears: 6 }];
}, { klass: "table", tobacco: false });

qadd("COPD -> decline (respiratory decline list)", d => {
  d.conditions = [{ id: "copd", status: "current", severity: "moderate", control: "fair" }];
}, { klass: "decline", tobacco: false });

qadd("Kidney disease -> decline", d => {
  d.conditions = [{ id: "kidney_disease", status: "current", severity: "moderate", control: "fair" }];
}, { klass: "decline", tobacco: false });

qadd("HIV -> decline", d => { d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

qadd("Drug use 4 yrs ago -> decline (F&G 5-yr window)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 4; }, { klass: "decline", tobacco: false });

qadd("Drug use 7 yrs ago -> Standard (recovery tier)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 7; }, { klass: "standard", tobacco: false });

qadd("2 moving violations -> Preferred (<=2 allowed)", d => { d.movingViolations3yr = 2; }, { klass: "preferred_plus", tobacco: false });

qadd("3 moving violations -> outside -> table (Standard requires no rateable violations)", d => { d.movingViolations3yr = 3; }, { klass: "table", tobacco: false });

qadd("DUI 2 yrs ago -> outside 5-yr window -> table", d => { d.seriousDriving = true; d.seriousDrivingYears = 2; }, { klass: "table", tobacco: false });

qadd("Hazardous avocation -> Flat extra (Preferred base)", d => { d.occupationHazardous = "yes"; }, { klass: "flat_extra", tobacco: false, wantFlatBase: "preferred" });

qadd("Hazardous avocation + HIV -> Decline (flat extra never masks gates)", d => { d.occupationHazardous = "yes"; d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false, wantFlatExtra: false });

qadd("Hazardous avocation + tobacco -> Flat extra, tobacco basis", d => { d.occupationHazardous = "yes"; d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette"; }, { klass: "flat_extra", tobacco: true });

qadd("Face 1.5M -> exceeds $1M max -> financial review flag", d => { d.faceAmount = 1500000; }, { klass: "preferred_plus", tobacco: false, wantFlag: "financial_review" });

qadd("Metformin undisclosed -> mismatch + APS (Diabetes on F&G APS list)", d => {
  d.medicationsText = "metformin 500mg";
}, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 1, aps: 1 }, wantFlag: "undisclosed_meds" });

qadd("Income 100K age 35 face 500K -> multiplier 30X", d => { d.income = 100000; d.faceAmount = 500000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 30, ok: true } });

/* ---------- F&G Pathsetter scenarios (IUL; same company, own data) ---------- */
const pbase = JSON.parse(JSON.stringify(base));
pbase.carrier = "fg_pathsetter";
pbase.occupationHazardous = "no";

function padd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(pbase));
  mutate(d);
  scenarios.push({ name: "[FG-PS] " + name, d, expect });
}

padd("Healthy clean profile -> Preferred Non-Tobacco", d => {}, { klass: "preferred_plus", tobacco: false });

padd("Tobacco user (cigarette) clean profile -> Preferred Tobacco", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette";
}, { klass: "preferred_plus", tobacco: true });

padd("Quit nicotine 18 months ago -> Non-Tobacco (needs 24 mo for Preferred)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(18); d.nicotineProduct = "vape";
}, { klass: "standard", tobacco: false });

padd("BP 152/92 at 35 -> Standard (PP 150/90, Std 155/95)", d => { d.bpSys = 152; d.bpDia = 92; }, { klass: "standard", tobacco: false });

padd("BP 158/94 at 55 -> Preferred (51-65: 160/95)", d => { d.age = 55; d.bpSys = 158; d.bpDia = 94; }, { klass: "preferred_plus", tobacco: false });

padd("BP 158/94 at 68 -> Preferred (66+: 160/95)", d => { d.age = 68; d.bpSys = 158; d.bpDia = 94; }, { klass: "preferred_plus", tobacco: false });

padd("BP 162/94 at 68 -> Standard (66+: Std 165/95)", d => { d.age = 68; d.bpSys = 162; d.bpDia = 94; }, { klass: "standard", tobacco: false });

padd("BP 167/96 at 68 -> outside -> table (above Std 165/95)", d => { d.age = 68; d.bpSys = 167; d.bpDia = 96; }, { klass: "table", tobacco: false });

padd("Cholesterol 270 at 35 -> Standard (PP 260, Std 300)", d => { d.cholTotal = 270; d.cholHdl = 50; }, { klass: "standard", tobacco: false });

padd("Cholesterol 290 at 60 -> Standard (51-65: PP 280)", d => { d.age = 60; d.cholTotal = 290; d.cholHdl = 50; }, { klass: "standard", tobacco: false });

padd("Cholesterol 290 at 68 -> Preferred (66+: PP 300)", d => { d.age = 68; d.cholTotal = 290; d.cholHdl = 50; }, { klass: "preferred_plus", tobacco: false });

padd("Cholesterol 310 at 68 -> outside -> table (Std 300)", d => { d.age = 68; d.cholTotal = 310; d.cholHdl = 50; }, { klass: "table", tobacco: false });

padd("Build male 5'10, 280 lb at 45 -> Table (std 259, Table H max 324)", d => { d.heightIn = 70; d.weightLb = 280; }, { klass: "table", tobacco: false });

padd("Build male 5'10, 330 lb at 45 -> above Table H -> substandard review", d => { d.heightIn = 70; d.weightLb = 330; }, { klass: "table", tobacco: false });

padd("Build male 5'10, 263 lb at 45 -> Table (std 259; +5 lb not yet applied)", d => { d.heightIn = 70; d.weightLb = 263; }, { klass: "table", tobacco: false });

padd("Build male 5'10, 263 lb at 64 -> Standard (51-65 adds 5 lb -> std 264)", d => { d.age = 64; d.heightIn = 70; d.weightLb = 263; }, { klass: "standard", tobacco: false });

padd("Build male 5'10, 269 lb at 64 -> Table (only +5 lb: std 264)", d => { d.age = 64; d.heightIn = 70; d.weightLb = 269; }, { klass: "table", tobacco: false });

padd("Build male 5'10, 269 lb at 68 -> Standard (66+ adds 10 lb -> std 269)", d => { d.age = 68; d.heightIn = 70; d.weightLb = 269; }, { klass: "standard", tobacco: false });

padd("Build female 5'4, 200 lb -> Table (female chart 179/197, Table H max 270)", d => { d.sex = "female"; d.heightIn = 64; d.weightLb = 200; }, { klass: "table", tobacco: false });

padd("Family: 1 parent death <60 -> Preferred (1 early death allowed)", d => { d.famCardio = "parent"; }, { klass: "preferred_plus", tobacco: false });

padd("Family: parent + sibling deaths -> Standard (>1 early death)", d => { d.famCardio = "parent_sibling"; }, { klass: "standard", tobacco: false });

padd("Type 2 diabetes A1c 6.5 -> Standard", d => {
  d.age = 50;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 1, onsetAge: 45, a1c: 6.5, insulin: "no", complications: "no" }];
}, { klass: "standard", tobacco: false });

padd("Type 2 diabetes A1c 7.2 -> decline (F&G threshold A1c 7+)", d => {
  d.age = 50;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 1, onsetAge: 45, a1c: 7.2, insulin: "no", complications: "no" }];
}, { klass: "decline", tobacco: false });

padd("Mild anxiety 1 med -> Standard (acceptable, not Preferred)", d => {
  d.conditions = [{ id: "anxiety", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "standard", tobacco: false });

padd("COPD -> decline (shared F&G respiratory list)", d => {
  d.conditions = [{ id: "copd", status: "current", severity: "moderate", control: "fair" }];
}, { klass: "decline", tobacco: false });

padd("Drug use 4 yrs ago -> decline (F&G 5-yr window)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 4; }, { klass: "decline", tobacco: false });

padd("2 moving violations -> Preferred (<=2 allowed)", d => { d.movingViolations3yr = 2; }, { klass: "preferred_plus", tobacco: false });

padd("3 moving violations -> outside -> table", d => { d.movingViolations3yr = 3; }, { klass: "table", tobacco: false });

padd("Hazardous avocation -> Flat extra (Preferred base)", d => { d.occupationHazardous = "yes"; }, { klass: "flat_extra", tobacco: false, wantFlatBase: "preferred" });

padd("Metformin undisclosed -> mismatch + APS (shared F&G APS list)", d => {
  d.medicationsText = "metformin 500mg";
}, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 1, aps: 1 }, wantFlag: "undisclosed_meds" });

padd("Income 100K age 35 face 500K -> multiplier 30X", d => { d.income = 100000; d.faceAmount = 500000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 30, ok: true } });

padd("Income 100K age 60 face 500K -> multiplier 15X (51-65)", d => { d.age = 60; d.income = 100000; d.faceAmount = 500000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 15, ok: true } });

padd("Income 100K age 75 face 500K -> multiplier 5X (71+)", d => { d.age = 75; d.income = 100000; d.faceAmount = 500000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 5, ok: true } });

padd("Age 35 face 500K -> Exam-Free evidence line", d => {}, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Exam-Free Underwriting"] });

padd("Age 75 face 500K -> APS + EKG + paramed evidence (over 60, 71+)", d => { d.age = 75; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["APS", "EKG", "Paramedical exam"] });

padd("Age 45 face 2.5M -> APS (41-60 >$2M) + large-case transmittal evidence", d => { d.age = 45; d.faceAmount = 2500000; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["APS", "Large Case Transmittal"] });

/* ---------- National Life Group scenarios ----------------------------- */
const nbase = JSON.parse(JSON.stringify(base));
nbase.carrier = "national_life";
nbase.occupationHazardous = "no";
// clean profile: 5'10, 170 lb (Elite band 129-188), BP 120/78, chol 190/60 (ratio 3.2)

function nadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(nbase));
  mutate(d);
  scenarios.push({ name: "[NL] " + name, d, expect });
}

nadd("Healthy clean profile -> Elite Preferred Non-Tobacco", d => {}, { klass: "preferred_plus", tobacco: false });

nadd("Tobacco user (cigarette) clean profile -> Preferred Tobacco", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette";
}, { klass: "preferred_plus", tobacco: true });

nadd("Quit nicotine 48 months ago -> Preferred NT (needs 60 mo for Elite)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(48); d.nicotineProduct = "cigarette";
}, { klass: "preferred", tobacco: false });

nadd("Quit nicotine 20 months ago -> Select NT (needs 36 for Preferred)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(20); d.nicotineProduct = "cigarette";
}, { klass: "standard_plus", tobacco: false });

nadd("Quit nicotine 6 months ago -> still tobacco (within 12-month window)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(6); d.nicotineProduct = "cigarette";
}, { klass: "preferred_plus", tobacco: true });

nadd("BP 138/88 at 35 -> Preferred (Elite 135/85, Preferred 140/90)", d => { d.bpSys = 138; d.bpDia = 88; }, { klass: "preferred", tobacco: false });

nadd("BP 145/90 at 35 -> Select (Preferred 140/90, Select 150/90)", d => { d.bpSys = 145; d.bpDia = 90; }, { klass: "standard_plus", tobacco: false });

nadd("BP 152/92 at 35 -> outside -> table (above Select 150/90)", d => { d.bpSys = 152; d.bpDia = 92; }, { klass: "table", tobacco: false });

nadd("Cholesterol 250/50 (ratio 5.0) -> Preferred (Elite ratio 4.5)", d => { d.cholTotal = 250; d.cholHdl = 50; }, { klass: "preferred", tobacco: false });

nadd("Cholesterol 290/50 (ratio 5.8) -> Select (Preferred ratio 5.5)", d => { d.cholTotal = 290; d.cholHdl = 50; }, { klass: "standard_plus", tobacco: false });

nadd("Cholesterol 310/50 -> outside -> table (Select total 300)", d => { d.cholTotal = 310; d.cholHdl = 50; }, { klass: "table", tobacco: false });

nadd("Cholesterol ratio 6.0 at age 70 -> Preferred (65+ band 6.0)", d => { d.age = 70; d.cholTotal = 270; d.cholHdl = 45; }, { klass: "preferred", tobacco: false });

nadd("Build male 5'10, 190 lb -> Preferred (Elite 188, Preferred 208)", d => { d.heightIn = 70; d.weightLb = 190; }, { klass: "preferred", tobacco: false });

nadd("Build male 5'10, 230 lb -> Standard (Elite 188, Preferred 208, Select 227, Std 261)", d => { d.heightIn = 70; d.weightLb = 230; }, { klass: "standard", tobacco: false });

nadd("Build male 5'10, 270 lb -> Express Standard NT 1 (Std 261, ES1 296)", d => { d.heightIn = 70; d.weightLb = 270; }, { klass: "table", tobacco: false });

nadd("Build male 5'10, 310 lb -> Express Standard NT 2 (ES1 296, ES2 324)", d => { d.heightIn = 70; d.weightLb = 310; }, { klass: "table", tobacco: false });

nadd("Build male 5'10, 330 lb -> above ES2 -> substandard review", d => { d.heightIn = 70; d.weightLb = 330; }, { klass: "table", tobacco: false });

nadd("Build female 5'2, 180 lb -> Standard (Select 178, Std 205)", d => { d.sex = "female"; d.heightIn = 62; d.weightLb = 180; }, { klass: "standard", tobacco: false });

nadd("Family: 1 parent death <60 -> Select (Elite/Pref require none)", d => { d.famCardio = "parent"; }, { klass: "standard_plus", tobacco: false });

nadd("Family: parent death but applicant age 68 -> disregarded -> Elite", d => { d.age = 68; d.famCardio = "parent"; }, { klass: "preferred_plus", tobacco: false });

nadd("Family: parent + sibling deaths at 35 -> Standard", d => { d.famCardio = "parent_sibling"; }, { klass: "standard", tobacco: false });

nadd("Mild anxiety 1 med -> Standard", d => {
  d.conditions = [{ id: "anxiety", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "standard", tobacco: false });

nadd("Type 2 diabetes A1c 8, adult onset -> Standard (A1c <10)", d => {
  d.age = 50;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 1, onsetAge: 46, a1c: 8, insulin: "no", complications: "no" }];
}, { klass: "standard", tobacco: false });

nadd("Type 2 diabetes A1c 10.5 -> decline (NL threshold A1c 10+)", d => {
  d.age = 50;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "fair", medCount: 2, onsetAge: 46, a1c: 10.5, insulin: "no", complications: "no" }];
}, { klass: "decline", tobacco: false });

nadd("Juvenile-onset diabetes (onset 15) -> decline", d => {
  d.age = 30;
  d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", medCount: 2, onsetAge: 15, a1c: 7.5, insulin: "yes", complications: "no" }];
}, { klass: "decline", tobacco: false });

nadd("Other cancer resolved 3 yrs ago -> decline (3-5 yr window)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 3, treatedWithin12mo: false, recurrence: false }];
}, { klass: "decline", tobacco: false });

nadd("Other cancer resolved 8 yrs ago -> Table (individual consideration)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", severity: "moderate", control: "good", resolvedYears: 8, treatedWithin12mo: false, recurrence: false }];
}, { klass: "table", tobacco: false });

nadd("HIV -> decline", d => { d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

nadd("Cirrhosis / liver disease -> decline", d => { d.conditions = [{ id: "liver_disease", status: "current", severity: "moderate", control: "fair" }]; }, { klass: "decline", tobacco: false });

nadd("Dementia -> decline", d => { d.conditions = [{ id: "dementia", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

nadd("Drug use 2 yrs ago -> decline (NL 3-yr window)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 2; }, { klass: "decline", tobacco: false });

nadd("Drug use 7 yrs ago -> Standard (5-yr abstinence tier)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 7; }, { klass: "standard", tobacco: false });

nadd("1 moving violation -> Elite (<=1 allowed)", d => { d.movingViolations3yr = 1; }, { klass: "preferred_plus", tobacco: false });

nadd("2 moving violations -> Preferred (Elite <=1, Preferred <=2)", d => { d.movingViolations3yr = 2; }, { klass: "preferred", tobacco: false });

nadd("3 moving violations -> Select (Preferred <=2, Select <=3)", d => { d.movingViolations3yr = 3; }, { klass: "standard_plus", tobacco: false });

nadd("4 moving violations -> outside -> table", d => { d.movingViolations3yr = 4; }, { klass: "table", tobacco: false });

nadd("DUI 2 yrs ago -> outside 5-yr window -> table", d => { d.seriousDriving = true; d.seriousDrivingYears = 2; }, { klass: "table", tobacco: false });

nadd("Hazardous occupation -> capped at Verified Standard", d => { d.occupationHazardous = "yes"; }, { klass: "standard", tobacco: false });

nadd("Metformin undisclosed -> mismatch + APS", d => {
  d.medicationsText = "metformin 500mg";
}, { klass: "preferred_plus", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 1, aps: 1 }, wantFlag: "undisclosed_meds" });

nadd("Income 100K age 35 face 500K -> multiplier 35X", d => { d.age = 35; d.income = 100000; d.faceAmount = 500000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 35, ok: true } });

nadd("Income 100K age 55 face 2M -> multiplier 15X exceeds -> financial review", d => { d.age = 55; d.income = 100000; d.faceAmount = 2000000; }, { klass: "preferred_plus", tobacco: false, wantFin: { multiplier: 15, ok: false }, wantFlag: "financial_review" });

nadd("Age 35 face 500K -> EZ-Underwriting application-only evidence", d => {}, { klass: "preferred_plus", tobacco: false, wantEvidence: ["EZ-Underwriting"] });

nadd("Age 35 face 200K -> Streamlined/EZ application evidence", d => { d.faceAmount = 200000; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Streamlined/EZ lane"] });

nadd("Age 72 face 500K -> Mature Assessment + APS evidence", d => { d.age = 72; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Mature Assessment", "APS"] });

// ---- build manual_review: ranks above estimable classes but below gates -----
add("Build manual review (height outside chart), clean -> manual_review", d => { d.heightIn = 96; }, { klass: "manual_review", tobacco: false });
add("Build manual review + HIV decline gate -> decline wins", d => { d.heightIn = 96; d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });
add("Build manual review + pending test postpone gate -> postpone wins", d => { d.heightIn = 96; d.pendingTests = "yes"; }, { klass: "postpone", tobacco: false });

// ---- unanswered-radio honesty: defaults must NOT assume the best answer -----
add("Nicotine unanswered -> missing domain, not assumed non-tobacco", d => { d.usedNicotine = ""; }, { klass: "preferred_plus", tobacco: false, wantMissing: ["tobacco"] });
add("Family history unanswered -> missing, no cap", d => { d.famCardio = ""; }, { klass: "preferred_plus", tobacco: false, wantMissing: ["family"] });
add("Pending care unanswered -> missing, no postpone", d => { d.pendingTests = ""; d.recentHospitalization = ""; d.recentSurgery = ""; d.activeSymptom = ""; }, { klass: "preferred_plus", tobacco: false, wantMissing: ["pending"] });
add("Functional status unanswered -> missing, no cap", d => { d.adlAssistance = ""; d.livingSetting = ""; d.mobility = ""; }, { klass: "preferred_plus", tobacco: false, wantMissing: ["functional"] });
add("Driving unanswered -> missing, no cap", d => { d.movingViolations3yr = ""; }, { klass: "preferred_plus", tobacco: false, wantMissing: ["driving"] });
add("Substance unanswered -> missing, no cap", d => { d.alcoholConcern = ""; d.drugAbuse = ""; d.marijuana = ""; }, { klass: "preferred_plus", tobacco: false, wantMissing: ["substance"] });
add("Marijuana daily -> decline (F&G Quantum)", d => { d.carrier = "fg_quantum"; d.marijuana = "daily"; }, { klass: "decline", tobacco: false });
add("Marijuana daily -> decline (National Life)", d => { d.carrier = "national_life"; d.marijuana = "daily"; }, { klass: "decline", tobacco: false });
add("Marijuana daily -> no decline for Banner (no published daily rule)", d => { d.marijuana = "daily"; }, { klass: "preferred_plus", tobacco: false });
add("Marijuana medicinal -> rated on underlying condition, no class change", d => { d.marijuana = "medicinal"; }, { klass: "preferred_plus", tobacco: false });
add("Quantum total line (existing + face) over $1M -> another product", d => { d.carrier = "fg_quantum"; d.existingCoverage = 600000; d.faceAmount = 500000; }, { klass: "preferred_plus", tobacco: false, wantFlag: "financial_review" });
add("Quantum replacement disclosed -> not allowed, financial review", d => { d.carrier = "fg_quantum"; d.replacement = "yes"; }, { klass: "preferred_plus", tobacco: false, wantFlag: "financial_review" });

// ---- carrier maximum issue age (eligibility gate) --------------------------
// Above a carrier's published maximum issue age the application is not
// accepted — report an eligibility decline instead of fabricating a class
// from data that was never published for that age.
add("Quantum age 61 -> outside issue ages (0-60) -> decline, not a fabricated table", d => { d.carrier = "fg_quantum"; d.age = 61; }, { klass: "decline", tobacco: false, wantFlag: "possible_decline" });
add("Quantum age 60 (issue-age cap inclusive) -> preferred_plus", d => { d.carrier = "fg_quantum"; d.age = 60; }, { klass: "preferred_plus", tobacco: false });
add("Banner age 71 -> outside issue ages (max 70) -> decline", d => { d.carrier = "banner"; d.age = 71; }, { klass: "decline", tobacco: false });
add("Banner age 70 (cap inclusive) -> preferred_plus", d => { d.carrier = "banner"; d.age = 70; }, { klass: "preferred_plus", tobacco: false });
add("AMAM age 76 -> outside term-lane issue ages (max 75) -> decline", d => { d.carrier = "amam"; d.age = 76; }, { klass: "decline", tobacco: false });
add("Foresters age 81 -> outside issue ages (max 80) -> decline", d => { d.carrier = "foresters"; d.age = 81; }, { klass: "decline", tobacco: false });
add("Transamerica age 86 -> outside issue ages (max 85) -> decline", d => { d.carrier = "transamerica"; d.age = 86; }, { klass: "decline", tobacco: false });
add("Pathsetter age 81 -> outside issue ages (max 80) -> decline", d => { d.carrier = "fg_pathsetter"; d.age = 81; }, { klass: "decline", tobacco: false });
add("Banner financed premium -> accelerated UW excluded", d => { d.financing = "yes"; }, { klass: "preferred_plus", tobacco: false, wantNoFlag: "accelerated_uw_possible", wantEvidence: ["accelerated underwriting not available"] });
add("Banner replacement -> accelerated UW excluded", d => { d.replacement = "yes"; }, { klass: "preferred_plus", tobacco: false, wantNoFlag: "accelerated_uw_possible" });
add("Policy purpose business -> BIQ evidence listed", d => { d.policyPurpose = "business"; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Business insurance questionnaire"] });
add("Hazardous occupation unanswered -> missing, no cap", d => { d.occupationHazardous = ""; }, { klass: "preferred_plus", tobacco: false, wantMissing: ["avocation"] });
add("Lifestyle & substance domains skipped -> Moderate confidence", d => { d.movingViolations3yr = ""; d.alcoholConcern = ""; d.drugAbuse = ""; d.paroleCurrent = ""; d.parolePast = ""; d.aviation = ""; d.hazardousSports = ""; d.foreignTravel = ""; }, { klass: "preferred_plus", tobacco: false, wantConfidence: "Moderate" });
add("All key radios skipped -> Low confidence", d => { d.usedNicotine = ""; d.famCardio = ""; d.pendingTests = ""; d.recentHospitalization = ""; d.recentSurgery = ""; d.activeSymptom = ""; d.adlAssistance = ""; d.livingSetting = ""; d.mobility = ""; d.occupationHazardous = ""; d.ownership = ""; d.premiumPayor = ""; }, { klass: "preferred_plus", tobacco: false, wantConfidence: "Low" });
add("Fully answered profile -> High confidence", d => {}, { klass: "preferred_plus", tobacco: false, wantConfidence: "High" });

/* ---- New lifestyle / criminal / financial questions ------------------- */
add("Currently on probation -> decline gate", d => { d.paroleCurrent = "yes"; }, { klass: "decline", tobacco: false, wantDeclineGates: 1 });
add("Past parole only -> review flag, no decline", d => { d.parolePast = "yes"; }, { klass: "preferred_plus", tobacco: false, wantFlag: "criminal_history", wantNoFlag: "possible_decline" });
add("Aviation exposure -> MOO flat extra on Standard Plus", d => { d.carrier = "mutual_of_omaha"; d.aviation = "yes"; }, { klass: "flat_extra", tobacco: false, wantFlatExtra: true, wantFlatBase: "standard_plus" });
add("Hazardous sport -> F&G flat extra on Preferred", d => { d.carrier = "fg_quantum"; d.hazardousSports = "yes"; }, { klass: "flat_extra", tobacco: false, wantFlatExtra: true, wantFlatBase: "preferred" });
add("Foresters 25 cigarettes/day -> Standard Tobacco", d => { d.carrier = "foresters"; d.usedNicotine = true; d.nicotineLastUse = monthsAgo(1); d.nicotineProduct = "cigarette"; d.nicotineAmount = 25; }, { klass: "standard", tobacco: true, wantTobaccoPlus: false });
add("Foresters 10 cigarettes/day -> Tobacco Plus", d => { d.carrier = "foresters"; d.usedNicotine = true; d.nicotineLastUse = monthsAgo(1); d.nicotineProduct = "cigarette"; d.nicotineAmount = 10; }, { klass: "preferred_plus", tobacco: true, wantTobaccoPlus: true });
add("Foreign travel -> evidence note", d => { d.foreignTravel = "yes"; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Foreign travel disclosed"] });
add("Third-party premium payor -> Banner AU excluded", d => { d.premiumPayor = "third_party"; }, { klass: "preferred_plus", tobacco: false, wantNoFlag: "accelerated_uw_possible", wantEvidence: ["accelerated underwriting not available"] });
add("Business ownership -> ownership evidence note", d => { d.ownership = "business"; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Business-owned coverage"] });

/* ---- Master-list additions: care, military, residence, nicotine history - */
add("Frequent doctor visits with no condition -> unexplained-care flag", d => { d.doctorVisits = "frequent"; }, { klass: "preferred_plus", tobacco: false, wantFlag: "unexplained_care" });
add("Frequent doctor visits WITH a disclosed condition -> no flag", d => { d.doctorVisits = "frequent"; d.conditions = [{ id: "asthma", status: "current", severity: "mild", control: "good" }]; }, { klass: "standard", tobacco: false, wantNoFlag: "unexplained_care" });
add("Military combat -> evidence notes, no class change", d => { d.militaryService = "combat"; }, { klass: "preferred_plus", tobacco: false, wantEvidence: ["Military service disclosed", "Combat deployment"] });
add("Foreign residence 6+ months -> eligibility-review flag", d => { d.foreignResidence = "long"; }, { klass: "preferred_plus", tobacco: false, wantFlag: "foreign_residence" });
add("Foreign residence under 6 months -> note only, no flag", d => { d.foreignResidence = "short"; }, { klass: "preferred_plus", tobacco: false, wantNoFlag: "foreign_residence", wantEvidence: ["Foreign residence disclosed"] });
add("Nicotine conflict: ever=no but 10-yr=yes -> conflict flag", d => { d.usedNicotine = "yes"; d.nicotineEver = "no"; d.nicotineLastUse = monthsAgo(3); }, { klass: "preferred_plus", tobacco: true, wantFlag: "conflicting_disclosure" });
add("Nicotine quit 15 yrs ago -> beyond-lookback note, no flag", d => { d.usedNicotine = "no"; d.nicotineEver = "yes"; d.nicotineQuitYears = 15; }, { klass: "preferred_plus", tobacco: false, wantNoFlag: "conflicting_disclosure", wantEvidence: ["outside every carrier's lookback"] });
add("Nicotine quit 5 yrs ago but 10-yr=no -> conflict flag", d => { d.usedNicotine = "no"; d.nicotineEver = "yes"; d.nicotineQuitYears = 5; }, { klass: "preferred_plus", tobacco: false, wantFlag: "conflicting_disclosure" });

/* ---- American Amicable (Express Term / Term Made Simple) ---------------- */
const abase = JSON.parse(JSON.stringify(base));
abase.carrier = "amam";
abase.usedNicotine = "no";

function aadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(abase));
  mutate(d);
  scenarios.push({ name: "[AMAM] " + name, d, expect });
}

aadd("Healthy clean profile -> Preferred Non-Tobacco", d => {}, { klass: "preferred", tobacco: false });

aadd("Tobacco user (cigarette) clean profile -> Preferred Tobacco", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette";
}, { klass: "preferred", tobacco: true });

aadd("Quit nicotine 30 months ago -> Standard Non-Tobacco (needs 36 for Preferred)", d => {
  d.usedNicotine = true; d.nicotineLastUse = monthsAgo(30); d.nicotineProduct = "vape";
}, { klass: "standard", tobacco: false });

aadd("Build 5'10/200 lb -> Preferred (preferred chart max 225)", d => { d.heightIn = 70; d.weightLb = 200; }, { klass: "preferred", tobacco: false });

aadd("Build 5'10/240 lb -> Standard (Table-2 265 / Table-4 289)", d => { d.heightIn = 70; d.weightLb = 240; }, { klass: "standard", tobacco: false });

aadd("Build 5'10/300 lb -> above Table 4 -> not eligible -> decline", d => { d.heightIn = 70; d.weightLb = 300; }, { klass: "decline", tobacco: false, wantDeclineGates: 1 });

aadd("Build below chart minimum (4'10/80 lb) -> not eligible -> decline", d => { d.heightIn = 58; d.weightLb = 80; }, { klass: "decline", tobacco: false, wantDeclineGates: 1 });

aadd("Build 5'10/275 lb + diabetes -> condition over Table 2 -> not eligible", d => {
  d.heightIn = 70; d.weightLb = 275;
  d.conditions = [{ id: "diabetes", status: "current", severity: "mild", control: "good" }];
}, { klass: "decline", tobacco: false, wantDeclineGates: 1 });

aadd("Stroke -> decline (impairment guide)", d => { d.conditions = [{ id: "stroke", status: "current", severity: "mild", control: "good" }]; }, { klass: "decline", tobacco: false });

aadd("COPD -> decline", d => { d.conditions = [{ id: "copd", status: "current", severity: "moderate", control: "fair" }]; }, { klass: "decline", tobacco: false });

aadd("Paralysis (paraplegia) -> decline", d => { d.conditions = [{ id: "paralysis", status: "current", severity: "moderate", control: "good" }]; }, { klass: "decline", tobacco: false });

aadd("Liver disease -> decline", d => { d.conditions = [{ id: "liver_disease", status: "current", severity: "moderate", control: "fair" }]; }, { klass: "decline", tobacco: false });

aadd("Diabetes controlled oral -> Standard", d => {
  d.conditions = [{ id: "diabetes", status: "current", severity: "mild", control: "good", insulin: "no" }];
}, { klass: "standard", tobacco: false });

aadd("Diabetes on insulin -> decline", d => {
  d.conditions = [{ id: "diabetes", status: "current", severity: "mild", control: "good", insulin: "yes" }];
}, { klass: "decline", tobacco: false });

aadd("Diabetes onset before 35 -> decline", d => {
  d.conditions = [{ id: "diabetes", status: "current", severity: "mild", control: "good", insulin: "no", onsetAge: 28 }];
}, { klass: "decline", tobacco: false });

aadd("Cancer resolved 3 yrs -> decline (8-yr window)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", resolvedYears: 3, severity: "moderate", control: "good" }];
}, { klass: "decline", tobacco: false });

aadd("Cancer resolved 10 yrs -> Standard (8-yr clear)", d => {
  d.conditions = [{ id: "other_cancer", status: "resolved", resolvedYears: 10, severity: "moderate", control: "good" }];
}, { klass: "standard", tobacco: false });

aadd("Anxiety 1 med -> Standard ceiling", d => {
  d.conditions = [{ id: "anxiety", status: "current", severity: "mild", control: "good", medCount: 1 }];
}, { klass: "standard", tobacco: false });

aadd("Pending diagnostic testing -> postpone until results", d => { d.pendingTests = "yes"; }, { klass: "postpone", tobacco: false });

aadd("Drug use 3 yrs ago -> decline (4-yr window)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 3; }, { klass: "decline", tobacco: false });

aadd("Drug use 6 yrs ago -> Standard (4-yr recovery)", d => { d.drugAbuse = "yes"; d.drugAbuseYears = 6; }, { klass: "standard", tobacco: false });

aadd("Third-party payor age 40 -> not accepted -> decline", d => { d.premiumPayor = "third_party"; }, { klass: "decline", tobacco: false });

aadd("Current parole -> decline (5-yr conviction / 6-mo parole windows)", d => { d.paroleCurrent = "yes"; }, { klass: "decline", tobacco: false });

aadd("Hazardous avocation -> capped at Standard", d => { d.occupationHazardous = "yes"; }, { klass: "standard", tobacco: false });

aadd("3 moving violations -> decline (3+ violates)", d => { d.movingViolations3yr = 3; }, { klass: "decline", tobacco: false });

aadd("2 moving violations -> Preferred (no preferred driving criteria published)", d => { d.movingViolations3yr = 2; }, { klass: "preferred", tobacco: false });

aadd("BP 152/92 -> Standard (Standard band 155/95)", d => { d.bpSys = 152; d.bpDia = 92; }, { klass: "standard", tobacco: false });

aadd("BP 162/98 -> beyond standard -> not eligible (accept/reject)", d => { d.bpSys = 162; d.bpDia = 98; }, { klass: "decline", tobacco: false });

aadd("Face 600K -> exceeds $500K maximum -> financial review", d => { d.faceAmount = 600000; }, { klass: "preferred", tobacco: false, wantFlag: "financial_review" });

aadd("Dignity band (60 / $25K) -> Dignity final-expense evidence line", d => { d.age = 60; d.faceAmount = 25000; }, { klass: "preferred", tobacco: false, wantEvidence: ["Dignity Solutions"] });

aadd("Metformin undisclosed -> mismatch + APS trigger", d => { d.medicationsText = "metformin 500mg"; }, { klass: "preferred", tobacco: false, wantMeds: { disclosed: 0, undisclosed: 1, aps: 1 }, wantFlag: "undisclosed_meds" });

/* ---- John Hancock (Simple Term with Vitality, ages 20-60) --------------- */
const jbase = JSON.parse(JSON.stringify(base));
jbase.carrier = "john_hancock";
jbase.usedNicotine = "no";

function jadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(jbase));
  mutate(d);
  scenarios.push({ name: "[John Hancock] " + name, d, expect });
}

jadd("Healthy clean profile -> Preferred", d => {}, { klass: "preferred", tobacco: false });

jadd("DUI 3 yrs ago -> decline (5-yr disqualifier)", d => { d.seriousDriving = true; d.seriousDrivingYears = 3; }, { klass: "decline", tobacco: false });

jadd("DUI 6 yrs ago -> no decline (outside 5-yr window)", d => { d.seriousDriving = true; d.seriousDrivingYears = 6; }, { klass: "preferred", tobacco: false });

jadd("Pending diagnostic test -> decline (not eligible until completed)", d => { d.pendingTests = "yes"; }, { klass: "decline", tobacco: false });

jadd("Cancer resolved 5 yrs ago -> decline (any cancer except BCC/SCC/Stage 0 melanoma)", d => { d.conditions = [{ id: "other_cancer", status: "resolved", resolvedYears: 5, severity: "moderate", control: "good" }]; }, { klass: "decline", tobacco: false });

jadd("Type 1 diabetes onset at 30 -> decline (under age 40)", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", type: "type1", onsetAge: 30, a1c: 7 }]; }, { klass: "decline", tobacco: false });

jadd("Type 2 diabetes onset at 45, controlled -> Select (standard)", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", type: "type2", onsetAge: 45, a1c: 7.2 }]; }, { klass: "standard", tobacco: false });

jadd("Age 61 -> outside issue ages (max 60) -> decline", d => { d.age = 61; }, { klass: "decline", tobacco: false });

jadd("Hazardous occupation -> decline (disqualifying occupations)", d => { d.occupationHazardous = "yes"; }, { klass: "decline", tobacco: false });

jadd("Nicotine 3 mo ago -> tobacco risk class (base class kept per guide)", d => { d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette"; }, { klass: "preferred", tobacco: true });

/* ---- Americo (Eagle Select final expense, ages 40-85) ------------------- */
const ebase = JSON.parse(JSON.stringify(base));
ebase.carrier = "americo";
ebase.age = 45;
ebase.faceAmount = 25000;
ebase.usedNicotine = "no";

function eadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(ebase));
  mutate(d);
  scenarios.push({ name: "[Americo] " + name, d, expect });
}

eadd("Healthy clean profile -> Eagle Select 1 (preferred)", d => {}, { klass: "preferred", tobacco: false });

eadd("Organ transplant -> knock-out decline", d => { d.conditions = [{ id: "transplant", status: "current", severity: "severe" }]; }, { klass: "decline", tobacco: false });

eadd("Pending tests -> 12-month declinable", d => { d.pendingTests = "yes"; }, { klass: "decline", tobacco: false });

eadd("Heart disease + nicotine -> Eagle Select 2 (standard)", d => { d.conditions = [{ id: "heart_disease", status: "current", severity: "moderate", control: "good" }]; d.usedNicotine = true; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette"; }, { klass: "standard", tobacco: true });

eadd("Diabetes with complications -> Eagle Select 2 (standard), not decline", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "fair", complications: "yes", a1c: 7.5 }]; }, { klass: "standard", tobacco: false });

eadd("Age 35 -> below minimum issue age (40) -> decline", d => { d.age = 35; }, { klass: "decline", tobacco: false });

eadd("Age 86 -> above maximum issue age (85) -> decline", d => { d.age = 86; }, { klass: "decline", tobacco: false });

eadd("Face 100K -> exceeds $40K maximum -> financial review", d => { d.faceAmount = 100000; }, { klass: "preferred", tobacco: false, wantFlag: "financial_review" });

eadd("Alzheimer's dementia -> knock-out decline", d => { d.conditions = [{ id: "dementia", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

/* ---- Quility Term Plus (Legal & General America) ----------------------- */
const qbase2 = JSON.parse(JSON.stringify(base));
qbase2.carrier = "quility";
qbase2.usedNicotine = "no";

function qadd2(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(qbase2));
  mutate(d);
  scenarios.push({ name: "[Quility] " + name, d, expect });
}

qadd2("Healthy clean profile -> Preferred Plus", d => {}, { klass: "preferred_plus", tobacco: false });

qadd2("Cancer resolved 3 yrs ago -> decline (10-yr window)", d => { d.conditions = [{ id: "other_cancer", status: "resolved", resolvedYears: 3, severity: "moderate", control: "good" }]; }, { klass: "decline", tobacco: false });

qadd2("DUI 1 yr ago -> decline (within 2-yr window)", d => { d.seriousDriving = true; d.seriousDrivingYears = 1; }, { klass: "decline", tobacco: false });

qadd2("DUI 3 yrs ago -> accepted (outside 2-yr window)", d => { d.seriousDriving = true; d.seriousDrivingYears = 3; }, { klass: "preferred_plus", tobacco: false });

qadd2("Diabetes A1c 7.5 onset 45 -> Standard (accepted criteria)", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good", a1c: 7.5, onsetAge: 45 }]; }, { klass: "standard", tobacco: false });

qadd2("Diabetes A1c 8.5 -> decline (requires A1c < 8)", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "fair", a1c: 8.5, onsetAge: 45 }]; }, { klass: "decline", tobacco: false });

qadd2("Felony / probation -> declinable non-medical", d => { d.criminalActive = true; }, { klass: "decline", tobacco: false });

qadd2("Build 70in/250lb -> Standard Plus (5'10\" Standard Plus band 226-285)", d => { d.heightIn = 70; d.weightLb = 250; }, { klass: "standard_plus", tobacco: false });

qadd2("Build 70in/340lb -> above Standard max -> decline (no tables)", d => { d.heightIn = 70; d.weightLb = 340; }, { klass: "decline", tobacco: false });

/* ---- Corebridge / AGL (SimpliNow Legacy SIWL, ages 50-80) -------------- */
const cbase = JSON.parse(JSON.stringify(base));
cbase.carrier = "corebridge";
cbase.age = 55;
cbase.usedNicotine = "no";

function cadd(name, mutate, expect) {
  const d = JSON.parse(JSON.stringify(cbase));
  mutate(d);
  scenarios.push({ name: "[Corebridge] " + name, d, expect });
}

cadd("Healthy clean profile -> Level benefit (preferred)", d => {}, { klass: "preferred", tobacco: false });

cadd("Warfarin on Rx exclusion list -> decline", d => { d.medicationsText = "warfarin 5mg daily"; }, { klass: "decline", tobacco: false });

cadd("Dementia -> decline (ever)", d => { d.conditions = [{ id: "dementia", status: "current", severity: "severe", control: "poor" }]; }, { klass: "decline", tobacco: false });

cadd("Diabetes A1c 8.8 -> Graded benefit (standard)", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "fair", a1c: 8.8 }]; }, { klass: "standard", tobacco: false });

cadd("Diabetes A1c 10.5 -> decline", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "poor", a1c: 10.5 }]; }, { klass: "decline", tobacco: false });

cadd("Age 45 -> below minimum issue age (50) -> decline", d => { d.age = 45; }, { klass: "decline", tobacco: false });

cadd("Age 81 -> above maximum issue age (80) -> decline", d => { d.age = 81; }, { klass: "decline", tobacco: false });

cadd("Organ transplant -> decline (ever)", d => { d.conditions = [{ id: "transplant", status: "current", severity: "severe" }]; }, { klass: "decline", tobacco: false });

/* ---- Lane-data integrity (Transamerica FE / Foresters PlanRight / AMAM Home Certainty) ---- */
const LANES = context.__CARRIERS;
let lanePass = 0, laneFail = 0;
function laneAssert(name, fn) {
  try {
    fn();
    lanePass++;
    console.log("PASS | lane-data " + name);
  } catch (e) {
    laneFail++;
    console.log("FAIL | lane-data " + name + ": " + e.message);
  }
}

// Transamerica Final Expense lane
laneAssert("Transamerica feLane exists with 12-month tobacco lookback", () => {
  const fe = LANES.transamerica.feLane;
  if (!fe) throw new Error("feLane missing");
  if (fe.tobaccoLookbackMonths !== 12) throw new Error("tobaccoLookbackMonths != 12");
  if (!fe.activityCredit || !fe.activityCredit.includes("3+ days")) throw new Error("activityCredit missing");
});
laneAssert("Transamerica feLane build chart covers 53-84in with worked-example row", () => {
  const chart = LANES.transamerica.feLane.buildChart;
  for (let h = 53; h <= 84; h++) if (!chart[h]) throw new Error("missing height " + h);
  const r = chart[66]; // 5'6"
  if (r.min !== 115 || r.pref !== 247 || r.std !== 278 || r.graded !== 297) throw new Error("5'6\" row wrong: " + JSON.stringify(r));
  // 5'6\" 250 lb is between pref (247) and std (278) — the guide's own example: Standard, upgradeable to Preferred with Activity Credit
  if (!(250 > r.pref && 250 <= r.std)) throw new Error("worked example band broken");
});
laneAssert("Transamerica feLane face bands cap at published maxima", () => {
  const bands = LANES.transamerica.feLane.faceBands;
  const byAge = Object.fromEntries(bands.map(b => [b.ages, b.max]));
  if (byAge["0-55"] !== 50000 || byAge["56-65"] !== 40000 || byAge["66-75"] !== 30000 || byAge["76-85"] !== 25000) throw new Error("face bands wrong");
  if (LANES.transamerica.feLane.declineScreens.length < 20) throw new Error("declineScreens too short");
});

// Foresters PlanRight lane
laneAssert("Foresters planright build chart covers 56-81in with row spot-check", () => {
  const chart = LANES.foresters.planright.buildChart;
  for (let h = 56; h <= 81; h++) if (!chart[h]) throw new Error("missing height " + h);
  const r = chart[66]; // 5'6"
  if (r.min !== 104 || r.pref !== 275 || r.std !== 294 || r.basic !== 315) throw new Error("5'6\" row wrong: " + JSON.stringify(r));
  if (!LANES.foresters.planright.chfRule.includes("congestive heart failure")) throw new Error("chfRule missing");
});
laneAssert("Foresters planright drug lists non-empty and combo rules wired", () => {
  const dr = LANES.foresters.planright.drugRules;
  for (const k of ["nephropathy", "neuropathy", "diabetes", "listA", "listB", "listC"]) {
    if (!dr[k] || !dr[k].length) throw new Error("drug list " + k + " empty");
  }
  if (!dr.nephropathy.includes("aranesp") || !dr.neuropathy.includes("gabapentin") || !dr.diabetes.includes("metformin")) throw new Error("spot-check meds missing");
  if (!dr.listA.includes("lisinopril") || !dr.listB.includes("metoprolol") || !dr.listC.includes("furosemide")) throw new Error("spot-check list meds missing");
});

// AMAM Home Certainty lane
laneAssert("AMAM homeCertainty lane present with mortgage requirement", () => {
  const hc = LANES.amam.homeCertainty;
  if (!hc) throw new Error("homeCertainty missing");
  if (hc.minIssueAge !== 20 || hc.maxIssueAge !== 75) throw new Error("issue ages wrong");
  if (!hc.faceRange.includes("300,000")) throw new Error("faceRange wrong");
  if (!hc.mortgageRequirement.includes("mortgage")) throw new Error("mortgage requirement missing");
});

// Corebridge knockout source: the SimpliNow Legacy knockout questions doc
// (AGLC201492 REV0425) screens "Steps 1-5" as not eligible and "Sections A-D"
// as graded; a BMI below 22.5 is listed as graded, not declined.
laneAssert("Corebridge build rules surface the BMI<22.5 graded knockout", () => {
  const cb = LANES.corebridge;
  const low = cb.build && cb.build.rules && cb.build.rules.lowBuildReview;
  const note = cb.build && cb.build.rules && cb.build.rules.note;
  if (!low || !/(BMI|body mass index)/i.test(low)) throw new Error("lowBuildReview missing BMI guidance");
  if (!/22\.5/.test(low)) throw new Error("lowBuildReview missing BMI<22.5 threshold");
  if (!/graded/.test(low)) throw new Error("lowBuildReview missing graded outcome");
  if (![50, 80].includes(cb.eligibility.minIssueAge) || ![50, 80].includes(cb.eligibility.maxIssueAge)) throw new Error("eligibility ages not 50-80");
});

let pass = 0, fail = 0;

// ---- cross-carrier gate-dedup probe --------------------------------------
// Regression guard for the gate dedup fix: every ruleset must emit at most one
// decline/postpone gate entry per condition id (a condition's published text
// and its auto-decline trigger are the same screen). Runs representative
// severe-condition profiles across all carriers and asserts the property.
const dedupProbes = [
  ["HIV severe", d => { d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }],
  ["Dementia severe", d => { d.conditions = [{ id: "dementia", status: "current", severity: "severe", control: "poor" }]; }],
  ["COPD severe", d => { d.conditions = [{ id: "copd", status: "current", severity: "severe", control: "poor" }]; }],
  ["CAD severe", d => { d.conditions = [{ id: "cad", status: "current", severity: "severe", control: "poor" }]; }],
  ["Diabetes on insulin", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "fair", insulin: true }]; }],
  ["Cancer resolved 2 yr", d => { d.conditions = [{ id: "other_cancer", status: "resolved", resolvedYears: 2, severity: "moderate", control: "good" }]; }],
  ["Stroke recent severe", d => { d.conditions = [{ id: "stroke", status: "current", severity: "severe", control: "poor", recentEvent: true }]; }],
  ["Pending test + HIV", d => { d.pendingTests = "yes"; d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }]
];
for (const carrier of CARRIER_IDS) {
  for (const [pname, mutate] of dedupProbes) {
    const d = JSON.parse(JSON.stringify(base));
    d.carrier = carrier;
    mutate(d);
    const out = Engine.run(carrier, d);
    const dupKeys = [];
    for (const kind of ["decline", "postpone"]) {
      const seen = new Set();
      for (const g of out.gates[kind]) {
        const key = g.id || g.text;
        if (seen.has(key)) dupKeys.push(kind + " #" + key);
        seen.add(key);
      }
    }
    if (!dupKeys.length) { pass++; console.log("PASS | dedup probe " + pname + " [" + carrier + "]"); }
    else {
      fail++;
      console.log("FAIL | dedup probe " + pname + " [" + carrier + "] duplicate gate keys: " + dupKeys.join(", "));
      console.log("      decline:", JSON.stringify(out.gates.decline));
      console.log("      postpone:", JSON.stringify(out.gates.postpone));
    }
  }
}

// ---- results-page contract probe -----------------------------------------
// The results page renders every emitted class through rules.classInfo (hero
// chip, domain chips, range). Assert the engine only emits classes the carrier
// documents, that declared classInfo entries are well-formed with known class
// keys, and that gate entries are renderable. A carrier that omits a classInfo
// entry fails here instead of rendering an unlabeled gray chip.
const KNOWN_EXTRA_CLASSES = ["tobacco_plus"]; // classInfo-only labels, never engine classes
const CONTRACT_SENTINELS = new Set(["tobacco", "bp_outside", "lipids_outside", "driving_outside", "substandard_review", "manual_review", "postpone", "decline"]);
const contractProbes = [
  ["clean", d => {}],
  ["BP 138/88", d => { d.bpSys = 138; d.bpDia = 88; }],
  ["BP 162/98", d => { d.bpSys = 162; d.bpDia = 98; }],
  ["Build heavy 70in/245lb", d => { d.heightIn = 70; d.weightLb = 245; }],
  ["Nicotine 3 mo ago", d => { d.usedNicotine = "yes"; d.nicotineLastUse = monthsAgo(3); d.nicotineProduct = "cigarette"; }],
  ["Quit nicotine 30 mo", d => { d.usedNicotine = "yes"; d.nicotineLastUse = monthsAgo(30); d.nicotineProduct = "vape"; }],
  ["Parent CV death", d => { d.famCardio = "parent"; }],
  ["Hazardous occupation", d => { d.occupationHazardous = "yes"; }],
  ["Depression current", d => { d.conditions = [{ id: "depression", status: "current", severity: "moderate", control: "good" }]; }],
  ["Diabetes type 2", d => { d.conditions = [{ id: "diabetes", status: "current", severity: "moderate", control: "good" }]; }],
  ["Cancer resolved 2 yr", d => { d.conditions = [{ id: "other_cancer", status: "resolved", resolvedYears: 2, severity: "moderate", control: "good" }]; }],
  ["Pending test", d => { d.pendingTests = "yes"; }],
  ["HIV severe", d => { d.conditions = [{ id: "hiv", status: "current", severity: "severe", control: "poor" }]; }],
  ["Invalid build", d => { d.heightIn = 96; }]
];
const classInfoCovered = (rules, k) => {
  const ci = rules.classInfo && rules.classInfo[k];
  return ci && typeof ci.name === "string" && ci.name.length > 0 && typeof ci.color === "string" && ci.color.length > 0;
};
for (const carrier of CARRIER_IDS) {
  const crules = context.__CARRIERS[carrier];
  // Declared classInfo entries: known class keys, well-formed name + color.
  for (const [key, entry] of Object.entries(crules.classInfo || {})) {
    const known = CLASS_ORDER.includes(key) || KNOWN_EXTRA_CLASSES.includes(key);
    const wellFormed = entry && typeof entry.name === "string" && entry.name.length > 0 && typeof entry.color === "string" && entry.color.length > 0;
    if (known && wellFormed) { pass++; console.log("PASS | contract classInfo " + carrier + ":" + key); }
    else {
      fail++;
      console.log("FAIL | contract classInfo " + carrier + ":" + key + (known ? " malformed (need non-empty name + color)" : " unknown class key"));
    }
  }
  for (const [pname, mutate] of contractProbes) {
    const d = JSON.parse(JSON.stringify(base));
    d.carrier = carrier;
    mutate(d);
    const out = Engine.run(carrier, d);
    const problems = [];
    const fc = out.finalClass;
    if (!CLASS_ORDER.includes(fc) && fc !== "manual_review") problems.push("finalClass " + fc + " is not a known class");
    else if (fc !== "manual_review" && !classInfoCovered(crules, fc)) problems.push("finalClass " + fc + " has no classInfo name/color");
    for (const [rk, rv] of [["range.low", out.range && out.range.low], ["range.high", out.range && out.range.high]]) {
      if (rv && rv !== "manual_review" && !classInfoCovered(crules, rv)) problems.push(rk + " " + rv + " has no classInfo");
    }
    for (const [dk, dv] of Object.entries(out.domains || {})) {
      if (dv && dv.klass && !CONTRACT_SENTINELS.has(dv.klass) && !classInfoCovered(crules, dv.klass)) problems.push("domain " + dk + " klass " + dv.klass + " has no classInfo");
    }
    for (const kind of ["decline", "postpone"]) {
      for (const g of out.gates[kind]) {
        if (!g || (!g.text && !g.id)) problems.push("gate " + kind + " entry has neither text nor id");
      }
    }
    if (!problems.length) { pass++; console.log("PASS | contract probe " + pname + " [" + carrier + "]"); }
    else {
      fail++;
      console.log("FAIL | contract probe " + pname + " [" + carrier + "]: " + problems.join("; "));
    }
  }
}
// Soft report: classes declared in classInfo that the engine source can never
// emit (documentation-only entries — a possible feature gap, not a failure).
for (const carrier of CARRIER_IDS) {
  const never = Object.keys(context.__CARRIERS[carrier].classInfo || {}).filter(k => !engine.includes(k));
  if (never.length) console.log("WARN | contract " + carrier + " classInfo documents classes the engine never emits: " + never.join(", "));
}

// ---- eligibility-block probe ------------------------------------------------
// The carrier panel renders a product lineup + eligibility notes from
// rules.eligibility — every carrier must carry a well-formed block.
for (const carrier of CARRIER_IDS) {
  const e = context.__CARRIERS[carrier].eligibility || {};
  const missing = ["products", "issueAges", "faceRange", "residency"].filter(f => !e[f]);
  const notesOk = Array.isArray(e.notes) && e.notes.length >= 1;
  const chartsOk = Array.isArray(e.charts) && e.charts.length >= 1 && e.charts.every(c => c.product && c.ages && c.face);
  if (!missing.length && notesOk && chartsOk) {
    pass++;
    console.log("PASS | eligibility probe " + carrier + " -> " + e.products + " | " + e.charts.length + " chart rows, " + e.notes.length + " notes");
  } else {
    fail++;
    console.log("FAIL | eligibility probe " + carrier + " missing: " + missing.join(", ") + (notesOk ? "" : " (notes)") + (chartsOk ? "" : " (charts)"));
  }
}

// ---- evidence-content probe -----------------------------------------------
// Regression guard for the APS mapping. A copy-paste bug mapped transplant to
// "APS: Paralysis" (all seven carriers), and paralysis had no APS line at all.
// Each condition must produce its carrier-published APS trigger, and
// transplant must never echo the paralysis label.
const evidenceProbes = [
  ["transplant", "Transplant", "Paralysis"], // expect label, must-not-contain
  ["paralysis", "Paralysis", null],
  ["stroke", "Stroke / TIA", null],
  ["dementia", "Cognitive disorders", null]
];
for (const carrier of CARRIER_IDS) {
  for (const [cond, expectLabel, forbidden] of evidenceProbes) {
    const d = JSON.parse(JSON.stringify(base));
    d.carrier = carrier;
    d.conditions = [{ id: cond, status: "current", severity: "moderate", control: "good" }];
    const out = Engine.run(carrier, d);
    const apsLines = ((out.evidence && out.evidence.list) || []).filter(l => /^APS:/.test(l));
    const hasLabel = apsLines.some(l => l.toLowerCase().includes(expectLabel.toLowerCase()));
    const noForbidden = forbidden === null || !apsLines.some(l => l.toLowerCase().includes(forbidden.toLowerCase()));
    if (hasLabel && noForbidden) { pass++; console.log("PASS | evidence probe " + cond + " [" + carrier + "] -> APS " + expectLabel); }
    else {
      fail++;
      console.log("FAIL | evidence probe " + cond + " [" + carrier + "] expected APS " + expectLabel + (forbidden ? " and no " + forbidden : "") + " got: " + JSON.stringify(apsLines));
    }
  }
}

// ---- Transamerica per-band requirement-grid probe -------------------------
// Transamerica publishes per-product age-and-face-amount requirement charts
// (p. 7-9) with codes Vitals, BCP, HOS, MVR, CS, PFS, ECG, IR. The engine
// must render those codes instead of the generic grid, unioned across the
// three product charts (no product is selected). A regression here would
// silently fall back to the Banner-flavored generic grid.
const gridProbes = [
  // [age, face, required codes, forbidden codes]
  [30, 40000, ["MVR"], ["Vitals", "BCP", "HOS", "CS", "PFS", "ECG", "IR"]],
  [30, 300000, ["MVR"], ["Vitals", "BCP", "HOS", "CS", "PFS", "ECG", "IR"]],
  [58, 300000, ["Vitals", "BCP", "HOS", "MVR"], ["CS", "PFS", "ECG", "IR"]],
  [73, 300000, ["Vitals", "BCP", "HOS", "CS", "MVR"], ["PFS", "ECG", "IR"]],
  [83, 300000, ["Vitals", "BCP", "HOS", "CS", "MVR"], ["PFS", "ECG", "IR"]],
  [45, 4000000, ["Vitals", "BCP", "HOS", "PFS", "MVR", "IR"], ["CS", "ECG"]],
  [50, 15000000, ["Vitals", "BCP", "HOS", "ECG", "PFS", "MVR", "IR"], ["CS"]],
  [65, 1500000, ["Vitals", "BCP", "HOS", "PFS", "MVR"], ["CS", "ECG", "IR"]]
];
for (const [age, face, expect, forbid] of gridProbes) {
  const d = JSON.parse(JSON.stringify(base));
  d.carrier = "transamerica";
  d.age = age;
  d.faceAmount = face;
  const out = Engine.run("transamerica", d);
  const items = ((out.evidence && out.evidence.list) || []).map(i => i.toLowerCase());
  const missing = expect.filter(e => !items.some(i => i.startsWith(e.toLowerCase())));
  const bad = forbid.filter(f => items.some(i => i.startsWith(f.toLowerCase())));
  if (!missing.length && !bad.length) {
    pass++;
    console.log("PASS | grid probe age " + age + " face $" + face.toLocaleString() + " -> " + expect.join("+"));
  } else {
    fail++;
    console.log("FAIL | grid probe age " + age + " face $" + face.toLocaleString() + " missing: " + missing.join(",") + " forbidden: " + bad.join(",") + " got: " + JSON.stringify(out.evidence && out.evidence.list));
  }
}
{
  // Structural guard: Transamerica owns the grid mechanism and nothing else
  // may silently combine it with the generic grid.
  const ta = context.__CARRIERS.transamerica.evidence;
  const gridsOk = Array.isArray(ta.requirementGrids) && ta.requirementGrids.length >= 3 &&
    ta.genericGrid === false && ta.requirementGrids.every(g => Array.isArray(g.ages) && Array.isArray(g.rows) && g.rows.every(r => Array.isArray(r.cells) && r.cells.length === g.ages.length));
  if (gridsOk) { pass++; console.log("PASS | grid probe structure -> 3 product grids, genericGrid off"); }
  else { fail++; console.log("FAIL | grid probe structure: requirementGrids malformed or genericGrid not false"); }
}

for (const s of scenarios) {
  const out = Engine.run(s.d.carrier, s.d);
  const got = { klass: out.finalClass, tobacco: !!out.tobaccoClass };
  let ok = got.klass === s.expect.klass && got.tobacco === s.expect.tobacco;
  if (ok && s.expect.wantMissing) {
    for (const dom of s.expect.wantMissing) {
      const v = out.domains[dom];
      if (!v || !v.missing) { ok = false; break; }
    }
  }
  if (ok && s.expect.wantConfidence) ok = out.confidence && out.confidence.level === s.expect.wantConfidence;
  if (ok && s.expect.wantDeclineGates !== undefined) ok = (out.gates.decline || []).length === s.expect.wantDeclineGates;
  if (ok && s.expect.wantPostponeGates !== undefined) ok = (out.gates.postpone || []).length === s.expect.wantPostponeGates;
  if (ok && s.expect.wantFlatExtra !== undefined) ok = (!!out.flatExtra) === s.expect.wantFlatExtra;
  if (ok && s.expect.wantFlatBase !== undefined) ok = out.flatExtra && out.flatExtra.baseClass === s.expect.wantFlatBase;
  if (ok && s.expect.wantTobaccoPlus !== undefined) ok = (!!out.tobaccoPlus) === s.expect.wantTobaccoPlus;
  if (ok && s.expect.noCredit) ok = !out.possibleCredit;
  if (ok && s.expect.wantCredit) ok = !!out.possibleCredit;
  if (ok && s.expect.wantMeds) {
    const m = out.medications || {};
    const w = s.expect.wantMeds;
    if (w.missing !== undefined && ok) ok = m.missing === w.missing;
    if (w.disclosed !== undefined && ok) ok = (m.disclosed || []).length === w.disclosed;
    if (w.undisclosed !== undefined && ok) ok = (m.undisclosed || []).length === w.undisclosed;
    if (w.aps !== undefined && ok) ok = (m.apsTriggers || []).length === w.aps;
  }
  if (ok && s.expect.wantFlag) ok = (out.flags || []).includes(s.expect.wantFlag);
  if (ok && s.expect.wantNoFlag) ok = !(out.flags || []).includes(s.expect.wantNoFlag);
  if (ok && s.expect.wantEvidence) {
    const list = (out.evidence && out.evidence.list) || [];
    for (const item of s.expect.wantEvidence) {
      if (!list.some(i => i.toLowerCase().includes(item.toLowerCase()))) { ok = false; break; }
    }
  }
  if (ok && s.expect.wantFin) {
    const f = out.financial || {};
    const w = s.expect.wantFin;
    if (w.multiplier !== undefined && ok) ok = f.multiplier === w.multiplier;
    if (w.ok !== undefined && ok) ok = f.ok === w.ok;
  }
  if (ok) { pass++; console.log("PASS | " + s.name + " -> " + got.klass + (got.tobacco ? " (tobacco)" : "") + (out.possibleCredit ? " [credit]" : "")); }
  else {
    fail++;
    console.log("FAIL | " + s.name + " | expected " + s.expect.klass + " got " + got.klass + (got.tobacco ? " (tobacco)" : ""));
    console.log("      gates:", JSON.stringify(out.gates).slice(0, 250));
    console.log("      domains:", JSON.stringify(Object.fromEntries(Object.entries(out.domains).map(([k, v]) => [k, v.klass]))));
    console.log("      credit:", JSON.stringify(out.possibleCredit));
    console.log("      meds:", JSON.stringify(out.medications && { missing: out.medications.missing, disclosed: out.medications.disclosed.length, undisclosed: out.medications.undisclosed.length, aps: out.medications.apsTriggers.length }));
    console.log("      evidence:", JSON.stringify(out.evidence && out.evidence.list));
    console.log("      fin:", JSON.stringify(out.financial));
  }
}
console.log("\n" + (pass + lanePass) + " passed, " + (fail + laneFail) + " failed");
process.exit(fail ? 1 : 0);
