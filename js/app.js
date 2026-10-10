/* Accessible product-specific interview; all results come from Engine.run. */
"use strict";
const App = (() => {
  const STORAGE_KEY="hce_state_v2", LEGACY_KEY="hce_state_v1";
  const $=sel=>document.querySelector(sel);
  let state=InterviewState.empty(), step=0, results=false, migrationNotice=false;
  const yesNo=[["yes","Yes"],["no","No"],["unknown","Unsure"]];
  const states="AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" ").map(s=>[s,s]);
  const conditions=[
    ["hypertension","High blood pressure"],["cholesterol","High cholesterol"],["diabetes","Diabetes"],["asthma","Asthma"],
    ["sleep_apnea","Sleep apnea"],["atrial_fibrillation","Atrial fibrillation / irregular rhythm"],["coronary_disease","Coronary artery disease / heart attack"],
    ["heart_failure","Heart failure / cardiomyopathy"],["stroke","Stroke"],["tia","TIA"],["cancer","Cancer"],["kidney_disease","Kidney disease"],
    ["end_stage_kidney","End-stage kidney disease"],["cirrhosis","Liver cirrhosis"],["hepatitis_b","Hepatitis B"],["hepatitis_c","Hepatitis C"],
    ["copd","COPD / emphysema"],["als","ALS"],["parkinsons","Parkinson's disease"],["multiple_sclerosis","Multiple sclerosis"],
    ["huntington","Huntington's disease"],["lupus","Lupus"],["alzheimers","Alzheimer's disease"],["dementia","Dementia"],
    ["hiv","HIV / AIDS"],["transplant","Organ transplant"],["tissue_transplant","Tissue transplant"],
    ["brain_tumor","Brain tumor"],["liver_disease","Liver disease"],["amputation","Amputation"],["bipolar","Bipolar disorder"],["schizophrenia","Schizophrenia"],
    ["depression","Depression"],["anxiety","Anxiety"],["suicide_attempt","Suicide attempt"],["other","Another diagnosis"]
  ];
  function node(tag,cls,text) {const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function save() {try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{toast("This browser could not save the draft.");}}
  function toast(text) {const t=$("#toast");t.textContent=text;t.classList.remove("hidden");setTimeout(()=>t.classList.add("hidden"),3500);}
  function field(parent,label,key,options=null,opts={}) {
    const obj=opts.obj||state, id=opts.id||key;
    const wrap=node("div","field"), lab=node("label",null,label);lab.htmlFor=id;
    const control=node(options?"select":opts.type === "textarea" ? "textarea" : "input");
    control.id=id;control.dataset.field=id;
    if(options){control.appendChild(new Option("Choose an answer",""));options.forEach(([value,text])=>control.appendChild(new Option(text,value)));}
    else {if(control.tagName === "INPUT")control.type=opts.type||"text";if(opts.min!=null)control.min=opts.min;if(opts.max!=null)control.max=opts.max;if(opts.step)control.step=opts.step;if(opts.type === "textarea")control.rows=3;}
    control.value=obj[key]??"";
    const change=()=>{obj[key]=control.value; if(opts.onChange)opts.onChange(control.value);save();if(opts.render)render();};
    control.addEventListener(options?"change":"input",change);
    wrap.append(lab,control);if(opts.hint)wrap.appendChild(node("p","hint",opts.hint));parent.appendChild(wrap);return control;
  }
  function yn(parent,label,key,opts={}) {return field(parent,label,key,yesNo,opts);}
  function confirmed(parent,label,key) {return field(parent,label,key,[["yes","Yes, confirmed"],["no","Still incomplete"],["unknown","Unsure"]]);}
  function number(parent,label,key,opts={}) {return field(parent,label,key,null,{type:"number",min:0,step:"any",...opts});}
  function date(parent,label,key,opts={}) {return field(parent,label,key,null,{type:"date",...opts});}
  function text(parent,label,key,opts={}) {return field(parent,label,key,null,opts);}
  function row(parent) {const r=node("div","field-row");parent.appendChild(r);return r;}
  function paragraph(parent,text,cls="card-sub") {parent.appendChild(node("p",cls,text));}
  function button(label,fn,cls="btn btn-ghost") {const b=node("button",cls,label);b.type="button";b.addEventListener("click",fn);return b;}
  function listEditor(parent,key,label,renderRow) {
    state[key].forEach((entry,i)=>{
      const card=node("fieldset","history-entry"),legend=node("legend",null,label+" "+(i+1));card.appendChild(legend);
      const f=(title,k,options=null,opts={})=>field(card,title,k,options,{obj:entry,id:key+"-"+i+"-"+k,...opts});
      renderRow(card,entry,f,i);
      card.appendChild(button("Remove this entry",()=>{state[key].splice(i,1);save();render();}));parent.appendChild(card);
    });
    parent.appendChild(button("Add "+label.toLowerCase(),()=>{state[key].push({});save();render();}));
  }
  function screen(parent,label,key,listKey,editor) {
    yn(parent,label,key,{render:true});
    if(state[key] === "yes" || state[listKey].length) editor();
  }
  function product(c) {
    paragraph(c,"Choose a product and route before estimating. Medical classes, simplified screens and final-expense benefits use different rules.");
    field(c,"Carrier, product and underwriting route","productId",Object.values(PRODUCT_RULES).map(p=>[p.id,p.carrier+" — "+p.name+" — "+p.route]),{render:true});
    const p=PRODUCT_RULES[state.productId];
    if(p){const info=node("div","source-panel");paragraph(info,p.status === "criteria"?"Selected class criteria are reconciled to the listed editions. Every offer remains subject to the carrier.":"Review route: this product's complete rating rules are unresolved. Published exclusions can be checked, but the app will withhold a final class.");
      (p.sources||[]).forEach(id=>paragraph(info,RULE_SOURCES[id].title+" · "+RULE_SOURCES[id].edition));if(p.scopeNote)paragraph(info,p.scopeNote);c.appendChild(info);}
    date(c,"Date of birth","dob");field(c,"Sex used for the carrier's underwriting chart","sex",[["male","Male"],["female","Female"],["unknown","Unsure / needs carrier review"]]);
    field(c,"State of residence","state",states);
    number(c,"Coverage requested ($)","faceAmount",{min:1,step:1000});
    if(p?.kind === "term")field(c,"Requested term length","termYears",[[10,"10 years"],[15,"15 years"],[20,"20 years"],[25,"25 years"],[30,"30 years"],[35,"35 years"],[40,"40 years"]],{hint:"Term availability must be confirmed for your age and product."});
    field(c,"Main purpose of coverage","policyPurpose",[["income","Replace earned income"],["mortgage","Mortgage / debt"],["family","Family support"],["estate","Estate planning"],["business","Business"],["final_expense","Final expenses"],["other","Other"]],{render:true});
    if(state.policyPurpose === "income" && p?.id !== "sbli_easytrak")number(c,"Annual earned income ($)","income");
    if(p?.id === "sbli_easytrak") {
      number(c,"Annual income for the EasyTrak quote ($)","sbliIncome",{min:0,hint:"Confirm the income definition with SBLI. Nonworking applicants need a carrier-confirmed financial basis."});
      if(state.policyPurpose === "mortgage") {
        field(c,"Is this coverage solely for a mortgage?","sbliMortgageOnly",yesNo,{render:true});
        if(state.sbliMortgageOnly === "yes")number(c,"Mortgage amount ($)","sbliMortgageAmount",{min:0,hint:"Mortgage-only quotes should not exceed 1.5 times this amount."});
      }
    }
    number(c,"Existing life insurance with all carriers ($)","existingCoverage");
    if(p?.id.startsWith("foresters_")||p?.id === "corebridge_legacy")number(c,p.id === "corebridge_legacy" ? "Existing AGL GIWL/SIWL coverage ($)" : "Existing Foresters life coverage ($)","existingCarrierCoverage");
    yn(c,"Will this coverage replace an existing life policy?","replacement");yn(c,"Will the premiums be financed or paid with a loan?","financing");
    field(c,"Work status","employment",[["employed","Employed"],["spouse","Nonworking spouse"],["student","Full-time student"],["seeking","Seeking work"],["retired","Retired"],["other","Other"]]);
    text(c,"Occupation (or enter none)","occupation");
    yn(c,"Does your work involve hazardous duties?","hazardousOccupation");yn(c,"Do you fly as a private pilot or crew member?","aviation");
    yn(c,"Do you take part in hazardous sports, racing, scuba or climbing, or plan to?","hazardousSports");
    yn(c,"Are you serving, or under orders to serve, in a hazardous military area or war zone?","militaryDeployment");
    if(p?.id.startsWith("foresters_"))yn(c,"Are you deployed, or have you received notice of military deployment, to a war zone, an area of conflict or political instability, or a country outside North America?","forestersDeployment");
    text(c,"Details of any hazardous duties, sports or aviation","exposureDetails",{type:"textarea"});
  }
  function residence(c) {
    yn(c,"Do you currently live in the United States?","usResident");
    field(c,"Citizenship or immigration status","citizenship",[["citizen","US citizen"],["permanent","Permanent resident / green card"],["visa","Visa holder"],["itin","ITIN without visa"],["other","Another status"],["unknown","Unsure"]],{render:true});
    date(c,"When did your current continuous US residence begin?","usSince",{hint:"If you have lived here since birth, use your date of birth."});
    yn(c,"Do you intend to remain in the United States?","intentStay");yn(c,"Do you plan to live outside the US?","foreignResidence");
    if(state.citizenship === "visa") {text(c,"Visa type (for example H1B or TN)","visaType");date(c,"Visa expiration date","visaExpiry");yn(c,"Is a pending visa renewal documented?","visaRenewal");yn(c,"Do you have current work authorization?","workAuthorization");}
    if(["visa","itin","other"].includes(state.citizenship))field(c,"Tax identification documentation","taxIdType",[["ssn","Valid SSN"],["itin","ITIN"],["none","Neither"],["unknown","Unsure"]]);
    yn(c,"Do you have established US health insurance?","healthInsurance");
    screen(c,"Have you traveled outside the US in the last two years, or do you plan to in the next two years?","travelHistory","travels",()=>listEditor(c,"travels","Trip",(card,r,f)=>{
      f("Country","country");f("Purpose (work, vacation, study, etc.)","purpose");f("Departure date","start",null,{type:"date"});f("Return date","end",null,{type:"date"});
    }));
    paragraph(c,"The carrier must check current destination risk and duration. This tool does not assign country risk from your nationality.");
  }
  function nicotine(c) {
    field(c,"Have you ever used tobacco, nicotine, vaping (including zero-nicotine), or smoking-cessation products?","nicotineHistory",[["never","Never"],["yes","Yes"],["unknown","Unsure"]],{render:true});
    if(state.nicotineHistory === "yes"||state.nicotine.length) {
      listEditor(c,"nicotine","Product used",(card,r,f)=>{
        f("Product","product",[["cigarette","Cigarettes"],["cigar","Cigars"],["pipe","Pipe / hookah"],["chew","Chew / snuff"],["nicotine","Patches, gum, pouches or other nicotine"],["vape","Vape / e-cigarette with nicotine"],["vape_no_nicotine","Zero-nicotine vape"],["cessation","Other smoking-cessation product"]],{render:true});
        f("Still using this product?","current",yesNo);f("Last-use date (use today if current)","lastDate",null,{type:"date"});
        if(r.product === "cigar"){f("Highest cigars per month in the past year","perMonth",null,{type:"number",min:0});f("Total cigars in the past year","perYear",null,{type:"number",min:0});}
        if(r.product === "cigarette")f("Packs per day","packsPerDay",null,{type:"number",min:0,step:"0.1"});
      });
      confirmed(c,"Have you listed every product and its most recent use?","nicotineComplete");
      field(c,"Most recent urine cotinine test result, if available","cotinineResult",[["negative","Negative"],["positive","Positive"],["unknown","No result / unsure"]]);date(c,"Cotinine specimen date","cotinineDate");
    }
    paragraph(c,"Report all products. An occasional-cigar exception depends on the selected carrier, other tobacco history and test evidence.");
  }
  function build(c) {
    const r=row(c);number(r,"Height in inches (5 ft 10 in = 70)","heightIn",{min:36,max:100,step:0.5});number(r,"Current weight (lb)","weightLb",{min:30,max:1000});
    field(c,"Weight change in the past 12 months","weightChange",[["none","No meaningful change"],["loss","Lost weight"],["gain","Gained weight"],["unknown","Unsure"]],{render:true});
    if(["loss","gain"].includes(state.weightChange)){number(c,"Weight before the change (lb)","priorWeightLb");date(c,"When did the change occur?","weightChangeDate");field(c,"Reason for the change","weightCause",[["intentional","Intentional diet / exercise / weight-loss medicine"],["illness","Illness"],["pregnancy","Pregnancy"],["surgery","Surgery"],["unknown","Unexplained / unsure"]]);date(c,"Since when has your weight been stable?","stableSince");}
    paragraph(c,"Weight-loss adjustments and height rounding are product-specific. Unexplained loss and ambiguous chart boundaries go to review.");
  }
  function vitals(c) {
    paragraph(c,"Use documented readings. If you do not have the required evidence, leave it unanswered; the result will identify what is needed.");
    const r=row(c);number(r,"Blood pressure — top (systolic)","bpSys",{min:60,max:260});number(r,"Blood pressure — bottom (diastolic)","bpDia",{min:30,max:160});
    date(c,"Date of most recent blood-pressure reading","bpDate");field(c,"What do the entered blood-pressure values represent?","bpBasis",[["current","One current reading"],["average_2yr","Documented two-year average"],["unknown","Unsure"]]);
    yn(c,"Are you treated for high blood pressure?","bpTreatment");yn(c,"Has your clinician described your blood pressure as well controlled?","bpControl");
    const l=row(c);number(l,"Total cholesterol (mg/dL)","cholTotal",{min:40,max:700});number(l,"HDL cholesterol (mg/dL)","cholHdl",{min:5,max:200});
    date(c,"Date of most recent cholesterol test","cholDate");field(c,"What do the entered cholesterol values represent?","cholBasis",[["current","One current test"],["average_12mo","Average of readings over 12 months"],["average_2yr","Documented two-year average"],["unknown","Unsure"]]);yn(c,"Are you treated for high cholesterol?","cholTreatment");
    if(PRODUCT_RULES[state.productId]?.kind === "final_expense")paragraph(c,"This final-expense product uses its medical questions and benefit tiers, rather than preferred-class blood-pressure and cholesterol bands.");
  }
  function driving(c) {
    screen(c,"Have you ever had a DUI, reckless driving, serious driving offense or license suspension, or any moving violation in the past five years?","drivingHistory","driving",()=>listEditor(c,"driving","Driving event",(card,r,f)=>{
      f("Event type","type",[["minor","Minor moving violation"],["speeding","Speeding"],["serious","Other serious moving violation"],["reckless","Reckless / negligent driving"],["dui","DUI / DWI"],["suspension","License suspension"],["revocation","License revocation"]],{render:true});
      f("Conviction/event date","date",null,{type:"date"});
      if(r.type === "speeding"){f("Speed (mph)","speed",null,{type:"number",min:0});f("Mph above the posted limit","mphOver",null,{type:"number",min:0});}
    }));
    field(c,"Current driver's license status","licenseStatus",[["valid","Valid"],["never","Never licensed"],["suspended","Suspended"],["revoked","Revoked"],["expired","Expired"],["unknown","Unsure"]]);
    confirmed(c,"Is the driving history complete, including every DUI and each separate violation?","drivingComplete");
  }
  function criminal(c) {
    paragraph(c,"A charge, arrest and conviction are different events. Report each accurately; the app applies only the selected product's published screen.");
    screen(c,"Have you ever been arrested, charged or convicted of a felony or misdemeanor, or served probation/parole?","criminalHistory","criminal",()=>listEditor(c,"criminal","Criminal event",(card,r,f)=>{
      f("Type","type",[["felony","Felony"],["misdemeanor","Misdemeanor"],["arrest","Arrest without a confirmed offense type"]]);f("Offense and circumstances","offense");
      f("Charge/arrest date","date",null,{type:"date"});f("Outcome","disposition",[["convicted","Convicted"],["pending","Pending"],["dismissed","Dismissed / acquitted"],["other","Other / unsure"]],{render:true});
      if(r.disposition === "convicted")f("Conviction date","convictionDate",null,{type:"date"});
      for(const [key,title]of [["jail","Jail / prison"],["probation","Probation"],["parole","Parole"]]){f(title+" part of the sentence?",key,yesNo,{render:true});if(r[key] === "yes")f(title+" completion / release date",key+"End",null,{type:"date"});}
    }));
    yn(c,"Are you currently in jail or prison?","incarcerated");yn(c,"Do you have criminal charges pending?","pendingCharges");yn(c,"Are you currently on probation?","probationCurrent");yn(c,"Are you currently on parole?","paroleCurrent");yn(c,"Do you owe criminal fines or restitution?","outstandingRestitution");
    confirmed(c,"Have you included all events and confirmed the sentence/release dates?","criminalComplete");
  }
  function medical(c) {
    paragraph(c,"Include every past or current diagnosis, even if mild, controlled or resolved. Use Another diagnosis for anything outside this list.");
    screen(c,"Have you ever been diagnosed, treated or advised to seek treatment for a medical or mental-health condition?","medicalHistory","conditions",()=>listEditor(c,"conditions","Condition",(card,r,f)=>{
      f("Condition","id",conditions,{render:true,onChange:value=>{r.name=conditions.find(x=>x[0]===value)?.[1]||"";}});
      if(r.id === "other"||r.legacyDetails)f("Diagnosis name / description","name");
      if(r.legacyDetails)paragraph(card,"This diagnosis was imported. Reconfirm the details below; old mild/control defaults are not accepted.");
      f("Date first diagnosed","diagnosisDate",null,{type:"date"});f("Current status","status",[["current","Current"],["resolved","Resolved"],["unknown","Unsure"]],{render:true});
      if(r.status === "resolved")f("Date treatment ended","treatmentEnd",null,{type:"date"});
      f("Treatment and follow-up (enter none if none)","treatment",null,{type:"textarea"});f("Any complications?","complications",yesNo);f("Any recurrence?","recurrence",yesNo);f("Hospitalized for this condition?","hospitalized",yesNo,{render:true});
      if(r.hospitalized === "yes")f("Most recent related hospitalization","hospitalDate",null,{type:"date"});
      if(r.id === "cancer")f("Cancer type","cancerType",[["basal_cell","Basal cell skin"],["squamous_cell","Squamous cell skin"],["breast","Breast"],["colon","Colon"],["prostate","Prostate"],["leukemia","Leukemia"],["other","Another type"],["unknown","Unsure"]]);
      if(state.productId === "banner_flex") {
        if(r.id === "asthma") {f("Asthma attacks in the last 12 months","attacksLastYear",null,{type:"number",min:0,max:365,step:1});f("Days of work missed due to asthma in the last 12 months","missedWorkDays",null,{type:"number",min:0,max:365,step:1});f("Do asthma symptoms restrict daily activities?","activityRestricted",yesNo);}
        if(r.id === "heart_failure")f("Has a clinician diagnosed cardiomyopathy?","cardiomyopathy",yesNo);
        if(r.id === "hypertension")f("Has a clinician described current blood pressure as uncontrolled?","bpUncontrolled",yesNo);
        if(r.id === "diabetes") {f("Physician follow-up for diabetes in the last 24 months?","diabetesFollowUp24mo",yesNo);f("Date of most recent diabetes physician follow-up","diabetesFollowUpDate",null,{type:"date"});f("Has a clinician described blood sugar or A1c as uncontrolled?","sugarUncontrolled",yesNo);f("Diabetic kidney or nephropathy complications?","kidneyComplications",yesNo);}
        if(r.id === "cancer") {f("Most recent cancer diagnosis, recurrence or treatment date","lastCancerDate",null,{type:"date"});f("Any cancer spread, metastasis or lymph-node involvement?","metastasis",yesNo);f("Any past or pending chemotherapy/radiation?","chemoRadiation",yesNo);}
      }
      if(state.productId === "americo" && r.id === "amputation")f("Was the amputation due to disease?","dueToDisease",yesNo);
      if(state.productId === "americo" && ["hepatitis_b","hepatitis_c"].includes(r.id))f("Has a clinician diagnosed liver disease?","liverDisease",yesNo);
      if(r.id === "lupus")f("Lupus type","lupusType",[["systemic","Systemic (SLE)"],["discoid","Discoid / skin only"],["other","Another type"],["unknown","Unsure"]]);
      if(r.id === "diabetes"){f("Measured A1c","a1c",null,{type:"number",min:1,max:25,step:0.1});f("A1c test date","a1cDate",null,{type:"date"});f("Use insulin?","insulin",yesNo);}
      if(r.id === "atrial_fibrillation"){f("Diagnosed with chronic AF within the last 24 months?","chronic24mo",yesNo);f("Take a daily anticoagulant / blood thinner?","dailyAnticoagulant",yesNo);}
    }));
    if(state.productId === "americo") {
      paragraph(c,"Eagle Select asks about these specific past events. Enter the most recent occurrence or use today for ongoing care. A date near the 12-month boundary requires carrier confirmation.");
      for(const [key,label] of [["Adl","Have you received help with bathing, toileting or dressing because of a debilitating disease, or been bed-bound?"],["Hospice","Have you received hospice care?"],["Oxygen","Have you used supplemental oxygen for breathing (not CPAP alone)?"],["Mobility","Have you been dependent on a wheelchair or motorized mobility device?"]]) {
        yn(c,label,"americo"+key+"History",{render:true});
        if(state["americo"+key+"History"] === "yes" || state["americo"+key+"LastDate"])date(c,"Most recent occurrence — "+label,"americo"+key+"LastDate");
      }
      paragraph(c,"Pending tests, surgery, hospitalization or results need the exact carrier question and its HIV/AIDS-related exception reviewed. A generic pending-care answer is not treated as an automatic exclusion.");
    }
    confirmed(c,"Have you disclosed all diagnoses and treatments?","medicalComplete");
    screen(c,"Have you been hospitalized (other than routine childbirth)?","hospitalHistory","hospitals",()=>listEditor(c,"hospitals","Hospitalization",(card,r,f)=>{f("Date","date",null,{type:"date"});f("Reason and outcome","reason");f("Was this only for a minor condition?","minor",yesNo);}));
    screen(c,"Have you had an operation or medical procedure?","surgeryHistory","surgeries",()=>listEditor(c,"surgeries","Procedure",(card,r,f)=>{f("Date","date",null,{type:"date"});f("Reason and recovery","reason");}));
    yn(c,"Are any tests, results, further evaluation, treatment or surgery pending?","pendingCare",{render:true});if(state.pendingCare === "yes")text(c,"Describe the pending care","pendingDetails",{type:"textarea"});
    yn(c,"Do you have unexplained symptoms that are still being investigated?","activeSymptoms",{render:true});if(state.activeSymptoms === "yes")text(c,"Describe the symptoms","symptomDetails",{type:"textarea"});
    for(const [key,title] of [["oxygen","Do you require prescribed oxygen (other than CPAP for sleep apnea)?"],["dialysis","Do you currently receive kidney dialysis?"],["adlAssistance","Do you need help with bathing, dressing, eating, toileting or medicines due to illness?"],["careFacility","Are you currently confined to a hospital, nursing facility or hospice?"],["homeHealth","Do you receive, or have you been advised to receive, home nursing care?"],["terminalIllness","Have you been diagnosed with a terminal illness?"],["disabled","Are you disabled now, or have you been disabled in the last six months?"]])yn(c,title,key,{render:key === "terminalIllness"});
    if(state.terminalIllness === "yes")number(c,"Clinician-stated life expectancy (months), if known","terminalMonths");
    yn(c,"Have you ever been treated for, advised to stop, or had problems from alcohol, illegal drugs or prescription misuse?","substanceHistory",{render:true});if(state.substanceHistory === "yes"){date(c,"Most recent substance use / treatment","substanceLastDate");text(c,"Details of substances, treatment and relapses","substanceDetails",{type:"textarea"});}
    field(c,"Marijuana use","marijuana",[["none","None"],["past","Past"],["current","Current recreational use"],["medical","Medical use"],["unknown","Unsure"]]);
    yn(c,"Has life insurance ever been rated, postponed or declined?","priorInsuranceAdverse",{render:true});if(state.priorInsuranceAdverse === "yes")date(c,"Date of most recent insurance decision","priorInsuranceDate");
  }
  function medications(c) {
    paragraph(c,"List current and past prescriptions with their reason and fill date. A drug name alone is not a diagnosis or an automatic decline.");
    screen(c,"Have you ever taken prescribed medicines?","medicationHistory","medications",()=>listEditor(c,"medications","Prescription",(card,r,f)=>{
      f("Medicine name","name");f("Dose and frequency","dose");f("Reason prescribed","indication");
      f("Related disclosed condition","conditionId",state.conditions.map(c=>[c.id,c.name]).concat([["other","Other / not listed — needs review"]]));
      f("Currently taking it?","current",yesNo,{render:true});f("Started","start",null,{type:"date"});f("Most recent fill","lastFill",null,{type:"date"});if(r.current === "no")f("Stopped","end",null,{type:"date"});
    }));confirmed(c,"Is the prescription list complete, including past use?","medicationsComplete");
  }
  function family(c) {
    paragraph(c,"Include biological parents and siblings with cardiovascular disease, cancer, inherited disease or another serious condition. Diagnosis and cause of death are recorded separately.");
    screen(c,"Has a biological parent or sibling had one of these conditions?","familyHistory","family",()=>listEditor(c,"family","Relative's condition",(card,r,f)=>{
      f("Relative (use the same label for the same person)","member",null,{hint:"For example mother, father, sister 1."});f("Relationship","relation",[["parent","Parent"],["sibling","Sibling"]]);
      f("Disease","disease",[["cardiovascular","Heart / cardiovascular disease"],["cancer","Cancer"],["huntington","Huntington's disease"],["polycystic_kidney","Polycystic kidney disease"],["other","Other serious disease"]],{render:true});
      if(r.disease === "cancer")f("Relative’s sex","sex",[["male","Male"],["female","Female"],["unknown","Unsure"]]);
      if(r.disease === "cancer")f("Cancer type","cancerType",[["breast","Breast"],["ovarian","Ovarian"],["prostate","Prostate"],["colon","Colon"],["melanoma","Melanoma"],["other","Another cancer"],["unknown","Unsure"]]);
      f("Age at diagnosis","diagnosisAge",null,{type:"number",min:0,max:120});f("Did this disease cause the relative's death?","death",yesNo,{render:true});if(r.death === "yes")f("Age at death","deathAge",null,{type:"number",min:0,max:120});
    }));confirmed(c,"Have you confirmed the family history and relevant ages?","familyComplete");
  }
  function review(c) {
    paragraph(c,"Confirm the histories before estimating. Unknown facts, incomplete application rules and source conflicts will produce a review result.");
    confirmed(c,"Are your answers complete and accurate, including every condition, prescription and relevant event?","historyConfirmed");
    const out=Engine.run(state.productId,state);
    if(out.missing.length){const ul=node("ul");out.missing.forEach(t=>ul.appendChild(node("li",null,t)));c.appendChild(node("h3",null,"Details still needed"));c.appendChild(ul);}
    paragraph(c,"An estimate cannot guarantee coverage, a price or living-benefit riders. The carrier will verify records and financial justification.");
  }
  const steps=[
    ["Product & profile",product],["Residency & travel",residence],["Tobacco & nicotine",nicotine],["Height & weight",build],
    ["Vitals & labs",vitals],["Driving",driving],["Criminal history",criminal],["Medical history",medical],
    ["Prescriptions",medications],["Family history",family],["Review",review]
  ];
  function resultLabel(o) {
    if(o.status === "unavailable")return "Product unavailable for this request";
    if(o.status === "decline_screen")return "Outside this product's published screen";
    if(o.status !== "estimated")return "Manual underwriting review needed";
    if(o.kind === "final_expense")return o.benefitTier === "graded" ? "Graded benefit screen" : "Level benefit screen";
    return (o.displayClass||CLASS_LABELS[o.healthClass]||"Review")+(o.tobaccoBasis === "tobacco" ? " · Tobacco" : " · Non-tobacco");
  }
  function sourceText(s) {return s ? s.id+" · "+s.edition+(s.pages?.length ? " · PDF p. "+s.pages.join(", ") : " · Web reference") : "Information / evidence check";}
  function showResults() {
    const target=$("#results-content");target.replaceChildren();target.classList.remove("hidden");$("#step-content").classList.add("hidden");
    const out=Engine.run(state.productId,state),hero=node("section","result-hero");
    hero.appendChild(node("div","hero-label",out.carrier+" — "+out.product+" — "+out.route));hero.appendChild(node("h2",null,resultLabel(out)));
    paragraph(hero,out.status === "estimated" ? "Preliminary result from the modeled source criteria. Carrier records and the current application can change this estimate." : "A final health class or benefit tier is withheld. Review the reasons below with the carrier.","hero-meaning");
    paragraph(hero,out.confidence.level+" · Assessment date "+out.assessed+" · "+(out.age == null ? "Age unconfirmed" : "Carrier age "+out.age+" ("+out.ageBasis+" birthday)"),"hero-meaning");target.appendChild(hero);
    if(out.tableRating||out.flatExtra){const box=node("section","card");box.appendChild(node("h3",null,"Separate rating components"));if(out.tableRating)paragraph(box,"Build component: Table "+out.tableRating.label+(out.tableRating.extraPercent?" ("+out.tableRating.extraPercent+"% extra rating)":"")+". Other factors and the final table remain subject to underwriting.");if(out.flatExtra)paragraph(box,out.flatExtra.basis+". "+sourceText(out.flatExtra.source));target.appendChild(box);}
    const why=node("section","card");why.appendChild(node("h3",null,"Reasons and next steps"));
    if(!out.issues.length)paragraph(why,"All modeled screens are complete. No underwriting credit or better-class range has been assumed.");
    const ul=node("ul","decision-list");out.issues.forEach(i=>{const li=node("li");li.appendChild(node("span",null,i.text));li.appendChild(node("small","source-reference",sourceText(i.source)));ul.appendChild(li);});why.appendChild(ul);out.notes.forEach(t=>paragraph(why,t));target.appendChild(why);
    if(out.kind === "final_expense" && out.status === "estimated"){const tier=node("section","card");tier.appendChild(node("h3",null,"Benefit design"));paragraph(tier,out.benefitTier === "graded" ? "The supplied guide pays 110% of premiums for death in the first two years, then the face amount, subject to policy terms. This is a benefit design, not a preferred health class." : "The source's Level benefit design provides the full benefit from the first year, subject to policy terms. This is separate from premium and tobacco classification.");target.appendChild(tier);}
    const factors=node("section","card");factors.appendChild(node("h3",null,"How the factors limit this screen"));
    const factorTable=node("table","domain-table"),factorHead=node("thead"),fh=node("tr");["Factor","Recorded evidence","Modeled limit"].forEach(t=>fh.appendChild(node("th",null,t)));factorHead.appendChild(fh);factorTable.appendChild(factorHead);const fb=node("tbody");
    Object.entries(out.domains).filter(([key])=>key!=="classes").forEach(([key,v])=>{const tr=node("tr"),label={build:"Height / weight",nicotine:"Tobacco / nicotine",vitals:"Blood pressure / cholesterol",family:"Family history",driving:"Driving",medical:"Medical"}[key]||key;
      tr.appendChild(node("td",null,label));const evidence=node("td",null,v.detail||("Weight used: "+v.weight+" lb; BMI "+v.bmi?.toFixed(2)));evidence.appendChild(node("small","source-reference",sourceText(v.source)));tr.appendChild(evidence);
      const limit=out.kind === "final_expense" ? key === "nicotine" ? out.tobaccoBasis === "non_tobacco" ? "Non-tobacco basis" : out.tobaccoBasis === "tobacco" ? "Tobacco basis" : "Tobacco basis needs review" : "Benefit screen / carrier review" : v.ceiling?CLASS_LABELS[v.ceiling]:"Carrier review";
      tr.appendChild(node("td",null,limit));fb.appendChild(tr);});factorTable.appendChild(fb);const factorScroll=node("div","table-scroll");factorScroll.appendChild(factorTable);factors.appendChild(factorScroll);target.appendChild(factors);
    const comparisons=Engine.compare(state);
    if(comparisons.length>1){const box=node("section","card");box.appendChild(node("h3",null,"Other products with the same coverage type and route"));paragraph(box,"Listed in carrier order. Term length, riders, price and availability still require confirmation; these are not ranked offers.");
      const table=node("table","domain-table"),head=node("tr");["Product","Screen result","Source scope"].forEach(t=>head.appendChild(node("th",null,t)));const th=node("thead");th.appendChild(head);table.appendChild(th);const body=node("tbody");
      comparisons.forEach(o=>{const tr=node("tr");tr.appendChild(node("td",null,o.carrier+" — "+o.product));tr.appendChild(node("td",null,resultLabel(o)));tr.appendChild(node("td",null,o.verification === "criteria" ? "Selected criteria reconciled" : "Carrier review"));body.appendChild(tr);});table.appendChild(body);const scroll=node("div","table-scroll");scroll.appendChild(table);box.appendChild(scroll);target.appendChild(box);}
    const refs=node("section","card");refs.appendChild(node("h3",null,"Source editions used"));out.sources.forEach(s=>{paragraph(refs,s.id+" · "+s.title+" · "+s.edition+(s.pages?.length ? " · Physical PDF pages "+s.pages.join(", ") : " · Web reference"));if(s.url){const a=node("a",null,"Carrier source");a.href=s.url;a.target="_blank";a.rel="noopener noreferrer";refs.appendChild(a);}});target.appendChild(refs);
    const actions=node("section","card");actions.append(button("Print this result",()=>window.print()),button("Delete saved answers and start over",reset));target.appendChild(actions);
    $("#btn-next").classList.add("hidden");$("#btn-back").textContent="← Edit answers";$("#btn-back").disabled=false;
  }
  function render() {
    const nav=$("#steps-nav");nav.replaceChildren();steps.forEach(([label],i)=>{const b=button((i+1)+". "+label,()=>{step=i;results=false;render();},"step-pill"+(i===step&&!results?" active":""));if(i===step&&!results)b.setAttribute("aria-current","step");nav.appendChild(b);});
    if(results){showResults();return;}
    $("#results-content").classList.add("hidden");$("#step-content").classList.remove("hidden");const target=$("#step-content");target.replaceChildren();
    if(migrationNotice)paragraph(target,"Your previous draft was imported. Select a product and reconfirm the new histories; earlier unchecked boxes and mild/control defaults are not treated as answers.","migration-notice");
    const card=node("section","card");card.appendChild(node("h2",null,steps[step][0]));steps[step][1](card);target.appendChild(card);
    $("#btn-back").disabled=step===0;$("#btn-back").textContent="← Back";$("#btn-next").classList.remove("hidden");$("#btn-next").textContent=step===steps.length-1?"Estimate →":"Next →";
  }
  function reset() {state=InterviewState.empty();step=0;results=false;migrationNotice=false;try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_KEY);}catch{}render();}
  function ack() {
    const gate=$("#ack-gate"),check=$("#ack-check"),accept=$("#ack-accept");let acknowledged=false;try{acknowledged=sessionStorage.getItem("hce_ack_v2")==="yes";}catch{}
    const surfaces=[$(".app-header"),$("#steps-nav"),$(".app-main"),$(".app-footer")];
    const set=open=>{gate.classList.toggle("hidden",!open);surfaces.forEach(s=>{s.inert=open;});};set(!acknowledged);
    check.addEventListener("change",()=>accept.disabled=!check.checked);
    accept.addEventListener("click",()=>{if(!check.checked)return;try{sessionStorage.setItem("hce_ack_v2","yes");sessionStorage.setItem("hce_ack_time_v2",new Date().toISOString());}catch{}set(false);$("#productId")?.focus();});
  }
  function printAck() {
    const popup=window.open("","_blank");if(!popup){toast("Allow the print window to open in this browser.");return;}
    popup.document.title="HealthClassEstimator acknowledgment";let accepted="Not recorded";try{accepted=sessionStorage.getItem("hce_ack_time_v2")||accepted;}catch{}
    popup.document.body.appendChild(node("h1",null,"Acknowledgment record"));popup.document.body.appendChild(node("p",null,"App version "+window.HCE_VERSION+" · Accepted: "+accepted));
    const card=$(".ack-card").cloneNode(true);card.querySelectorAll("button,input,.ack-contact-row,.ack-hint").forEach(n=>n.remove());popup.document.body.appendChild(card);popup.focus();popup.print();
  }
  function init() {
    try {const current=localStorage.getItem(STORAGE_KEY),old=localStorage.getItem(LEGACY_KEY);if(current||old){state=InterviewState.migrate(JSON.parse(current||old));migrationNotice=!!state.migrated;}}catch{migrationNotice=true;}
    $("#btn-next").addEventListener("click",()=>{if(step===steps.length-1)results=true;else step++;render();window.scrollTo(0,0);});
    $("#btn-back").addEventListener("click",()=>{if(results)results=false;else if(step>0)step--;render();window.scrollTo(0,0);});
    $("#btn-save").addEventListener("click",()=>{save();toast("Draft saved on this device.");});$("#btn-print-ack").addEventListener("click",printAck);
    // Reserve the actual fixed footer height, including wrapped mobile links.
    const footer=$(".app-footer"),fitFooter=()=>document.documentElement.style.setProperty("--footer-h",footer.getBoundingClientRect().height+"px");
    if(typeof ResizeObserver === "function")new ResizeObserver(fitFooter).observe(footer);
    window.addEventListener("resize",fitFooter);render();fitFooter();ack();
  }
  init();return {reset};
})();
