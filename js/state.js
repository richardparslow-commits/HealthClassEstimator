/* Versioned interview state. A migrated unchecked box is never a confirmed No. */
"use strict";
const InterviewState = (() => {
  const schemaVersion = 2;
  function empty() {
    return {
      schemaVersion, productId: "", dob: "", sex: "", state: "", faceAmount: "", termYears: "",
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
      if (!Object.prototype.hasOwnProperty.call(PRODUCT_RULES,next.productId)) next.productId = "";
      return next;
    }
    // Preserve entered facts for review; discard old favorable defaults and
    // ambiguous aggregate histories. The applicant must confirm the new screens.
    for (const key of ["sex","state","faceAmount","policyPurpose","income","existingCoverage","replacement","financing","occupation","weightLb","bpSys","bpDia","cholTotal","cholHdl"]) {
      if (typeof raw[key] === "string" || typeof raw[key] === "number") next[key] = raw[key];
    }
    if (raw.heightFt !== "" && raw.heightFt != null && Number.isFinite(Number(raw.heightFt)) && Number.isFinite(Number(raw.heightIn))) next.heightIn = Number(raw.heightFt) * 12 + Number(raw.heightIn);
    next.conditions = Array.isArray(raw.conditions) ? raw.conditions.filter(c => c && c.id).map(c => ({ id: c.id, name: c.name || c.id.replace(/_/g," "), legacyDetails: JSON.stringify(c) })) : [];
    if (next.conditions.length) next.medicalHistory = "yes";
    if (raw.medicationsText && !/^none$/i.test(raw.medicationsText.trim())) {
      next.medications = String(raw.medicationsText).split(/[,;\n]+/).filter(t => t.trim()).map(name => ({ name: name.trim() }));
      next.medicationHistory = "yes";
    }
    next.migrated = true;
    return next;
  }
  return { schemaVersion, empty, migrate };
})();

