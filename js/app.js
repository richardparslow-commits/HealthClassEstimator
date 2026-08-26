/* =========================================================================
 * HealthClassEstimator — UI application
 * -------------------------------------------------------------------------
 * Multi-step interview wizard with localStorage persistence, then a
 * case-triage results page powered by Engine.run().
 * ========================================================================= */
"use strict";

const App = (() => {

  const STORAGE_KEY = "hce_state_v1";
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* The carrier lineup — shared by the applicant-step panel, the comparison
     header, and anywhere else the carrier choice appears. */
  const CARRIER_OPTIONS = [
    ["banner", "Banner Life"],
    ["foresters", "Foresters (Your Term / AP II / SMART UL)"],
    ["transamerica", "Transamerica (Trendsetter Super / LB, IULs)"],
    ["mutual_of_omaha", "Mutual of Omaha (United of Omaha)"],
    ["fg_quantum", "F&G Quantum (Fidelity & Guaranty)"],
    ["fg_pathsetter", "F&G Pathsetter (Fidelity & Guaranty)"],
    ["national_life", "National Life Group (NL / LSW)"]
  ];

  let state = defaultState();

  function defaultState() {
    return {
      carrier: "banner",
      age: "", sex: "", state: "", occupation: "", occupationHazardous: "",
      faceAmount: "", policyPurpose: "", income: "", existingCoverage: "", replacement: "", financing: "",
      usedNicotine: "", nicotineProduct: "cigarette", nicotineLastUse: "", cigarPerMonth: "", cotinineNegative: false, cigarComorbid: false,
      marijuana: "",
      heightFt: "", heightIn: "", weightLb: "", weightOneYearAgoLb: "", weightIntentional: false, weightChangeUnintentional: false,
      bpSys: "", bpDia: "", cholTotal: "", cholHdl: "", a1c: "",
      movingViolations3yr: "", seriousDriving: false, seriousDrivingYears: "",
      criminalActive: false, bankruptcyActive: false,
      alcoholConcern: "", drugAbuse: "", drugAbuseYears: "",
      conditions: [],
      medicationsText: "",
      cirrhosis: "no", defibrillator: false, cardiomyopathy: false, dialysis: false, kidneyFailure: false, paralysisType: "paraplegia",
      strokeSevere: false, multipleStrokes: false, suicideMultiple: false, oxygenUse: false,
      a1cHigh: false, diabetesComplications: false, gastricBypassRecent: false,
      famCardio: "",
      livingSetting: "", mobility: "", adlAssistance: "", homeHealth: false,
      pendingTests: "", recentHospitalization: "", recentSurgery: "", activeSymptom: ""
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        state = Object.assign(defaultState(), saved);
      }
    } catch (e) { /* ignore */ }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function resetState() {
    state = defaultState();
    saveState();
    currentStep = 0;
    render();
  }

  /* ---------- tiny DOM helpers ---------------------------------------- */

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (k === "checked") node.checked = !!v;
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function field(label, control, hint) {
    const wrap = el("div", { class: "field" });
    wrap.appendChild(el("label", {}, [label, hint ? el("span", { class: "hint" }, hint) : null]));
    wrap.appendChild(control);
    return wrap;
  }

  function numInput(key, opts = {}) {
    const inp = el("input", { type: "number", min: opts.min || 0, max: opts.max || "", step: opts.step || "", placeholder: opts.placeholder || "" });
    if (state[key] !== "" && state[key] !== null && state[key] !== undefined) inp.value = state[key];
    inp.addEventListener("input", () => { state[key] = inp.value; saveState(); });
    return inp;
  }

  function textInput(key, opts = {}) {
    const inp = el("input", { type: "text", placeholder: opts.placeholder || "", list: opts.list || "" });
    if (state[key]) inp.value = state[key];
    inp.addEventListener("input", () => { state[key] = inp.value; saveState(); });
    return inp;
  }

  function dateInput(key) {
    const inp = el("input", { type: "date" });
    if (state[key]) inp.value = state[key];
    inp.addEventListener("change", () => { state[key] = inp.value; saveState(); });
    return inp;
  }

  function selectInput(key, options, opts = {}) {
    const sel = el("select", {});
    sel.appendChild(el("option", { value: "" }, "— select —"));
    for (const [val, label] of options) {
      const o = el("option", { value: val }, label);
      if (String(state[key]) === String(val)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => { state[key] = sel.value; saveState(); if (opts.onChange) opts.onChange(sel.value); });
    return sel;
  }

  function radioPill(key, options) {
    const wrap = el("div", { class: "radio-group" });
    for (const [val, label] of options) {
      const pill = el("div", { class: "radio-pill" + (String(state[key]) === String(val) ? " selected" : ""), role: "radio" }, label);
      pill.addEventListener("click", () => {
        state[key] = val;
        saveState();
        $$(".radio-pill", wrap).forEach(p => p.classList.remove("selected"));
        pill.classList.add("selected");
        onRadioChange(key, val);
      });
      wrap.appendChild(pill);
    }
    return wrap;
  }

  function checkPill(key, label, opts = {}) {
    const pill = el("div", { class: "check-pill" + (state[key] ? " selected" : "") }, label);
    pill.addEventListener("click", () => {
      state[key] = !state[key];
      saveState();
      pill.classList.toggle("selected");
      if (opts.onChange) opts.onChange(state[key]);
    });
    return pill;
  }

  let _radioHandlers = {};
  function onRadioChange(key, val) {
    if (_radioHandlers[key]) _radioHandlers[key](val);
  }

  /* ---------- condition catalog --------------------------------------- */

  const CONDITION_CATALOG = [
    { id: "anxiety", name: "Anxiety", group: "Mental health" },
    { id: "depression", name: "Depression", group: "Mental health" },
    { id: "bipolar", name: "Bipolar disorder", group: "Mental health" },
    { id: "schizophrenia", name: "Schizophrenia", group: "Mental health" },
    { id: "substance_treatment", name: "Alcohol/drug treatment history", group: "Substance use" },
    { id: "hypertension", name: "High blood pressure", group: "Cardiovascular" },
    { id: "high_cholesterol", name: "High cholesterol", group: "Cardiovascular" },
    { id: "cad", name: "Coronary artery disease / angina", group: "Cardiovascular" },
    { id: "heart_disease", name: "Heart disease (CHF, cardiomyopathy, valve, device)", group: "Cardiovascular" },
    { id: "stroke", name: "Stroke / TIA", group: "Cardiovascular" },
    { id: "asthma", name: "Asthma", group: "Respiratory" },
    { id: "copd", name: "COPD / emphysema / chronic bronchitis", group: "Respiratory" },
    { id: "sleep_apnea", name: "Sleep apnea", group: "Respiratory" },
    { id: "diabetes", name: "Diabetes", group: "Metabolic" },
    { id: "kidney_disease", name: "Kidney disease", group: "Other" },
    { id: "liver_disease", name: "Liver disease", group: "Other" },
    { id: "hiv", name: "HIV / AIDS", group: "Other" },
    { id: "dementia", name: "Alzheimer's / dementia", group: "Neurological" },
    { id: "seizures", name: "Seizures / epilepsy", group: "Neurological" },
    { id: "autism", name: "Autism", group: "Other" },
    { id: "skin_cancer", name: "Skin cancer (basal / squamous)", group: "Cancer" },
    { id: "other_cancer", name: "Other cancer history", group: "Cancer" },
    { id: "osteoporosis", name: "Osteoporosis", group: "Other" },
    { id: "mvp", name: "Mitral valve prolapse", group: "Cardiovascular" },
    { id: "cimt", name: "Carotid imaging (CIMT)", group: "Cardiovascular" },
    { id: "dysplastic_nevi", name: "Dysplastic nevi", group: "Other" },
    { id: "transplant", name: "Organ transplant", group: "Other" },
    { id: "paralysis", name: "Paralysis", group: "Other" }
  ];

  const GROUPS = ["Mental health", "Substance use", "Cardiovascular", "Respiratory", "Metabolic", "Cancer", "Neurological", "Other"];

  function getConditionState(id) {
    let c = state.conditions.find(x => x.id === id);
    if (!c) {
      c = { id, status: "current", severity: "mild", control: "good", resolvedYears: "", medCount: "", onsetAge: "", a1c: "", insulin: "no", complications: "no", onsetWithin1yr: false, suicide10yr: false, stableYears: "", residualSymptoms: false, recurrence: false, treatedWithin12mo: false, yearsSober: "", relapse: false, count: "", recentEvent: false, postponeTrigger: false, declineTrigger: false, defibrillator: false, cardiomyopathy: false };
      state.conditions.push(c);
      saveState();
    }
    return c;
  }

  function condDetailForm(id) {
    const c = getConditionState(id);
    const meta = CARRIER_RULES[state.carrier].medicalCeilings.find(m => m.id === id);
    const wrap = el("div", { class: "cond-detail" });
    wrap.appendChild(el("h4", {}, [catalogName(id), meta && meta.worse ? el("span", { class: "hint", html: " &nbsp;·&nbsp; " + meta.worse }) : null]));

    const row1 = el("div", { class: "field-row" });
    row1.appendChild(field("Status", radioPillKey(c, "status", [["current", "Current"], ["resolved", "Resolved / history"]])));
    row1.appendChild(field("Severity", radioPillKey(c, "severity", [["mild", "Mild"], ["moderate", "Moderate"], ["severe", "Severe"]])));
    row1.appendChild(field("Control / stability", radioPillKey(c, "control", [["good", "Good"], ["fair", "Fair"], ["poor", "Poor"]])));
    wrap.appendChild(row1);

    const row2 = el("div", { class: "field-row" });
    const med = el("input", { type: "number", min: 0, step: 1, placeholder: "0" });
    if (c.medCount !== "") med.value = c.medCount;
    med.addEventListener("input", () => { c.medCount = med.value; saveState(); });
    row2.appendChild(field("Medications (count)", med));
    const ryr = el("input", { type: "number", min: 0, step: 1, placeholder: "years" });
    if (c.resolvedYears !== "") ryr.value = c.resolvedYears;
    ryr.addEventListener("input", () => { c.resolvedYears = ryr.value; saveState(); });
    row2.appendChild(field("If resolved: years ago", ryr));
    wrap.appendChild(row2);

    /* condition-specific fields */
    const spec = el("div", {});
    if (id === "diabetes") {
      const r = el("div", { class: "field-row" });
      const onset = el("input", { type: "number", min: 0, max: 110, placeholder: "age at diagnosis" });
      if (c.onsetAge !== "") onset.value = c.onsetAge;
      onset.addEventListener("input", () => { c.onsetAge = onset.value; saveState(); });
      r.appendChild(field("Age at diagnosis", onset));
      const a1c = el("input", { type: "number", min: 0, step: 0.1, placeholder: "e.g. 6.8" });
      if (c.a1c !== "") a1c.value = c.a1c;
      a1c.addEventListener("input", () => { c.a1c = a1c.value; saveState(); });
      r.appendChild(field("Most recent A1c", a1c));
      r.appendChild(field("Insulin?", radioPillKey(c, "insulin", [["no", "No"], ["yes", "Yes"]])));
      wrap.appendChild(r);
      const r2 = el("div", { class: "field-row" });
      r2.appendChild(field("Complications (kidney, eye, nerve, vascular)?", radioPillKey(c, "complications", [["no", "No"], ["yes", "Yes"]])));
      wrap.appendChild(r2);
    }
    if (id === "bipolar") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Diagnosed within last year?", checkPillKey(c, "onsetWithin1yr", "Yes")));
      r.appendChild(field("Suicide attempt within 10 years?", checkPillKey(c, "suicide10yr", "Yes")));
      const st = el("input", { type: "number", min: 0, step: 1, placeholder: "years stable" });
      if (c.stableYears !== "") st.value = c.stableYears;
      st.addEventListener("input", () => { c.stableYears = st.value; saveState(); });
      r.appendChild(field("Years stable on treatment", st));
      wrap.appendChild(r);
    }
    if (id === "sleep_apnea") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Residual symptoms despite treatment?", checkPillKey(c, "residualSymptoms", "Yes")));
      wrap.appendChild(r);
    }
    if (id === "other_cancer" || id === "skin_cancer") {
      const r = el("div", { class: "field-row" });
      if (id === "other_cancer") {
        r.appendChild(field("Diagnosed/treated within 12 months?", checkPillKey(c, "treatedWithin12mo", "Yes")));
        r.appendChild(field("Recurrence or multiple cancers?", checkPillKey(c, "recurrence", "Yes")));
      }
      wrap.appendChild(r);
    }
    if (id === "substance_treatment") {
      const r = el("div", { class: "field-row" });
      const yr = el("input", { type: "number", min: 0, step: 1, placeholder: "years since last use" });
      if (c.yearsSober !== "") yr.value = c.yearsSober;
      yr.addEventListener("input", () => { c.yearsSober = yr.value; saveState(); });
      r.appendChild(field("Years since last use / sobriety", yr));
      r.appendChild(field("Any relapse?", checkPillKey(c, "relapse", "Yes")));
      wrap.appendChild(r);
    }
    if (id === "dysplastic_nevi") {
      const r = el("div", { class: "field-row" });
      const ct = el("input", { type: "number", min: 0, step: 1, placeholder: "number of nevi" });
      if (c.count !== "") ct.value = c.count;
      ct.addEventListener("input", () => { c.count = ct.value; saveState(); });
      r.appendChild(field("Number of atypical nevi", ct));
      wrap.appendChild(r);
    }
    if (id === "cad" || id === "heart_disease" || id === "stroke" || id === "seizures" || id === "copd") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Recent event (within postpone window)?", checkPillKey(c, "recentEvent", "Yes")));
      wrap.appendChild(r);
    }
    if (id === "heart_disease") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Defibrillator (AICD)?", checkPillKey(c, "defibrillator", "Yes")));
      r.appendChild(field("Cardiomyopathy / CHF?", checkPillKey(c, "cardiomyopathy", "Yes")));
      wrap.appendChild(r);
    }
    if (id === "paralysis") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Type", radioPillKey(c, "paralysisType", [["paraplegia", "Paraplegia"], ["quadriplegia", "Quadriplegia"]])));
      wrap.appendChild(r);
    }
    if (meta && meta.postpone) {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Postpone concern — recent event, pending workup, or unstable timing?", checkPillKey(c, "postponeTrigger", "Yes — timing/stability issue")));
      wrap.appendChild(r);
    }
    if (meta && meta.decline) {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Decline concern — severe, progressive, or prohibited presentation?", checkPillKey(c, "declineTrigger", "Yes — severe/prohibited")));
      wrap.appendChild(r);
    }
    wrap.appendChild(spec);

    // note about what the guide says for this condition
    if (meta) {
      const notes = [];
      if (meta.ceilings && meta.ceilings.length) {
        const best = meta.ceilings[0];
        notes.push(`Best possible class: ${classLabel(best.klass)} — ${best.when}.`);
      }
      if (meta.postpone) notes.push("Postpone trigger: " + meta.postpone);
      if (meta.decline) notes.push("Decline/specialist screen: " + meta.decline);
      if (notes.length) wrap.appendChild(el("div", { class: "note-box" }, notes.map(n => el("div", {}, "• " + n))));
    }
    return wrap;
  }

  function catalogName(id) {
    const c = CONDITION_CATALOG.find(x => x.id === id);
    return c ? c.name : id;
  }

  /* helpers that operate directly on a condition object */
  function radioPillKey(condObj, key, options) {
    const wrap = el("div", { class: "radio-group" });
    for (const [val, label] of options) {
      const pill = el("div", { class: "radio-pill" + (String(condObj[key]) === String(val) ? " selected" : ""), role: "radio" }, label);
      pill.addEventListener("click", () => {
        condObj[key] = val;
        saveState();
        $$(".radio-pill", wrap).forEach(p => p.classList.remove("selected"));
        pill.classList.add("selected");
      });
      wrap.appendChild(pill);
    }
    return wrap;
  }

  function checkPillKey(condObj, key, label) {
    const pill = el("div", { class: "check-pill" + (condObj[key] ? " selected" : "") }, label);
    pill.addEventListener("click", () => {
      condObj[key] = !condObj[key];
      saveState();
      pill.classList.toggle("selected");
    });
    return pill;
  }

  function classLabel(klass) {
    const info = CARRIER_RULES[state.carrier].classInfo[klass];
    return info ? info.name : klass.replace(/_/g, " ");
  }

  /* ---------- step renderers ------------------------------------------ */

  const STEPS = [
    { id: "profile", label: "Applicant", render: renderProfile },
    { id: "coverage", label: "Coverage & financial", render: renderCoverage },
    { id: "nicotine", label: "Tobacco & nicotine", render: renderNicotine },
    { id: "build", label: "Build", render: renderBuild },
    { id: "vitals", label: "Vitals & labs", render: renderVitals },
    { id: "driving", label: "Driving & criminal", render: renderDriving },
    { id: "substance", label: "Alcohol & substances", render: renderSubstance },
    { id: "medical", label: "Medical history", render: renderMedical },
    { id: "medications", label: "Medications", render: renderMedications },
    { id: "family", label: "Family history", render: renderFamily },
    { id: "functional", label: "Function & ADLs", render: renderFunctional },
    { id: "pending", label: "Pending care", render: renderPending }
  ];

  function renderProfile() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Applicant profile"));
    c.appendChild(el("p", { class: "card-sub" }, "Start with the carrier — it determines the underwriting ruleset for every estimate below."));

    /* Carrier panel: the one choice that drives the entire estimate. */
    const carrierPanel = el("div", { class: "carrier-panel" });
    carrierPanel.appendChild(el("p", { class: "carrier-label" }, "1 · Underwriting carrier"));
    carrierPanel.appendChild(selectInput("carrier", CARRIER_OPTIONS, { onChange: () => { $("#carrier-badge").textContent = CARRIER_RULES[state.carrier].name; render(); } }));
    const cr = CARRIER_RULES[state.carrier];
    carrierPanel.appendChild(el("p", { class: "carrier-desc" }, (cr.guide && cr.guide.title ? cr.guide.title + " (" + (cr.guide.version || "current edition") + ")" : cr.name) + " — build charts, BP/cholesterol thresholds, nicotine lookbacks, decline/postpone screens, and evidence requirements all come from this ruleset."));
    c.appendChild(carrierPanel);

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Age (nearest birthday)", numInput("age", { min: 0, max: 120 })));
    r1.appendChild(field("Sex", radioPill("sex", [["male", "Male"], ["female", "Female"]])));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("State of residence", textInput("state", { placeholder: "e.g. TX" })));
    r2.appendChild(field("Occupation", textInput("occupation", { placeholder: "Job title / duties" })));
    r2.appendChild(field("Hazardous occupation (heights, explosives, military, aviation, corrections, etc.)", radioPill("occupationHazardous", [["no", "No"], ["yes", "Yes"], ["unknown", "Unsure"]])));
    c.appendChild(r2);

    _radioHandlers.sex = () => {};
    _radioHandlers.occupationHazardous = () => {};
    return c;
  }

  function renderCoverage() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Coverage, purpose & financial justification"));
    c.appendChild(el("p", { class: "card-sub" }, "Carriers review the requested face amount against income, purpose, total coverage in force, and premium source."));

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Requested face amount ($)", numInput("faceAmount", { min: 0, step: 1000 }), "Application amount, plus in-force/pending coverage with the carrier."));
    r1.appendChild(field("Policy purpose", selectInput("policyPurpose", [["income", "Income replacement"], ["estate", "Estate conservation / liquidity"], ["mortgage", "Debt / mortgage"], ["business", "Business (key person / buy-sell)"], ["family", "Family protection"], ["charity", "Charitable giving"]], { })));
    r1.appendChild(field("Annual earned income ($)", numInput("income", { min: 0, step: 1000 }), "Salary, commissions, bonuses."));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("Total life coverage in force + pending, all carriers ($)", numInput("existingCoverage", { min: 0, step: 1000 })));
    r2.appendChild(field("Replacing / reducing existing coverage?", radioPill("replacement", [["no", "No"], ["yes", "Yes"]])));
    r2.appendChild(field("Third-party or financed premium?", radioPill("financing", [["no", "No"], ["yes", "Yes"]])));
    c.appendChild(r2);

    _radioHandlers.replacement = () => {};
    _radioHandlers.financing = () => {};
    return c;
  }

  function renderNicotine() {
    const c = el("div", { class: "card" });
    const rules = CARRIER_RULES[state.carrier];
    c.appendChild(el("h2", {}, "Tobacco & nicotine use"));
    c.appendChild(el("p", { class: "card-sub" }, rules.nicotine.tobaccoDefinition || "Lookbacks vary by class."));

    c.appendChild(field("Used tobacco or nicotine in the past 10 years?", radioPill("usedNicotine", [["yes", "Yes"], ["no", "No"]])));
    _radioHandlers.usedNicotine = () => render();

    const det = el("div", { class: (state.usedNicotine === "yes" ? "" : "hidden") });
    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Product", selectInput("nicotineProduct", [["cigarette", "Cigarettes"], ["cigar", "Cigars (occasional)"], ["vape", "Vaping / e-cigarettes"], ["smokeless", "Chewing tobacco / snuff"], ["nicotine_sub", "Nicotine substitutes (gum, patch, pouch)"], ["other", "Other / multiple"]], { onChange: () => render() })));
    r1.appendChild(field("Date last used", dateInput("nicotineLastUse")));
    r1.appendChild(field("Frequency", selectInput("nicotineFrequency", [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["occasional", "Occasional"]])));
    det.appendChild(r1);

    const cigarBox = el("div", { class: (state.nicotineProduct === "cigar" ? "" : "hidden") });
    const r3 = el("div", { class: "field-row" });
    r3.appendChild(field("Cigars per month", numInput("cigarPerMonth", { min: 0, step: 1 })));
    r3.appendChild(field("Urine negative for cotinine?", checkPill("cotinineNegative", "Yes (tested negative)")));
    r3.appendChild(field("Comorbid diabetes or asthma?", checkPill("cigarComorbid", "Yes")));
    cigarBox.appendChild(r3);
    det.appendChild(cigarBox);
    c.appendChild(det);

    const lookbacks = rules.nicotine.classes.map(x => {
      const months = x.lookbackMonths !== undefined ? x.lookbackMonths : (x.lookbackYears !== undefined ? x.lookbackYears * 12 : 12);
      return (x.label.split(" (")[0]) + ": " + (months >= 12 ? (months / 12) + " yr" : months + " mo");
    }).join(" · ");
    c.appendChild(el("div", { class: "note-box" }, "Nicotine lookbacks — " + lookbacks + ". " + (rules.nicotine.tobaccoDefinition ? rules.nicotine.tobaccoDefinition + " " : "") + (rules.nicotine.cigarException ? rules.nicotine.cigarException.note : "")));
    return c;
  }

  function renderBuild() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Height, weight & build"));
    c.appendChild(el("p", { class: "card-sub" }, "The class is assigned from the carrier's height/weight chart — BMI is a screening flag only. Half-inch heights round up."));

    const r1 = el("div", { class: "field-row" });
    const hf = numInput("heightFt", { min: 0, max: 8 });
    const hi = numInput("heightIn", { min: 0, max: 11 });
    r1.appendChild(field("Height — feet", hf));
    r1.appendChild(field("Height — inches", hi));
    r1.appendChild(field("Current weight (lb)", numInput("weightLb", { min: 0 })));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("Weight one year ago (lb)", numInput("weightOneYearAgoLb", { min: 0 }), "Used for the >20 lb intentional-loss adjustment."));
    r2.appendChild(field("Weight loss was intentional?", checkPill("weightIntentional", "Yes — diet/exercise/surgery")));
    r2.appendChild(field("Unexplained / illness-related change?", checkPill("weightChangeUnintentional", "Yes")));
    c.appendChild(r2);

    const buildNote = CARRIER_RULES[state.carrier].build.type === "bmi"
      ? CARRIER_RULES[state.carrier].build.rules.note
      : "Rule: if intentional loss exceeded 20 lb in the prior 12 months, add back half the pounds lost before using the chart. Weight below chart minimum or BMI under 18.5 → manual review. Weight above Standard maximum → substandard build chart (no auto table).";
    c.appendChild(el("div", { class: "note-box" }, buildNote));
    return c;
  }

  function renderVitals() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Vitals & labs"));
    c.appendChild(el("p", { class: "card-sub" }, "Current readings — carriers evaluate 2-year average blood pressure with or without treatment."));

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Blood pressure — systolic", numInput("bpSys", { min: 0, max: 300 })));
    r1.appendChild(field("Blood pressure — diastolic", numInput("bpDia", { min: 0, max: 200 })));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("Total cholesterol", numInput("cholTotal", { min: 0, max: 500 })));
    r2.appendChild(field("HDL cholesterol", numInput("cholHdl", { min: 0, max: 200 })));
    r2.appendChild(field("Most recent A1c (if diabetic)", numInput("a1c", { min: 0, step: 0.1, max: 20 })));
    c.appendChild(r2);

    c.appendChild(el("div", { class: "note-box" }, "Blood-pressure and cholesterol ceilings vary by class and, for some carriers, by age band — the results page applies the selected carrier's exact thresholds. Carriers evaluate the 2-year average reading with or without treatment."));
    return c;
  }

  function renderDriving() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Driving, criminal & financial history"));
    c.appendChild(el("p", { class: "card-sub" }, "These non-medical factors affect class and eligibility; carriers run MVR and criminal checks."));

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Moving violations in last 3 years", numInput("movingViolations3yr", { min: 0, max: 30 })));
    r1.appendChild(field("DUI / DWI, reckless driving, or suspension/revocation?", checkPill("seriousDriving", "Yes")));
    const yr = el("input", { type: "number", min: 0, step: 1, placeholder: "years since last offense" });
    if (state.seriousDrivingYears !== "") yr.value = state.seriousDrivingYears;
    yr.addEventListener("input", () => { state.seriousDrivingYears = yr.value; saveState(); });
    r1.appendChild(field("Years since last serious offense", yr));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("Currently in jail, awaiting trial, on probation/parole, or major convictions?", checkPill("criminalActive", "Yes")));
    r2.appendChild(field("Active bankruptcy (Ch. 7 not discharged / Ch. 13 < 2 yrs)?", checkPill("bankruptcyActive", "Yes")));
    c.appendChild(r2);

    c.appendChild(el("div", { class: "note-box" }, "Driving limits vary by carrier and class — DUI/reckless/suspension lookbacks of 2-5 years and violation limits are applied per the selected carrier. Criminal exposure or active bankruptcy is a decline screen."));
    return c;
  }

  function renderSubstance() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Alcohol & substance use"));
    c.appendChild(el("p", { class: "card-sub" }, "Marijuana is rated separately from tobacco — it never forces a tobacco class; carriers apply their own frequency and medicinal-use rules."));

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Alcohol concerns", radioPill("alcoholConcern", [["no", "None"], ["history", "History — resolved"], ["active", "Current use / abuse"]])));
    r1.appendChild(field("Non-marijuana drug abuse", radioPill("drugAbuse", [["no", "No"], ["yes", "Yes"]])));
    const dy = el("input", { type: "number", min: 0, step: 1, placeholder: "years since last use" });
    if (state.drugAbuseYears !== "") dy.value = state.drugAbuseYears;
    dy.addEventListener("input", () => { state.drugAbuseYears = dy.value; saveState(); });
    r1.appendChild(field("Years since last drug use", dy));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("Marijuana / cannabis use", selectInput("marijuana", [["none", "None"], ["infrequent", "Infrequent recreational"], ["frequent", "Frequent / more than weekly"], ["daily", "Daily use"], ["medicinal", "Medicinal"]])));
    r2.appendChild(field("Multiple suicide attempts?", checkPill("suicideMultiple", "Yes")));
    c.appendChild(r2);

    const mjNote = (CARRIER_RULES[state.carrier].nicotine && CARRIER_RULES[state.carrier].nicotine.marijuana) ? CARRIER_RULES[state.carrier].nicotine.marijuana + " " : "";
    c.appendChild(el("div", { class: "note-box" }, mjNote + "Decline screen: current alcohol abuse or abstinence < 2 years; non-marijuana drug use within 3 years or multiple relapses. Single suicide attempt within 2 years → postpone."));
    return c;
  }

  function renderMedical() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Medical history"));
    c.appendChild(el("p", { class: "card-sub" }, "Select each condition disclosed in the interview. For each, record status, severity, control, and the condition-specific details — the estimator uses control, duration, complications, and treatment intensity, not just the diagnosis label."));

    for (const group of GROUPS) {
      const items = CONDITION_CATALOG.filter(x => x.group === group);
      if (!items.length) continue;
      c.appendChild(el("h3", {}, group));
      const grid = el("div", { class: "cond-grid" });
      for (const it of items) {
        const selected = state.conditions.some(x => x.id === it.id);
        const item = el("div", { class: "cond-item" + (selected ? " selected" : "") });
        const cb = el("input", { type: "checkbox" });
        cb.checked = selected;
        cb.addEventListener("change", () => {
          if (cb.checked) {
            getConditionState(it.id);
            item.classList.add("selected");
          } else {
            state.conditions = state.conditions.filter(x => x.id !== it.id);
            saveState();
            item.classList.remove("selected");
          }
          render();
        });
        item.appendChild(cb);
        item.appendChild(el("span", {}, it.name));
        item.addEventListener("click", (e) => { if (e.target.tagName !== "INPUT") cb.click(); });
        grid.appendChild(item);
      }
      c.appendChild(grid);
    }

    // Condition detail forms for selected conditions
    const sel = state.conditions.map(x => x.id);
    if (sel.length) {
      c.appendChild(el("h3", {}, "Condition details"));
      const detWrap = el("div", {});
      for (const id of sel) {
        detWrap.appendChild(condDetailForm(id));
      }
      c.appendChild(detWrap);
    } else {
      c.appendChild(el("div", { class: "note-box" }, "No conditions selected — the estimate will assume a clean medical history. Make sure this matches the interview."));
    }

    // Global medical flags
    c.appendChild(el("h3", {}, "Additional medical flags"));
    const r = el("div", { class: "field-row" });
    r.appendChild(field("Gastric bypass within 6 months?", checkPill("gastricBypassRecent", "Yes")));
    r.appendChild(field("Oxygen use?", checkPill("oxygenUse", "Yes")));
    c.appendChild(r);
    return c;
  }

  function renderMedications() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Medications & prescriptions"));
    c.appendChild(el("p", { class: "card-sub" }, "List current prescription medications (generic or brand names, comma-separated). The app cross-checks them against disclosed conditions and the carrier's APS triggers — carriers see your applicant's prescription history, so undisclosed conditions surface at underwriting regardless."));

    const ta = el("textarea", { rows: 4, placeholder: "e.g. metformin, lisinopril, atorvastatin — or 'none'" });
    if (state.medicationsText) ta.value = state.medicationsText;
    ta.addEventListener("input", () => { state.medicationsText = ta.value; saveState(); });
    c.appendChild(field("Current prescription medications", ta));
    c.appendChild(el("div", { class: "note-box" }, "If the applicant takes no medications, enter 'none'. Entering a medication that suggests a condition not disclosed raises a mismatch flag — confirm with the applicant and update the medical history before submission. Over-the-counter items (aspirin, vitamins) are generally not material. The reference dictionary covers common generics and brands for the conditions in the history catalog."));
    return c;
  }

  function renderFamily() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Family history"));
    c.appendChild(el("p", { class: "card-sub" }, "Cardiovascular death in parents/siblings before age 60 is the primary class factor. Cancer family history no longer prevents preferred consideration."));

    c.appendChild(field("Cardiovascular death in family before age 60",
      radioPill("famCardio", [["none", "None"], ["parent", "One parent"], ["parent_sibling", "Parent or sibling"], ["multiple", "More than one parent"]])));

    c.appendChild(el("div", { class: "note-box" }, "Early cardiovascular death in parents/siblings before age 60 is the primary class factor; some carriers also include listed cancers. See the selected carrier's criteria on the results page."));
    _radioHandlers.famCardio = () => {};
    return c;
  }

  function renderFunctional() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Functional status & activities of daily living"));
    c.appendChild(el("p", { class: "card-sub" }, "These facts can signal higher-severity conditions and are explicit eligibility screens — assistance with ADLs, facility care, or chronic wheelchair use is a specialist-review trigger."));

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Living setting", selectInput("livingSetting", [["home", "Private residence"], ["assisted", "Assisted living"], ["nursing", "Nursing / skilled-care facility"], ["psychiatric", "Psychiatric facility"], ["hospice", "Hospice"]])));
    r1.appendChild(field("Mobility", selectInput("mobility", [["independent", "Independent"], ["cane", "Cane"], ["walker", "Walker"], ["wheelchair_temp", "Wheelchair — temporary"], ["wheelchair_chronic", "Wheelchair — chronic"], ["bedbound", "Bedbound"]])));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("Help needed with medications, bathing, dressing, eating, toileting, transferring, or continence?", radioPill("adlAssistance", [["no", "No"], ["yes", "Yes"]])));
    r2.appendChild(field("Home-health care?", checkPill("homeHealth", "Yes")));
    c.appendChild(r2);

    c.appendChild(el("div", { class: "note-box" }, "Banner: any ADL assistance, facility/hospice/home-health care, or chronic wheelchair dependence → specialist review / likely decline screen — a hard stop before submission."));
    return c;
  }

  function renderPending() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Pending care, referrals & symptoms"));
    c.appendChild(el("p", { class: "card-sub" }, "Banner explicitly asks about pending evaluations, referrals, upcoming care, and recent symptoms. Unfinished outcomes can matter more than known history — these are postpone triggers, not routine 'yes' answers."));

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Pending biopsy, test, referral, or evaluation with unknown results?", radioPill("pendingTests", [["no", "No"], ["yes", "Yes"]])));
    r1.appendChild(field("Hospitalization or advised hospitalization in past 4 months?", radioPill("recentHospitalization", [["no", "No"], ["yes", "Yes"]])));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("Surgery performed or recommended in past 4 months?", radioPill("recentSurgery", [["no", "No"], ["yes", "Yes"]])));
    r2.appendChild(field("New/unexplained symptom under first-time evaluation (bleeding, lump, fainting, persistent cough, changing mole)?", radioPill("activeSymptom", [["no", "No"], ["yes", "Yes"]])));
    c.appendChild(r2);

    c.appendChild(el("div", { class: "note-box" }, "Any 'Yes' above routes the case to Postpone / pre-review until the outcome is known — the missing result can matter more than the known history."));
    return c;
  }

  /* ---------- navigation & render ------------------------------------- */

  let currentStep = 0;
  const isResults = () => $("#results-content") && !$("#results-content").classList.contains("hidden");

  function render() {
    renderStepsNav();
    const content = $("#step-content");
    content.innerHTML = "";
    content.appendChild(STEPS[currentStep].render());

    const btnNext = $("#btn-next");
    const btnBack = $("#btn-back");
    const isLast = currentStep === STEPS.length - 1;
    btnNext.textContent = isLast ? "Run estimate →" : "Next →";
    btnBack.style.visibility = currentStep === 0 ? "hidden" : "visible";
    btnNext.onclick = () => {
      if (isLast) {
        // Tobacco & nicotine is a required question: an unanswered answer must
        // not silently estimate the best non-tobacco class.
        if (state.usedNicotine === "") {
          showToast("Please answer the Tobacco & nicotine question first.");
          const ni = STEPS.findIndex(s => s.id === "nicotine");
          if (ni >= 0) { currentStep = ni; render(); window.scrollTo(0, 0); }
          return;
        }
        runEstimate();
      } else { currentStep++; render(); window.scrollTo(0, 0); }
    };
    btnBack.onclick = () => { if (currentStep > 0) { currentStep--; render(); window.scrollTo(0, 0); } };
  }

  function renderStepsNav() {
    const nav = $("#steps-nav");
    nav.innerHTML = "";
    STEPS.forEach((s, i) => {
      const pill = el("div", {
        class: "step-pill" + (i === currentStep ? " active" : i < currentStep ? " done" : ""),
        onclick: () => { currentStep = i; render(); }
      });
      pill.appendChild(el("span", { class: "step-num" }, String(i + 1)));
      pill.appendChild(el("span", {}, s.label));
      nav.appendChild(pill);
    });
  }

  /* ---------- results -------------------------------------------------- */

  /* Assemble the computed fields the engine expects from the form state.
     Shared by the single-carrier estimate and the cross-carrier comparison. */
  function buildInput() {
    const d = Object.assign({}, state);
    // usedNicotine stays as the raw "yes"/"no"/"" so the engine can tell
    // an explicit answer from an unanswered question ("" -> missing, not non-tobacco).
    const hfRaw = state.heightFt, hiRaw = state.heightIn;
    d.heightIn = (hfRaw === "" || hiRaw === "") ? "" : (Number(hfRaw) * 12 + Number(hiRaw));
    d.weightLb = state.weightLb === "" ? "" : Number(state.weightLb);
    d.movingViolations3yr = state.movingViolations3yr === "" ? "" : Number(state.movingViolations3yr);
    d.bpSys = state.bpSys === "" ? "" : Number(state.bpSys);
    d.bpDia = state.bpDia === "" ? "" : Number(state.bpDia);
    d.cholTotal = state.cholTotal === "" ? "" : Number(state.cholTotal);
    d.cholHdl = state.cholHdl === "" ? "" : Number(state.cholHdl);
    d.a1c = state.a1c === "" ? "" : Number(state.a1c);
    d.faceAmount = state.faceAmount === "" ? "" : Number(state.faceAmount);
    d.income = state.income === "" ? "" : Number(state.income);
    d.conditions = (d.conditions || []).map(c => {
      const copy = Object.assign({}, c);
      copy.medCount = copy.medCount === "" ? 0 : Number(copy.medCount);
      copy.onsetAge = copy.onsetAge === "" ? null : Number(copy.onsetAge);
      copy.a1c = copy.a1c === "" ? null : Number(copy.a1c);
      copy.stableYears = copy.stableYears === "" ? null : Number(copy.stableYears);
      copy.yearsSober = copy.yearsSober === "" ? null : Number(copy.yearsSober);
      copy.resolvedYears = copy.resolvedYears === "" ? null : Number(copy.resolvedYears);
      copy.count = copy.count === "" ? null : Number(copy.count);
      return copy;
    });

    // condition-level extra flags -> form-level flags the engine reads
    const diabetes = d.conditions.find(c => c.id === "diabetes");
    if (diabetes) {
      if (diabetes.a1c && Number(diabetes.a1c) > 10) d.a1cHigh = true;
      if (diabetes.complications === "yes") d.diabetesComplications = true;
    }
    const hd = d.conditions.find(c => c.id === "heart_disease");
    if (hd && hd.defibrillator) d.defibrillator = true;
    if (hd && hd.cardiomyopathy) d.cardiomyopathy = true;
    const kd = d.conditions.find(c => c.id === "kidney_disease");
    const ld = d.conditions.find(c => c.id === "liver_disease");
    if (kd) { if (d.dialysis) d.kidneyFailure = true; }
    const pl = d.conditions.find(c => c.id === "paralysis");
    if (pl) d.paralysisType = pl.paralysisType || "paraplegia";
    const st = d.conditions.find(c => c.id === "stroke");
    if (st) {
      if (st.severity === "severe") d.strokeSevere = true;
      if (st.recentEvent) d.multipleStrokes = false;
    }
    return d;
  }

  function runEstimate() {
    const out = Engine.run(state.carrier, buildInput());
    renderResults(out);
  }

  function renderResults(out) {
    $("#step-content").classList.add("hidden");
    const box = $("#results-content");
    box.classList.remove("hidden");
    box.innerHTML = "";
    box.appendChild(resultsView(out));
    window.scrollTo(0, 0);

    const btnNext = $("#btn-next");
    btnNext.textContent = "Re-run estimate";
    btnNext.onclick = () => runEstimate();
    const btnBack = $("#btn-back");
    btnBack.textContent = "← Edit answers";
    btnBack.style.visibility = "visible";
    btnBack.onclick = () => {
      $("#results-content").classList.add("hidden");
      $("#step-content").classList.remove("hidden");
      btnBack.textContent = "← Back";
      render();
    };
  }

  /* ---------- cross-carrier comparison ------------------------------- */

  /* Run the same assembled profile through every carrier ruleset and return
     { carrierId, out } rows, ordered by the carrier select list. */
  function runComparison() {
    const d = buildInput();
    return Object.keys(CARRIER_RULES).map(id => ({ id, out: Engine.run(id, d) }));
  }

  function compareClassName(out, rules) {
    if (out.finalClass === "manual_review") return { name: "Manual review", color: "#5b6b7b" };
    const ci = rules.classInfo[out.finalClass] || {};
    if (out.tobaccoClass) {
      const tName = (out.finalClass === "preferred_plus" || out.finalClass === "preferred") ? "Preferred Tobacco" :
        (out.finalClass === "table" ? "Table-rated (tobacco base)" : "Standard Tobacco");
      return { name: tName, color: "#b8860b" };
    }
    return { name: ci.name || out.finalClass.replace(/_/g, " "), color: ci.color || "#5b6b7b" };
  }

  function compareEvidence(out) {
    const list = (out.evidence && out.evidence.list) || [];
    if (!list.length) return "Application only";
    const shown = list.slice(0, 3);
    const more = list.length - shown.length;
    return shown.join("; ") + (more > 0 ? ` (+${more} more)` : "");
  }

  function compareLimiting(row) {
    const { id, out } = row;
    const parts = [];
    if (out.gates.decline.length) parts.push("Decline: " + out.gates.decline.map(g => g.text || g.id).slice(0, 2).join("; "));
    if (out.gates.postpone.length) parts.push("Postpone: " + out.gates.postpone.map(g => g.text || g.id).slice(0, 2).join("; "));
    if (!parts.length) {
      [...out.limitingFactors, ...(out.outsideFactors || [])].slice(0, 3).forEach(l => parts.push(DOMAIN_LABELS[l.domain] || l.domain));
    }
    if (!parts.length) parts.push("No single cap — consistent profile");
    return parts.join(" · ");
  }

  function compareFinancial(out) {
    if (!out.financial) return "—";
    if (out.financial.ok === false) return "Exceeds " + out.financial.multiplier + "X guideline";
    if (out.financial.ok === true) return "Within " + out.financial.multiplier + "X guideline";
    return "—";
  }

  function renderComparison(rows) {
    const wrap = el("div", { id: "comparison", class: "card" });
    wrap.appendChild(el("h2", {}, "Carrier comparison — same profile, all carriers"));
    wrap.appendChild(el("p", { class: "card-sub" }, "The same answers run through every carrier ruleset. Classes are carrier-specific labels on a shared ladder (Preferred Plus/Elite → Standard → table-rated); a tobacco profile appears in each carrier's own tobacco class. Click a row to open that carrier's full estimate."));

    /* Prominent primary-carrier panel — same treatment as the applicant step.
       Switching here re-runs the estimate and re-renders the table with the
       new carrier's row highlighted. */
    const cr = CARRIER_RULES[state.carrier];
    const prevCarrier = state.carrier; // render-time value; selectInput mutates state before onChange
    const panel = el("div", { class: "carrier-panel" });
    panel.appendChild(el("p", { class: "carrier-label" }, "Primary carrier · drives the full estimate below"));
    panel.appendChild(selectInput("carrier", CARRIER_OPTIONS, { onChange: (v) => { if (v !== prevCarrier) applyCarrierSwitch(v); } }));
    panel.appendChild(el("p", { class: "carrier-desc" }, (cr.guide && cr.guide.title ? cr.guide.title + " (" + (cr.guide.version || "current edition") + ")" : cr.name) + " — the highlighted row is this carrier's full estimate below; click any other row to switch."));
    wrap.appendChild(panel);

    const tbl = el("table", { class: "domain-table compare-table" });
    const thead = el("thead", {});
    thead.appendChild(el("tr", {}, [
      el("th", {}, "Carrier"), el("th", {}, "Estimated class"), el("th", {}, "Limiting factors / gates"), el("th", {}, "Evidence highlights"), el("th", {}, "Financial")
    ]));
    tbl.appendChild(thead);
    const tbody = el("tbody", {});
    rows.forEach(row => {
      const rules = CARRIER_RULES[row.id];
      const cn = compareClassName(row.out, rules);
      const isCurrent = row.id === state.carrier;
      // Clicking a row switches the results page to that carrier's full estimate.
      const tr = el("tr", {
        class: isCurrent ? "compare-current" : "compare-row",
        title: isCurrent ? "Current carrier — full estimate shown below" : "Open this carrier's full estimate",
        onclick: () => switchCarrier(row.id)
      });
      tr.appendChild(el("td", { style: "font-weight:600" }, [rules.name, el("div", { class: "compare-version" }, rules.guide.version)]));
      tr.appendChild(el("td", {}, el("span", { class: "klass-chip klass", style: `background:${cn.color}` }, cn.name)));
      tr.appendChild(el("td", {}, compareLimiting(row)));
      tr.appendChild(el("td", {}, compareEvidence(row.out)));
      tr.appendChild(el("td", {}, compareFinancial(row.out)));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.appendChild(tbl);

    const note = el("div", { class: "note-box" });
    note.appendChild(el("strong", {}, "How to read this: "));
    note.appendChild(document.createTextNode("Each column is the carrier's own estimated class for the same applicant — the best match varies by product and underwriting style. Click any row to switch the full estimate below to that carrier; the highlighted row is the one currently shown. This is still a preliminary, non-binding estimate based only on disclosed information; evidence, records, and carrier rules can change every result."));
    wrap.appendChild(note);
    return wrap;
  }

  function resultsView(out) {
    const rules = CARRIER_RULES[state.carrier];
    const wrap = el("div", {});

    /* ---- Hero outcome ---- */
    let heroInfo;
    if (out.finalClass === "manual_review") {
      heroInfo = { name: "Manual underwriting review", meaning: "Key evidence is missing or conflicting. Complete the intake and obtain records before estimating.", color: "#5b6b7b" };
    } else if (out.tobaccoClass && state.carrier === "foresters" && out.finalClass === "preferred_plus") {
      heroInfo = { name: "Tobacco Plus", meaning: "Nicotine use within the past year AND meets all Preferred Plus criteria (≤1 pack per day) — Foresters Tobacco Plus, subject to full evidence and carrier rules.", color: "#b8860b" };
    } else if (out.tobaccoClass && (out.finalClass === "preferred_plus" || out.finalClass === "preferred")) {
      heroInfo = { name: "Preferred Tobacco", meaning: "Otherwise favorable profile with nicotine use — carrier's Preferred Tobacco class, subject to full evidence and carrier rules.", color: "#b8860b" };
    } else if (out.tobaccoClass && (out.finalClass === "standard_plus" || out.finalClass === "standard")) {
      heroInfo = { name: "Standard Tobacco", meaning: "Average risk with nicotine use; health factors still affect the result.", color: "#8a6d1a" };
    } else if (out.tobaccoClass && out.finalClass === "table") {
      heroInfo = { name: "Table-rated (tobacco base)", meaning: "Substandard risk with nicotine use; tables are not available with preferred tobacco classes.", color: "#b8860b" };
    } else {
      heroInfo = rules.classInfo[out.finalClass] || { name: out.finalClass.replace(/_/g, " "), meaning: "", color: "#5b6b7b" };
    }

    const hero = el("div", { class: "result-hero", style: `background:linear-gradient(135deg, ${heroInfo.color}, ${shade(heroInfo.color, -25)})` });
    hero.appendChild(el("div", { class: "hero-label" }, "Preliminary estimate · " + out.carrier + " · " + out.guide.version));
    hero.appendChild(el("h2", {}, heroInfo.name));
    if (heroInfo.meaning) hero.appendChild(el("div", { class: "hero-meaning" }, heroInfo.meaning));
    const meta = el("div", { class: "hero-meta" });
    meta.appendChild(el("div", { class: "meta-item" }, [el("strong", {}, rangeLabel(out.range)), "likely range"]));
    meta.appendChild(el("div", { class: "meta-item" }, [el("strong", {}, out.confidence.level), "confidence"]));
    meta.appendChild(el("div", { class: "meta-item" }, [el("strong", {}, String(state.age || "—")), "age"]));
    if (out.tobaccoClass) meta.appendChild(el("div", { class: "meta-item" }, [el("strong", {}, "Tobacco"), "class basis"]));
    hero.appendChild(meta);
    wrap.appendChild(hero);

    /* ---- Flat-extra outcome ---- */
    if (out.flatExtra) {
      const fe = el("div", { class: "card flat-extra-card" });
      fe.appendChild(el("h2", {}, "Flat extra may apply"));
      fe.appendChild(el("p", {}, ["The estimate is a flat extra on the ", el("strong", {}, classLabel(out.flatExtra.baseClass)), " base class", out.flatExtra.tobacco ? " (tobacco class)" : "", "."]));
      fe.appendChild(el("p", { class: "card-sub" }, out.flatExtra.reason));
      wrap.appendChild(fe);
    }

    /* ---- Gate screen results ---- */
    if (out.gates.postpone.length || out.gates.decline.length) {
      if (out.gates.postpone.length) {
        const g = el("div", { class: "gate-box gate-postpone" });
        g.appendChild(el("h3", {}, "Postpone / pre-review triggers"));
        const ul = el("ul", {});
        out.gates.postpone.forEach(p => ul.appendChild(el("li", {}, [el("strong", {}, p.text || p.id), p.reason ? " — " + p.reason : ""])));
        g.appendChild(ul);
        wrap.appendChild(g);
      }
      if (out.gates.decline.length) {
        const g = el("div", { class: "gate-box gate-decline" });
        g.appendChild(el("h3", {}, "Specialist review / likely-decline triggers"));
        const ul = el("ul", {});
        out.gates.decline.forEach(p => ul.appendChild(el("li", {}, [el("strong", {}, p.text || p.id), p.reason ? " — " + p.reason : ""])));
        g.appendChild(ul);
        wrap.appendChild(g);
      }
    }

    /* ---- Summary card ---- */
    const sum = el("div", { class: "card" });
    sum.appendChild(el("h2", {}, "Case triage summary"));
    const sumList = el("ul", { class: "check-list" });
    out.summaryLines.forEach(l => sumList.appendChild(el("li", {}, l)));
    if (out.comorbidityFlags && out.comorbidityFlags.length) {
      sumList.appendChild(el("li", {}, "Combination flag: " + out.comorbidityFlags.join("; ") + " — materially different from an isolated diagnosis; specialist review recommended."));
    }
    sum.appendChild(sumList);

    /* Flags */
    const flags = el("div", { class: "flag-list", style: "margin-top:12px" });
    out.flags.forEach(f => {
      const label = FLAG_LABELS[f] || f.replace(/_/g, " ");
      const cls = FLAG_CLASS[f] || "flag-warn";
      flags.appendChild(el("span", { class: "flag " + cls }, label));
    });
    if (!out.flags.length) flags.appendChild(el("span", { class: "flag flag-ok" }, "No adverse flags — verify all disclosures"));
    sum.appendChild(el("div", { class: "field" }, [el("label", {}, "Flags"), flags]));
    wrap.appendChild(sum);

    /* ---- Medication cross-check ---- */
    const medCard = el("div", { class: "card" });
    medCard.appendChild(el("h2", {}, "Medication cross-check"));
    if (out.medications && out.medications.missing) {
      medCard.appendChild(el("p", {}, "No medications entered — add them in the Medications step to cross-check against disclosed conditions and carrier APS triggers."));
    } else if (out.medications && !out.medications.meds.length) {
      medCard.appendChild(el("p", {}, "No entered medications matched the reference dictionary — verify spellings or brand names."));
    } else if (out.medications) {
      if (out.medications.disclosed && out.medications.disclosed.length) {
        const ul = el("ul", { class: "evidence-list" });
        out.medications.disclosed.forEach(m => ul.appendChild(el("li", {}, [el("strong", {}, m.med + " → " + m.conditionName + ": "), "consistent with disclosed condition."])));
        medCard.appendChild(ul);
      }
      if (out.medications.undisclosed && out.medications.undisclosed.length) {
        const warn = el("div", { class: "gate-box gate-decline" });
        warn.appendChild(el("h3", {}, "Possible undisclosed condition — confirm with applicant"));
        const ul = el("ul", {});
        out.medications.undisclosed.forEach(m => ul.appendChild(el("li", {}, [el("strong", {}, m.med), " suggests ", m.conditionName, " — not disclosed in medical history. The carrier's prescription-history check will surface this; confirm before submission."])));
        warn.appendChild(ul);
        medCard.appendChild(warn);
      }
      if (out.medications.apsTriggers && out.medications.apsTriggers.length) {
        medCard.appendChild(el("p", { class: "card-sub" }, "APS likely from the prescription record:"));
        const ul = el("ul", { class: "evidence-list" });
        out.medications.apsTriggers.forEach(t => ul.appendChild(el("li", {}, `APS: ${t.apsText} (${t.med})`)));
        medCard.appendChild(ul);
      }
    }
    wrap.appendChild(medCard);

    /* ---- Domain breakdown ---- */
    const dom = el("div", { class: "card" });
    dom.appendChild(el("h2", {}, "Domain breakdown — least favorable factor wins"));
    const tbl = el("table", { class: "domain-table" });
    const thead = el("thead", {});
    thead.appendChild(el("tr", {}, [el("th", {}, "Risk domain"), el("th", {}, "Best supported class"), el("th", {}, "Basis")]));
    tbl.appendChild(thead);
    const tbody = el("tbody", {});
    const domainOrder = ["tobacco", "build", "bp", "cholesterol", "driving", "family", "medical", "medications", "substance", "avocation", "functional", "pending"];
    for (const key of domainOrder) {
      const v = out.domains[key];
      if (!v) continue;
      const row = el("tr", {});
      row.appendChild(el("td", { style: "font-weight:600" }, DOMAIN_LABELS[key] || key));
      let klassName = "—";
      let chipCls = "missing";
      if (v.klass === "tobacco") { klassName = "Tobacco class"; chipCls = "gate"; }
      else if (v.klass === "bp_outside") { klassName = "Outside Standard"; chipCls = "gate"; }
      else if (v.klass === "lipids_outside") { klassName = "Outside Standard"; chipCls = "gate"; }
      else if (v.klass === "driving_outside") { klassName = "Outside Standard"; chipCls = "gate"; }
      else if (v.klass === "substandard_review") { klassName = "Substandard build review"; chipCls = "gate"; }
      else if (v.klass === "manual_review") { klassName = "Manual review"; chipCls = "gate"; }
      else if (v.klass === "postpone") { klassName = "Postpone"; chipCls = "gate"; }
      else if (v.klass === "decline") { klassName = "Decline screen"; chipCls = "gate"; }
      else if (v.klass === null && v.missing) { klassName = "Not provided"; chipCls = "missing"; }
      else if (v.klass === null) { klassName = "Cross-check"; chipCls = "missing"; }
      else { klassName = classLabel(v.klass); chipCls = "klass"; }
      row.appendChild(el("td", {}, el("span", { class: "klass-chip " + chipCls, style: chipCls === "klass" ? `background:${(rules.classInfo[v.klass] || {}).color || "#5b6b7b"}` : "" }, klassName)));
      row.appendChild(el("td", {}, v.detail || v.details ? [].concat(v.details || [], v.detail || []).join(" ") : ""));
      tbody.appendChild(row);
    }
    tbl.appendChild(tbody);
    dom.appendChild(tbl);
    wrap.appendChild(dom);

    /* ---- Limiting factors ---- */
    const lim = el("div", { class: "card" });
    lim.appendChild(el("h2", {}, "What capped the estimate"));
    if (out.limitingFactors.length || out.outsideFactors.length) {
      const ul = el("ul", { class: "evidence-list" });
      out.limitingFactors.forEach(l => ul.appendChild(el("li", {}, [el("strong", {}, DOMAIN_LABELS[l.domain] + ": "), l.detail])));
      out.outsideFactors.forEach(o => ul.appendChild(el("li", {}, [el("strong", {}, DOMAIN_LABELS[o.domain] + ": "), o.reason])));
      lim.appendChild(ul);
    } else {
      lim.appendChild(el("p", {}, "No single domain capped the estimate below the provisional class — the profile is consistent."));
    }
    wrap.appendChild(lim);

    /* ---- Evidence checklist ---- */
    const ev = el("div", { class: "card" });
    ev.appendChild(el("h2", {}, "Evidence checklist & workflow"));
    const evUl = el("ul", { class: "evidence-list" });
    if (out.evidence && out.evidence.list && out.evidence.list.length) {
      out.evidence.list.forEach(i => evUl.appendChild(el("li", {}, i)));
    }
    // carrier-level items
    const age = state.age ? Number(state.age) : null;
    if (out.carrier === "Banner Life") {
      if (age !== null && age >= 20 && age <= 60 && Number(state.faceAmount || 0) <= 5000000) {
        evUl.appendChild(el("li", {}, "Accelerated underwriting may apply (ages 20-60, up to $5,000,000) — instant-decision path possible."));
      }
      if (age !== null && age >= 61 && age <= 70 && Number(state.faceAmount || 0) <= 500000) {
        evUl.appendChild(el("li", {}, "Accelerated underwriting may apply (ages 61-70, up to $500,000) — APS required."));
      }
    } else if (out.carrier === "Foresters") {
      if (age !== null && age >= 18 && age <= 60 && Number(state.faceAmount || 0) <= 2000000) {
        evUl.appendChild(el("li", {}, "Foresters accelerated underwriting may apply (ages 18-60, up to $2,000,000)."));
      }
      if (age !== null && age >= 75) evUl.appendChild(el("li", {}, "Activities of Daily Living Questionnaire required (age 75+)."));
      evUl.appendChild(el("li", {}, "Non-medical issue limits: check amount against product limits (" + rules.evidence.ageAmountNote.split(".")[0] + ")."));
    } else if (out.carrier === "Transamerica") {
      evUl.appendChild(el("li", {}, "Transamerica orders all requirements through approved vendors; digital underwriting (iGO e-App) may produce a decision within minutes."));
      if (age !== null && age >= 70 && Number(state.faceAmount || 0) >= 100000) {
        evUl.appendChild(el("li", {}, "Minnesota Cognitive Acuity Screen required (age 70+, face amount $100,000+)."));
      }
      if (age !== null && age >= 61 && age <= 69 && Number(state.faceAmount || 0) > 1000000) {
        evUl.appendChild(el("li", {}, "APS: within the last 5 years for preferred classes with an established primary care physician."));
      }
      if (age !== null && age >= 70) evUl.appendChild(el("li", {}, "APS always required (age 70+)."));
      if (Number(state.faceAmount || 0) >= 5000000) evUl.appendChild(el("li", {}, "IRS Form 4506-C required at $5,000,000+; PFS on business coverage $5,000,000+."));
      evUl.appendChild(el("li", {}, "Highlighted age/amount cells may qualify for fluidless processing (no blood/urine) — verify against the current chart."));
    } else if (out.carrier === "Mutual of Omaha") {
      evUl.appendChild(el("li", {}, "United of Omaha uses age last birthday (advantage to the applicant)."));
      evUl.appendChild(el("li", {}, "Paramedical exam + blood/urine + Rx check at $100,000+ (ages 18-70); MVR per the age/amount grid."));
      if (age !== null && age >= 66) evUl.appendChild(el("li", {}, "APS required from age 66; BNP, PHI and Senior Assessment from age 71."));
      if (age !== null && age >= 71) evUl.appendChild(el("li", {}, "BNP + PHI + Senior Assessment required (age 71+)."));
      evUl.appendChild(el("li", {}, "EKG at higher ages/amounts (age 66+, $2,000,000+; age 61-65, $5,000,000+); Inspection Report at $5,000,000+."));
      if (age !== null && age >= 18 && age <= 55 && Number(state.faceAmount || 0) >= 100000 && Number(state.faceAmount || 0) <= 1000000) {
        evUl.appendChild(el("li", {}, "Accelerated Underwriting may apply (Term Life Answers, ages 18-55, $100,000-$1,000,000)."));
      }
      if (Number(state.faceAmount || 0) >= 100000) evUl.appendChild(el("li", {}, "Signed HIV consent form required at $100,000+."));
      if (age !== null && age >= 65 && Number(state.faceAmount || 0) >= 1000000) {
        evUl.appendChild(el("li", {}, "Statement of Policyowner Intent + Premium Funding & Acknowledgement form required (age 65+, $1,000,000+)."));
      }
      if (Number(state.faceAmount || 0) > 5000000) evUl.appendChild(el("li", {}, "Tax returns and 3rd-party verified financials may be required above $5,000,000."));
    } else if (out.carrier === "F&G Quantum") {
      evUl.appendChild(el("li", {}, "Quantum underwrites from the application plus electronic databases — MIB on all applications; RX, lab and medical-claims history; ID verification tools; MVR and phone interviews as needed."));
      evUl.appendChild(el("li", {}, "A paramedical exam will not improve the rate class."));
      evUl.appendChild(el("li", {}, "Complete prescription list with the reason for each medication is required on the application — incomplete medication details can delay approval or cause a decline."));
      if (Number(state.faceAmount || 0) > 1000000) {
        evUl.appendChild(el("li", {}, "Total in-force + applied-for coverage over $1,000,000 requires application and underwriting on another product."));
      }
      evUl.appendChild(el("li", {}, "No internal or external replacements are allowed."));
      if (age !== null && age < 18) evUl.appendChild(el("li", {}, "Juvenile: up to 50% of the parent's coverage, maximum $1,000,000 per primary insured; growth-chart build applies."));
    } else if (out.carrier === "F&G Pathsetter") {
      if (age !== null && age <= 60 && Number(state.faceAmount || 0) <= 1000000) {
        evUl.appendChild(el("li", {}, "Exam-Free Underwriting applies (ages 0-60, through $1,000,000) — MIB, InstantID, MVR, RX/lab/medical-claims databases, and credit/public-records. A paramedical exam should not be ordered and will not improve the rate class."));
      } else {
        evUl.appendChild(el("li", {}, "Above the Exam-Free parameters (age 60+/over $1,000,000) — paramedical exam + HOS/blood are ordered; EKG at 71+ or higher amounts."));
      }
      if (age !== null && age >= 70) evUl.appendChild(el("li", {}, "APS required for all amounts at age 70+ (and by age/amount thresholds below that: 0-17 >$500K; 18-40 >$3M; 41-60 >$2M; 61-69 >$1M)."));
      if (Number(state.faceAmount || 0) >= 2000000) {
        evUl.appendChild(el("li", {}, "Large case ($2,000,000+ face or $20,000+ planned annual premium) — Large Case Transmittal form + F&G illustration + telephone interview required."));
      }
      if (age !== null && age < 18) evUl.appendChild(el("li", {}, "Juvenile: up to 50% of the parent's coverage, maximum $1,000,000 per primary insured; growth-chart build applies."));
      evUl.appendChild(el("li", {}, "Applicants who do not qualify for Preferred or Standard may be approved at Express Standard rates without medical requirements."));
    } else if (out.carrier === "National Life Group") {
      if (age !== null && age <= 65 && Number(state.faceAmount || 0) <= 250000) {
        evUl.appendChild(el("li", {}, "Streamlined Underwriting applies (face $250,000 or less, age 65 and under) — MIB, prescription database and MVR; no medical testing. Verified Standard / Express Standard NT / Standard Tobacco classes."));
      } else if (age !== null && age <= 60 && Number(state.faceAmount || 0) <= 1000000) {
        evUl.appendChild(el("li", {}, "EZ-Underwriting accelerated lane may apply (ages 18-60, through $1,000,000; ages 61-65 through $250,000) — MIB, Milliman IntelliScript prescription database, LexisNexis Risk Classifier; best class may be available without medical requirements."));
      }
      if (age !== null && age >= 70) evUl.appendChild(el("li", {}, "Mature Assessment + EKG + blood/urine required at age 70+; APS on all amounts."));
      if (Number(state.faceAmount || 0) >= 2000000) evUl.appendChild(el("li", {}, "Face over $2,000,000: APS + Personal Financial Questionnaire (form 1392) + Electronic Inspection Report required."));
      if (Number(state.faceAmount || 0) >= 5000000) evUl.appendChild(el("li", {}, "Face over $5,000,000: EKG added; income verification (4506T/W2/1099); third-party verified financials (age 70+ at $5M+, all ages at $10M+)."));
      if (age !== null && age >= 60) evUl.appendChild(el("li", {}, "Age 60+ requires routine health care with a physical within the last 24 months — otherwise declined."));
    }
    evUl.appendChild(el("li", {}, "Authorization: MIB, FCRA consumer report, prescription history, and medical-record authorization required."));
    evUl.appendChild(el("li", {}, "Condition-specific questionnaires: " + questionnaireNames(state.conditions) + "."));
    ev.appendChild(evUl);
    wrap.appendChild(ev);

    /* ---- Financial justification ---- */
    const fin = el("div", { class: "card" });
    fin.appendChild(el("h2", {}, "Financial justification"));
    if (out.financial) {
      fin.appendChild(el("p", {}, out.financial.detail));
      if (out.financial.ok === false) {
        fin.appendChild(el("p", { class: "finance-fail" }, "Requested amount exceeds the guideline multiplier — obtain financial justification (income verification, coverage purpose, total in-force)."));
      } else if (out.financial.ok === true) {
        fin.appendChild(el("p", { class: "finance-ok" }, "Requested amount is within the guideline multiplier."));
      }
      fin.appendChild(el("div", { class: "note-box" }, rules.financial.note));
    }
    wrap.appendChild(fin);

    /* ---- Guardrails ---- */
    const guard = el("div", { class: "card" });
    guard.appendChild(el("h2", {}, "Guardrails — read before using this estimate"));
    const gUl = el("ul", { class: "evidence-list" });
    gUl.appendChild(el("li", {}, "This estimate is preliminary, non-binding, and based only on disclosed information."));
    gUl.appendChild(el("li", {}, "The carrier may obtain medical records, prescription history, laboratory/paramedical results, consumer reports, and information from other insurers or MIB — those sources can change this estimate."));
    gUl.appendChild(el("li", {}, "Never suggest withholding information or 'answering around' a condition. Applications state that answers influence acceptance and that material misrepresentation or nondisclosure can jeopardize coverage."));
    gUl.appendChild(el("li", {}, "Temporary or conditional coverage exists only if the exact carrier receipt conditions are met — not because this estimate is favorable."));
    gUl.appendChild(el("li", {}, "This is not a medical diagnostic tool. It does not issue insurance, bind coverage, or replace a carrier underwriter's decision."));
    gUl.appendChild(el("li", {}, "Final decision is the carrier's: " + out.carrier + " evaluates the whole risk and may request additional evidence."));
    guard.appendChild(gUl);
    guard.appendChild(el("div", { class: "note-box" }, [el("strong", {}, "Sources: "), out.carrier + " — " + out.guide.title + " (" + out.guide.version + "). Estimated " + new Date().toLocaleDateString() + "."]));
    wrap.appendChild(guard);

    /* ---- Actions ---- */
    const actions = el("div", { id: "results-actions", style: "display:flex;gap:10px;flex-wrap:wrap" });
    actions.appendChild(el("button", { class: "btn btn-compare", id: "btn-compare", onclick: () => toggleComparison() }, "Compare across carriers"));
    actions.appendChild(el("button", { class: "btn btn-print", id: "btn-print-compare", onclick: () => printComparison() }, "Print comparison"));
    actions.appendChild(el("button", { class: "btn btn-print", onclick: () => window.print() }, "Print / save PDF"));
    actions.appendChild(el("button", { class: "btn btn-ghost", onclick: () => { $("#results-content").classList.add("hidden"); $("#step-content").classList.remove("hidden"); render(); } }, "Edit answers"));
    actions.appendChild(el("button", { class: "btn btn-danger-ghost", onclick: () => { if (confirm("Start a new case? Current answers will be cleared.")) resetState(); } }, "New case"));
    wrap.appendChild(actions);

    return wrap;
  }

  function toggleComparison() {
    const existing = $("#comparison");
    if (existing) { existing.remove(); return; }
    const wrap = renderComparison(runComparison());
    const resultsBox = $("#results-content");
    const anchor = $("#results-actions");
    resultsBox.insertBefore(wrap, anchor ? anchor.parentNode : null);
    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Switch the results page to another carrier's full estimate, keeping the
     comparison open (re-rendered) so the new row is highlighted. */
  function switchCarrier(id) {
    if (id === state.carrier) return;
    applyCarrierSwitch(id);
  }

  /* The actual switch. The comparison panel's select drives this directly
     because selectInput sets state.carrier before calling onChange — the guard
     in switchCarrier would see an already-updated state and no-op. */
  function applyCarrierSwitch(id) {
    const keepOpen = !!document.getElementById("comparison");
    state.carrier = id;
    saveState();
    $("#carrier-badge").textContent = CARRIER_RULES[id].name;
    runEstimate(); // re-renders the results box, destroying the comparison card
    if (keepOpen) {
      const wrap = renderComparison(runComparison());
      const resultsBox = $("#results-content");
      const anchor = $("#results-actions");
      resultsBox.insertBefore(wrap, anchor ? anchor.parentNode : null);
    }
  }

  /* ---------- printable comparison sheet ------------------------------ */

  /* One-page print layout, distinct from the full results print. A hidden
     #print-sheet is populated with a compact profile header and the
     comparison table; printing adds body.print-compare so the print CSS
     shows only this sheet. */
  function printComparison() {
    const rows = runComparison();
    const sheet = buildPrintSheet(rows);
    document.body.classList.add("print-compare");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-compare"), { once: true });
    // Trigger print after the sheet is in the DOM; fall back to removing the
    // class if the print dialog never fires afterprint (e.g., cancelled).
    window.print();
    setTimeout(() => document.body.classList.remove("print-compare"), 1500);
  }

  function profileLine() {
    const bits = [];
    if (state.age !== "") bits.push(state.age + " yr");
    if (state.sex) bits.push(state.sex);
    if (state.state) bits.push(state.state);
    if (state.heightFt !== "" && state.heightIn !== "") bits.push(`${state.heightFt}'${state.heightIn}"`);
    if (state.weightLb !== "") bits.push(state.weightLb + " lb");
    if (state.bpSys !== "" && state.bpDia !== "") bits.push("BP " + state.bpSys + "/" + state.bpDia);
    if (state.cholTotal !== "") bits.push("chol " + state.cholTotal + (state.cholHdl !== "" ? "/" + state.cholHdl : ""));
    if (state.usedNicotine === "yes") bits.push("nicotine"); else if (state.usedNicotine === "no") bits.push("non-tobacco");
    if (state.faceAmount !== "") bits.push("face $" + Number(state.faceAmount).toLocaleString());
    if (state.income !== "") bits.push("income $" + Number(state.income).toLocaleString());
    const conds = (state.conditions || []).map(c => c.id.replace(/_/g, " "));
    if (conds.length) bits.push(conds.length + " condition(s): " + conds.join(", "));
    return bits.join("  ·  ") || "Applicant profile not entered";
  }

  function buildPrintSheet(rows) {
    let sheet = document.getElementById("print-sheet");
    if (!sheet) {
      sheet = el("div", { id: "print-sheet" });
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = "";

    const title = el("div", { class: "print-sheet-head" });
    title.appendChild(el("div", { class: "print-sheet-brand" }, "HealthClassEstimator"));
    title.appendChild(el("div", { class: "print-sheet-title" }, "Carrier comparison — same applicant profile"));
    title.appendChild(el("div", { class: "print-sheet-meta" }, [el("span", {}, "Estimated " + new Date().toLocaleDateString()), el("span", {}, "Preliminary, non-binding — based only on disclosed information")]));
    sheet.appendChild(title);

    const profile = el("div", { class: "print-sheet-profile" }, profileLine());
    sheet.appendChild(profile);

    const tbl = el("table", { class: "print-sheet-table" });
    const thead = el("thead", {});
    thead.appendChild(el("tr", {}, [
      el("th", {}, "Carrier"), el("th", {}, "Estimated class"), el("th", {}, "Limiting factors / gates"), el("th", {}, "Evidence highlights"), el("th", {}, "Financial")
    ]));
    tbl.appendChild(thead);
    const tbody = el("tbody", {});
    rows.forEach(row => {
      const rules = CARRIER_RULES[row.id];
      const cn = compareClassName(row.out, rules);
      const tr = el("tr", { class: row.id === state.carrier ? "print-current" : "" });
      tr.appendChild(el("td", { class: "print-carrier" }, [rules.name, el("div", { class: "print-version" }, rules.guide.version)]));
      tr.appendChild(el("td", {}, el("span", { class: "klass-chip klass", style: `background:${cn.color}` }, cn.name)));
      tr.appendChild(el("td", {}, compareLimiting(row)));
      tr.appendChild(el("td", {}, compareEvidence(row.out)));
      tr.appendChild(el("td", {}, compareFinancial(row.out)));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    sheet.appendChild(tbl);

    const foot = el("div", { class: "print-sheet-foot" });
    foot.appendChild(el("div", {}, "The carrier may obtain medical records, prescription history, laboratory/paramedical results, consumer reports, and information from other insurers or MIB — those sources can change every estimate above. Classes are carrier-specific labels on a shared ladder; the final decision is the carrier's."));
    foot.appendChild(el("div", { class: "print-sheet-sources" }, "Sources: " + rows.map(r => CARRIER_RULES[r.id].name + " — " + CARRIER_RULES[r.id].guide.title + " (" + CARRIER_RULES[r.id].guide.version + ")").join("; ")));
    sheet.appendChild(foot);
    return sheet;
  }

  function questionnaireNames(conditions) {
    const map = {
      diabetes: "Diabetes", heart_disease: "Heart murmur/irregular heartbeat or chest pain", cad: "Chest pain",
      other_cancer: "Tumor/cyst/cancer", skin_cancer: "Tumor/cyst/cancer", copd: "Respiratory",
      asthma: "Respiratory", sleep_apnea: "Sleep apnea", seizures: "Epilepsy/seizure", bipolar: "Mental health",
      anxiety: "Mental health", depression: "Mental health", schizophrenia: "Mental health", substance_treatment: "Drug/substance use",
      hypertension: "High blood pressure", kidney_disease: "Kidney and urinary", liver_disease: "Digestive"
    };
    const set = new Set();
    conditions.forEach(c => { if (map[c.id]) set.add(map[c.id]); });
    return set.size ? Array.from(set).join(", ") : "as applicable";
  }

  function rangeLabel(range) {
    if (!range) return "—";
    const rules = CARRIER_RULES[state.carrier];
    const a = range.low === "preferred_plus" ? "Preferred Plus" : (rules.classInfo[range.low] || { name: range.low }).name;
    const b = range.high === "preferred_plus" ? "Preferred Plus" : (rules.classInfo[range.high] || { name: range.high.replace(/_/g, " ") }).name;
    return a + " → " + b;
  }

  function shade(hex, pct) {
    const n = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + pct));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + pct));
    const b = Math.max(0, Math.min(255, (n & 0xff) + pct));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  const FLAG_LABELS = {
    needs_aps: "APS / records needed",
    needs_exam: "Exam / EKG likely",
    likely_table: "Likely table rating",
    possible_decline: "Possible decline — specialist review",
    manual_review: "Manual review",
    missing_material_data: "Missing key data",
    accelerated_uw_possible: "Accelerated UW may apply",
    financial_review: "Financial justification needed",
    undisclosed_meds: "Medication-condition mismatch — confirm",
    flat_extra: "Flat extra may apply"
  };
  const FLAG_CLASS = {
    needs_aps: "flag-warn", needs_exam: "flag-warn", likely_table: "flag-warn",
    possible_decline: "flag-danger", manual_review: "flag-warn", missing_material_data: "flag-warn",
    accelerated_uw_possible: "flag-ok", financial_review: "flag-warn", undisclosed_meds: "flag-warn"
  };

  const DOMAIN_LABELS = {
    tobacco: "Tobacco / nicotine", build: "Build (height/weight)", bp: "Blood pressure",
    cholesterol: "Cholesterol / HDL", driving: "Driving", family: "Family history",
    medical: "Medical history", medications: "Medications / prescriptions", substance: "Alcohol / substances", avocation: "Occupation / avocation", functional: "Functional status / ADLs",
    pending: "Pending care"
  };

  /* ---------- boot ----------------------------------------------------- */

  function boot() {
    loadState();
    $("#carrier-badge").textContent = CARRIER_RULES[state.carrier].name;
    $("#btn-save").addEventListener("click", () => {
      saveState();
      showToast("Draft saved to this browser.");
    });
    render();
  }

  function showToast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.add("hidden"), 2200);
  }

  // Scripts are injected dynamically (single version constant in index.html),
  // so DOMContentLoaded may already have fired by the time app.js executes.
  // Boot immediately in that case rather than missing the event.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  return { runEstimate };
})();
