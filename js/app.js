/* Accessible, product-neutral intake; results come from Engine.profile. */
"use strict";
const App = (() => {
  const STORAGE_KEY="hce_state_v2", LEGACY_KEY="hce_state_v1", QUARANTINE_KEY="hce_state_v2_unreadable";
  const $=sel=>document.querySelector(sel);
  let state=InterviewState.empty(), step=0, results=false, migrationNotice=false, unreadableNotice=false, focusStepHeading=false;
  // True while another tab holds answers this one has not adopted: every keystroke here
  // saves, so the next answer typed would replace them. The two tabs cannot be merged.
  let staleAnswers=false;
  // A draft this build cannot read is copied here before anything overwrites it, so an
  // unreadable save costs a session of answers instead of all of them.
  let unpreserved=null, preserveWarned=false, keptDraftExpanded=false;
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
  function quarantine(raw,key) {
    let records=[];
    try{const held=JSON.parse(localStorage.getItem(QUARANTINE_KEY));if(Array.isArray(held))records=held.filter(r=>r&&typeof r.raw==="string");}catch{}
    records.push({key,raw,savedAt:new Date().toISOString()});
    try{localStorage.setItem(QUARANTINE_KEY,JSON.stringify(records));return true;}catch{return false;}
  }
  // A value that is not a plain object is as unreadable as text that will not parse.
  // Storage that refuses to be read has nothing to preserve, so it is not a lost draft.
  function loadStored(key) {
    let raw;try{raw=localStorage.getItem(key);}catch{return {};}
    if(!raw)return {};
    let parsed;try{parsed=JSON.parse(raw);}catch{return {unreadable:true,raw,key};}
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return {unreadable:true,raw,key};
    try{return {state:InterviewState.migrate(parsed)};}catch{return {unreadable:true,raw,key};}
  }
  // The kept draft is the applicant's own answers. They can read it and take it away here,
  // rather than being told it survived in a place they cannot reach.
  function keptDrafts() {
    try{const held=JSON.parse(localStorage.getItem(QUARANTINE_KEY));return Array.isArray(held)?held.filter(r=>r&&typeof r.raw==="string"):[];}catch{return [];}
  }
  function downloadKept() {
    const kept=keptDrafts();if(!kept.length)return;
    const text=kept.length===1?kept[0].raw:JSON.stringify(kept.map(r=>({savedAt:r.savedAt,key:r.key,draft:r.raw})),null,2);
    // A data: URL, not a Blob URL: the embedded copy runs under a strict Content-Security-Policy,
    // and taking the draft away must not depend on what that policy lets the page fetch.
    const link=node("a","visually-hidden");
    link.href="data:text/plain;charset=utf-8,"+encodeURIComponent(text);
    link.download="health-class-draft-kept-"+new Date().toISOString().slice(0,10)+".txt";
    document.body.appendChild(link);link.click();link.remove();
  }
  // Deleting a kept draft is the one action here that cannot be undone, so the list is
  // rewritten without that record and the key is removed once nothing is left: an empty
  // array would still tell a reader something is kept. The copy the applicant downloaded
  // is theirs; this only forgets the one in this browser.
  function deleteKept(index) {
    const kept=keptDrafts();if(index<0||index>=kept.length)return;
    const remaining=kept.filter((_,i)=>i!==index);
    try{
      if(remaining.length)localStorage.setItem(QUARANTINE_KEY,JSON.stringify(remaining));
      else localStorage.removeItem(QUARANTINE_KEY);
    }catch{toast("This browser would not let the kept draft be deleted.");return;}
    if(!remaining.length)unreadableNotice=false;
    toast("Kept draft deleted from this browser.");
    render();
    // The button that asked is gone with the render, so focus lands on what is left: the
    // panel when another draft is still kept, otherwise the heading it was shown above.
    const summary=$("#step-content details.kept-draft summary");
    if(summary){summary.focus();return;}
    const heading=$("#step-content h2");
    if(heading){heading.setAttribute("tabindex","-1");heading.focus();}
  }
  function keptDraftPanel(parent) {
    const kept=keptDrafts();if(!kept.length)return;
    const details=node("details","kept-draft");details.open=keptDraftExpanded;
    // A deletion re-renders this panel, so how far it was opened is carried across rather
    // than snapping shut on the draft that is still there.
    details.addEventListener("toggle",()=>{keptDraftExpanded=details.open;});
    details.appendChild(node("summary",null,"View or download the saved draft this build could not read"));
    kept.forEach((record,index)=>{
      details.appendChild(node("p","hint","Kept "+record.savedAt+" from "+record.key+"."));
      const id="kept-draft-"+index,label=node("label",null,"Draft text "+(index+1));label.htmlFor=id;
      const area=node("textarea","kept-draft-text");area.id=id;area.readOnly=true;area.rows=6;area.value=record.raw;
      details.append(label,area);
      // A single press must not cost the applicant their only copy, so the delete asks in
      // place. Until it is answered the text is still on screen, beside the download.
      const actions=node("div","kept-draft-actions"),ask=button("Delete this kept draft",()=>{
        const yes=button("Delete permanently",()=>deleteKept(index),"btn btn-primary");
        const no=button("Keep it",()=>{actions.replaceChildren(ask);ask.focus();});
        actions.replaceChildren(node("p","hint","This removes the kept copy from this browser and cannot be undone. Download it first if you may need it."),yes,no);
        yes.focus();
      });
      actions.appendChild(ask);details.appendChild(actions);
    });
    details.appendChild(button("Download the kept draft",downloadKept));
    parent.appendChild(details);
  }
  function keepUnreadable(found) {
    // If the copy cannot be made and the draft is the one save() would overwrite, saving
    // waits: overwriting here is the one thing that cannot be undone from this page.
    if(!quarantine(found.raw,found.key)&&found.key===STORAGE_KEY)unpreserved={raw:found.raw,key:found.key};
    unreadableNotice=true;
  }
  function loadDraft() {
    const current=loadStored(STORAGE_KEY);
    if(current.unreadable){keepUnreadable(current);const legacy=loadStored(LEGACY_KEY);if(legacy.unreadable)keepUnreadable(legacy);return legacy.state||null;}
    if(current.state)return current.state;
    const legacy=loadStored(LEGACY_KEY);
    if(legacy.unreadable){keepUnreadable(legacy);return null;}
    return legacy.state||null;
  }
  function save() {
    if(unpreserved&&quarantine(unpreserved.raw,unpreserved.key))unpreserved=null;
    if(unpreserved){if(!preserveWarned){preserveWarned=true;toast("A saved draft could not be copied aside, so it was not overwritten. Copy what you need from this browser's storage before saving again.");}return;}
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));if(staleAnswers){staleAnswers=false;drawDraftNotice();}}catch{toast("This browser could not save the draft.");}
  }
  // Two open tabs hold two interviews, and nothing here can merge them. So a tab that is
  // behind says so and offers the saved draft, instead of reloading answers underneath the
  // person typing them or leaving two tabs that silently disagree. The region is in the
  // markup from the start and is emptied rather than hidden, so a reader announces it when
  // it fills; `:empty` keeps it out of the layout until there is something to say.
  function sameAnswers(a,b) {
    // Normalised, because the stored copy and this tab's copy can differ in keys that are
    // not answers (`migrated`, a schema field) and warning about those would be noise.
    try{return JSON.stringify(InterviewState.migrate(a))===JSON.stringify(InterviewState.migrate(b));}catch{return false;}
  }
  function drawDraftNotice() {
    const host=$("#draft-notice");if(!host)return;
    if(!staleAnswers){host.replaceChildren();return;}
    const actions=node("div","draft-notice-actions");
    actions.append(
      button("Use the answers saved in the other tab",adoptSaved,"btn btn-primary"),
      button("Keep this tab's answers",()=>{staleAnswers=false;drawDraftNotice();})
    );
    host.replaceChildren(
      node("p",null,"Another tab saved different answers to this draft. Nothing here can merge the two, so this tab still shows its own answers, and the next answer typed here will replace the other tab's."),
      actions
    );
  }
  function adoptSaved() {
    const saved=loadDraft();
    staleAnswers=false;
    if(!saved){drawDraftNotice();toast("The answers saved in the other tab are no longer there. This tab's answers are unchanged.");return;}
    state=saved;migrationNotice=!!state.migrated;focusStepHeading=!results;
    drawDraftNotice();render();
  }
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
  function confirmed(parent,label,key,opts={}) {return field(parent,label,key,[["yes","Yes, confirmed"],["no","Still incomplete"],["unknown","Unsure"]],opts);}
  function number(parent,label,key,opts={}) {return field(parent,label,key,null,{type:"number",min:0,step:"any",...opts});}
  function date(parent,label,key,opts={}) {return field(parent,label,key,null,{type:"date",...opts});}
  function text(parent,label,key,opts={}) {return field(parent,label,key,null,opts);}
  function row(parent) {const r=node("div","field-row");parent.appendChild(r);return r;}
  // A horizontally scrollable table needs to be reachable by keyboard and to
  // carry a name; both are required before the region is announced.
  function labelledRegion(label,table) {const region=node("div","table-scroll");region.setAttribute("role","region");region.setAttribute("tabindex","0");region.setAttribute("aria-label",label);region.appendChild(table);return region;}
  function paragraph(parent,text,cls="card-sub") {parent.appendChild(node("p",cls,text));}
  function button(label,fn,cls="btn btn-ghost") {const b=node("button",cls,label);b.type="button";b.addEventListener("click",fn);return b;}
  // A medicine's related-condition link is only meaningful while that diagnosis is listed.
  // Once no condition carries the id, the link is cleared so the select and the stored answer
  // agree, and the engine asks for the link to be made again.
  function unlinkMedications(conditionId) {
    if(!conditionId||state.conditions.some(c=>c.id===conditionId))return;
    state.medications.forEach(m=>{if(m.conditionId===conditionId)m.conditionId="";});
  }
  function listEditor(parent,key,label,renderRow) {
    state[key].forEach((entry,i)=>{
      const card=node("fieldset","history-entry"),legend=node("legend",null,label+" "+(i+1));card.appendChild(legend);
      const f=(title,k,options=null,opts={})=>field(card,title,k,options,{obj:entry,id:key+"-"+i+"-"+k,...opts});
      renderRow(card,entry,f,i);
      card.appendChild(button("Remove this entry",()=>{const [removed]=state[key].splice(i,1);if(key==="conditions")unlinkMedications(removed?.id);save();render();}));parent.appendChild(card);
    });
    parent.appendChild(button("Add "+label.toLowerCase(),()=>{state[key].push({});save();render();}));
  }
  function screen(parent,label,key,listKey,editor) {
    yn(parent,label,key,{render:true});
    if(state[key] === "yes" || state[listKey].length) editor();
  }
  // Health-history intake is deliberately not tied to an insurer, plan or underwriting route.
  function profile(c) {
    paragraph(c,"Enter the applicant's background. No insurer, policy product or underwriting route is selected or inferred.");
    date(c,"Date of birth","dob");
    field(c,"Sex recorded for the application","sex",[["male","Male"],["female","Female"],["unknown","Prefer to review / unsure"]]);
    field(c,"State of residence","state",states);
    number(c,"Coverage requested ($), if known","faceAmount",{min:1,step:1000});
    field(c,"Main purpose of coverage","policyPurpose",[["income","Replace earned income"],["mortgage","Mortgage / debt"],["family","Family support"],["estate","Estate planning"],["business","Business"],["final_expense","Final expenses"],["other","Other"]],{render:true});
    if(state.policyPurpose === "income")number(c,"Annual earned income ($)","income");
    number(c,"Existing life insurance ($)","existingCoverage");
    yn(c,"Will this coverage replace an existing life policy?","replacement");
    yn(c,"Will the premiums be financed or paid with a loan?","financing");
    field(c,"Work status","employment",[["employed","Employed"],["spouse","Nonworking spouse"],["student","Full-time student"],["seeking","Seeking work"],["retired","Retired"],["other","Other"]]);
    text(c,"Occupation (or enter none)","occupation");
    yn(c,"Does your work involve hazardous duties?","hazardousOccupation");
    yn(c,"Do you fly as a private pilot or crew member?","aviation");
    yn(c,"Do you take part in hazardous sports, racing, scuba or climbing, or plan to?","hazardousSports");
    yn(c,"Are you serving, or under orders to serve, in a hazardous military area or war zone?","militaryDeployment");
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
    paragraph(c,"Report all nicotine and tobacco products. Any occasional-use exception depends on the eventual insurer and supporting evidence; this tool assumes none.");
  }
  function build(c) {
    const r=row(c);number(r,"Height in inches (5 ft 10 in = 70)","heightIn",{min:36,max:100,step:0.5});number(r,"Current weight (lb)","weightLb",{min:30,max:1000});
    field(c,"Weight change in the past 12 months","weightChange",[["none","No meaningful change"],["loss","Lost weight"],["gain","Gained weight"],["unknown","Unsure"]],{render:true});
    if(["loss","gain"].includes(state.weightChange)){number(c,"Weight before the change (lb)","priorWeightLb");date(c,"When did the change occur?","weightChangeDate");field(c,"Reason for the change","weightCause",[["intentional","Intentional diet / exercise / weight-loss medicine"],["illness","Illness"],["pregnancy","Pregnancy"],["surgery","Surgery"],["unknown","Unexplained / unsure"]]);date(c,"Since when has your weight been stable?","stableSince");}
    paragraph(c,"Weight and recent changes are recorded without applying any insurer-specific build chart.");
  }
  function vitals(c) {
    paragraph(c,"Use documented readings. If you do not have the required evidence, leave it unanswered; the result will identify what is needed.");
    const r=row(c);number(r,"Blood pressure — top (systolic)","bpSys",{min:60,max:260});number(r,"Blood pressure — bottom (diastolic)","bpDia",{min:30,max:160});
    date(c,"Date of most recent blood-pressure reading","bpDate");field(c,"What do the entered blood-pressure values represent?","bpBasis",[["current","One current reading"],["average_2yr","Documented two-year average"],["unknown","Unsure"]]);
    yn(c,"Are you treated for high blood pressure?","bpTreatment");yn(c,"Has your clinician described your blood pressure as well controlled?","bpControl");
    const l=row(c);number(l,"Total cholesterol (mg/dL)","cholTotal",{min:40,max:700});number(l,"HDL cholesterol (mg/dL)","cholHdl",{min:5,max:200});
    date(c,"Date of most recent cholesterol test","cholDate");field(c,"What do the entered cholesterol values represent?","cholBasis",[["current","One current test"],["average_12mo","Average of readings over 12 months"],["average_2yr","Documented two-year average"],["unknown","Unsure"]]);yn(c,"Are you treated for high cholesterol?","cholTreatment");
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
    paragraph(c,"A charge, arrest and conviction are different events. Report each accurately; no insurer-specific exclusion is assigned here.");
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
      const previousId=r.id;
      f("Condition","id",conditions,{render:true,onChange:value=>{r.name=conditions.find(x=>x[0]===value)?.[1]||"";if(previousId!==value)unlinkMedications(previousId);}});
      if(r.id === "other"||r.legacyDetails)f("Diagnosis name / description","name");
      if(r.legacyDetails)paragraph(card,"This diagnosis was imported. Reconfirm the details below; old mild/control defaults are not accepted.");
      f("Date first diagnosed","diagnosisDate",null,{type:"date"});f("Current status","status",[["current","Current"],["resolved","Resolved"],["unknown","Unsure"]],{render:true});
      if(r.status === "resolved")f("Date treatment ended","treatmentEnd",null,{type:"date"});
      f("Treatment and follow-up (enter none if none)","treatment",null,{type:"textarea"});f("Any complications?","complications",yesNo);f("Any recurrence?","recurrence",yesNo);f("Hospitalized for this condition?","hospitalized",yesNo,{render:true});
      if(r.hospitalized === "yes")f("Most recent related hospitalization","hospitalDate",null,{type:"date"});
      if(r.id === "cancer")f("Cancer type","cancerType",[["basal_cell","Basal cell skin"],["squamous_cell","Squamous cell skin"],["breast","Breast"],["colon","Colon"],["prostate","Prostate"],["leukemia","Leukemia"],["other","Another type"],["unknown","Unsure"]]);
      if(r.id === "lupus")f("Lupus type","lupusType",[["systemic","Systemic (SLE)"],["discoid","Discoid / skin only"],["other","Another type"],["unknown","Unsure"]]);
      if(r.id === "diabetes"){f("Measured A1c","a1c",null,{type:"number",min:1,max:25,step:0.1});f("A1c test date","a1cDate",null,{type:"date"});f("Use insulin?","insulin",yesNo);}
      if(r.id === "atrial_fibrillation"){f("Diagnosed with chronic AF within the last 24 months?","chronic24mo",yesNo);f("Take a daily anticoagulant / blood thinner?","dailyAnticoagulant",yesNo);}
    }));
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
    paragraph(c,"Confirm the information before viewing the general health profile. It does not use carrier, product, underwriting-route or benefit-tier criteria.");
    const details=node("div");details.id="review-details";details.setAttribute("aria-live","polite");
    function refreshDetails() {
      const out=Engine.profile(state);
      details.replaceChildren();
      if(out.missing.length){const ul=node("ul");out.missing.forEach(t=>ul.appendChild(node("li",null,t)));details.append(node("h3",null,"Details still needed"),ul);}
    }
    confirmed(c,"Are your answers complete and accurate, including every condition, prescription and relevant event?","historyConfirmed",{onChange:refreshDetails});
    c.appendChild(details);refreshDetails();
    paragraph(c,"Only an insurer can determine an actual insurance health class, eligibility or benefit design.");
  }
  const steps=[
    ["Applicant profile",profile],["Residency & travel",residence],["Tobacco & nicotine",nicotine],["Height & weight",build],
    ["Vitals & labs",vitals],["Driving",driving],["Criminal history",criminal],["Medical history",medical],
    ["Prescriptions",medications],["Family history",family],["Review",review]
  ];
  function showResults() {
    const target=$("#results-content");target.replaceChildren();target.classList.remove("hidden");$("#step-content").classList.add("hidden");
    const out=Engine.profile(state),hero=node("section","result-hero");
    hero.appendChild(node("div","hero-label","Product-neutral health history screening"));
    const heading=out.status === "needs_details" ? "Additional information needed" :
      out.status === "review" ? "Disclosed history needs individual underwriting review" :
      "Reported health profile collected";
    const resultHeading=node("h2",null,heading);
    resultHeading.id="result-heading";resultHeading.setAttribute("tabindex","-1");hero.appendChild(resultHeading);
    paragraph(hero,"No insurer, product, or route was selected. No carrier-specific health class, approval, rating, price, benefit tier or exclusion is inferred.","hero-meaning");
    paragraph(hero,"Assessment date "+out.assessed+(out.age == null?" · Age unconfirmed":" · Age "+out.age)+" · "+out.completeness,"hero-meaning");
    target.appendChild(hero);

    const overview=node("section","card");overview.appendChild(node("h3",null,"Recorded health measurements"));
    const ul=node("ul","decision-list");
    for(const item of out.measurements)ul.appendChild(node("li",null,item));
    if(!out.measurements.length)ul.appendChild(node("li",null,"No measurements were entered."));
    overview.appendChild(ul);target.appendChild(overview);

    const details=node("section","card");details.appendChild(node("h3",null,"Health history requiring attention"));
    if(!out.concerns.length)paragraph(details,"No specified health-history flags have been reported in the completed answers. This is not a finding of good health or a predicted health class.");
    const flags=node("ul","decision-list");out.concerns.forEach(item=>flags.appendChild(node("li",null,item)));details.appendChild(flags);target.appendChild(details);
    if(out.missing.length){
      const missing=node("section","card");missing.appendChild(node("h3",null,"Information still needed"));
      const list=node("ul","decision-list");out.missing.forEach(item=>list.appendChild(node("li",null,item)));missing.appendChild(list);target.appendChild(missing);
    }
    if(out.otherReview.length){
      const other=node("section","card");other.appendChild(node("h3",null,"Nonmedical disclosures to review"));
      const list=node("ul","decision-list");out.otherReview.forEach(item=>list.appendChild(node("li",null,item)));other.appendChild(list);target.appendChild(other);
    }
    const disclaimer=node("section","card");disclaimer.appendChild(node("h3",null,"How to use this summary"));
    paragraph(disclaimer,"This is a general, self-reported pre-underwriting profile, not a validated health-class prediction. Underwriting class and eligibility can only be evaluated for a specific current insurance application by the insurer.");
    paragraph(disclaimer,"An insurer may obtain additional medical and nonmedical evidence and can reach a different result. Do not use this summary to promise an underwriting outcome.");target.appendChild(disclaimer);
    const actions=node("section","card");actions.append(button("Print this summary",()=>window.print()),button("Delete saved answers and start over",reset));target.appendChild(actions);
    $("#btn-next").classList.add("hidden");$("#btn-back").textContent="← Edit answers";$("#btn-back").disabled=false;resultHeading.focus();
  }
  function render() {
    // A question that changes the step rebuilds the step, and the control that had focus with it.
    // Its id survives the rebuild, so the keyboard user is put back on that field rather than on
    // the document (the step heading is focused on purpose when returning from results, so skip then).
    const host=$("#step-content"),active=document.activeElement,keepFocus=!focusStepHeading&&active&&active.id&&host.contains(active)?active.id:"";
    const nav=$("#steps-nav");nav.replaceChildren();steps.forEach(([label],i)=>{const b=button((i+1)+". "+label,()=>{step=i;results=false;render();},"step-pill"+(i===step&&!results?" active":""));if(i===step&&!results)b.setAttribute("aria-current","step");nav.appendChild(b);});
    if(results){showResults();return;}
    $("#results-content").classList.add("hidden");$("#step-content").classList.remove("hidden");const target=$("#step-content");target.replaceChildren();
    if(unreadableNotice){paragraph(target,"A saved draft on this device could not be read. It has been kept in this browser's storage, and this interview has started fresh.","migration-notice");keptDraftPanel(target);}
    if(migrationNotice)paragraph(target,"Your previous draft was imported. Reconfirm the histories; former carrier and product choices are ignored, and earlier unchecked boxes and defaults are not treated as answers.","migration-notice");
    const card=node("section","card"),cardHeading=node("h2",null,steps[step][0]);card.appendChild(cardHeading);steps[step][1](card);target.appendChild(card);
    if(focusStepHeading){focusStepHeading=false;cardHeading.setAttribute("tabindex","-1");cardHeading.focus();}
    $("#btn-back").disabled=step===0;$("#btn-back").textContent="← Back";$("#btn-next").classList.remove("hidden");$("#btn-next").textContent=step===steps.length-1?"Estimate →":"Next →";
    if(keepFocus){const again=document.getElementById(keepFocus);if(again)again.focus({preventScroll:true});}
  }
  function reset() {state=InterviewState.empty();step=0;results=false;migrationNotice=false;staleAnswers=false;try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(LEGACY_KEY);}catch{}drawDraftNotice();render();}
  function ack() {
    const gate=$("#ack-gate"),check=$("#ack-check"),accept=$("#ack-accept");let acknowledged=false;try{acknowledged=sessionStorage.getItem("hce_ack_v2")==="yes";}catch{}
    const surfaces=[$(".app-header"),$("#steps-nav"),$(".app-main"),$(".app-footer")];
    const set=open=>{gate.classList.toggle("hidden",!open);surfaces.forEach(s=>{s.inert=open;});};set(!acknowledged);
    // aria-modal promises managed focus: announce and enter the dialog, keep Tab
    // inside it, and hand focus to the first question once it is accepted.
    const focusables=()=>[...gate.querySelectorAll("a[href],button:not([disabled]),input:not([disabled]),select,textarea")].filter(n=>n.offsetParent!==null);
    gate.addEventListener("keydown",event=>{
      if(event.key!=="Tab")return;
      const items=focusables();if(!items.length)return;
      const first=items[0],last=items[items.length-1],active=document.activeElement;
      if(event.shiftKey&&(active===first||!gate.contains(active))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(active===last||!gate.contains(active))){event.preventDefault();first.focus();}
    });
    if(!acknowledged)$("#ack-title").focus();
    check.addEventListener("change",()=>accept.disabled=!check.checked);
    accept.addEventListener("click",()=>{if(!check.checked)return;try{sessionStorage.setItem("hce_ack_v2","yes");sessionStorage.setItem("hce_ack_time_v2",new Date().toISOString());}catch{}set(false);$("#dob")?.focus();});
  }
  function printAck() {
    const popup=window.open("","_blank");if(!popup){toast("Allow the print window to open in this browser.");return;}
    popup.document.title="HealthClassEstimator acknowledgment";let accepted="Not recorded";try{accepted=sessionStorage.getItem("hce_ack_time_v2")||accepted;}catch{}
    popup.document.body.appendChild(node("h1",null,"Acknowledgment record"));popup.document.body.appendChild(node("p",null,"App version "+window.HCE_VERSION+" · Accepted: "+accepted));
    const card=$(".ack-card").cloneNode(true);card.querySelectorAll("button,input,.ack-actions,.ack-contact-row,.ack-hint").forEach(n=>n.remove());popup.document.body.appendChild(card);popup.focus();popup.print();
  }
  function init() {
    const remembered=loadDraft();
    if(remembered){state=remembered;migrationNotice=!!state.migrated;}
    // `storage` fires only in the other documents, so it is the only news a page gets of a
    // draft written elsewhere. Two keys are followed, for two different reasons. The
    // quarantine key: a panel on screen would otherwise keep offering a draft that was
    // deleted in another tab, and only a tab already showing the notice re-renders, so an
    // unrelated page is not rebuilt by somebody else's cleanup. The saved-draft key: a
    // draft saved in another tab is newer than the answers here, and this tab says so
    // rather than adopting or discarding it silently. A removal is not newer answers, so
    // it only takes down a warning about a draft that is no longer there, and an unreadable
    // value cannot be merged with anything, so it is not judged here.
    window.addEventListener("storage",event=>{
      if(event.key===STORAGE_KEY){
        if(event.newValue==null){
          if(staleAnswers){staleAnswers=false;drawDraftNotice();}
          return;
        }
        let saved;try{saved=JSON.parse(event.newValue);}catch{return;}
        if(!saved||typeof saved!=="object"||Array.isArray(saved))return;
        if(sameAnswers(saved,state))return;
        staleAnswers=true;drawDraftNotice();return;
      }
      if(event.key!==QUARANTINE_KEY&&event.key!==null)return;
      if(!unreadableNotice)return;
      if(!keptDrafts().length)unreadableNotice=false;
      render();
    });
    // The frame is not the window: an embedder can make this document's viewport far
    // taller than the window it is shown in (Streamlit's `st.iframe(..., height=2400)`
    // does), and a footer positioned against the viewport then lands at the bottom of a
    // document the visitor cannot see the whole of — measured on the deployed app on
    // 2026-10-17, the interview's Next button sat 1,361px below the fold. So the app
    // takes the height of the window it is actually shown in — the embedding window
    // where the frame can read it, a plausible 800px where it cannot — and scrolls
    // inside itself; the stylesheet turns that into the window-shaped panel the embedder
    // should have made. A 746px website frame, a phone or a browser tab never matches.
    const root=document.documentElement;
    const fitToWindow=()=>{
      if(window.self===window.top||window.innerHeight<=1400){root.classList.remove("oversized-frame");return;}
      let band=Math.min(window.innerHeight,800);
      try {
        const space=window.parent.innerHeight-window.frameElement.getBoundingClientRect().top-8;
        if(isFinite(space))band=space;
      } catch {}
      root.style.setProperty("--window-band",Math.max(240,Math.min(window.innerHeight,band))+"px");
      root.classList.add("oversized-frame");
    };
    // A step change returns to the top of the tool, so the way forward is never left
    // where the previous question's answers were: the panel's own scroll position when
    // the app is a panel, the window's when it is a document of its own.
    const backToTop=()=>{if(root.classList.contains("oversized-frame"))document.body.scrollTop=0;else window.scrollTo(0,0);};
    $("#btn-next").addEventListener("click",()=>{if(step===steps.length-1)results=true;else step++;render();backToTop();});
    $("#btn-back").addEventListener("click",()=>{if(results){results=false;focusStepHeading=true;}else if(step>0)step--;render();backToTop();});
    $("#btn-save").addEventListener("click",()=>{save();toast("Draft saved on this device.");});$("#btn-print-ack").addEventListener("click",printAck);
    // Reserve the actual fixed footer height, including wrapped mobile links.
    const footer=$(".app-footer"),fitFooter=()=>document.documentElement.style.setProperty("--footer-h",footer.getBoundingClientRect().height+"px");
    if(typeof ResizeObserver === "function")new ResizeObserver(fitFooter).observe(footer);
    window.addEventListener("resize",fitFooter);window.addEventListener("resize",fitToWindow);
    fitToWindow();render();fitFooter();ack();
  }
  init();return {reset};
})();
