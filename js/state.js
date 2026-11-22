/* Versioned interview state. A migrated unchecked box is never a confirmed No. */
"use strict";
const InterviewState = (() => {
  const schemaVersion = 2;
  function empty() {
    const next = {
      schemaVersion, dob: "", sex: "", state: "", faceAmount: "", termYears: "", uhlTermPlan: "",
      policyPurpose: "", income: "", sbliIncome: "", sbliMortgageOnly: "", sbliMortgageAmount: "", existingCoverage: "", existingCarrierCoverage: "", replacement: "", financing: "",
      employment: "", occupation: "", hazardousOccupation: "", aviation: "", hazardousSports: "",
      militaryDeployment: "", forestersDeployment: "", exposureDetails: "", citizenship: "", usResident: "", usSince: "",
      intentStay: "", visaType: "", visaExpiry: "", visaRenewal: "", workAuthorization: "",
      taxIdType: "", healthInsurance: "", foreignResidence: "", travelHistory: "", travels: [],
      nicotineHistory: "", nicotineComplete: "", nicotine: [], cotinineResult: "", cotinineDate: "",
      heightIn: "", weightLb: "", weightChange: "", priorWeightLb: "", weightChangeDate: "",
      weightCause: "", stableSince: "", bpSys: "", bpDia: "", bpDate: "", bpBasis: "",
      bpTreatment: "", bpControl: "", cholTotal: "", cholHdl: "", cholDate: "", cholBasis: "",
      cholTreatment: "", medicalHistory: "", medicalComplete: "", conditions: [],
      hospitalHistory: "", hospitals: [], surgeryHistory: "", surgeries: [], pendingCare: "",
      americoAdlHistory: "", americoAdlLastDate: "", americoHospiceHistory: "", americoHospiceLastDate: "",
      americoOxygenHistory: "", americoOxygenLastDate: "", americoMobilityHistory: "", americoMobilityLastDate: "",
      pendingDetails: "", activeSymptoms: "", symptomDetails: "", oxygen: "", dialysis: "",
      adlAssistance: "", careFacility: "", homeHealth: "", terminalIllness: "", terminalMonths: "",
      substanceHistory: "", substanceLastDate: "", substanceDetails: "", marijuana: "",
      medicationHistory: "", medications: [], medicationsComplete: "", drivingHistory: "",
      drivingComplete: "", driving: [], licenseStatus: "", criminalHistory: "", criminalComplete: "",
      criminal: [], incarcerated: "", pendingCharges: "", probationCurrent: "", paroleCurrent: "",
      outstandingRestitution: "", familyHistory: "", familyComplete: "", family: [],
      priorInsuranceAdverse: "", priorInsuranceDate: "", disabled: "", historyConfirmed: ""
    };
    // Each standalone prompt is stored once. Repeating histories are arrays; their
    // internal answers live on each row, not as duplicate top-level questions.
    if (typeof IntakeQuestions !== "undefined") {
      next.intakeRevision = "2026-11";
      for (const section of IntakeQuestions.sections) for (const group of section.groups) for (const q of group.questions) {
        if (q.type === "repeat") next[q.id] = [];
        else if (!Object.hasOwn(next, q.id)) next[q.id] = "";
      }
    }
    return next;
  }
  function separateMentalHistory(next) {
    // Older interviews used one physical/mental list. Re-home those entries
    // rather than asking for a second copy or silently discarding them.
    if (!Array.isArray(next.mentalConditions) || !Array.isArray(next.conditions)) return;
    const typeById={depression:"depression",anxiety:"anxiety",bipolar:"bipolar",schizophrenia:"schizophrenia",suicide_attempt:"other"};
    const moved=next.conditions.filter(c=>Object.hasOwn(typeById,c.id));
    if (!moved.length) return;
    for (const c of moved) next.mentalConditions.push({
      condition:typeById[c.id],name:c.name||c.id,
      diagnosed:c.diagnosisDate||"",status:c.status||"",
      treatment:c.treatment||""
    });
    next.conditions=next.conditions.filter(c=>!Object.hasOwn(typeById,c.id));
    next.mentalHistory="yes";
    if(!next.conditions.length && next.medicalHistory==="yes")next.medicalHistory="";
    next.migrated=true;
  }
  function migrate(raw) {
    const next = empty();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
    if (raw.schemaVersion === schemaVersion) {
      for (const key of Object.keys(next)) {
        if (key === "schemaVersion") continue;
        if (Array.isArray(next[key])) next[key] = Array.isArray(raw[key]) ? raw[key].filter(v => v && typeof v === "object" && !Array.isArray(v)).map(v => ({ ...v })) : [];
        else if (typeof raw[key] === "string" || typeof raw[key] === "number") next[key] = raw[key];
      }
      separateMentalHistory(next);
      return next;
    }
    // Preserve entered facts for review; discard old favorable defaults and
    // ambiguous aggregate histories. The applicant must confirm the new screens.
    for (const key of ["sex","state","faceAmount","policyPurpose","income","existingCoverage","replacement","financing","occupation","weightLb","bpSys","bpDia","cholTotal","cholHdl"]) {
      if (typeof raw[key] === "string" || typeof raw[key] === "number") next[key] = raw[key];
    }
    if (raw.heightFt !== "" && raw.heightFt != null && Number.isFinite(Number(raw.heightFt)) && Number.isFinite(Number(raw.heightIn))) next.heightIn = Number(raw.heightFt) * 12 + Number(raw.heightIn);
    // A legacy entry whose id is not text cannot name a diagnosis the picker offers, so it is kept
    // as "Another diagnosis" with its old id as the name, for the applicant to reconfirm. Dropping
    // it, or letting it throw, would discard the whole legacy draft.
    next.conditions = Array.isArray(raw.conditions) ? raw.conditions.filter(c => c && c.id != null && c.id !== "").map(c => {
      const text = typeof c.id === "string";
      return { id: text ? c.id : "other", name: text ? (c.name || c.id.replace(/_/g," ")) : String(c.id), legacyDetails: JSON.stringify(c) };
    }) : [];
    if (next.conditions.length) next.medicalHistory = "yes";
    if (raw.medicationsText && !/^none$/i.test(raw.medicationsText.trim())) {
      next.medications = String(raw.medicationsText).split(/[,;\n]+/).filter(t => t.trim()).map(name => ({ name: name.trim() }));
      next.medicationHistory = "yes";
    }
    next.migrated = true;
    separateMentalHistory(next);
    return next;
  }
  return { schemaVersion, empty, migrate };
})();

