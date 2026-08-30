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
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  /* Inline flag SVGs for the printable acknowledgment record header — the
     same US-left / Texas-right motif as the app header top bar. */
  function usFlagSvg(width, height) {
    const star = '<path id="hce-print-us-star" d="M0 -2.6 L0.584 -0.803 L2.472 -0.803 L0.944 0.307 L1.528 2.103 L0 0.993 L-1.528 2.103 L-0.944 0.307 L-2.472 -0.803 L-0.584 -0.803 Z" fill="#fff"/>';
    let uses = "";
    [2.99, 14.97, 26.94, 38.91, 50.88].forEach(y => [7.6, 18.46, 29.31, 40.17, 51.03, 61.89].forEach(x => { uses += '<use href="#hce-print-us-star" x="' + x + '" y="' + y + '"/>'; }));
    [8.98, 20.95, 32.92, 44.9].forEach(y => [12.67, 23.52, 34.38, 45.24, 56.1].forEach(x => { uses += '<use href="#hce-print-us-star" x="' + x + '" y="' + y + '"/>'; }));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 100" width="' + width + '" height="' + height + '" role="img" aria-label="United States flag"><defs>' + star + '</defs>' +
      '<rect width="190" height="100" fill="#fff"/>' +
      [0, 15.384, 30.768, 46.152, 61.536, 76.92, 92.304].map(y => '<rect y="' + y + '" width="190" height="7.692" fill="#B22234"/>').join("") +
      '<rect width="76" height="53.846" fill="#3C3B6E"/>' + uses + '</svg>';
  }
  function txFlagSvg(width, height) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60" width="' + width + '" height="' + height + '" role="img" aria-label="Texas flag">' +
      '<defs><path id="hce-print-tx-star" d="M0 -8.5 L1.908 -2.627 L8.084 -2.627 L3.088 1.003 L4.996 6.876 L0 3.247 L-4.996 6.876 L-3.088 1.003 L-8.084 -2.627 L-1.908 -2.627 Z" fill="#fff"/></defs>' +
      '<rect width="30" height="60" fill="#002868"/>' +
      '<rect x="30" width="60" height="30" fill="#fff"/>' +
      '<rect x="30" y="30" width="60" height="30" fill="#BF0A30"/>' +
      '<use href="#hce-print-tx-star" transform="translate(15 30)"/>' +
      '</svg>';
  }

  let state = defaultState();

  function defaultState() {
    return {
      carrier: "banner",
      age: "", sex: "", state: "", occupation: "",      occupationHazardous: "",
      aviation: "", hazardousSports: "", foreignTravel: "", militaryService: "", militaryRating: "", vaTreatment: "", foreignResidence: "",
      faceAmount: "", policyPurpose: "", income: "", existingCoverage: "", replacement: "", financing: "",
      ownership: "", premiumPayor: "",
      usedNicotine: "", nicotineEver: "", nicotineQuitYears: "", nicotineProduct: "cigarette", nicotineLastUse: "", nicotineAmount: "", cigarPerMonth: "", cotinineNegative: false, cigarComorbid: false,
      marijuana: "",
      heightFt: "", heightIn: "", weightLb: "", weightOneYearAgoLb: "", weightIntentional: false, weightChangeUnintentional: false,
      bpSys: "", bpDia: "", cholTotal: "", cholHdl: "",
      movingViolations3yr: "", seriousDriving: false, seriousDrivingYears: "",
      criminalActive: false, paroleCurrent: "", parolePast: "", bankruptcyActive: false,
      alcoholConcern: "", drugAbuse: "", drugAbuseYears: "",
      doctorVisits: "",
      conditions: [],
      medicationsText: "",
      cirrhosis: "no", defibrillator: false, cardiomyopathy: false, dialysis: false, kidneyFailure: false, paralysisType: "paraplegia",
      strokeSevere: false, multipleStrokes: false, suicideMultiple: false, suicideAttemptYears: "", mentalHospitalYears: "", disabledBenefits: false, terminalPrognosis: false, oxygenUse: false,
      a1cHigh: false, diabetesComplications: false, gastricBypassRecent: false, pregnancyComplications: false,
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
        /* Carrier is fixed: Banner Life's ruleset is applied automatically
           (there is no profile-time selector). Row-click switching in the
           results comparison still re-targets within the session. */
        state.carrier = "banner";
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
    { id: "major_depression", name: "Major depressive disorder (MDD)", group: "Mental health" },
    { id: "ptsd", name: "Post-traumatic stress disorder (PTSD)", group: "Mental health" },
    { id: "bipolar", name: "Bipolar disorder", group: "Mental health" },
    { id: "schizophrenia", name: "Schizophrenia", group: "Mental health" },
    { id: "substance_treatment", name: "Alcohol/drug treatment history", group: "Substance use" },
    { id: "hypertension", name: "High blood pressure", group: "Cardiovascular" },
    { id: "high_cholesterol", name: "High cholesterol", group: "Cardiovascular" },
    { id: "cad", name: "Coronary artery disease / angina", group: "Cardiovascular" },
    { id: "heart_disease", name: "Heart disease (CHF, cardiomyopathy, valve, device)", group: "Cardiovascular" },
    { id: "pacemaker_icd", name: "Cardiac pacemaker / implanted defibrillator (ICD)", group: "Cardiovascular" },
    { id: "heart_valve_prosthesis", name: "Heart valve prosthesis (metal / mechanical valve)", group: "Cardiovascular" },
    { id: "abdominal_aneurysm", name: "Abdominal aortic aneurysm (AAA)", group: "Cardiovascular" },
    { id: "stroke", name: "Stroke / TIA", group: "Cardiovascular" },
    { id: "asthma", name: "Asthma", group: "Respiratory" },
    { id: "copd", name: "COPD / emphysema / chronic bronchitis", group: "Respiratory" },
    { id: "sleep_apnea", name: "Sleep apnea", group: "Respiratory" },
    { id: "diabetes", name: "Diabetes", group: "Metabolic" },
    { id: "hypothyroidism", name: "Hypothyroidism", group: "Metabolic" },
    { id: "hypogonadism", name: "Hypogonadism / low testosterone", group: "Metabolic" },
    { id: "erectile_dysfunction", name: "Erectile dysfunction", group: "Metabolic" },
    { id: "kidney_disease", name: "Kidney disease", group: "Other" },
    { id: "liver_disease", name: "Liver disease", group: "Other" },
    { id: "hiv", name: "HIV / AIDS", group: "Other" },
    { id: "dementia", name: "Alzheimer's / dementia", group: "Neurological" },
    { id: "seizures", name: "Seizures / epilepsy", group: "Neurological" },
    { id: "migraine", name: "Migraine / headache", group: "Neurological" },
    { id: "chronic_fatigue", name: "Chronic fatigue syndrome", group: "Neurological" },
    { id: "rem_sleep_disorder", name: "REM sleep behavior disorder", group: "Neurological" },
    { id: "intracranial_aneurysm_clip", name: "Intracranial aneurysm clip", group: "Neurological" },
    { id: "vp_shunt", name: "VP shunt / CSF shunt", group: "Neurological" },
    { id: "neurostimulator", name: "Neurostimulator (spinal cord stimulator, etc.)", group: "Neurological" },
    { id: "autism", name: "Autism", group: "Other" },
    { id: "skin_cancer", name: "Skin cancer (basal / squamous)", group: "Cancer" },
    { id: "other_cancer", name: "Other cancer history", group: "Cancer" },
    { id: "osteoporosis", name: "Osteoporosis", group: "Other" },
    { id: "mvp", name: "Mitral valve prolapse", group: "Cardiovascular" },
    { id: "cimt", name: "Carotid imaging (CIMT)", group: "Cardiovascular" },
    { id: "dysplastic_nevi", name: "Dysplastic nevi", group: "Other" },
    { id: "cochlear_implant", name: "Cochlear implant", group: "Other" },
    { id: "drug_infusion_pump", name: "Drug infusion pump (e.g., intrathecal / insulin pump)", group: "Other" },
    { id: "ocular_monitoring", name: "Ocular monitoring system (e.g., Sensimed Triggerfish lens)", group: "Other" },
    { id: "transplant", name: "Organ transplant", group: "Other" },
    { id: "paralysis", name: "Paralysis", group: "Other" }
  ];

  const GROUPS = ["Mental health", "Substance use", "Cardiovascular", "Respiratory", "Metabolic", "Cancer", "Neurological", "Other"];

  function getConditionState(id) {
    let c = state.conditions.find(x => x.id === id);
    if (!c) {
      c = { id, status: "current", severity: "mild", control: "good", resolvedYears: "", medCount: "", onsetAge: "", a1c: "", insulin: "no", complications: "no", onsetWithin1yr: false, suicide10yr: false, stableYears: "", residualSymptoms: false, recurrence: false, treatedWithin12mo: false, yearsSober: "", relapse: false, count: "", recentEvent: false, postponeTrigger: false, declineTrigger: false, defibrillator: false, cardiomyopathy: false, treatment: "", implantYears: "", investigated: false, selfHarm: false, alcoholUse: false, dialysis: "no", cirrhosis: "no" };
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
    if (id === "bipolar" || id === "schizophrenia") {
      const r = el("div", { class: "field-row" });
      /* Recency-heavy questions are bipolar-specific; schizophrenia shares the
         stability field so the published "less than 1 year stability" postpone
         trigger (Banner) can be evaluated from collected data. */
      if (id === "bipolar") {
        r.appendChild(field("Diagnosed within last year?", checkPillKey(c, "onsetWithin1yr", "Yes")));
        r.appendChild(field("Suicide attempt within 10 years?", checkPillKey(c, "suicide10yr", "Yes")));
      }
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
    /* Respiratory treatment question: how is the respiratory condition treated? */
    if (id === "asthma" || id === "copd" || id === "sleep_apnea") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("How is it treated?", selectInputKey(c, "treatment", [["none", "No treatment needed"], ["inhaler", "Rescue inhaler only"], ["controller", "Daily controller medication (inhaler / pill)"], ["oral_steroids", "Oral steroids"], ["cpap", "CPAP / BiPAP"], ["oxygen", "Supplemental oxygen"], ["other", "Other / multiple"]])));
      wrap.appendChild(r);
    }
    if (id === "ptsd") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("History of self-harm or suicide attempt?", checkPillKey(c, "selfHarm", "Yes")));
      r.appendChild(field("Alcohol use disclosed?", checkPillKey(c, "alcoholUse", "Yes")));
      wrap.appendChild(r);
    }
    if (id === "migraine") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Fully investigated (imaging/evaluation complete)?", checkPillKey(c, "investigated", "Yes")));
      wrap.appendChild(r);
    }
    if (id === "abdominal_aneurysm") {
      wrap.appendChild(el("div", { class: "note-box" }, "Status: Current = aneurysm present (surveillance or untreated). Resolved = surgically repaired — also answer the repair-recency question below. National Life declines a present aneurysm or one repaired within the past 6 months; other carriers review individually."));
      const rAaa = el("div", { class: "field-row" });
      rAaa.appendChild(field("Surgically repaired within the past 6 months?", checkPillKey(c, "repairedWithin6mo", "Yes")));
      wrap.appendChild(rAaa);
    }
    if (id === "pacemaker_icd" || id === "heart_valve_prosthesis" || id === "intracranial_aneurysm_clip" || id === "vp_shunt" || id === "neurostimulator" || id === "cochlear_implant" || id === "drug_infusion_pump" || id === "ocular_monitoring") {
      const r = el("div", { class: "field-row" });
      const yr = el("input", { type: "number", min: 0, step: 1, placeholder: "years ago" });
      if (c.implantYears !== "") yr.value = c.implantYears;
      yr.addEventListener("input", () => { c.implantYears = yr.value; saveState(); });
      r.appendChild(field("Implanted / placed how many years ago?", yr));
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
    if (id === "asthma") {
      /* Foresters publishes a qualified accept: "mild/moderate asthma —
         accept; severe with hospitalization — decline." The hospitalization
         fact is what the decline screen asks about — collect it (tri-state:
         unanswered is gate-first in the engine). */
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Ever hospitalized for asthma?", radioPillKey(c, "hospitalized", [["no", "No"], ["yes", "Yes"]])));
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
    if (id === "stroke") {
      /* Multiple strokes feed the stroke_severe decline trigger (Banner: "severe
         stroke ... or multiple strokes") alongside the severity field. */
      const r = el("div", { class: "field-row" });
      r.appendChild(field("More than one stroke?", checkPillKey(c, "multipleStrokes", "Yes")));
      wrap.appendChild(r);
    }
    if (id === "paralysis") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Type", radioPillKey(c, "paralysisType", [["paraplegia", "Paraplegia"], ["quadriplegia", "Quadriplegia"]])));
      wrap.appendChild(r);
    }
    if (id === "kidney_disease") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Dialysis or kidney failure?", radioPillKey(c, "dialysis", [["no", "No"], ["yes", "Yes"]])));
      wrap.appendChild(r);
    }
    if (id === "liver_disease") {
      const r = el("div", { class: "field-row" });
      r.appendChild(field("Cirrhosis / confirmed liver scarring?", radioPillKey(c, "cirrhosis", [["no", "No"], ["yes", "Yes"]])));
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
        notes.push(`Best possible class: ${classLabel(best.klass)}${best.when ? " — " + best.when : "."}`);
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
  function selectInputKey(condObj, key, options) {
    const sel = el("select", {});
    sel.appendChild(el("option", { value: "" }, "— select —"));
    for (const [val, label] of options) {
      const o = el("option", { value: val }, label);
      if (String(condObj[key]) === String(val)) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener("change", () => { condObj[key] = sel.value; saveState(); });
    return sel;
  }

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
    { id: "profile", label: "Profile", render: renderProfile },
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

  /* Product lineup + eligibility notes for the selected carrier, rendered
     under the carrier panel. Data comes from the ruleset's eligibility block. */
  function carrierEligibility(rules) {
    const e = rules.eligibility || {};
    const wrap = el("div", { class: "carrier-eligibility" });
    const dl = el("dl", { class: "elig-grid" });
    [["Products", e.products], ["Issue ages", e.issueAges], ["Face amounts", e.faceRange], ["Residency", e.residency]].forEach(([k, v]) => {
      if (!v) return;
      dl.appendChild(el("dt", {}, k));
      dl.appendChild(el("dd", {}, v));
    });
    wrap.appendChild(dl);
    if (e.charts && e.charts.length) {
      const tbl = el("table", { class: "elig-chart" });
      const thead = el("thead", {});
      thead.appendChild(el("tr", {}, [el("th", {}, "Product"), el("th", {}, "Issue ages"), el("th", {}, "Face range")]));
      tbl.appendChild(thead);
      const tbody = el("tbody", {});
      e.charts.forEach(c => {
        const tr = el("tr", {});
        tr.appendChild(el("td", {}, c.product));
        tr.appendChild(el("td", {}, c.ages));
        tr.appendChild(el("td", {}, c.face));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      /* Scroll wrapper: the eligibility chart keeps its natural column
         widths and scrolls horizontally on narrow screens instead of
         crushing or overflowing the page. */
      const eligScroll = el("div", { class: "table-scroll" });
      eligScroll.appendChild(tbl);
      wrap.appendChild(eligScroll);
      if (e.chartNote) wrap.appendChild(el("p", { class: "elig-chart-note" }, e.chartNote));
    }
    if (e.notes && e.notes.length) {
      const ul = el("ul", { class: "elig-notes" });
      e.notes.forEach(n => ul.appendChild(el("li", {}, n)));
      wrap.appendChild(ul);
    }
    return wrap;
  }

  function renderProfile() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Profile Information"));
    c.appendChild(el("p", { class: "card-sub" }, "These details drive every carrier estimate on the results page."));
    c.appendChild(el("p", { class: "card-sub" },
      "Banner Life's underwriting ruleset is applied automatically; after the estimate runs, the results page compares all " +
      Object.keys(CARRIER_RULES).length + " carriers side by side, most favorable class first."));

    const r1 = el("div", { class: "field-row" });
    r1.appendChild(field("Age (nearest birthday)", numInput("age", { min: 0, max: 120 })));
    r1.appendChild(field("Sex", radioPill("sex", [["male", "Male"], ["female", "Female"]])));
    c.appendChild(r1);

    const r2 = el("div", { class: "field-row" });
    r2.appendChild(field("State of residence", textInput("state", { placeholder: "e.g. TX" })));
    r2.appendChild(field("Occupation", textInput("occupation", { placeholder: "Job title / duties" })));
    r2.appendChild(field("Hazardous occupation (heights, explosives, military, corrections, etc.)", radioPill("occupationHazardous", [["no", "No"], ["yes", "Yes"], ["unknown", "Unsure"]])));
    c.appendChild(r2);

    const r3 = el("div", { class: "field-row" });
    r3.appendChild(field("Aviation exposure (pilot, crew, frequent flying hours)", radioPill("aviation", [["no", "No"], ["yes", "Yes"]])));
    r3.appendChild(field("Hazardous sports (racing, skydiving, scuba, climbing, etc.)", radioPill("hazardousSports", [["no", "No"], ["yes", "Yes"]])));
    r3.appendChild(field("Frequent foreign travel", radioPill("foreignTravel", [["no", "No"], ["yes", "Yes"]])));
    c.appendChild(r3);

    const r4 = el("div", { class: "field-row" });
    r4.appendChild(field("Military service", radioPill("militaryService", [["no", "No"], ["veteran", "Veteran"], ["yes", "Yes — non-combat"], ["combat", "Yes — combat deployment"]])));
    r4.appendChild(field("Currently live outside the USA", radioPill("foreignResidence", [["no", "No"], ["short", "Yes — under 6 months"], ["long", "Yes — 6 months or more"]])));
    c.appendChild(r4);

    /* Military sub-questions: disability rating and VA treatment only matter
       when service is disclosed — asking them for everyone would be noise. */
    if (state.militaryService && state.militaryService !== "no") {
      const r5 = el("div", { class: "field-row" });
      r5.appendChild(field("VA disability rating", selectInput("militaryRating", [["none", "None"], ["lt30", "0–20%"], ["30to60", "30–60%"], ["60plus", "60% or more"], ["total", "Total / unemployable"]], { onChange: () => render() })));
      r5.appendChild(field("Currently receiving VA treatment?", radioPill("vaTreatment", [["no", "No"], ["yes", "Yes"]])));
      c.appendChild(r5);
    }

    _radioHandlers.sex = () => {};
    _radioHandlers.occupationHazardous = () => {};
    _radioHandlers.aviation = () => {};
    _radioHandlers.hazardousSports = () => {};
    _radioHandlers.foreignTravel = () => {};
    _radioHandlers.militaryService = (val) => {
      // Disclosure drives the class caps; picking "No" clears the sub-answers.
      if (val === "no") { state.militaryRating = ""; state.vaTreatment = ""; }
      render();
    };
    _radioHandlers.foreignResidence = () => {};
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

    const r3 = el("div", { class: "field-row" });
    r3.appendChild(field("Coverage ownership", selectInput("ownership", [["personal", "Personal"], ["business", "Business / key person"], ["trust", "Trust / estate"]])));
    r3.appendChild(field("Premium payor", selectInput("premiumPayor", [["self", "Self"], ["employer", "Employer-paid"], ["third_party", "Third party"], ["financed", "Financed / loan"]])));
    c.appendChild(r3);

    _radioHandlers.replacement = () => {};
    _radioHandlers.financing = () => {};
    return c;
  }

  function renderNicotine() {
    const c = el("div", { class: "card" });
    const rules = CARRIER_RULES[state.carrier];
    c.appendChild(el("h2", {}, "Tobacco & nicotine use"));
    c.appendChild(el("p", { class: "card-sub" }, rules.nicotine.tobaccoDefinition || "Lookbacks vary by class."));

    c.appendChild(field("Have you EVER used tobacco or nicotine in any form?", radioPill("nicotineEver", [["no", "No"], ["yes", "Yes"]])));
    _radioHandlers.nicotineEver = () => render();

    const quitBox = el("div", { class: (state.nicotineEver === "yes" && state.usedNicotine === "no" ? "" : "hidden") });
    quitBox.appendChild(field("Years since you quit", numInput("nicotineQuitYears", { min: 0, step: 1 }), "Last use more than 10 years ago is outside every carrier's lookback window — no class impact. If you quit within the last 10 years, answer 'Yes' to the 10-year question below."));
    c.appendChild(quitBox);

    c.appendChild(field("Used tobacco or nicotine in the past 10 years?", radioPill("usedNicotine", [["yes", "Yes"], ["no", "No"]])));
    _radioHandlers.usedNicotine = () => render();

    const det = el("div", { class: (state.usedNicotine === "yes" ? "" : "hidden") });
    const r1 = el("div", { class: "field-row" });
    const amountLabel = {
      cigarette: "Cigarettes per day",
      cigar: "Cigars per month",
      vape: "Vaping sessions per day (approx.)",
      smokeless: "Dips / cans per week",
      nicotine_sub: "Pieces per day",
      other: "Amount per day"
    }[state.nicotineProduct] || "Amount";
    r1.appendChild(field("Product", selectInput("nicotineProduct", [["cigarette", "Cigarettes"], ["cigar", "Cigars (occasional)"], ["vape", "Vaping / e-cigarettes"], ["smokeless", "Chewing tobacco / snuff"], ["nicotine_sub", "Nicotine substitutes (gum, patch, pouch)"], ["other", "Other / multiple"]], { onChange: () => render() })));
    r1.appendChild(field("Date last used", dateInput("nicotineLastUse")));
    r1.appendChild(field("Frequency", selectInput("nicotineFrequency", [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["occasional", "Occasional"]])));
    r1.appendChild(field(amountLabel, numInput("nicotineAmount", { min: 0, step: 1 }), "Foresters Tobacco Plus requires ≤ 1 pack (20 cigarettes) per day; heavier use lands in Standard Tobacco."));
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
    r2.appendChild(field("Currently in jail, awaiting trial, or major convictions?", checkPill("criminalActive", "Yes")));
    r2.appendChild(field("Currently on probation or parole?", radioPill("paroleCurrent", [["no", "No"], ["yes", "Yes"]])));
    r2.appendChild(field("Ever been on probation or parole (including in the past)?", radioPill("parolePast", [["no", "No"], ["yes", "Yes"]])));
    c.appendChild(r2);

    const r3 = el("div", { class: "field-row" });
    r3.appendChild(field("Active bankruptcy (Ch. 7 not discharged / Ch. 13 < 2 yrs)?", checkPill("bankruptcyActive", "Yes")));
    c.appendChild(r3);

    _radioHandlers.paroleCurrent = () => {};
    _radioHandlers.parolePast = () => {};

    c.appendChild(el("div", { class: "note-box" }, "Driving limits vary by carrier and class — DUI/reckless/suspension lookbacks of 2-5 years and violation limits are applied per the selected carrier. Currently on probation/parole, current criminal exposure, or active bankruptcy is a decline screen; a past (resolved) probation/parole history is reviewed by the carrier for recency and offense severity."));
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
    c.appendChild(r2);

    const mjNote = (CARRIER_RULES[state.carrier].nicotine && CARRIER_RULES[state.carrier].nicotine.marijuana) ? CARRIER_RULES[state.carrier].nicotine.marijuana + " " : "";
    c.appendChild(el("div", { class: "note-box" }, mjNote + "Decline screen: current alcohol abuse or abstinence < 2 years; non-marijuana drug use within 3 years or multiple relapses. Suicide-attempt and mental-health hospitalization history are captured with the mental-health conditions on the Medical history step."));
    return c;
  }

  function renderMedical() {
    const c = el("div", { class: "card" });
    c.appendChild(el("h2", {}, "Medical history"));
    c.appendChild(el("p", { class: "card-sub" }, "Select each condition disclosed in the interview. For each, record status, severity, control, and the condition-specific details — the estimator uses control, duration, complications, and treatment intensity, not just the diagnosis label."));

    /* Mental-health history cluster — the suicide-attempt and mental-health
       hospitalization recency screens render beside the Mental health
       condition group so a producer captures the whole history in one place.
       The recency answers drive carrier screens: most postpone a suicide
       attempt within the published window (1–2 years by carrier); National
       Life treats an attempt within 1 year — or more than one within 2
       years — as a decline screen, and a mental-health hospitalization
       within the last year as a postpone screen. */
    function mentalHealthHistoryBlock() {
      const wrap = el("div", {});
      wrap.appendChild(el("h3", {}, "Mental health history"));
      wrap.appendChild(el("p", { class: "card-sub" }, "Attempt and hospitalization recency drive carrier screens: most carriers postpone a suicide attempt within the published window (1–2 years); National Life treats an attempt within 1 year — or more than one within 2 years — as a decline screen, and a mental-health hospitalization within the last year as a postpone screen."));
      const row1 = el("div", { class: "field-row" });
      row1.appendChild(field("Multiple suicide attempts?", checkPill("suicideMultiple", "Yes")));
      const sAttemptYrs = el("input", { type: "number", min: 0, step: 1, placeholder: "years since attempt" });
      if (state.suicideAttemptYears !== "") sAttemptYrs.value = state.suicideAttemptYears;
      sAttemptYrs.addEventListener("input", () => { state.suicideAttemptYears = sAttemptYrs.value; saveState(); });
      row1.appendChild(field("Years since most recent suicide attempt", sAttemptYrs));
      wrap.appendChild(row1);
      const row2 = el("div", { class: "field-row" });
      const mhYrs = el("input", { type: "number", min: 0, step: 1, placeholder: "years since hospitalization" });
      if (state.mentalHospitalYears !== "") mhYrs.value = state.mentalHospitalYears;
      mhYrs.addEventListener("input", () => { state.mentalHospitalYears = mhYrs.value; saveState(); });
      row2.appendChild(field("Years since most recent mental-health hospitalization", mhYrs));
      wrap.appendChild(row2);
      return wrap;
    }

    const rDoc = el("div", { class: "field-row" });
    rDoc.appendChild(field("How often do you see a doctor?", selectInput("doctorVisits", [["rarely", "Rarely — less than once a year"], ["yearly", "Yearly checkup"], ["regular", "Regular follow-ups (known conditions)"], ["frequent", "Frequently — monthly or more"]], { onChange: () => render() })));
    c.appendChild(rDoc);

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
      if (group === "Mental health") c.appendChild(mentalHealthHistoryBlock());
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
    /* National Life's uninsurable-list disability screen (SSDI/DI for
       depression, PTSD, or other medical — non-musculoskeletal — issues).
       A form-level fact, so it lives beside the other carrier-trigger flags. */
    const rDis = el("div", { class: "field-row" });
    rDis.appendChild(field("Receiving SSDI / disability benefits for a medical (non-injury) condition?", checkPill("disabledBenefits", "Yes")));
    c.appendChild(rDis);
    /* Terminal-illness disclosure — Transamerica's published impairment-table
       decline. Other carriers have no terminal row: their screens catch
       terminal presentations through what is actually published (hospice or
       facility care, active cancer, ADL dependence), so the flag fires only
       where declared. */
    const rTerm = el("div", { class: "field-row" });
    rTerm.appendChild(field("Terminal prognosis — has a physician given a life expectancy measured in months?", checkPill("terminalPrognosis", "Yes")));
    c.appendChild(rTerm);
    /* Complicated-pregnancy postpone screen (Banner, Transamerica, MOO, F&G,
       National Life publish a postpone row). Female-applicant question — the
       flag only produces a gate for carriers that declare the trigger. */
    if (state.sex === "female") {
      const rp = el("div", { class: "field-row" });
      rp.appendChild(field("Currently pregnant with complications (gestational diabetes, pre-eclampsia/eclampsia)?", checkPill("pregnancyComplications", "Yes")));
      c.appendChild(rp);
    }
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
    d.faceAmount = state.faceAmount === "" ? "" : Number(state.faceAmount);
    d.income = state.income === "" ? "" : Number(state.income);
    d.conditions = (d.conditions || []).map(c => {
      const copy = Object.assign({}, c);
      // An unanswered medication count is NOT evidence of "no medications" —
      // leave it null so the engine treats the condition conservatively instead
      // of reading a blank as the favorable "on 0 meds" best case.
      copy.medCount = copy.medCount === "" ? null : Number(copy.medCount);
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
    if (kd && kd.dialysis === "yes") { d.dialysis = true; d.kidneyFailure = true; }
    if (ld && ld.cirrhosis === "yes") d.cirrhosis = true;
    const pl = d.conditions.find(c => c.id === "paralysis");
    if (pl) d.paralysisType = pl.paralysisType || "paraplegia";
    const st = d.conditions.find(c => c.id === "stroke");
    if (st && st.severity === "severe") d.strokeSevere = true;
    if (st && st.multipleStrokes) d.multipleStrokes = true;
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
    // Default output is the all-carrier comparison — the client's possible
    // health class under every carrier, with the primary carrier's full
    // estimate below. The compare button hides/shows it.
    const comp = renderComparison(runComparison());
    box.insertBefore(comp, box.firstChild);
    const btnComp = $("#btn-compare");
    if (btnComp) btnComp.textContent = "Hide comparison";
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

  /* Product / underwriting lane for each carrier, surfaced on the comparison
     table so a producer sees that a "Preferred" at a simplified-issue or
     final-expense carrier is a different product than at a fully underwritten
     term carrier — the classes share labels but are not directly comparable. */
  const CARRIER_LANES = {
    banner:          { kind: "fully_underwritten", label: "Fully underwritten term",                 note: "Full medical/paramedical underwriting — comparably rated tables." },
    mutual_of_omaha: { kind: "fully_underwritten", label: "Fully underwritten term/permanent",        note: "Tables and flat extras; Express simplified lanes are separate." },
    transamerica:    { kind: "fully_underwritten", label: "Fully underwritten term/IUL",             note: "Tables and flat extras; Final Expense Solutions is a separate lane." },
    fg_quantum:      { kind: "database_underwritten", label: "DB-driven term/IUL (no CD exam)",      note: "MIB/RX/MVR review; a paramedical exam won't improve the class." },
    fg_pathsetter:   { kind: "database_underwritten", label: "DB-driven IUL (exam-free to $1M)",    note: "InstApproval / MIB / RX/MVR; no exam required through $1M." },
    foresters:       { kind: "fully_underwritten", label: "Non-medical term/UL",                     note: "No tables in the modeled lanes; PlanRight whole life is separate." },
    national_life:   { kind: "database_underwritten", label: "Streamlined / EZ term & IUL",          note: "MIB, RX database, MVR — no medical testing for Streamlined/EZ." },
    amam:            { kind: "simplified_issue",      label: "Simplified-issue term (accept/reject)", note: "Standard through Table 4, issued at Standard rates; no tables." },
    john_hancock:    { kind: "simplified_issue",      label: "Simplified-issue term (Simple Term)",    note: "Accepted Standard / Select; database checks only, no exam." },
    quility:         { kind: "simplified_issue",      label: "Simplified-issue term (QTP)",           note: "Accept/reject; no tables; declined on many impairments that a fully underwritten carrier might still rate." },
    corebridge:      { kind: "final_expense",        label: "Simplified-issue final expense",         note: "Knockout-question instant decision; no tables or flat extras." },
    americo:         { kind: "final_expense",        label: "Simplified-issue final expense",         note: "Eagle Select plans; no tables; built on simple health questions." }
  };

  function carrierLane(id) {
    return (CARRIER_LANES[id] && CARRIER_LANES[id].label) || "";
  }

  /* Run the same assembled profile through every carrier ruleset and return
     { carrierId, out } rows, ordered by the carrier select list. */
  /* Every carrier on the same input, sorted most favorable → least favorable
     (CLASS_INDEX rank; ties broken in carrier-lineup order by id) so the
     producer reads the strongest lane first. */
  function runComparison() {
    const d = buildInput();
    return Object.keys(CARRIER_RULES)
      .map(id => ({ id, out: Engine.run(id, d) }))
      .sort((a, b) => {
        const ra = CLASS_INDEX[a.out.finalClass] != null ? CLASS_INDEX[a.out.finalClass] : CLASS_INDEX.decline;
        const rb = CLASS_INDEX[b.out.finalClass] != null ? CLASS_INDEX[b.out.finalClass] : CLASS_INDEX.decline;
        return ra - rb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
  }

  /* Issue 5 — one source of truth for the outcome name/color across every view
     (comparison table, print sheet, expanded rows, and the results hero), so
     the same profile never renders two different labels. Fixes three real
     inconsistencies: Foresters Tobacco Plus showed "Tobacco Plus" in the hero
     but "Preferred Tobacco" in the table; a tobacco flat-extra showed its base
     + flat-extra name in the table but plain "Flat extra" in the hero; and a
     declined tobacco row showed "Standard Tobacco" in the table because the
     tobacco branch ran before the gate. Gates (manual/decline/postpone)
     always come first here. */
  function outcomeClassLabel(out, rules) {
    if (out.finalClass === "manual_review") return { name: "Manual underwriting review", color: "#5b6b7b" };
    const ci = rules.classInfo[out.finalClass] || {};
    if (out.finalClass === "decline" || out.finalClass === "postpone") {
      return { name: ci.name || out.finalClass.replace(/_/g, " "), color: ci.color || (out.finalClass === "decline" ? "#b3364a" : "#8a5fb8") };
    }
    if (out.finalClass === "flat_extra" && out.flatExtra) {
      if (out.tobaccoClass) {
        // Tobacco + hazardous avocation: the flat-extra lane sits on the base
        // class (e.g., F&G Preferred Tobacco + flat extra) — don't collapse it
        // to plain "Standard Tobacco".
        const base = (rules.classInfo[out.flatExtra.baseClass] || { name: out.flatExtra.baseClass.replace(/_/g, " ") }).name;
        return { name: base + " Tobacco + flat extra", color: "#b8860b" };
      }
      return { name: ci.name || "Flat extra", color: ci.color || "#c2691b" };
    }
    if (out.tobaccoClass) {
      if (rules.id === "foresters" && out.tobaccoPlus) return { name: "Tobacco Plus", color: "#b8860b" };
      if (out.finalClass === "preferred_plus" || out.finalClass === "preferred") return { name: "Preferred Tobacco", color: "#b8860b" };
      if (out.finalClass === "table") return { name: "Table-rated (tobacco base)", color: "#b8860b" };
      return { name: "Standard Tobacco", color: "#8a6d1a" };
    }
    return { name: ci.name || out.finalClass.replace(/_/g, " "), color: ci.color || "#5b6b7b" };
  }

  function compareClassName(out, rules) {
    return outcomeClassLabel(out, rules);
  }

  /* Issue 6 — synthesized plain-English bottom line for the comparison table.
     Reads the ranked rows and compresses them into one or two sentences the
     producer can say out loud: what the best likely lane is (and who offers
     it), whether any carriers gate the profile, and a lane-comparability
     caveat when the best lane is simplified-issue or final-expense rather than
     fully underwritten term. */
  function compareBottomLine(rows) {
    const ranked = rows.map(r => ({
      id: r.id,
      out: r.out,
      lane: CARRIER_LANES[r.id],
      rank: CLASS_INDEX[r.out.finalClass] != null ? CLASS_INDEX[r.out.finalClass] : CLASS_INDEX.decline,
      label: outcomeClassLabel(r.out, CARRIER_RULES[r.id]).name
    }));
    const bestRank = Math.min(...ranked.map(x => x.rank));
    if (bestRank >= CLASS_INDEX.manual_review) {
      return "Every modeled carrier postpones or declines this profile — hold the case for specialist review (or an alternate product) before an estimate is reliable.";
    }
    const best = ranked.filter(x => x.rank === bestRank);
    const bestNames = best.map(x => CARRIER_RULES[x.id].name);
    const nameList = bestNames.slice(0, 3).join(", ") + (bestNames.length > 3 ? ` (and ${bestNames.length - 3} more)` : "");
    const parts = [`Best likely outcome: ${best[0].label} at ${nameList}.`];
    const gatedCount = ranked.filter(x => x.out.gates.decline.length || x.out.gates.postpone.length).length;
    if (gatedCount) parts.push(`${gatedCount} carrier${gatedCount > 1 ? "s" : ""} decline or postpone this profile — see the gates column.`);
    const bestLane = best[0].lane;
    if (bestLane && bestLane.kind !== "fully_underwritten" && bestLane.kind !== "database_underwritten") {
      parts.push(`The best lane is ${bestLane.label.toLowerCase()} — not directly comparable to fully underwritten term.`);
    }
    return parts.join(" ");
  }

  /* Issue 3 — scannable gate/evidence tags. Returns DOM nodes (el-built) so
     the comparison columns read as colored DECLINE / POSTPONE / EVIDENCE
     prefixes instead of a wall of text — a hard gate is instantly separable
     from a nice-to-have evidence item, on screen and in the print sheet. */
  const COMPARE_TAG_LABEL = { decline: "Decline", postpone: "Postpone", limit: "Factor", ev: "Evidence" };
  function compareTag(kind) {
    return el("span", { class: "compare-tag tag-" + kind, "aria-hidden": "true" }, (COMPARE_TAG_LABEL[kind] || kind).toUpperCase());
  }
  function tagItem(kind, text) {
    return el("span", { class: "compare-item" }, [compareTag(kind), document.createTextNode(" " + text)]);
  }

  function compareEvidence(out) {
    const list = (out.evidence && out.evidence.list) || [];
    if (!list.length) return [el("span", { class: "compare-nogate" }, "Application only")];
    const shown = list.slice(0, 3);
    const more = list.length - shown.length;
    const nodes = shown.map(it => tagItem("ev", it));
    if (more > 0) nodes.push(document.createTextNode(` (+${more} more)`));
    return nodes;
  }

  function compareLimiting(row) {
    const { out } = row;
    const items = [];
    out.gates.decline.slice(0, 2).forEach(g => items.push({ kind: "decline", text: g.text || g.id }));
    out.gates.postpone.slice(0, 2).forEach(g => items.push({ kind: "postpone", text: g.text || g.id }));
    if (!items.length) {
      [...out.limitingFactors, ...(out.outsideFactors || [])].slice(0, 3).forEach(l => items.push({ kind: "limit", text: DOMAIN_LABELS[l.domain] || l.domain }));
    }
    if (!items.length) return [el("span", { class: "compare-nogate" }, "No single cap — consistent profile")];
    const nodes = items.map(it => tagItem(it.kind, it.text));
    if (out.gates.decline.length > 2 || out.gates.postpone.length > 2) nodes.push(document.createTextNode(` (+${out.gates.decline.length + out.gates.postpone.length - 2} more)`));
    return nodes;
  }

  function compareFinancial(out) {
    if (!out.financial) return "—";
    if (out.financial.ok === false) return "Exceeds " + out.financial.multiplier + "X guideline";
    if (out.financial.ok === true) return "Within " + out.financial.multiplier + "X guideline";
    return "—";
  }

  function renderComparison(rows) {
    const wrap = el("div", { id: "comparison", class: "card" });
    const head = el("div", { class: "compare-head" });
    const headTxt = el("div", {});
    headTxt.appendChild(el("h2", {}, "Carrier comparison — same profile, all carriers"));
    headTxt.appendChild(el("p", { class: "card-sub" }, "The same answers run through every carrier ruleset. Classes are carrier-specific labels on a shared ladder (Preferred Plus/Elite → Standard → table-rated); a tobacco profile appears in each carrier's own tobacco class. Click a row to open that carrier's full estimate."));
    /* Issue 7 — lane-comparability caveat lifted up from the footer note into a
       persistent header strip, shown whenever a simplified-issue or
       final-expense lane sits beside fully underwritten term: same ladder
       labels, different products — a "Preferred" at Americo is not a
       "Preferred" at Banner. */
    const laneKinds = rows.map(r => CARRIER_LANES[r.id] && CARRIER_LANES[r.id].kind);
    const hasSimplifiedLane = laneKinds.some(k => k === "simplified_issue" || k === "final_expense");
    const hasFullLane = laneKinds.some(k => k === "fully_underwritten" || k === "database_underwritten");
    if (hasSimplifiedLane && hasFullLane) {
      headTxt.appendChild(el("div", { class: "compare-lane-caveat" }, "Lane mix: simplified-issue and final-expense carriers appear beside fully underwritten term — same ladder labels, different products. Their classes are not directly comparable; see the lane under each carrier name."));
    }
    head.appendChild(headTxt);
    const headActions = el("div", { class: "compare-head-actions" });
    const expandAllBtn = el("button", { class: "btn btn-ghost compare-all-btn", type: "button", "aria-label": "Expand or collapse every carrier row", title: "Expand every row's full gates & evidence, or collapse them all" }, "Expand all");
    headActions.appendChild(expandAllBtn);
    headActions.appendChild(el("a", { class: "btn btn-cta", href: "https://lifeinsurancebrokeradvocate.com/contact", target: "_blank", rel: "noopener noreferrer" }, "Contact your broker advocate →"));
    head.appendChild(headActions);
    wrap.appendChild(head);

    /* Shared expand logic: insert/remove the detail row for one carrier row,
       and keep the expand-all button label in sync with the actual state. */
    const rowRefs = [];
    function toggleDetail(tr, expandBtn, row) {
      const existing = tbody.querySelector('tr.compare-detail[data-carrier="' + row.id + '"]');
      if (existing) { existing.remove(); expandBtn.classList.remove("expanded"); return; }
      const dtr = el("tr", { class: "compare-detail", "data-carrier": row.id });
      dtr.appendChild(el("td", { colspan: 6, class: "compare-detail-cell" }, compareDetailContent(row)));
      tr.insertAdjacentElement("afterend", dtr);
      expandBtn.classList.add("expanded");
    }
    function allExpanded() {
      return rowRefs.length > 0 && rowRefs.every(r => r.expandBtn.classList.contains("expanded"));
    }
    function syncAllLabel() { expandAllBtn.textContent = allExpanded() ? "Collapse all" : "Expand all"; }
    expandAllBtn.addEventListener("click", () => {
      if (allExpanded()) {
        rowRefs.forEach(r => {
          const d = tbody.querySelector('tr.compare-detail[data-carrier="' + r.row.id + '"]');
          if (d) d.remove();
          r.expandBtn.classList.remove("expanded");
        });
      } else {
        rowRefs.forEach(r => {
          if (!r.expandBtn.classList.contains("expanded")) {
            const dtr = el("tr", { class: "compare-detail", "data-carrier": r.row.id });
            dtr.appendChild(el("td", { colspan: 6, class: "compare-detail-cell" }, compareDetailContent(r.row)));
            r.tr.insertAdjacentElement("afterend", dtr);
            r.expandBtn.classList.add("expanded");
          }
        });
      }
      syncAllLabel();
    });

    /* Ruleset panel — carrier is fixed to Banner Life (no dropdown). The
       highlighted row is the full estimate shown below; clicking any other
       row still switches via applyCarrierSwitch, which re-renders this panel
       with the new carrier's name and eligibility chart. */
    const cr = CARRIER_RULES[state.carrier];
    const panel = el("div", { class: "carrier-panel" });
    panel.appendChild(el("p", { class: "carrier-label" }, "Underwriting ruleset · " + cr.name));
    panel.appendChild(el("p", { class: "carrier-desc" }, "The highlighted row is this carrier's full estimate below; click any other row to switch. Banner Life's published rules are applied automatically unless you switch rows."));
    panel.appendChild(carrierEligibility(cr));
    wrap.appendChild(panel);

    const tbl = el("table", { class: "domain-table compare-table" });
    const thead = el("thead", {});
    thead.appendChild(el("tr", {}, [
      el("th", { "aria-hidden": "true" }, ""), el("th", {}, "Carrier"), el("th", {}, "Estimated class"), el("th", {}, "Limiting factors / gates"), el("th", {}, "Evidence highlights"), el("th", {}, "Financial")
    ]));
    tbl.appendChild(thead);
    const tbody = el("tbody", {});
    /* Best-class highlight: the most favorable class offered across the
       compared carriers for this profile, so the producer sees the strongest
       lane(s) at a glance. Only a real underwriting offer (better than manual
       review / postpone / decline) qualifies — an all-decline table marks no
       row as "best". Ties (several carriers at the same best class) all get
       the badge. */
    const bestIdx = Math.min(...rows.map(r => CLASS_INDEX[r.out.finalClass] != null ? CLASS_INDEX[r.out.finalClass] : CLASS_INDEX.decline));
    const showBest = bestIdx < CLASS_INDEX.manual_review;
    rows.forEach(row => {
      const rules = CARRIER_RULES[row.id];
      const cn = compareClassName(row.out, rules);
      const isBest = showBest && CLASS_INDEX[row.out.finalClass] === bestIdx;
      const isCurrent = row.id === state.carrier;
      // Clicking a row switches the results page to that carrier's full estimate;
      // the chevron expands the row in place to show full gates + evidence
      // without switching.
      const tr = el("tr", {
        class: isCurrent ? "compare-current" : "compare-row",
        title: isCurrent ? "Current carrier — full estimate shown below" : "Open this carrier's full estimate",
        onclick: () => switchCarrier(row.id)
      });
      const expandBtn = el("button", {
        class: "compare-expand", type: "button", "aria-label": "Expand " + rules.name + " details",
        title: "Show full gates & evidence",
        onclick: (e) => {
          e.stopPropagation();
          toggleDetail(tr, expandBtn, row);
          syncAllLabel();
        }
      }, "▸");
      tr.appendChild(el("td", { class: "compare-expand-cell" }, expandBtn));
      rowRefs.push({ tr, expandBtn, row });
      tr.appendChild(el("td", { style: "font-weight:600" }, [
        rules.name,
        el("div", { class: "compare-version" }, rules.guide.version),
        el("div", { class: "compare-lane", title: (CARRIER_LANES[row.id] && CARRIER_LANES[row.id].note) || "" }, carrierLane(row.id))
      ]));
      tr.appendChild(el("td", {}, el("span", { class: "klass-chip klass" + (isBest ? " best" : ""), style: `background:${cn.color}` }, [
        cn.name,
        isBest ? el("span", { class: "compare-best-badge", title: "Best available class for this profile across the compared carriers" }, "Best") : null
      ])));
      tr.appendChild(el("td", {}, compareLimiting(row)));
      tr.appendChild(el("td", {}, compareEvidence(row.out)));
      tr.appendChild(el("td", {}, compareFinancial(row.out)));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    /* Scroll wrapper: the 12-row comparison table scrolls horizontally on
       phones/tablets instead of overflowing the page. */
    const compareScroll = el("div", { class: "table-scroll" });
    compareScroll.appendChild(tbl);
    wrap.appendChild(compareScroll);

    const bottomLine = el("div", { class: "compare-bottom-line" });
    bottomLine.appendChild(el("strong", {}, "Bottom line: "));
    bottomLine.appendChild(document.createTextNode(compareBottomLine(rows)));
    wrap.appendChild(bottomLine);

    const note = el("div", { class: "note-box" });
    note.appendChild(el("strong", {}, "How to read this:"));
    const noteList = el("ul", { class: "compare-read-list" });
    noteList.appendChild(el("li", {}, "Each column is that carrier's own estimated class for the same applicant — the best match varies by product and underwriting style."));
    noteList.appendChild(el("li", {}, [el("strong", {}, "Lanes aren't comparable: "), "simplified-issue and final-expense classes are not the same product as fully underwritten term — check the lane under each carrier name."]));
    noteList.appendChild(el("li", {}, "Click any row to open that carrier's full estimate below; click the chevron to expand its full gates and evidence in place."));
    noteList.appendChild(el("li", {}, "Preliminary and non-binding — evidence, records, and carrier rules can change every result."));
    note.appendChild(noteList);
    wrap.appendChild(note);
    return wrap;
  }

  /* Expanded row content: that carrier's full postpone/decline gate list,
     limiting factors, confidence, and complete evidence checklist — without
     switching the detailed estimate below. */
  function compareDetailContent(row) {
    const { id, out } = row;
    const rules = CARRIER_RULES[id];
    const cn = compareClassName(out, rules);
    const box = el("div", { class: "compare-detail-body" });

    const head = el("div", { class: "compare-detail-head" });
    head.appendChild(el("span", { class: "compare-detail-class", style: `color:${cn.color}` }, cn.name));
    const headMeta = el("span", { class: "compare-detail-meta" });
    headMeta.appendChild(document.createTextNode("Confidence: " + (out.confidence ? out.confidence.level : "—") + (out.range ? " · Range: " + rangeLabel(out.range) : "")));
    head.appendChild(headMeta);
    box.appendChild(head);

    const cols = el("div", { class: "compare-detail-cols" });

    const gatesCol = el("div", {});
    gatesCol.appendChild(el("strong", {}, "Gates & limiting factors"));
    const gUl = el("ul", { class: "evidence-list" });
    let gCount = 0;
    (out.gates.decline || []).forEach(g => { gCount++; gUl.appendChild(el("li", {}, [el("strong", {}, g.text || g.id), g.reason ? " — " + g.reason : ""])); });
    (out.gates.postpone || []).forEach(g => { gCount++; gUl.appendChild(el("li", {}, [el("strong", {}, g.text || g.id), g.reason ? " — " + g.reason : ""])); });
    (out.limitingFactors || []).forEach(l => { gCount++; gUl.appendChild(el("li", {}, DOMAIN_LABELS[l.domain] + ": " + (l.detail || l.klass))); });
    if (!gCount) gUl.appendChild(el("li", {}, "No decline/postpone gates and no limiting factors — consistent profile."));
    gatesCol.appendChild(gUl);
    cols.appendChild(gatesCol);

    const evCol = el("div", {});
    evCol.appendChild(el("strong", {}, "Evidence checklist"));
    const eUl = el("ul", { class: "evidence-list" });
    const list = (out.evidence && out.evidence.list) || [];
    if (list.length) list.forEach(i => eUl.appendChild(el("li", {}, i)));
    else eUl.appendChild(el("li", {}, "Application only"));
    evCol.appendChild(eUl);
    cols.appendChild(evCol);

    box.appendChild(cols);
    return box;
  }

  function resultsView(out) {
    const rules = CARRIER_RULES[state.carrier];
    const wrap = el("div", {});

    /* ---- Hero outcome ---- */
    let heroInfo;
    if (out.finalClass === "manual_review") {
      heroInfo = { name: "Manual underwriting review", meaning: "Key evidence is missing or conflicting. Complete the intake and obtain records before estimating.", color: "#5b6b7b" };
    } else if (out.tobaccoClass) {
      /* Name/color come from the shared outcomeClassLabel so the hero and the
         comparison table always agree (Tobacco Plus, flat-extra tobacco, etc.);
         only the explanation text is hero-specific. */
      const t = outcomeClassLabel(out, rules);
      let meaning;
      if (rules.id === "foresters" && out.tobaccoPlus) meaning = "Nicotine use within the past year AND meets all Preferred Plus criteria (≤1 pack per day for cigarettes) — Foresters Tobacco Plus, subject to full evidence and carrier rules.";
      else if (out.finalClass === "preferred_plus" || out.finalClass === "preferred") meaning = "Otherwise favorable profile with nicotine use — carrier's Preferred Tobacco class, subject to full evidence and carrier rules.";
      else if (out.finalClass === "table") meaning = "Substandard risk with nicotine use; tables are not available with preferred tobacco classes.";
      else meaning = "Average risk with nicotine use; health factors still affect the result.";
      heroInfo = { name: t.name, color: t.color, meaning };
    } else {
      const t = outcomeClassLabel(out, rules);
      const ci = rules.classInfo[out.finalClass] || {};
      heroInfo = { name: t.name, color: t.color, meaning: ci.meaning || "" };
    }

    const hero = el("div", { class: "result-hero", style: `background:linear-gradient(135deg, ${heroInfo.color}, ${shade(heroInfo.color, -25)})` });
    hero.appendChild(el("div", { class: "hero-label" }, "Preliminary estimate · " + out.carrier + " · " + out.guide.version));
    hero.appendChild(el("h2", {}, heroInfo.name));
    if (heroInfo.meaning) hero.appendChild(el("div", { class: "hero-meaning" }, heroInfo.meaning));
    const meta = el("div", { class: "hero-meta" });
    meta.appendChild(el("div", { class: "meta-item" }, [el("strong", {}, rangeLabel(out.range)), "likely range"]));
    /* Issue 4 — localize the confidence level: instead of a bare "Moderate",
       state what evidence would firm it up, drawn straight from the engine's
       missing list (A1c, last-fill dates, pending-care status, etc.). */
    const confItem = el("div", { class: "meta-item" }, [el("strong", {}, out.confidence ? out.confidence.level : "—"), "confidence"]);
    if (out.confidence && out.confidence.missing && out.confidence.missing.length) {
      const top = out.confidence.missing.slice(0, 3);
      const more = out.confidence.missing.length - top.length;
      confItem.appendChild(el("div", { class: "hero-conf-missing" }, "Needs: " + top.join(", ") + (more > 0 ? ` (+${more} more)` : "")));
    }
    meta.appendChild(confItem);
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
    if (out.notes && out.notes.length) {
      out.notes.forEach(n => sumList.appendChild(el("li", { class: "note-line" }, n)));
    }
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
    const domScroll = el("div", { class: "table-scroll" });
    domScroll.appendChild(tbl);
    dom.appendChild(domScroll);
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
      evUl.appendChild(el("li", {}, "PlanRight whole-life lane (separate simplified-issue product): its own build chart applies — check build against the PlanRight minimum/maximum weights — and any history of congestive heart failure, regardless of when diagnosed or treated, is not eligible for PlanRight."));
      const pr = rules.planright && rules.planright.drugRules;
      if (pr) {
        const prWords = String(state.medicationsText || "").toLowerCase().split(/[^a-z]+/).filter(Boolean);
        const prHit = (list) => list.some(w => prWords.includes(w));
        const prNeph = prHit(pr.nephropathy), prNeuro = prHit(pr.neuropathy), prDiab = prHit(pr.diabetes);
        const prA = prHit(pr.listA), prB = prHit(pr.listB), prC = prHit(pr.listC);
        if (prA && prB && prC) evUl.appendChild(el("li", {}, "PlanRight drug-rule flag: a List A (ACE/ARB) + List B (beta-blocker) + List C (diuretic) medication combination is disclosed — PlanRight would not be eligible for coverage on this profile."));
        else if ((prNeph || prNeuro) && prDiab) evUl.appendChild(el("li", {}, "PlanRight drug-rule flag: a nephropathy/neuropathy medication combined with a diabetes medication is disclosed (within the past 2 years) — PlanRight would offer at most the Basic death benefit."));
      }
    } else if (out.carrier === "Transamerica") {
      if (age !== null && age <= 85 && Number(state.faceAmount || 0) >= 1000) {
        const feBands = (rules.feLane && rules.feLane.faceBands) || [];
        const feMax = feBands.reduce((m, b) => { const lo = parseInt(b.ages.split("-")[0], 10); const hi = parseInt(b.ages.split("-")[1], 10); return (age >= lo && age <= hi) ? b.max : m; }, 0);
        if (Number(state.faceAmount || 0) <= feMax) {
          evUl.appendChild(el("li", {}, "Final Expense Solutions lane applies at this age/face band (Immediate Solution / 10-Pay / Easy Solution, $1,000-" + feMax.toLocaleString() + ") — decisions are Preferred / Standard / Graded / Decline with no table ratings; nicotine within 12 months receives a tobacco rating; the Activity Credit (3+ days/week exercise) can improve a build-only Standard to Preferred."));
        }
      }
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
    } else if (out.carrier === "American Amicable") {
      evUl.appendChild(el("li", {}, "Simplified-issue workflow: application, MIB check, pharmaceutical (prescription) facility check, and MVR on every application — no exams or blood work required."));
      evUl.appendChild(el("li", {}, "Telephone interview by age/amount — Term Made Simple: mandatory at age 65+; Express Term: none at 18-55, ages 56-65 only for the Critical Illness Rider at 100%, ages 66-75 at all amounts."));
      if (age !== null && age >= 66) evUl.appendChild(el("li", {}, "Telephone interview required at this age (ages 66-75, all amounts)."));
      if (Number(state.faceAmount || 0) > 300000 && age !== null && age >= 46) {
        evUl.appendChild(el("li", {}, "Express Term maximum face at ages 46-75 is $300,000 — this amount exceeds it; verify the applicable product before submitting."));
      }
      if (age !== null && age >= 30 && state.premiumPayor === "third_party") {
        evUl.appendChild(el("li", {}, "Third-party premium payor with the insured age 30 or older — American Amicable does not accept these applications (spouse, business, or business partner payors are accepted)."));
      }
      if (age !== null && age >= 50 && age <= 85 && Number(state.faceAmount || 0) >= 2500 && Number(state.faceAmount || 0) <= 50000) {
        evUl.appendChild(el("li", {}, "Dignity Solutions final-expense lane applies at this age/face band — the plan tier (Immediate / Graded / Return of Premium) is set by the health answers; coverage is declined if any of the first three health questions are answered yes."));
      }
      if (age !== null && age >= 20 && age <= 75 && Number(state.faceAmount || 0) >= 25000 && Number(state.faceAmount || 0) <= 300000) {
        evUl.appendChild(el("li", {}, "Home Certainty mortgage-protection lane applies at this age/face band — simplified-issue level term to age 95 (10/15/20/25/30-yr premium periods), $25,000-$300,000, shares the Express Term build chart; a current mortgage is required for eligibility."));
      }
      evUl.appendChild(el("li", {}, "Underwriting is standard through Table 4 on an accept/reject basis — no table ratings are offered; conditions on the impairment-guide decline list and build outside the chart should not be submitted."));
    } else if (out.carrier === "John Hancock") {
      evUl.appendChild(el("li", {}, "Simple Term with Vitality is underwritten from the simplified application plus database checks — MIB, MVR, prescription history check, and identification. No paramedical exam is used for this product."));
      evUl.appendChild(el("li", {}, "Any nicotine, tobacco, or smoking-cessation product within the past 12 months renders the tobacco risk class; a post-issue quality review may request medical records and a policy may be rescinded for material misrepresentation."));
      if (age !== null && (age < 20 || age > 60)) evUl.appendChild(el("li", {}, `Simple Term with Vitality is available only at ages 20-60 — this age is outside the product's eligibility.`));
      if (Number(state.faceAmount || 0) > 500000) evUl.appendChild(el("li", {}, "Coverage is limited to $500,000 and may not replace in-force coverage."));
    } else if (out.carrier === "Americo") {
      evUl.appendChild(el("li", {}, "Eagle Select uses a 100% instant-decision eApplication — the health questions plus MIB, prescriptions, medical information, and other third-party services generate the offer (Eagle Select 1 / 2 / 3 or decline) in minutes."));
      evUl.appendChild(el("li", {}, "The Quit Smoking Advantage lets smokers receive non-nicotine rates for the first three policy years."));
      if (age !== null && (age < 40 || age > 85)) evUl.appendChild(el("li", {}, `Eagle Select is available at ages 40-85 — this age is outside the product's eligibility.`));
      if (Number(state.faceAmount || 0) > 40000) evUl.appendChild(el("li", {}, "Eagle Select maximum face is $40,000 (Eagle Select 1 & 2) / $25,000 (Eagle Select 3)."));
    } else if (out.carrier === "Quility Term Plus (LGA)") {
      evUl.appendChild(el("li", {}, "QTP is designed for instant decisions on about 70% of applicants and 20% APS-free decisions within 24 hours — underwritten and issued by Banner Life (William Penn in NY; QTP is not available in NY)."));
      evUl.appendChild(el("li", {}, "No table ratings — a risk above Standard is declined, not table-rated. Half of intentional weight loss over the last 12 months is added to the current build."));
      evUl.appendChild(el("li", {}, "Two-year contestability and suicide provisions apply."));
    } else if (out.carrier === "Corebridge / AGL") {
      evUl.appendChild(el("li", {}, "SimpliNow Legacy offers instant underwriting decisions with no underwriters — the electronic application plus prescription data; the condition table assigns Level / Graded / Decline by condition and time frame."));
      evUl.appendChild(el("li", {}, "The prescription list flags medications that impact the death benefit (most result in decline); combinations of conditions can result in worse than listed decisions."));
      if (age !== null && (age < 50 || age > 80)) evUl.appendChild(el("li", {}, `SimpliNow Legacy is available at ages 50-80 — this age is outside the product's eligibility.`));
      evUl.appendChild(el("li", {}, "American General GIWL (guaranteed issue, ages 50-80, $5,000-$25,000, no health questions, graded years 1-2) is a separate lane for applicants who cannot pass even the simplified health screen."));
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
    actions.appendChild(el("button", { class: "btn btn-print", onclick: () => printAckRecord() }, "Print acknowledgment"));
    actions.appendChild(el("button", { class: "btn btn-ghost", onclick: () => { $("#results-content").classList.add("hidden"); $("#step-content").classList.remove("hidden"); render(); } }, "Edit answers"));
    actions.appendChild(el("button", { class: "btn btn-danger-ghost", onclick: () => { if (confirm("Start a new case? Current answers will be cleared.")) resetState(); } }, "New case"));
    wrap.appendChild(actions);

    return wrap;
  }

  function toggleComparison() {
    const existing = $("#comparison");
    const btn = $("#btn-compare");
    if (existing) { existing.remove(); if (btn) btn.textContent = "Compare across carriers"; return; }
    const wrap = renderComparison(runComparison());
    const resultsBox = $("#results-content");
    const anchor = $("#results-actions");
    resultsBox.insertBefore(wrap, anchor ? anchor.parentNode : null);
    if (btn) btn.textContent = "Hide comparison";
    wrap.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* Switch the results page to another carrier's full estimate, keeping the
     comparison open (re-rendered) so the new row is highlighted. */
  function switchCarrier(id) {
    if (id === state.carrier) return;
    applyCarrierSwitch(id);
  }

  /* The actual switch. Comparison rows drive this via switchCarrier; the
     switched carrier persists only for the session — loadState resets it to
     Banner Life on the next boot. */
  function applyCarrierSwitch(id) {
    state.carrier = id;
    saveState();
    const cb = $("#carrier-badge"); if (cb) cb.textContent = CARRIER_RULES[id].name;
    runEstimate(); // re-renders results, including the all-carrier comparison
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
    return bits.join("  ·  ") || "Profile information not entered";
  }

  function buildPrintSheet(rows) {
    let sheet = document.getElementById("print-sheet");
    if (!sheet) {
      sheet = el("div", { id: "print-sheet" });
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = "";

    const title = el("div", { class: "print-sheet-head print-sheet-head-flags" });
    title.appendChild(el("div", { class: "print-flag print-flag-left", html: usFlagSvg(60, 32) }));
    const center = el("div", { class: "print-sheet-center" });
    center.appendChild(el("div", { class: "print-sheet-brand" }, "HealthClassEstimator"));
    center.appendChild(el("div", { class: "print-sheet-title" }, "Carrier comparison — same applicant profile"));
    const meta = el("div", { class: "print-sheet-meta" }, [el("span", {}, "Estimated " + new Date().toLocaleDateString()), el("span", {}, "Preliminary, non-binding — based only on disclosed information")]);
    center.appendChild(meta);
    title.appendChild(center);
    title.appendChild(el("div", { class: "print-flag print-flag-right", html: txFlagSvg(48, 32) }));
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
    /* Same best-class ranking as the on-screen table, so the printed sheet
       agrees with the screen version. */
    const pBestIdx = Math.min(...rows.map(r => CLASS_INDEX[r.out.finalClass] != null ? CLASS_INDEX[r.out.finalClass] : CLASS_INDEX.decline));
    const pShowBest = pBestIdx < CLASS_INDEX.manual_review;
    rows.forEach(row => {
      const rules = CARRIER_RULES[row.id];
      const cn = compareClassName(row.out, rules);
      const pIsBest = pShowBest && CLASS_INDEX[row.out.finalClass] === pBestIdx;
      const tr = el("tr", { class: row.id === state.carrier ? "print-current" : "" });
      tr.appendChild(el("td", { class: "print-carrier" }, [rules.name, el("div", { class: "print-version" }, rules.guide.version), el("div", { class: "print-lane" }, carrierLane(row.id))]));
      tr.appendChild(el("td", {}, el("span", { class: "klass-chip klass" + (pIsBest ? " best" : ""), style: `background:${cn.color}` }, [cn.name, pIsBest ? el("span", { class: "compare-best-badge" }, "Best") : null])));
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

  /* ---------- printable acknowledgment record ------------------------ */

  /* One-page print layout (body.print-ack), distinct from the comparison
     sheet and the full results print. A hidden #ack-sheet is populated with
     the stored acceptance date, the case context (if any), the full
     acknowledgment + legal disclaimer text, the consumer-report links, and
     signature lines — a record the producer can file with the case file. */
  function printAckRecord() {
    const ack = readAck();
    let caseRef = "";
    try { caseRef = (window.prompt("Optional case reference (e.g., applicant initials or file #) to print on the record — leave blank to omit:", "") || "").trim(); } catch (e) { /* ignore */ }
    const sheet = buildAckSheet(ack, caseRef);
    document.body.classList.add("print-ack");
    window.addEventListener("afterprint", () => document.body.classList.remove("print-ack"), { once: true });
    window.print();
    setTimeout(() => document.body.classList.remove("print-ack"), 1500);
  }

  function buildAckSheet(ack, caseRef) {
    let sheet = document.getElementById("ack-sheet");
    if (!sheet) {
      sheet = el("div", { id: "ack-sheet" });
      document.body.appendChild(sheet);
    }
    sheet.innerHTML = "";

    const head = el("div", { class: "print-sheet-head print-sheet-head-flags" });
    head.appendChild(el("div", { class: "print-flag print-flag-left", html: usFlagSvg(60, 32) }));
    const center = el("div", { class: "print-sheet-center" });
    center.appendChild(el("div", { class: "print-sheet-brand" }, "HealthClassEstimator"));
    center.appendChild(el("div", { class: "print-sheet-title" }, "Acknowledgment record"));
    const meta = el("div", { class: "print-sheet-meta" });
    meta.appendChild(el("span", {}, "Accepted: " + (ack && ack.acceptedAt ? new Date(ack.acceptedAt).toLocaleString() : "before dated records were stored")));
    meta.appendChild(el("span", {}, "App version " + (window.HCE_VERSION || "?") + " · printed " + new Date().toLocaleDateString()));
    center.appendChild(meta);
    head.appendChild(center);
    head.appendChild(el("div", { class: "print-flag print-flag-right", html: txFlagSvg(48, 32) }));
    sheet.appendChild(head);

    if (caseRef) sheet.appendChild(el("div", { class: "ack-record-ref" }, "Case reference: " + caseRef));

    const profLine = profileLine();
    if (profLine !== "Profile information not entered") {
      sheet.appendChild(el("div", { class: "print-sheet-profile" }, "Case context — " + (CARRIER_RULES[state.carrier] ? CARRIER_RULES[state.carrier].name + "; " : "") + profLine));
    }

    const body = el("div", { class: "ack-record-body" });
    body.appendChild(el("p", { class: "ack-record-statement" },
      "The undersigned acknowledges that this tool is used only to help estimate a person's health class for life-insurance pre-underwriting and case triage; it is not an offer of life insurance, a quote, or medical advice, and it does not issue insurance or bind coverage. No information entered into the tool is collected or stored — entries remain in the user's own browser on their own device. The estimate is preliminary and non-binding, and all carriers have the final and absolute say on the client's underwriting and health class."));
    const disc = el("div", { class: "ack-record-disclaimer" });
    disc.appendChild(el("strong", {}, "Legal disclaimer. "));
    disc.appendChild(document.createTextNode("This tool is not a medical diagnostic tool and does not issue insurance, bind coverage, or replace a carrier underwriter's decision. The estimate is based only on disclosed information. The carrier may obtain medical records, prescription history, laboratory/paramedical results, consumer reports, and information from other insurers or MIB, subject to authorization — those sources can change the estimate. Never suggest withholding information or \"answering around\" a condition: applications state that answers influence acceptance and that material misrepresentation or nondisclosure can jeopardize coverage. Temporary coverage exists only if the exact carrier receipt conditions are met, not because this tool gives a favorable estimate."));
    body.appendChild(disc);
    body.appendChild(el("p", { class: "ack-record-check" },
      "I have read and accept the acknowledgment and disclaimer above — including that this tool is only an estimating aid, that it is not an offer of life insurance, that no information entered is collected or stored, and that each carrier has the final and absolute say on the client's underwriting and health class."));
    sheet.appendChild(body);

    const links = el("div", { class: "ack-record-links" });
    links.appendChild(el("div", { class: "ack-record-links-label" }, "Consumer-report record requests:"));
    links.appendChild(el("div", {}, "MIB Consumer File — https://www.mib.com/request_your_record.html"));
    links.appendChild(el("div", {}, "Milliman IntelliScript — https://www.rxhistories.com/for-consumers/insurance/"));
    links.appendChild(el("div", { class: "ack-record-links-label" }, "Producer contact:"));
    links.appendChild(el("div", {}, "https://lifeinsurancebrokeradvocate.com/"));
    sheet.appendChild(links);

    const sig = el("div", { class: "ack-record-sig" });
    sig.appendChild(el("div", { class: "sig-line" }, "Producer signature: "));
    sig.appendChild(el("div", { class: "sig-line" }, "Date: "));
    sheet.appendChild(sig);
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
    flat_extra: "Flat extra may apply",
    criminal_history: "Criminal history disclosed — carrier review",
    unexplained_care: "Frequent care without disclosed condition — confirm",
    foreign_residence: "Foreign residence — eligibility review",
    conflicting_disclosure: "Nicotine history conflict — confirm",
    combat_exposure: "Combat exposure — best class capped pending records",
    va_disability: "VA disability rating — class capped pending records",
    va_treatment: "VA treatment without disclosed condition — confirm",
    hazardous_avocation: "Hazardous occupation / avocation — class capped pending review",
    nicotine_date_suspect: "Last-use date unrecognized or in the future — confirm before trusting the class",
    diabetes_a1c_missing: "Diabetes A1c not provided — confirm before relying on the non-declined class"
  };
  const FLAG_CLASS = {
    needs_aps: "flag-warn", needs_exam: "flag-warn", likely_table: "flag-warn",
    possible_decline: "flag-danger", manual_review: "flag-warn", missing_material_data: "flag-warn",
    accelerated_uw_possible: "flag-ok",    financial_review: "flag-warn", undisclosed_meds: "flag-warn", criminal_history: "flag-warn",
    unexplained_care: "flag-warn", foreign_residence: "flag-warn", conflicting_disclosure: "flag-danger",
    combat_exposure: "flag-warn", va_disability: "flag-warn", va_treatment: "flag-warn",
    nicotine_date_suspect: "flag-danger", diabetes_a1c_missing: "flag-warn"
  };

  const DOMAIN_LABELS = {
    tobacco: "Tobacco / nicotine", build: "Build (height/weight)", bp: "Blood pressure",
    cholesterol: "Cholesterol / HDL", driving: "Driving", family: "Family history",
    medical: "Medical history", medications: "Medications / prescriptions", substance: "Alcohol / substances", avocation: "Occupation / avocation", functional: "Functional status / ADLs",
    pending: "Pending care"
  };

  /* ---------- boot ----------------------------------------------------- */

  /* Acknowledgment gate: no applicant information may be entered before the
     user accepts that the estimate is non-binding and that each carrier has
     the final and absolute say on the client's underwriting and health class.
     Acceptance persists per browser (localStorage); the gate re-appears until
     accepted. */
  /* v2: the acknowledgment was expanded (not-an-offer + no-data-collection
     sections added) — the key bump re-presents the gate to everyone so every
     user accepts the current terms. */
  const ACK_KEY = "hce_ack_v2";

  /* Read the stored acknowledgment. Records are { accepted, acceptedAt };
     the legacy bare "1" (pre-dated-record) still counts as accepted. */
  function readAck() {
    try {
      const raw = localStorage.getItem(ACK_KEY);
      if (!raw) return null;
      if (raw === "1") return { accepted: true, acceptedAt: null };
      const rec = JSON.parse(raw);
      return rec && rec.accepted ? rec : null;
    } catch (e) { return null; }
  }

  /* -- Responsive footer clearance ---------------------------------------
     The footer is fixed; its height changes as the nav and links wrap at
     different viewport widths. Expose the live height as --footer-h so the
     main content's bottom padding always clears it — no dead space on
     desktop, no hidden content behind the footer on phones. */
  function syncFooterSpace() {
    const f = $(".app-footer");
    if (f) document.documentElement.style.setProperty("--footer-h", Math.ceil(f.offsetHeight) + "px");
  }

  function boot() {
    loadState();
    syncFooterSpace();
    window.addEventListener("resize", syncFooterSpace);
    /* The footer's height also changes when the vertical scrollbar appears
       (content renders -> viewport narrows -> links wrap taller) — observe
       the element itself so clearance tracks every real size change. */
    const footerEl = $(".app-footer");
    if (footerEl && typeof ResizeObserver !== "undefined") {
      new ResizeObserver(syncFooterSpace).observe(footerEl);
    }
    const cb = $("#carrier-badge"); if (cb) cb.textContent = CARRIER_RULES[state.carrier].name;
    $("#btn-save").addEventListener("click", () => {
      saveState();
      showToast("Draft saved to this browser.");
    });
    const btnPrintAck = $("#btn-print-ack");
    if (btnPrintAck) btnPrintAck.addEventListener("click", () => printAckRecord());

    const gate = $("#ack-gate");
    const check = $("#ack-check");
    const accept = $("#ack-accept");
    let acknowledged = !!readAck();

    check.addEventListener("change", () => { accept.disabled = !check.checked; });
    accept.addEventListener("click", () => {
      try { localStorage.setItem(ACK_KEY, JSON.stringify({ accepted: true, acceptedAt: new Date().toISOString(), version: 2 })); } catch (e) { /* ignore */ }
      gate.classList.add("hidden");
      render();
    });

    if (!acknowledged) {
      // Keep the wizard inert until the acknowledgment is accepted.
      gate.classList.remove("hidden");
      return;
    }
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
