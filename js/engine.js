/* Edition-specific screening engine. Unknown evidence withholds a final class.
 * Dates use calendar anniversaries, never approximate "years ago" arithmetic.
 * Every decision has source provenance; this is not a carrier offer or diagnosis.
 */
"use strict";
const Engine = (() => {
  const present = v => v !== "" && v != null;
  const numeric = v => present(v) && Number.isFinite(Number(v)) ? Number(v) : null;
  function date(v) {
    if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(v + "T00:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === v ? d : null;
  }
  function shift(v, months) {
    const d = date(v); if (!d) return null;
    const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
    const last = new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(day,last)); return d.toISOString().slice(0,10);
  }
  function ageAt(dob, asOf, basis = "last") {
    if (!date(dob) || !date(asOf) || dob > asOf) return null;
    const b = date(dob), a = date(asOf);
    let n = a.getUTCFullYear() - b.getUTCFullYear();
    const birthday = shift(dob,n*12);
    if (birthday > asOf) n--;
    if (basis === "nearest") {
      const last = date(shift(dob,n*12)), next = date(shift(dob,(n+1)*12));
      if (a-last >= next-a) n++;
    }
    return n;
  }
  function within(v, months, asOf, inclusive = false) {
    return !!date(v) && v <= asOf && (inclusive ? v >= shift(asOf,-months) : v > shift(asOf,-months));
  }
  const band = (v,age) => Array.isArray(v) ? v.find(b => age >= (b.ageMin ?? 0) && age <= (b.ageMax ?? 200)) : v;
  const maxOf = (v,age) => { const b = band(v,age); return typeof b === "number" ? b : b?.max; };
  const rank = k => CLASS_ORDER.indexOf(k);
  function source(id, pages) { return { id, pages: pages || RULE_SOURCES[id]?.pages || [], ...RULE_SOURCES[id] , ...(pages ? {pages} : {}) }; }
  function run(productId, input = {}, options = {}) {
    const d = input && typeof input === "object" && !Array.isArray(input) ? {...input} : {};
    const invalidLists=[];
    for(const key of ["travels","driving","criminal","family","conditions","hospitals","surgeries","nicotine","medications"]) {
      if(!Array.isArray(d[key])) {if(present(d[key]))invalidLists.push(key);d[key]=[];}
      else {if(d[key].some(r=>!r||typeof r!=="object"||Array.isArray(r)))invalidLists.push(key);d[key]=d[key].filter(r=>r&&typeof r === "object"&&!Array.isArray(r));}
    }
    const p = Object.prototype.hasOwnProperty.call(PRODUCT_RULES,productId) ? PRODUCT_RULES[productId] : null;
    const asOf = options.asOf || new Date().toISOString().slice(0,10);
    if (!date(asOf)) throw new Error("Assessment date must be a valid YYYY-MM-DD date.");
    const out = {
      productId, product: p?.name || "Select a product", carrier: p?.carrier || "",
      route: p?.route || "", kind: p?.kind || "unverified", assessed: asOf,
      sources: (p?.sources || []).map(id => source(id)), verification: p?.status || "unverified",
      eligibility: "not_confirmed", status: "manual_review", finalClass: "manual_review",
      healthClass: null, displayClass: null, tobaccoBasis: "unknown", tableRating: null, flatExtra: null,
      benefitTier: null, range: null, issues: [], domains: {}, missing: [], notes: []
    };
    const issue = (id,text,status="review",sid=p?.sources[0],pages) => {
      if (!out.issues.some(i => i.id === id && i.text === text)) out.issues.push({id,text,status,source:sid ? source(sid,pages) : null});
    };
    const need = (key,label,allowed) => {
      if (!present(d[key]) || d[key] === "unknown" || (allowed && !allowed.includes(d[key]))) {
        out.missing.push(label); issue("missing_"+key,"Please confirm "+label+".","missing"); return false;
      } return true;
    };
    const num = (key,label,min,max) => {
      const n = numeric(d[key]);
      if (n === null || n < min || n > max) {out.missing.push(label);issue("invalid_"+key,"Enter a valid "+label+".","missing");return null;} return n;
    };
    const past = (v,label) => {
      if (!date(v) || v > asOf) {out.missing.push(label);issue("date_"+label,"Confirm the date for "+label+" (a past date is needed).","missing");return false;}return true;
    };
    const yn = (key,label) => need(key,label,["yes","no"]);
    const confirm = (key,label) => need(key,label,["yes"]);
    const history = (key,list,label) => {
      yn(key,label);
      if (!Array.isArray(d[list])) {issue("list_"+list,"Confirm the entries for "+label+".","missing");return [];}
      if (d[key] === "yes" && !d[list].length) issue("empty_"+list,"Add the details for "+label+".","missing");
      if (d[key] === "no" && d[list].length) issue("conflict_"+list,"The answer and listed "+label+" disagree. Please reconcile them.");
      if (d[list].some(r => !r || typeof r !== "object" || Array.isArray(r))) issue("invalid_"+list,"Check each entry in "+label+".","missing");
      return d[list].filter(r => r && typeof r === "object" && !Array.isArray(r));
    };
    invalidLists.forEach(key=>issue("invalid_list_"+key,"The saved "+key+" history is malformed. Confirm the entries.","missing"));
    if (!p) {issue("product","Choose the carrier, product and underwriting route.");return finish();}
    if (p.status !== "criteria") issue("source_scope",p.status === "unverified" ? "The product's source edition has not been reconciled. A health class cannot be estimated." : "Verified exclusions can be screened, but the complete product rating and application rules still need carrier review.");
    if (p.scopeNote) out.notes.push(p.scopeNote);
    out.notes.push("Based on the listed source editions. Carrier records, current application, product terms and state rules can change the result. No underwriting credits are assumed.");
    if (d.schemaVersion !== 2) issue("schema","This saved interview uses an older or incomplete question set. Confirm the updated histories.");
    const dobOK = past(d.dob,"date of birth");
    const age = dobOK ? ageAt(d.dob,asOf,p.ageBasis === "nearest" ? "nearest" : "last") : null;
    const alternateAge=["last","nearest"].includes(p.ageBasis) ? age : dobOK ? ageAt(d.dob,asOf,"nearest") : null;
    if(!["last","nearest"].includes(p.ageBasis))issue("age_basis","The supplied product material does not establish the carrier age basis. Confirm it before relying on a class.");
    out.age = age; out.ageBasis = p.ageBasis || "unconfirmed";
    need("sex","sex used by the carrier",["male","female"]);
    const states = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" ");
    need("state","state of residence",states);
    const face = num("faceAmount","coverage amount",1,1000000000);
    num("existingCoverage","existing life coverage",0,1000000000);
    need("policyPurpose","purpose of coverage",["income","mortgage","family","estate","business","final_expense","other"]);
    yn("replacement","whether coverage replaces a policy");yn("financing","whether premiums are financed");
    if (age !== null && age < 18) issue("juvenile","Juvenile risks require the separate carrier application and growth charts; adult classes are withheld.");
    if (age !== null && ((p.minAge != null && Math.max(age,alternateAge) < p.minAge) || (p.maxAge != null && Math.min(age,alternateAge) > p.maxAge))) issue("age_limit","Age is outside this product's published issue ages.","unavailable");
    if (p.excludeStates?.includes(d.state) || (p.onlyStates && present(d.state) && !p.onlyStates.includes(d.state))) issue("state_limit",p.onlyStates ? "The verified application is specific to Texas; another state's application must be reviewed." : "This product/issuing company is unavailable in the selected state.",p.onlyStates ? "review" : "unavailable");
    if (p.excludeTerritories && ["PR","GU","VI","AS","MP"].includes(d.state)) issue("territory","Quantum does not accept residents of US territories.","unavailable","D141",[4]);
    const maxFace = (age !== null ? p.faceBands?.find(([to]) => age <= to)?.[1] : null) ?? p.maxFace;
    if (face !== null && ((p.minFace && face < p.minFace) || (maxFace && face > maxFace))) issue("face_limit","Requested coverage is outside this product/route's published face limits.","unavailable");
    if (p.id.startsWith("foresters_") && p.route === "Non-medical" && numeric(d.existingCarrierCoverage) === null) issue("carrier_total","Confirm total existing Foresters coverage; non-medical limits include coverage already in force.","review","D152",[7]);
    if (p.id.startsWith("foresters_") && p.route === "Non-medical" && face + (numeric(d.existingCarrierCoverage)||0) > maxFace) issue("face_total","Total existing and requested Foresters coverage exceeds the non-medical route limit.","unavailable","D152",[7]);
    if (p.id === "fg_quantum" && face + (numeric(d.existingCoverage)||0) > 1000000) issue("total_line","Total in-force and requested coverage exceeds Quantum's $1 million total line.","unavailable","D141",[9]);
    if (["fg_quantum","sbli_easytrak"].includes(p.id) && d.replacement === "yes") issue("replacement","Replacement is not permitted for this product.","unavailable",p.sources[0],p.id === "fg_quantum" ? [5] : [4]);
    if (d.financing === "yes" || ["estate","business","other"].includes(d.policyPurpose)) issue("financial","Coverage purpose or premium financing needs financial and ownership review.");
    if (d.policyPurpose === "income") {
      const income = num("income","annual earned income",0,1000000000);
      if (p.id.startsWith("foresters_") && age >= 18 && income !== null) {
        const factor = age <= 35 ? 30 : age <= 45 ? 25 : age <= 55 ? 20 : age <= 60 ? 15 : age <= 70 ? 10 : null;
        if (!factor || face + (numeric(d.existingCoverage)||0) > income*factor) issue("income_limit","Income replacement amount needs financial justification under Foresters' income factors.","review","D152",[4]);
      } else if (income !== null) out.notes.push("The carrier must confirm the financial justification for the total coverage requested.");
    }
    residency();
    const driving = history("drivingHistory","driving","driving history");
    confirm("drivingComplete","that all driving events are listed");
    need("licenseStatus","current driver's license status",["valid","never","suspended","revoked","expired"]);
    for (const r of driving) {
      if (!["minor","speeding","serious","reckless","dui","suspension","revocation"].includes(r.type)) issue("drive_type","Choose a type for each driving event.","missing");
      past(r.date,"driving event");
      if (r.type === "speeding" && (numeric(r.mphOver) === null || numeric(r.speed) === null || numeric(r.mphOver)<0 || numeric(r.speed)<0)) issue("speed_detail","Confirm speed and miles per hour over the posted limit.","missing");
    }
    drivingScreens(driving);
    criminal();
    const family = history("familyHistory","family","biological family history");
    confirm("familyComplete","that family history is complete");
    for (const r of family) {
      if (!["parent","sibling"].includes(r.relation) || !present(r.member) || !["cardiovascular","cancer","huntington","polycystic_kidney","other"].includes(r.disease) || !["yes","no"].includes(r.death)) issue("family_detail","Confirm the relative, disease and whether it caused a death.","missing");
      if (numeric(r.diagnosisAge) === null || numeric(r.diagnosisAge)<0 || numeric(r.diagnosisAge)>120) issue("family_diagnosis_age","Confirm each relative's age at diagnosis.","missing");
      if (r.death === "yes" && (numeric(r.deathAge) === null || numeric(r.deathAge)<0 || numeric(r.deathAge)>120)) issue("family_death_age","Confirm each relative's age at death.","missing");
      if (r.disease === "cancer" && (!["male","female"].includes(r.sex)||!present(r.cancerType)||r.cancerType === "unknown")) issue("family_cancer_type","Confirm the family cancer type.","missing");
      if (["huntington","polycystic_kidney","other"].includes(r.disease)) issue("inherited_risk","This family condition needs carrier review; it is outside the modeled cardiovascular/cancer criteria.");
    }
    const conds = medical();
    nicotine(conds);
    build();
    productLimits();
    medications(conds);
    for (const [key,label] of [["hazardousOccupation","hazardous occupation"],["aviation","private aviation"],["hazardousSports","hazardous sports"],["militaryDeployment","current or ordered hazardous military deployment"]]) {
      yn(key,label); if (d[key] === "yes") issue("exposure_"+key,"Carrier review is needed for "+label+". No generic military or VA-percentage rating is applied.","review",p.sources[0]);
    }
    if (p.id.startsWith("foresters_")) {
      yn("forestersDeployment","deployment or notice of deployment under Foresters' specific geographic screen");
      if(d.forestersDeployment === "yes")issue("warzone","Foresters does not offer coverage for deployment or notice of deployment to a war zone, an area of conflict/political instability, or a country outside North America.","decline","D152",[5]);
    }
    if (p.status === "criteria" && p.kind !== "final_expense") rateClasses(driving,family);
    confirm("historyConfirmed","that the interview is complete and accurate");
    return finish();

    function productLimits() {
      if (p.kind === "term") {
        need("termYears","term length");
        const term=Number(d.termYears),entry=p.terms?.[term];
        if (p.terms && present(d.termYears) && !entry) issue("term_unavailable","This term duration is not offered by the product.","unavailable",p.sources[p.sources.length-1]);
        if (entry && age!==null && out.tobaccoBasis!=="unknown") {
          let cap=entry[out.tobaccoBasis === "tobacco"?1:0];
          if (p.id === "transamerica_super" && face<100000) cap=({10:[80,80],15:[75,70],20:[65,65],25:[60,55],30:[50,45]})[term][out.tobaccoBasis === "tobacco"?1:0];
          if(age>cap)issue("term_age","Age exceeds the selected term's limit for the disclosed tobacco basis.","unavailable",p.sources[p.sources.length-1]);
        }
      }
      if (p.id === "sbli_easytrak") {
        need("employment","work status",["employed","spouse","student","seeking","retired","other"]);
        if (["student","seeking"].includes(d.employment) && (face>100000 || d.employment === "student" && age>=26)) issue("sbli_employment","EasyTrak student/seeking-work limits are not met.","unavailable","D347",[4]);
        if (d.employment === "retired" && (age<49 || face>250000)) issue("sbli_retired","EasyTrak retired eligibility requires age49+ and coverage at most $250,000.","unavailable","D347",[4]);
        if (d.employment === "other") issue("sbli_work_review","This work status requires EasyTrak eligibility review.","review","D347",[4]);
        if (age>50 && Number(d.termYears)===30) issue("sbli_term","EasyTrak30-year term ends at issue age50.","unavailable","D347",[5]);
      }
      if (p.id === "corebridge_legacy") {
        const existing=num("existingCarrierCoverage","existing AGL GIWL/SIWL coverage",0,1000000000);
        const levelMax=age<=60?25000:age<=70?30000:35000;
        if(face>levelMax || existing!==null && face+existing>35000 || out.benefitTier === "graded" && existing!==null && face+existing>25000) issue("core_amount","The requested amount / total existing AGL coverage exceeds the source benefit-design limit.","unavailable","D105",[7,9]);
        if(age>=71&&out.tobaccoBasis === "tobacco"&&out.benefitTier === "level")issue("core_level_smoker","The supplied product guide does not offer Level benefits to smokers aged71–80.","unavailable","D105",[7]);
        if(d.replacement === "yes" && out.benefitTier === "graded")issue("core_graded_replacement","Replacement is permitted only for the Level design in this supplied guide.","unavailable","D105",[9]);
      }
    }
    function residency() {
      yn("usResident","current US residence");
      if(date(d.usSince) && date(d.dob) && d.usSince<d.dob)issue("residence_birth","The US residence start date precedes the date of birth.","missing");need("citizenship","citizenship or immigration status",["citizen","permanent","visa","itin","other"]);
      past(d.usSince,"start of continuous US residence");yn("intentStay","intent to remain in the US");
      yn("foreignResidence","planned foreign residence");
      const travel = history("travelHistory","travels","foreign travel in the past two years or planned next two years");
      for (const r of travel) {
        if (!present(r.country) || !present(r.purpose) || !date(r.start) || !date(r.end) || r.end<r.start) issue("travel_detail","Confirm country, purpose and travel dates for each trip.","missing");
      }
      if (travel.length || d.travelHistory === "yes") issue("travel_risk","Destinations and current country risk must be checked by the carrier. Nationality alone does not determine travel risk.");
      if (d.usResident === "no" || d.foreignResidence === "yes" || d.intentStay === "no") {
        if (["corebridge_legacy","fg_quantum"].includes(p.id)) issue("residence_ineligible","This product requires permanent US residence and does not accept this disclosed residency plan.","unavailable");
        else issue("foreign_residence","Foreign residence requires carrier review and may require a different product.");
      }
      if (["visa","itin","other"].includes(d.citizenship)) {
        if (d.citizenship === "visa") {
          need("visaType","visa type");if (!date(d.visaExpiry)) issue("visa_expiry","Confirm visa expiration date.","missing");
          if (date(d.visaExpiry) && d.visaExpiry <= asOf) issue("visa_expired","Expired immigration documentation needs review.");
          if (p.id.startsWith("foresters_") && date(d.visaExpiry) && (date(d.visaExpiry)-date(asOf))/86400000 <= 60 && d.visaRenewal !== "yes") issue("visa_renewal","Foresters requires renewal confirmation for a visa expiring within 60 days.","review","D199",[1]);
          if (p.id.startsWith("foresters_") && ["R1","TN"].includes(String(d.visaType).toUpperCase().replace(/[ -]/g,"")) && d.workAuthorization !== "yes") issue("work_authorization","R1/TN cases need work authorization confirmation.","review","D199",[2]);
        }
        if (p.id === "corebridge_legacy") issue("citizenship_ineligible","SimpliNow Legacy accepts US citizens and permanent residents/green card holders only.","unavailable","D105",[9]);
        else if (p.id !== "fg_quantum") issue("immigration_review","Confirm the carrier's current immigration/ITIN criteria and required documents.","review",p.id.startsWith("foresters_") ? "D199" : p.sources[0]);
      }
      if (p.id === "fg_quantum" && ["permanent","visa","itin","other"].includes(d.citizenship)) {
        if (face > 300000) issue("noncitizen_face","Quantum limits non-US citizens to $300,000.","unavailable","D141",[13]);
        const visas = ["E1","E2","E3","EB5","OPTF1","H1B","H1C","H2A","H2B","H4","L1","L2","K1","K3","O1","O3","P1","P2","P3","P4","TN","TN1","V1"];
        if (d.citizenship !== "permanent" && !(d.citizenship === "visa" && visas.includes(String(d.visaType).toUpperCase().replace(/[ -]/g,"")))) issue("quantum_status","This immigration status is outside Quantum's published eligible list.","unavailable","D141",[13]);
        if (date(d.usSince) && d.usSince > shift(asOf,-6)) issue("quantum_residence","Quantum requires six consecutive months in the US during the past year for non-US citizens.","unavailable","D141",[13]);
        issue("quantum_documents","Confirm US address, income/taxes, application/delivery, payment bank and identity documents for the noncitizen case.","review","D141",[13]);
      }
      if (p.id === "sbli_easytrak") {
        yn("healthInsurance","established US health insurance");
        if (date(d.usSince) && d.usSince > shift(asOf,-24)) issue("sbli_residence","EasyTrak requires two years of US residence.","unavailable","D347",[4]);
        if (d.healthInsurance === "no") issue("sbli_insurance","EasyTrak requires established health insurance.","unavailable","D347",[4]);
      }
    }
    function drivingScreens(rows) {
      const duis=rows.filter(r=>r.type === "dui" && date(r.date));
      if (["banner_beyondterm","banner_flex"].includes(p.id)) {
        if (duis.some(r=>within(r.date,24,asOf,true)) || duis.filter(r=>within(r.date,120,asOf)).length>1 || ["suspended","revoked"].includes(d.licenseStatus)) issue("beyond_driving_exclusion","DUI within two years, multiple DUIs within ten years, or a currently suspended/revoked license fails BeyondTerm/Flex screening.","decline","D077",[5,7,11]);
      }
      if (p.id === "corebridge_legacy" && duis.some(r=>within(r.date,24,asOf))) issue("core_dui","DUI within 24 months fails SimpliNow Legacy screening.","decline","D106",[4]);
      if (p.id.startsWith("foresters_") && p.route === "Non-medical" && (duis.some(r=>within(r.date,12,asOf)) || duis.length>=2 && duis.some(r=>within(r.date,60,asOf)))) issue("foresters_nonmed_dui","This DUI history fails Foresters' non-medical route; fully underwritten consideration requires a separate assessment.","decline","D152",[18]);
      if (["sbli_easytrak","moo_tle","moo_iule"].includes(p.id) && duis.some(r=>within(r.date,60,asOf))) issue("simplified_dui","DUI within five years fails this simplified product's screen.","decline",p.id === "sbli_easytrak" ? "D347" : "D295",p.id === "sbli_easytrak" ? [11] : [7,22]);
      if (p.id === "uhl_otherterm" && rows.some(r=>["dui","suspension","revocation"].includes(r.type)&&within(r.date,60,asOf))) issue("uhl_partb_driving","This five-year driving history fails Part B term plans. Simple Term 20 DLX has a separate application screen.","decline","D459",[7]);
      if (p.id === "transamerica_super") {
        if (duis.some(r=>within(r.date,12,asOf))) issue("ta_dui_1","DUI within one year fails Transamerica's published impairment screen.","decline","D370",[27]);
        if (duis.some(r=>ageAt(d.dob,r.date)!==null && ageAt(d.dob,r.date)<21 && within(r.date,48,asOf)) || duis.filter(r=>within(r.date,48,asOf)).length>1) issue("ta_dui_young_multiple","DUI before age 21 in four years, or multiple DUIs within four years, fails the published screen.","decline","D370",[27]);
      }
    }
    function criminal() {
      const rows = history("criminalHistory","criminal","criminal history (including misdemeanors and charges)");
      confirm("criminalComplete","that criminal events and sentence dates are complete");
      for (const [key,label] of [["incarcerated","current incarceration"],["pendingCharges","pending criminal charges"],["probationCurrent","current probation"],["paroleCurrent","current parole"],["outstandingRestitution","outstanding criminal fines or restitution"]]) yn(key,label);
      const active = ["incarcerated","pendingCharges","probationCurrent","paroleCurrent"].some(k=>d[k] === "yes");
      const foresters = p.id.startsWith("foresters_");
      if (active) {
        if (foresters || p.id === "transamerica_super" || p.id.startsWith("banner_") && p.id !== "banner_opterm" || p.id === "fg_quantum") issue("criminal_active","Current incarceration, pending charges, probation or parole fails this product's criminal screen.","decline",foresters ? "D152" : p.sources[0],foresters ? [18] : p.id === "transamerica_super" ? [26] : p.id === "fg_quantum" ? [8] : [11]);
        else if (p.id === "corebridge_legacy" && d.incarcerated === "yes") issue("incarcerated","Current incarceration fails the SimpliNow Legacy screen.","decline","D106",[4]);
        else issue("criminal_current_review","Current criminal status needs carrier review.");
      }
      if (d.outstandingRestitution === "yes") issue("restitution","Outstanding fines/restitution need carrier review.");
      for (const r of rows) {
        if (!["felony","misdemeanor","arrest"].includes(r.type) || !["convicted","pending","dismissed","other"].includes(r.disposition)) issue("criminal_detail","Confirm offense type and outcome for each criminal event.","missing");
        past(r.date,"charge or arrest");
        if (r.disposition === "convicted") past(r.convictionDate,"conviction");
        for (const key of ["jail","probation","parole"]) {
          if (!["yes","no"].includes(r[key])) issue("sentence_"+key,"Confirm whether jail, probation and parole were part of each sentence.","missing");
          if (r[key] === "yes") past(r[key+"End"],key+" completion or release");
        }
        if (r.disposition !== "convicted") {issue("criminal_disposition","A charge or arrest is not assumed to be a conviction; the carrier must assess the disclosed outcome.");continue;}
        if (r.type === "felony") {
          if (["banner_beyondterm","banner_flex","sbli_easytrak"].includes(p.id) && within(r.convictionDate,120,asOf)) issue("felony_10","Felony conviction within ten years fails this product's screen.","decline",p.sources[0],p.id === "sbli_easytrak" ? [11] : [11]);
          if (p.id === "moo_full" && within(r.convictionDate,120,asOf)) issue("moo_felony","MOO preferred and Standard Plus criteria exclude felony convictions within ten years; Standard/substandard requires review.","review","D282",[11,12,13]);
          if (p.id === "corebridge_legacy" && within(r.convictionDate,24,asOf)) issue("core_felony","Felony conviction within 24 months fails the SimpliNow Legacy screen.","decline","D106",[4]);
          if (p.id.startsWith("uhl_") && within(r.convictionDate,84,asOf)) issue("uhl_felony","Felony conviction within seven years fails the Texas term application screen.","decline","D459",[7]);
        }
        if (p.id === "fg_quantum" && [r.jailEnd,r.probationEnd,r.paroleEnd].some(v=>within(v,12,asOf))) issue("fg_release","Release from jail, probation or parole within 12 months fails Quantum's screen.","decline","D141",[8]);
        if (foresters && ((r.jail === "no" && within(r.probationEnd,12,asOf)) || (r.jail === "yes" && within(r.paroleEnd,60,asOf)))) issue("foresters_release","Foresters consideration starts one year after probation without jail, or five years after parole with jail.","decline","D152",[18]);
        else if (foresters && r.jail === "yes" && r.parole !== "yes") issue("foresters_sentence","Jail history without a confirmed parole completion requires carrier consideration.","review","D152",[18]);
        if (p.id === "transamerica_super" && [r.probationEnd,r.paroleEnd].some(v=>within(v,12,asOf))) issue("ta_release","Transamerica requires one year after probation/parole ends before reconsideration.","decline","D370",[26]);
        if (p.id === "royal") issue("royal_criminal","The supplied Royal guide does not accept criminal background; confirm the current product/application.","review","D309",[15]);
        if (!["corebridge_legacy","banner_beyondterm","banner_flex","sbli_easytrak","uhl_simple20","uhl_otherterm"].includes(p.id)) issue("criminal_history_review","Past criminal history requires the carrier's case review after any published waiting period.");
      }
    }
    function medical() {
      const rows = history("medicalHistory","conditions","past and current medical diagnoses");
      confirm("medicalComplete","that all diagnoses and treatments are disclosed");
      const hospitals = history("hospitalHistory","hospitals","hospitalizations");
      const surgeries = history("surgeryHistory","surgeries","operations and procedures");
      for (const r of [...hospitals,...surgeries]) {past(r.date,"hospitalization or procedure");if (!present(r.reason)) issue("care_reason","Enter the reason for each hospitalization/procedure.","missing");}
      for (const [key,label] of [["pendingCare","pending tests, treatment or surgery"],["activeSymptoms","unexplained current symptoms"],["oxygen","prescribed oxygen other than sleep-apnea CPAP"],["dialysis","current dialysis"],["adlAssistance","help with daily activities due to illness"],["careFacility","current nursing, hospital or hospice confinement"],["homeHealth","current or advised home nursing care"],["terminalIllness","diagnosed terminal illness"]]) {
        yn(key,label);
        if (d[key] === "yes") {
          if (key === "terminalIllness") {
            const prognosis=numeric(d.terminalMonths),limit=p.id === "corebridge_legacy"?12:p.id.startsWith("uhl_")?24:null;
            if(limit&&prognosis!==null&&prognosis>0&&prognosis<=limit)issue("terminal_prognosis","The disclosed prognosis meets this product's terminal-illness exclusion.","decline",p.sources[0],p.id === "corebridge_legacy"?[6]:[7]);
            else issue("terminal_review","Confirm terminal-illness prognosis and carrier rules before assigning an outcome.");
          }
          else if (p.id === "corebridge_legacy" && ["oxygen","dialysis","adlAssistance","careFacility","homeHealth"].includes(key)) issue("medical_"+key,"The disclosed "+label+" fails the SimpliNow Legacy medical screen.","decline","D106",[5,6]);
          else if (p.id.startsWith("uhl_") && ["oxygen","dialysis","adlAssistance","careFacility","homeHealth","pendingCare"].includes(key)) issue("medical_"+key,"The disclosed "+label+" fails the Texas term application screen.","decline","D459",[7]);
          else issue("medical_"+key,"The disclosed "+label+" requires medical underwriting review.");
        }
      }
      if (d.pendingCare === "yes" && !present(d.pendingDetails)) issue("pending_detail","Describe the pending care.","missing");
      if (d.activeSymptoms === "yes" && !present(d.symptomDetails)) issue("symptom_detail","Describe the unexplained symptoms.","missing");
      yn("substanceHistory","any history of alcohol/drug abuse or treatment");
      if (d.substanceHistory === "yes") {past(d.substanceLastDate,"last substance use or treatment");issue("substances","Alcohol or drug abuse/treatment needs the selected carrier's medical review.");}
      need("marijuana","marijuana use",["none","past","current","medical"]);
      if (d.marijuana !== "none" && present(d.marijuana)) issue("marijuana","Marijuana use needs frequency, form and any underlying condition reviewed; a favorable class is withheld.");
      yn("priorInsuranceAdverse","past rated, declined or postponed life insurance");
      if (d.priorInsuranceAdverse === "yes") {past(d.priorInsuranceDate,"prior insurance decision");issue("prior_decision","The prior insurance decision requires carrier review.");}
      yn("disabled","current or recent disability");if (d.disabled === "yes") issue("disability","Review the disabling condition and disability dates with the carrier.");
      if (p.id.startsWith("uhl_") && hospitals.filter(r=>within(r.date,12,asOf) && r.minor !== "yes").length >= 2) issue("uhl_hospitals","Two non-minor hospitalizations in 12 months fail the Texas term application screen.","decline","D459",[7]);
      for (const r of rows) {
        if (p.id.startsWith("uhl_")) {
          const recent=r.status === "current" || within(r.diagnosisDate,60,asOf) || within(r.treatmentEnd,60,asOf);
          const excluded=["coronary_disease","heart_failure","atrial_fibrillation","stroke","tia","kidney_disease","end_stage_kidney","cirrhosis","hepatitis_b","hepatitis_c","copd","als","parkinsons","multiple_sclerosis","huntington"];
          if (r.id === "cancer" && recent && present(r.cancerType) && !["basal_cell","unknown"].includes(r.cancerType))issue("uhl_cancer","Cancer other than basal cell within five years fails the Texas Part A screen.","decline","D459",[7]);
          if (["hiv","aids","alzheimers","dementia","transplant"].includes(r.id) || recent&&excluded.includes(r.id)) issue("uhl_medical_"+r.id,"The disclosed condition meets the Texas Part A term application exclusion.","decline","D459",[7]);
          if(p.id === "uhl_otherterm" && recent && (["schizophrenia","bipolar","suicide_attempt"].includes(r.id)||r.id === "lupus"&&r.lupusType === "systemic"||r.id === "diabetes"&&r.insulin === "yes"))issue("uhl_partb_"+r.id,"This condition meets Part B's five-year exclusion; Simple Term20DLX has a separate screen.","decline","D459",[7]);
        }
        if (!present(r.id) || !present(r.name)) issue("condition_name","Name each medical condition.","missing");
        past(r.diagnosisDate,"diagnosis of "+(r.name||"condition"));
        if (!["current","resolved","unknown"].includes(r.status) || r.status === "unknown" || !["yes","no"].includes(r.complications) || !["yes","no"].includes(r.hospitalized) || !["yes","no"].includes(r.recurrence)) issue("condition_detail","Confirm current status, complications, hospitalization and recurrence for "+(r.name||"each condition")+".","missing");
        if(r.insulin === "yes" && !(d.medications||[]).some(m=>m.conditionId === "diabetes" && m.current === "yes" && /insulin/i.test(m.name||"")))issue("insulin_rx","Insulin is reported but its current prescription is missing; reconcile the treatment history.");
        if (r.status === "resolved") past(r.treatmentEnd,"last treatment for "+r.name);
        if (r.hospitalized === "yes") past(r.hospitalDate,"condition hospitalization");
        if (!present(r.treatment)) issue("treatment_detail","Describe treatment (or explicitly enter none) for "+r.name+".","missing");
        if (p.id === "corebridge_legacy") coreCondition(r,rows);
        else if (!["hypertension","cholesterol"].includes(r.id)) issue("condition_review_"+r.id,(r.name||"This condition")+" needs condition-specific carrier review; no mild/good-control default or guessed table is applied.");
        if (r.complications === "yes" || r.recurrence === "yes") issue("condition_complex_"+r.id,"Complications/recurrence for "+r.name+" need review before a final class is estimated.");
      }
      if (hospitals.length || surgeries.length) issue("care_history","Hospitalizations and procedures require review of cause, treatment and recovery.");
      return rows;
    }
    function coreCondition(r,rows) {
      const alwaysDecline = ["alzheimers","dementia","als","huntington","hiv","aids","transplant","cirrhosis","suicide_attempt","end_stage_kidney"];
      if (alwaysDecline.includes(r.id)) {issue("core_condition_"+r.id,r.name+" fails the SimpliNow Legacy medical screen.","decline","D106",[3,5,6]);return;}
      if (r.id === "diabetes") {
        const a1c = numeric(r.a1c);
        if (a1c === null || a1c < 1 || a1c > 25 || !past(r.a1cDate,"A1c test") || !["yes","no"].includes(r.insulin)) issue("diabetes_detail","Confirm measured A1c, test date and insulin use.","missing","D106",[4]);
        else if (Math.abs(a1c*10-Math.round(a1c*10))>0.000001) issue("a1c_precision","The source uses one-decimal A1c bands; a value between printed boundaries needs confirmation.","review","D106",[4]);
        else if (a1c >= 10 || (r.hospitalized === "yes" && within(r.hospitalDate,24,asOf)) || rows.some(c=>["stroke","coronary_disease"].includes(c.id))) issue("core_diabetes","A1c 10+, diabetic hospitalization within 24 months, or diabetes plus stroke/coronary disease fails this screen.","decline","D106",[4]);
        else if (a1c > 8.6 || r.insulin === "yes") benefit("graded","Diabetes falls in the source's Graded benefit category.","D106",[4]);
        else benefit("level","A1c 8.6 or lower without insulin supports the Level category, subject to the other screens.","D106",[4]);
      } else if (r.id === "atrial_fibrillation") {
        if (!["yes","no"].includes(r.chronic24mo) || !["yes","no"].includes(r.dailyAnticoagulant)) issue("af_detail","Confirm chronic atrial fibrillation in 24 months and daily anticoagulant treatment.","missing","D106",[4]);
        else benefit(r.chronic24mo === "yes" || r.dailyAnticoagulant === "no" ? "graded" : "level","The AF category depends on chronic diagnosis and daily anticoagulant use, not the drug name alone.","D106",[4]);
      } else if (["multiple_sclerosis","parkinsons","hepatitis_b","schizophrenia"].includes(r.id)) benefit("graded",r.name+" is a Graded category in the supplied guide.","D106",[3,5]);
      else if (["lupus","bipolar","kidney_disease"].includes(r.id) && (r.status === "current" || within(r.treatmentEnd,48,asOf))) benefit("graded",r.name+" within the stated 48-month window supports Graded screening.","D106",[5]);
      else if (!["hypertension","cholesterol"].includes(r.id)) issue("core_unmodeled_"+r.id,"The exact timing/subtype for "+r.name+" requires carrier review.","review","D106",[3,4,5,6]);
      if (rows.filter(c=>!["hypertension","cholesterol"].includes(c.id)).length > 1) issue("core_combination","The guide warns that medical combinations can worsen the decision; a single-condition tier is withheld.","review","D106",[6]);
    }
    function benefit(tier,text,sid,pages) {
      if (out.benefitTier !== "graded") out.benefitTier = tier;
      out.domains.medical = {detail:text,source:source(sid,pages)};
    }
    function nicotine(conds) {
      need("nicotineHistory","complete tobacco/nicotine history",["never","yes"]);
      const rows = Array.isArray(d.nicotine) ? d.nicotine.filter(r=>r && typeof r === "object") : [];
      if (!Array.isArray(d.nicotine) || (d.nicotineHistory === "yes" && !rows.length)) issue("nicotine_list","List every tobacco, vaping and nicotine/cessation product used.","missing");
      if (d.nicotineHistory === "never" && rows.length) issue("nicotine_conflict","Never-use answer conflicts with the listed products.");
      if (d.nicotineHistory === "yes") confirm("nicotineComplete","that all tobacco/nicotine products are listed");
      for (const r of rows) {
        if (!["cigarette","cigar","pipe","chew","nicotine","vape","vape_no_nicotine","cessation"].includes(r.product)) issue("nicotine_type","Select a type for each nicotine/tobacco product.","missing");
        past(r.lastDate,"last use of "+(r.product||"nicotine"));
        if (r.current === "yes" && r.lastDate !== asOf) issue("current_nicotine_date","For a currently used product, confirm today's date as its last-use date.","missing");
        if (!["yes","no"].includes(r.current)) issue("nicotine_current","Confirm whether each product is still used.","missing");
      }
      if (d.cotinineResult === "positive")issue("cotinine_conflict","A positive cotinine result needs reconciliation with all disclosed use before a class is estimated.");
      if (d.nicotineHistory === "never") {out.tobaccoBasis="non_tobacco";out.domains.nicotine={ceiling:p.kind === "final_expense" ? null : "preferred_plus",detail:"Explicitly reported no lifetime tobacco/nicotine/vaping use.",source:source(p.sources[0])};return;}
      if (!rows.length) return;
      const relevant = p.id === "foresters_strong" ? rows.filter(r=>r.product === "cigarette") : rows;
      if (p.id === "corebridge_legacy") {
        if (relevant.some(r=>r.current === "yes")) out.tobaccoBasis="tobacco";
        else issue("core_tobacco_window","The supplied guide does not establish a general tobacco class lookback; confirm the application definition.","review","D106",[4,5]);
        return;
      }
      const cigar = relevant.filter(r=>r.product === "cigar" && within(r.lastDate,12,asOf));
      let exception = false;
      if (cigar.length && ["banner_opterm","moo_full","transamerica_super","foresters_yourterm_med","foresters_advantage_med","foresters_smart_med"].includes(p.id)) {
        const maxMonth = p.id === "moo_full" ? 2 : 1, maxYear = p.id === "moo_full" ? 24 : 12;
        const countOK = cigar.every(r=>numeric(r.perMonth) !== null && numeric(r.perYear) !== null && Number(r.perMonth)>=0 && Number(r.perYear)>=0 && Number(r.perMonth)<=maxMonth && Number(r.perYear)<=maxYear);
        const tested = d.cotinineResult === "negative" && date(d.cotinineDate) && within(d.cotinineDate,12,asOf);
        const otherWindow = 12;
        const otherOK = !relevant.some(r=>r.product !== "cigar" && within(r.lastDate,otherWindow,asOf));
        exception = countOK && tested && otherOK;
        if (!countOK || !tested) issue("cigar_evidence","An occasional-cigar exception needs admitted monthly/annual use and dated negative cotinine evidence. Non-tobacco status is withheld until confirmed.");
      }
      let tobaccoMonths = p.id === "transamerica_super" ? 24 : 12;
      const recent = relevant.some(r=>within(r.lastDate,tobaccoMonths,asOf));
      out.tobaccoBasis = recent && !exception ? "tobacco" : "non_tobacco";
      let ceiling = "preferred_plus";
      if (out.tobaccoBasis === "non_tobacco" && !exception && p.nicotine) {
        ceiling = CLASS_ORDER.slice(0,4).find((k,i)=>!relevant.some(r=>within(r.lastDate,p.nicotine[i],asOf))) || "standard";
      }
      if (exception) {
        const otherProducts=relevant.filter(r=>r.product !== "cigar");
        ceiling=CLASS_ORDER.slice(0,4).find((k,i)=>!otherProducts.some(r=>within(r.lastDate,(p.nicotine||[36,24,12,12])[i],asOf)))||"standard";
        if (p.id.startsWith("foresters_") && rank(ceiling)<rank("preferred")) ceiling="preferred";
        if (p.id === "banner_opterm" && conds.some(c=>["diabetes","asthma"].includes(c.id)) && rank(ceiling)<rank("preferred")) ceiling="preferred";
      }
      out.domains.nicotine={ceiling,detail:exception ? "Occasional cigar exception supported by disclosed frequency, other-product history and test evidence." : "Class lookbacks apply to the most recent use of every relevant product.",source:source(p.sources[0],p.id.startsWith("foresters_") ? [7,8,9] : undefined)};
      if (p.id === "fg_quantum" && relevant.some(r=>r.product === "cigar" && within(r.lastDate,12,asOf))) issue("fg_cigar","Quantum's occasional cigar frequency threshold is unpublished; ask underwriting rather than assume one cigar per month.","review","D141",[10]);
    }
    function build() {
      const h = num("heightIn","height in inches",36,100), w = num("weightLb","weight in pounds",30,1000);
      need("weightChange","weight change in the last 12 months",["none","loss","gain"]);
      let ratedWeight=w;
      if (d.weightChange === "loss" || d.weightChange === "gain") {
        const prior = num("priorWeightLb","previous weight",30,1000);past(d.weightChangeDate,"weight change");
        need("weightCause","weight-change cause",["intentional","illness","pregnancy","surgery","unknown"]);
        if (d.weightCause !== "intentional") {
          if (p.id === "corebridge_legacy" && d.weightCause === "unknown" && d.weightChange === "loss" && within(d.weightChangeDate,12,asOf)) benefit("graded","Unexplained weight loss within 12 months supports Graded screening.","D106",[6]);
          else issue("weight_cause","Weight change due to illness, pregnancy, surgery or an unknown cause requires review.");
        }
        if (w !== null && prior !== null && ((d.weightChange === "loss" && prior <= w) || (d.weightChange === "gain" && prior >= w))) issue("weight_conflict","The reported weight change conflicts with the current/previous weights.");
        if (d.weightChange === "loss" && prior > w && d.weightCause === "intentional") {
          if (p.build === "banner" && prior-w>20 && within(d.weightChangeDate,12,asOf)) ratedWeight=w+(prior-w)/2;
          else if (p.build === "foresters") {
            if (!past(d.stableSince,"weight stability")) return;
            if (d.stableSince > shift(asOf,-12)) ratedWeight=w+(prior-w)/2;
          } else if (["beyond","flex"].includes(p.build)) {ratedWeight=w+(prior-w)/2;out.notes.push("September guide permits adding back half of intentional weight loss; carrier discretion still applies.");}
          else issue("weight_loss_review","This product's weight-loss adjustment has not been reconciled; underwriting must review it.");
        }
      }
      if (h === null || w === null || !p.build) return;
      const bmi = ratedWeight*703/(h*h);out.domains.build={bmi,weight:ratedWeight,source:source(p.sources[0])};
      let height = h;
      if (h % 1) {
        if (p.build === "banner" && h % 1 === 0.5) height=Math.ceil(h);
        else {issue("height_rounding","A fractional height needs carrier confirmation; this product's rounding rule is not fully published.");return;}
      }
      if (p.build === "bmi") {
        const edges=[16,age>=60?18:17,28,30,32,35,37,39,41,42,43,44];
        if(edges.some(edge=>bmi>edge&&bmi<edge+0.0001)){issue("bmi_precision","BMI falls between printed four-decimal bands; carrier rounding must be confirmed.","review","D370",[12]);return;}
        if (bmi <= 16 || bmi > 46) issue("bmi_decline","BMI is outside the published adult build range.","decline","D370",[12]);
        else if (age >= 60 && bmi <= 18) issue("bmi_low","Age 60+ and BMI 16–18 require individual consideration.","review","D370",[12]);
        else if (bmi > 35) {
          const rating = [[37,"A"],[39,"B"],[41,"C"],[42,"D"],[43,"E"],[44,"F"],[46,"H"]].find(([max])=>bmi<=max);
          out.tableRating={label:rating[1],basis:"Build component",source:source("D370",[12])};out.domains.build.ceiling="table";
        } else out.domains.build.ceiling=bmi <= (age>=60?18:17) ? "standard" : bmi<=28 ? "preferred_plus" : bmi<=30 ? "preferred" : bmi<=32 ? "standard_plus" : "standard";
      } else if (p.build === "flex") {
        if (bmi>55) issue("flex_bmi_decline","BMI exceeds the BeyondTermflex maximum.","decline","D077",[3]);
        else {out.domains.build.level=bmi>=43 && bmi<=45.99?1:bmi>=46&&bmi<=48?2:bmi>=48.1&&bmi<=55?3:null;issue("flex_level","The printed BMI intervals and all other Flex risks need carrier confirmation; a build level is not a health-class offer.","review","D077",[3]);}
      } else if (p.build === "beyond") {
        const row=BUILD_CHARTS.beyond[height];
        const hits=row?.map((range,i)=>ratedWeight>=range[0]&&ratedWeight<=range[1]?CLASS_ORDER[i]:null).filter(Boolean)||[];
        if (hits.length!==1) issue("beyond_build","Build is outside a single unambiguous published BeyondTerm band; overlapping/gapped chart cells need review.","review","D077",[3]);
        else out.domains.build.ceiling=hits[0];
      } else if (p.build === "corebridge") {
        const row=BUILD_CHARTS.corebridge[height];
        if (!row) issue("core_height","Height is outside the source build chart.","review","D106",[7]);
        else if (ratedWeight>=row.level[0]&&ratedWeight<=row.level[1]) benefit("level","Build falls in the Level benefit column.","D106",[7]);
        else if (ratedWeight>=row.graded[0]&&ratedWeight<=row.graded[1]) benefit("graded","Build falls in the Graded benefit column.","D106",[7]);
        else issue("core_build","Build falls outside both published benefit charts.","review","D106",[7]);
      } else {
        const row=BUILD_CHARTS[p.build]?.[height];
        if (!row) {issue("chart_height","Height is outside the source chart; no extrapolation is applied.");return;}
        if (p.build === "banner" && (ratedWeight<row.min||bmi<=18.5)) {issue("low_build","Below-chart/low BMI requires Banner individual consideration.","review","B-FIELD",[7]);return;}
        if (p.build !== "banner" && bmi<18.5) {issue("low_build_unpublished","Low build requires assessment; this product's lower preferred-class boundary is not fully modeled.");return;}
        if (p.build === "fg_quantum") {
          const add=age>=51&&age<=60?5:0, sexRow=row[d.sex];
          if (!sexRow) return;
          if (ratedWeight<row.min+add || ratedWeight>row.tableMax+add) issue("quantum_build","Build is outside Quantum's adult minimum/maximum range.","review","D141",[11,12]);
          else if (ratedWeight<=sexRow.pp+add) out.domains.build.ceiling="preferred";
          else if (ratedWeight<=sexRow.std+add) out.domains.build.ceiling="standard";
          else {out.domains.build.ceiling="table";issue("quantum_table","Build is in Quantum's substandard range through Table D/4, but the exact table is not published in this chart.","review","D141",[12]);}
        } else {
          const keys=["pp","p","sp","std"];const i=keys.findIndex(key=>ratedWeight<=row[key]);
          if(p.build === "banner" && i>0 && ratedWeight<row[keys[i-1]]+1){issue("build_precision","Weight falls between the printed OPTerm integer-pound bands; carrier rounding must be confirmed.","review","B-FIELD",[7]);return;}
          if (i>=0) out.domains.build.ceiling=CLASS_ORDER[i];
          else if (p.build === "mutual_of_omaha") {
            const t=[1,2,3,4,5,6,8,10,12].find(n=>ratedWeight<=row["t"+n]);
            if (t) {out.domains.build.ceiling="table";out.tableRating={label:String(t),extraPercent:t*25,basis:"Build component",source:source("D282",[6,7])};}
            else issue("moo_build","Above the published Table 12 build chart; no higher table or decline is guessed.","review","D282",[7]);
          } else issue("substandard_build","Build exceeds Standard. The appropriate substandard rating needs carrier review and is not reduced to Standard Tobacco.");
        }
      }
    }
    function medications(conds) {
      const rows=history("medicationHistory","medications","past and current prescriptions");
      confirm("medicationsComplete","that the prescription history is complete");
      const names=["warfarin","coumadin","apixaban","eliquis","rivaroxaban","xarelto","dabigatran","pradaxa","metformin","insulin","lisinopril","losartan","amlodipine","atorvastatin","rosuvastatin","simvastatin","levothyroxine","albuterol","sertraline","fluoxetine","escitalopram","clopidogrel","plavix"];
      for (const r of rows) {
        if (!present(r.name) || !present(r.indication) || !present(r.dose) || !["yes","no"].includes(r.current)) issue("rx_details","Confirm prescription name, dose, reason and current/past use.","missing");
        past(r.start,"prescription start");past(r.lastFill,"last prescription fill");
        if (r.current === "no") past(r.end,"prescription end");
        if (date(r.start) && date(r.lastFill) && r.start>r.lastFill || date(r.end)&&date(r.start)&&r.end<r.start) issue("rx_dates","Prescription dates conflict; please correct them.");
        const normalized=String(r.name||"").toLowerCase().replace(/[^a-z ]/g," ").trim();
        const mapped=names.find(n=>normalized.split(/\s+/).includes(n));
        const indications={warfarin:["atrial_fibrillation","stroke","tia","coronary_disease"],coumadin:["atrial_fibrillation","stroke","tia","coronary_disease"],apixaban:["atrial_fibrillation"],eliquis:["atrial_fibrillation"],rivaroxaban:["atrial_fibrillation"],xarelto:["atrial_fibrillation"],dabigatran:["atrial_fibrillation"],pradaxa:["atrial_fibrillation"],metformin:["diabetes"],insulin:["diabetes"],lisinopril:["hypertension","heart_failure"],losartan:["hypertension","heart_failure"],amlodipine:["hypertension","coronary_disease"],atorvastatin:["cholesterol","coronary_disease"],rosuvastatin:["cholesterol","coronary_disease"],simvastatin:["cholesterol","coronary_disease"],albuterol:["asthma","copd"],sertraline:["anxiety","depression"],fluoxetine:["anxiety","depression"],escitalopram:["anxiety","depression"]};
        if(mapped&&indications[mapped]&&!indications[mapped].includes(r.conditionId))issue("rx_indication_review","Confirm the reported indication for "+r.name+". Other or off-label indications require review; no diagnosis is inferred.");
        if (!mapped) issue("rx_unrecognized","The medicine "+(r.name||"listed")+" is not mapped. Its indication and history need review; it is not assumed harmless or disqualifying.");
        if (!r.conditionId || !conds.some(c=>c.id === r.conditionId)) issue("rx_condition","Link "+(r.name||"each prescription")+" to a disclosed diagnosis, or have its indication reviewed. A medicine alone does not establish a diagnosis.");
        if (p.id === "amam_qsfp" && within(r.lastFill,24,asOf) && /\b(warfarin|coumadin|plavix|clopidogrel|aggrenox)\b/.test(normalized) && ["stroke","tia","coronary_disease"].includes(r.conditionId)) issue("amam_rx","This prescription plus the disclosed stroke/TIA/circulatory indication and fill within two years meets the QSFP exclusion.","decline","D017",[1]);
      }
      if (p.id === "corebridge_legacy") {
        const af=conds.find(c=>c.id === "atrial_fibrillation");
        if (af?.dailyAnticoagulant === "yes" && !rows.some(r=>r.current === "yes" && r.conditionId === "atrial_fibrillation" && /\b(warfarin|coumadin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa)\b/i.test(r.name||""))) issue("af_rx_conflict","Daily anticoagulant use is reported but the matching current prescription is missing.","review","D106",[4]);
      }
    }
    function rateClasses(driving,family) {
      const v=VITAL_RULES[p.vitals];
      if (!v) {issue("vital_rules","This product's complete class criteria are not reconciled.");return;}
      const sys=num("bpSys","systolic blood pressure",60,260),dia=num("bpDia","diastolic blood pressure",30,160);
      const total=num("cholTotal","total cholesterol",40,700),hdl=num("cholHdl","HDL cholesterol",5,200);
      const bpOK=past(d.bpDate,"blood-pressure measurement"),cholOK=past(d.cholDate,"cholesterol measurement");
      need("bpBasis","basis of blood-pressure readings",["current","average_2yr"]);need("cholBasis","basis of cholesterol readings",["current","average_12mo","average_2yr"]);
      yn("bpTreatment","blood-pressure treatment");yn("bpControl","well-controlled blood pressure");yn("cholTreatment","cholesterol treatment");
      if(d.bpTreatment === "yes" && !(d.conditions||[]).some(c=>c.id === "hypertension") || d.cholTreatment === "yes" && !(d.conditions||[]).some(c=>c.id === "cholesterol"))issue("vital_diagnosis","Treatment is reported but its related diagnosis is missing. Reconcile the medical history.");
      if((d.bpTreatment === "yes"||d.cholTreatment === "yes") && d.medicationHistory!=="yes")issue("vital_prescriptions","Treatment is reported but the prescription history is unanswered or says no. Confirm the medicines.");
      if (d.bpControl === "no") issue("bp_control","Blood pressure that is not well controlled requires review.");
      if (sys!==null && dia!==null && sys<=dia) issue("bp_conflict","Systolic blood pressure must exceed diastolic pressure.","missing");
      if (total!==null && hdl!==null && total<=hdl) issue("chol_conflict","Total cholesterol must exceed HDL cholesterol.","missing");
      if (["banner_opterm","fg_quantum"].includes(p.id) && (d.bpBasis!=="average_2yr" || p.id === "fg_quantum" && d.cholBasis!=="average_2yr")) issue("vital_average","The selected guide uses two-year averages; a single reading cannot establish the published preferred criteria.");
      if ((bpOK && !within(d.bpDate,12,asOf)) || (cholOK && !within(d.cholDate,12,asOf))) issue("vital_age","These readings are over a year old. Obtain current evidence before relying on a class estimate.","review",null);
      if (sys===null || dia===null || total===null || hdl===null || age===null) return;
      const ratio=total/hdl;
      const candidates=(p.classes||CLASS_ORDER.slice(0,4)).filter(k=>(!p.preferredMinFace || face>=p.preferredMinFace || k === "standard")&&nicFit(k)&&buildFit(k)&&vitalFit(k)&&familyFit(k)&&drivingFit(k)&&residencyFit(k));
      if (!candidates.length) issue("class_outside","The disclosed factors do not jointly meet a modeled published class. Standard or substandard requires individual review; a favorable range is withheld.");
      else {
        const k=candidates[0];
        if(k === "standard" && p.id === "fg_quantum" && driving.length)issue("fg_driving_standard","Quantum Standard requires no rateable violations; assess the driving record.","review","D141",[10]);
        if(k === "standard" && p.id === "transamerica_super" && driving.some(r=>["dui","serious","reckless","suspension","revocation"].includes(r.type)))issue("ta_driving_standard","Standard driving is individually considered; a disclosed major violation needs review.","review","D370",[21,27]);
        out.healthClass=out.domains.build?.ceiling === "table" ? "table" : k;
        out.domains.classes={detail:"The result must meet all modeled criteria together; no favorable domain is used as a range endpoint.",supported:candidates,source:source(p.sources[0])};
      }
      out.domains.vitals={ceiling:(p.classes||CLASS_ORDER.slice(0,4)).find(vitalFit),detail:`Blood pressure ${sys}/${dia}; total cholesterol ${total}, HDL ${hdl}, ratio ${ratio.toFixed(2)}.`,source:source(p.sources[0])};
      out.domains.family={ceiling:(p.classes||CLASS_ORDER.slice(0,4)).find(familyFit),detail:"Disease, relation and age-at-death criteria applied only for this product.",source:source(p.sources[0])};
      out.domains.driving={ceiling:(p.classes||CLASS_ORDER.slice(0,4)).find(drivingFit),detail:"Events counted separately over the product's actual 1-, 2-, 3-, 5- and 10-year windows.",source:source(p.sources[0])};
      function nicFit(k) {
        if (out.tobaccoBasis === "unknown") return false;
        if (out.tobaccoBasis === "tobacco") {
          if (p.id.startsWith("foresters_")) {
            const smoking=(d.nicotine||[]).filter(r=>r.product === "cigarette" && within(r.lastDate,12,asOf));
            if (k === "preferred_plus" && smoking.some(r=>numeric(r.packsPerDay) === null || Number(r.packsPerDay)>1)) return false;
            return ["preferred_plus","standard"].includes(k);
          }
          return ["preferred","standard"].includes(k);
        }
        return rank(k)>=rank(out.domains.nicotine?.ceiling||"preferred_plus");
      }
      function buildFit(k) {
        const ceiling=out.domains.build?.ceiling;
        return ceiling === "table" || ceiling && rank(k)>=rank(ceiling);
      }
      function vitalFit(k) {
        let key=k;
        if (out.tobaccoBasis === "tobacco" && p.id.startsWith("foresters_") && k === "preferred_plus") key="tobacco_plus";
        const t=band(v.bp[key],age);
        // If Standard has no numeric ceiling, favorable published readings
        // may support it, but outside-band readings always require review.
        const tFallback=t||band(v.bp.standard_plus||v.bp.preferred,age);
        if (!tFallback) return false;
        const strict=p.vitals === "mutual_of_omaha";
        if (strict ? sys>=tFallback.sys||dia>=tFallback.dia : sys>tFallback.sys||dia>tFallback.dia) return false;
        if (p.id === "transamerica_super" && k === "preferred_plus" && d.bpTreatment === "yes" && (age<50||age>=81)) return false;
        const c=v.cholesterol;
        const maxTotal=c.totalMax ?? maxOf(c.total?.[key],age) ?? maxOf(c.total?.standard_plus||c.total?.preferred,age);
        const min=c.totalMin ?? (d.cholTreatment === "no" ? c.minUntreated : null);
        if (min!=null && total<min || maxTotal!=null && total>maxTotal) return false;
        const ratioMax=maxOf(c.ratio?.[key],age) ?? maxOf(c.ratio?.standard_plus||c.ratio?.preferred,age);
        if (ratioMax==null || (c.strict ? ratio>=ratioMax : ratio>ratioMax)) return false;
        return true;
      }
      function familyFit(k) {
        const deaths=(items,threshold)=>new Set(items.filter(r=>r.death === "yes" && numeric(r.deathAge)!==null && Number(r.deathAge)<threshold).map(r=>r.member)).size;
        if (p.family === "banner") {
          if (age>70 && out.tobaccoBasis === "non_tobacco") return true;
          const cv=family.filter(r=>r.disease === "cardiovascular");
          const parents=cv.filter(r=>r.relation === "parent");
          return k === "preferred_plus" ? deaths(cv,60)===0 : k === "preferred" ? deaths(parents,60)===0 : deaths(parents,60)<=1;
        }
        if (p.family === "foresters") {
          if (k === "standard") return true;
          const f=family.filter(r=>r.relation === "parent" && ["cardiovascular","cancer"].includes(r.disease));
          return deaths(f,k === "standard_plus" ? 60 : 65)===0;
        }
        if (p.family === "moo") {
          if (age>=60 || k === "standard") return true;
          const f=family.filter(r=>r.relation === "parent" && ["cardiovascular","cancer"].includes(r.disease) && !oppositeCancer(r));
          // MOO's one cardiac-death exception requires an underwriter's
          // favorable workup decision; no self-entered credit is assumed.
          return deaths(f,60)===0;
        }
        if (p.family === "transamerica") {
          if (age>=65 || k === "standard") return true;
          const types=["breast","ovarian","melanoma","prostate","colon"];
          const f=family.filter(r=>r.disease === "cardiovascular" || r.disease === "cancer" && types.includes(r.cancerType));
          return deaths(f,60)<=(k === "standard_plus" ? 1 : 0);
        }
        if (p.family === "fg") {
          if (k === "standard") return true;
          return deaths(family.filter(r=>["cardiovascular","cancer"].includes(r.disease) && !oppositeCancer(r)),60)<=1;
        }
        return false;
      }
      function oppositeCancer(r) {
        return r.disease === "cancer" && r.sex && r.sex !== d.sex && (d.sex === "male" && ["breast","ovarian"].includes(r.cancerType) || d.sex === "female" && r.cancerType === "prostate");
      }
      function drivingFit(k) {
        const duis=driving.filter(r=>r.type === "dui");
        const major=driving.filter(r=>["dui","reckless","serious","suspension","revocation"].includes(r.type) || r.type === "speeding" && (Number(r.mphOver)>=30||Number(r.speed)>=90));
        const moving=driving.filter(r=>["minor","speeding","serious","reckless","dui"].includes(r.type));
        if (["suspended","revoked","expired"].includes(d.licenseStatus)) {issue("license_review","Current suspended, revoked or expired license needs underwriting review.");return false;}
        if (p.id === "banner_opterm") {
          if (duis.length>1) {issue("multiple_dui","Multiple DUI history is excluded from these published Banner class criteria and requires review.","review","B-FIELD",[5,6]);return false;}
          const idx=rank(k),max=[2,2,3,4][idx],years=[5,5,3,2][idx];
          return moving.filter(r=>within(r.date,36,asOf)).length<=max && !major.some(r=>within(r.date,years*12,asOf));
        }
        if (p.id.startsWith("foresters_")) {
          if (k === "standard") {
            if (moving.filter(r=>within(r.date,36,asOf)).length>2||major.some(r=>within(r.date,60,asOf))) issue("foresters_driving_standard","Outside published preferred driving criteria; obtain a fully underwritten driving assessment.","review","D152",[8,9,18]);
            return true;
          }
          const months=k === "preferred_plus"?60:36,max=k === "preferred_plus"?p.drivingPPMax:2;
          return moving.filter(r=>within(r.date,months,asOf)).length<=max&&!major.some(r=>within(r.date,60,asOf));
        }
        if (p.id === "moo_full") {
          if (moving.length) issue("moo_driving","MOO requires an otherwise non-rateable driving record; assess the disclosed violations before assigning a class.","review","D282",[11,12,13]);
          return k === "standard" || !major.some(r=>within(r.date,60,asOf));
        }
        if (p.id === "fg_quantum") {

          return k === "standard" || moving.filter(r=>within(r.date,36,asOf)).length<=2&&!duis.some(r=>within(r.date,60,asOf));
        }
        if (p.id === "transamerica_super") {
          if (duis.some(r=>within(r.date,12,asOf))) issue("ta_dui_1","DUI within one year fails Transamerica's published impairment screen.","decline","D370",[27]);
          if (duis.some(r=>ageAt(d.dob,r.date)<21 && within(r.date,48,asOf)) || duis.filter(r=>within(r.date,48,asOf)).length>1) issue("ta_dui_young_multiple","DUI before age 21 in four years, or multiple DUIs within four years, fails the published screen.","decline","D370",[27]);
          if (duis.some(r=>within(r.date,48,asOf))) {out.flatExtra={rangePerThousand:[0,3.5],basis:"DUI history; exact amount/duration require underwriting",source:source("D370",[27])};issue("ta_dui_flat","Recent DUI may require a flat extra or other adverse outcome; carrier review sets the amount and duration.","review","D370",[27]);}

          return k === "standard" || !duis.some(r=>within(r.date,60,asOf)) && major.filter(r=>within(r.date,36,asOf)).length<=1 && (k !== "preferred_plus"||!major.some(r=>within(r.date,12,asOf))) && moving.filter(r=>!["serious","reckless","dui"].includes(r.type)&&within(r.date,36,asOf)).length<=3;
        }
        return false;
      }
      function residencyFit(k) {
        if (p.id !== "banner_opterm") return true;
        const months=rank(k)<=1?36:24;
        return ["citizen","permanent"].includes(d.citizenship) && date(d.usSince) && d.usSince<=shift(asOf,-months);
      }
    }
    function finish() {
      // Independently verified exclusions govern even when other evidence is
      // missing. Otherwise any material uncertainty withholds a final class.
      const unavailable=out.issues.some(i=>i.status === "unavailable"),decline=out.issues.some(i=>i.status === "decline");
      const review=out.issues.some(i=>["review","missing"].includes(i.status));
      out.eligibility=unavailable ? "unavailable" : review ? "not_confirmed" : "screen_passed";
      out.status=unavailable ? "unavailable" : decline ? "decline_screen" : review ? "manual_review" : "estimated";
      if (out.kind === "final_expense" && out.status === "estimated" && !out.benefitTier) out.benefitTier="level";
      if (out.status !== "estimated") {out.healthClass=null;out.benefitTier=null;}
      if (out.status === "estimated" && out.kind !== "final_expense" && !out.healthClass) out.status="manual_review";
      out.finalClass=out.status === "estimated" ? out.healthClass||out.benefitTier : out.status;
      if(out.healthClass)out.displayClass=out.tobaccoBasis === "tobacco" && out.healthClass === "preferred_plus" && p?.id.startsWith("foresters_") ? "Tobacco Plus" : CLASS_LABELS[out.healthClass];
      out.range=out.healthClass ? {low:out.healthClass,high:out.healthClass} : null;
      out.missing=[...new Set([...out.missing,...out.issues.filter(i=>i.status === "missing").map(i=>i.text)])];
      out.confidence={level:out.issues.some(i=>i.status === "missing") ? "Incomplete information" : out.status === "estimated" ? "Complete for modeled screens" : "Carrier review required",missing:out.missing};
      out.flags=out.issues.map(i=>i.id);
      return out;
    }
  }
  function compare(input,options={}) {
    const selected=Object.prototype.hasOwnProperty.call(PRODUCT_RULES,input?.productId) ? PRODUCT_RULES[input.productId] : null;
    // Same coverage type AND underwriting route; no unlike-product ranking.
    if (!selected || selected.status === "unverified" || selected.kind === "life") return [];
    return Object.values(PRODUCT_RULES).filter(p=>p.kind === selected.kind && p.route === selected.route && p.status !== "unverified").map(p=>run(p.id,input,options));
  }
  return {run,compare,ageAt,within,shift};
})();
