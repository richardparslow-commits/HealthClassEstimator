"use strict";
const fs=require("fs"),path=require("path"),vm=require("vm"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const ctx=vm.createContext({Date,console});
vm.runInContext(["rules","state","engine"].map(n=>fs.readFileSync(path.join(root,"js",n+".js"),"utf8")).join("\n")+"\nglobalThis.api={Engine,InterviewState,PRODUCT_RULES,BUILD_CHARTS};",ctx);
const {Engine,InterviewState,PRODUCT_RULES,BUILD_CHARTS}=ctx.api;
const asOf="2026-10-08";
const base={...InterviewState.empty(),productId:"banner_opterm",dob:"1991-10-08",sex:"male",state:"TX",faceAmount:500000,termYears:20,existingCoverage:0,existingCarrierCoverage:0,policyPurpose:"income",income:120000,replacement:"no",financing:"no",employment:"employed",occupation:"Office worker",hazardousOccupation:"no",aviation:"no",hazardousSports:"no",militaryDeployment:"no",forestersDeployment:"no",citizenship:"citizen",usResident:"yes",usSince:"1991-10-08",intentStay:"yes",foreignResidence:"no",travelHistory:"no",healthInsurance:"yes",nicotineHistory:"never",heightIn:70,weightLb:165,weightChange:"none",bpSys:120,bpDia:78,bpDate:"2026-09-01",bpBasis:"average_2yr",bpTreatment:"no",bpControl:"yes",cholTotal:190,cholHdl:60,cholDate:"2026-09-01",cholBasis:"average_2yr",cholTreatment:"no",medicalHistory:"no",medicalComplete:"yes",hospitalHistory:"no",surgeryHistory:"no",pendingCare:"no",activeSymptoms:"no",oxygen:"no",dialysis:"no",adlAssistance:"no",careFacility:"no",homeHealth:"no",terminalIllness:"no",substanceHistory:"no",marijuana:"none",priorInsuranceAdverse:"no",disabled:"no",medicationHistory:"no",medicationsComplete:"yes",drivingHistory:"no",drivingComplete:"yes",licenseStatus:"valid",criminalHistory:"no",criminalComplete:"yes",incarcerated:"no",pendingCharges:"no",probationCurrent:"no",paroleCurrent:"no",outstandingRestitution:"no",familyHistory:"no",familyComplete:"yes",historyConfirmed:"yes"};
const clone=x=>JSON.parse(JSON.stringify(x));
const run=(id="banner_opterm",changes={})=>Engine.run(id,{...clone(base),...changes,productId:id},{asOf});
let checks=0;
function equal(actual,expected,label){assert.equal(actual,expected,label);checks++;}
function ok(actual,label){assert.ok(actual,label);checks++;}
function review(id,changes,label){const o=run(id,changes);equal(o.status,"manual_review",label);equal(o.healthClass,null,label+" withholds class");return o;}
const family=(member,relation,deathAge,disease="cardiovascular",extra={})=>({member,relation,diagnosisAge:45,death:"yes",deathAge,disease,sex:"female",...extra});
const criminal=(extra={})=>({type:"felony",offense:"Theft",date:"2016-01-01",convictionDate:"2016-02-01",disposition:"convicted",jail:"no",probation:"yes",probationEnd:"2020-02-01",parole:"no",...extra});
const condition=(id,extra={})=>({id,name:id,diagnosisDate:"2020-01-01",status:"current",treatment:"Documented treatment",complications:"no",recurrence:"no",hospitalized:"no",...extra});
const rx=(name,conditionId,extra={})=>({name,conditionId,indication:conditionId,dose:"As prescribed daily",current:"yes",start:"2020-01-01",lastFill:"2026-09-01",...extra});
const cigar={product:"cigar",lastDate:asOf,current:"yes",perMonth:1,perYear:12};
function smoke(extra={}){return {nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[{product:"cigarette",lastDate:asOf,current:"yes",packsPerDay:0.5}],...extra};}
// Audit P1: missing answers, ignored review flags and optimistic ranges.
equal(run().healthClass,"preferred_plus","B-FIELD pp.4–7 healthy explicit history");
equal(Engine.run("banner_opterm",{}, {asOf}).status,"manual_review","Empty interview cannot receive a favorable class");
equal(Engine.run("banner",base,{asOf}).healthClass,null,"Carrier alone is not product identity");
for(const key of ["dob","sex","state","faceAmount","medicalHistory","criminalHistory","probationCurrent","familyHistory","drivingHistory","usSince","citizenship","nicotineHistory","medicationHistory","historyConfirmed","medicalComplete","familyComplete","drivingComplete","criminalComplete","medicationsComplete"]){review("banner_opterm",{[key]:""},"Missing "+key);review("banner_opterm",{[key]:"unknown"},"Unknown "+key);}
review("banner_opterm",{historyConfirmed:"no"},"Not confirmed is incomplete");
review("banner_opterm",{weightChange:"loss",priorWeightLb:190,weightChangeDate:"2026-09-01",weightCause:"unknown"},"Unexplained loss governs outcome");
let o=run("banner_opterm",{weightLb:280,bpSys:150,bpDia:93,cholTotal:280,cholHdl:36});
equal(o.healthClass,"standard","All limiting criteria intersect at Standard");equal(o.range.low,"standard","No unsupported Preferred Plus range endpoint");equal(o.range.high,"standard","Range matches jointly supported result");
review("banner_opterm",{bpSys:200,bpDia:110},"Outside vitals are reviewed, not a guessed table");
review("banner_opterm",{bpBasis:"current"},"Banner requires two-year BP average");
// Family disease/relationship/age thresholds are carrier specific.
equal(run("banner_opterm",{familyHistory:"yes",family:[family("mother","parent",59)]}).healthClass,"standard_plus","B-FIELD one parental death excludes Preferred");
equal(run("banner_opterm",{familyHistory:"yes",family:[family("brother","sibling",59)]}).healthClass,"preferred","B-FIELD sibling-only death may support Preferred");
review("banner_opterm",{familyHistory:"yes",family:[family("mother","parent",59),family("father","parent",58)]},"B-FIELD both parents fail Standard too");
equal(run("banner_opterm",{familyHistory:"yes",family:[family("mother","parent",59,"cancer",{cancerType:"colon"})]}).healthClass,"preferred_plus","Banner cancer rule not generalized to other carriers");
equal(run("foresters_yourterm_med",{familyHistory:"yes",family:[family("mother","parent",64)]}).healthClass,"standard_plus","D152 p.9 parent death <65 vs <60");
equal(run("foresters_yourterm_med",{familyHistory:"yes",family:[family("mother","parent",65)]}).healthClass,"preferred_plus","D152 exact age65 does not trigger <65");
equal(run("moo_full",{familyHistory:"yes",family:[family("mother","parent",59)]}).healthClass,"standard","D282 p.13 Standard Plus no longer permits one early death");
equal(run("moo_full",{dob:"1966-10-08",familyHistory:"yes",family:[family("mother","parent",59)]}).healthClass,"preferred_plus","MOO disregards at applicant60");
equal(run("moo_full",{familyHistory:"yes",family:[family("mother","parent",59,"cancer",{cancerType:"ovarian"})]}).healthClass,"preferred_plus","MOO opposite-sex gender-specific cancer exception");
equal(run("transamerica_super",{familyHistory:"yes",family:[family("mother","parent",59,"cancer",{cancerType:"colon"})]}).healthClass,"standard_plus","D370 listed parental cancer death");
review("foresters_yourterm_med",{familyHistory:"yes",family:[family("mother","parent",null)]},"Unknown relative death age withholds favorable class");
// Exact driving event windows and distinct Foresters products.
const violations=[{type:"minor",date:"2022-01-01"},{type:"minor",date:"2022-02-01"}];
equal(run("foresters_yourterm_med",{drivingHistory:"yes",driving:violations}).healthClass,"preferred","D152 Your Term <2 moving events in5yrs");
equal(run("foresters_advantage_med",{drivingHistory:"yes",driving:violations}).healthClass,"preferred_plus","D152 AP II <3 events in5yrs");
review("foresters_yourterm_med",{drivingHistory:"yes",driving:Array.from({length:10},(_,i)=>({type:"minor",date:`2026-01-${String(i+1).padStart(2,"0")}`}))},"Ten violations cannot silently pass Standard");
review("banner_opterm",{drivingHistory:"yes",driving:[{type:"dui",date:"2019-01-01"},{type:"dui",date:"2020-01-01"}]},"Repeated DUIs retained independently");
equal(run("banner_beyondterm",{drivingHistory:"yes",driving:[{type:"dui",date:"2024-10-08"}]}).status,"decline_screen","D077 requires single DUI >2yrs");
equal(run("corebridge_legacy",{dob:"1966-10-08",faceAmount:25000,drivingHistory:"yes",driving:[{type:"dui",date:"2026-01-01"}]}).status,"decline_screen","Corebridge DUI24month gate independent of vitals");
equal(run("transamerica_super",{drivingHistory:"yes",driving:[{type:"dui",date:"2026-01-01"}],bpSys:""}).status,"decline_screen","Known DUI exclusion governs with other missing info");
o=review("transamerica_super",{drivingHistory:"yes",driving:[{type:"dui",date:"2025-01-01"}]},"TA recent DUI requires flat-extra review");ok(o.flatExtra,"TA flat extra separate from health class");
equal(run("uhl_otherterm",{drivingHistory:"yes",driving:[{type:"dui",date:"2023-01-01"}]}).status,"decline_screen","UHL Part B five-year DUI");
equal(run("uhl_simple20",{drivingHistory:"yes",driving:[{type:"dui",date:"2023-01-01"}]}).status,"manual_review","UHL Part A doesn't inherit Part B DUI exclusion");
// D152 p.5: the deployment exclusion requires the stated geography/notice.
review("foresters_yourterm_med",{militaryDeployment:"yes"},"Hazardous duties alone require review, not the geographic deployment exclusion");
equal(run("foresters_yourterm_med",{forestersDeployment:"yes"}).status,"decline_screen","Foresters' explicit deployment screen");
review("foresters_yourterm_med",{forestersDeployment:""},"Foresters deployment history needs an explicit answer");
// Current and completed criminal status, not a shared anonymous note.
for(const id of ["foresters_yourterm_med","transamerica_super","fg_quantum"]){equal(run(id,{probationCurrent:"yes"}).status,"decline_screen",id+" current probation");}
equal(run("fg_quantum",{criminalHistory:"yes",criminal:[criminal({probationEnd:"2026-04-08"})]}).status,"decline_screen","D141 release in12mo");
equal(run("foresters_yourterm_med",{criminalHistory:"yes",criminal:[criminal({probationEnd:"2026-04-08"})]}).status,"decline_screen","D152 no-jail probation wait1yr");
equal(run("foresters_yourterm_med",{criminalHistory:"yes",criminal:[criminal({jail:"yes",jailEnd:"2020-01-01",probation:"no",parole:"yes",paroleEnd:"2022-01-01"})]}).status,"decline_screen","D152 jail+parole wait5yr");
review("moo_full",{criminalHistory:"yes",criminal:[criminal({convictionDate:"2021-01-01"})]},"MOO felony10yrs excludes favorable-class assumption");
review("corebridge_legacy",{dob:"1966-10-08",faceAmount:25000,criminalHistory:"yes",criminal:[criminal({type:"arrest",disposition:"dismissed",probation:"no"})]},"Arrest not fabricated as conviction");
// Tobacco is an independent basis; table risk must survive.
o=run("transamerica_super",smoke({weightLb:270}));equal(o.healthClass,"table","D370 substandard build smoker stays substandard");equal(o.tobaccoBasis,"tobacco","Table tobacco basis retained");ok(o.tableRating,"Published BMI table retained");
o=review("banner_opterm",smoke({weightLb:350}),"Out-of-chart smoker requires review");equal(o.tobaccoBasis,"tobacco","Review keeps tobacco status");
const cigarAnswers={nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[cigar],cotinineResult:"negative",cotinineDate:"2026-09-01"};
equal(run("banner_opterm",cigarAnswers).healthClass,"preferred_plus","Banner cigar evidence permits PP");
// Regression: exceptions use an applicant total, not an independently allowed count per row.
for (const id of ["banner_opterm","moo_full","transamerica_super","foresters_yourterm_med","foresters_advantage_med","foresters_smart_med"]) {
  review(id,{...cigarAnswers,nicotine:[{...cigar},{...cigar}]},id+" duplicate/split cigar totals require reconciliation");
  for (const [perMonth,perYear] of [[0,0],[0,1],[1,0],[1,-1],[0.5,6],[1,12.5],[2,1]]) {
    review(id,{...cigarAnswers,nicotine:[{...cigar,perMonth,perYear}]},id+" inconsistent/noninteger cigar counts "+perMonth+"/"+perYear);
  }
}
equal(run("moo_full",{...cigarAnswers,nicotine:[{...cigar,perMonth:2,perYear:24}]}).tobaccoBasis,"non_tobacco","MOO maximum confirmed applicant total remains supported");
review("moo_full",{...cigarAnswers,nicotine:[{...cigar,perMonth:1,perYear:13}]},"Annual total cannot exceed twelve times highest monthly count");

equal(run("foresters_yourterm_med",cigarAnswers).healthClass,"preferred","Foresters cigar maximum is Preferred");
review("banner_opterm",{...cigarAnswers,cotinineDate:""},"Cigar exception needs specimen date");
equal(run("banner_opterm",{...cigarAnswers,nicotine:[cigar,{product:"cigarette",current:"no",lastDate:"2025-01-01"}]}).healthClass,"standard_plus","Other tobacco3yr prevents Banner PP cigar class while preserving eligible NT basis");
for(const id of ["john_hancock","quility","national_life"]){o=run(id,cigarAnswers);equal(o.status,"manual_review",id+" unverified source does not crash or quote");}
o=run("foresters_strong",{nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[{product:"vape",current:"yes",lastDate:asOf}]});equal(o.tobaccoBasis,"non_tobacco","Strong Foundation cigarette-only definition");
equal(run("foresters_yourterm_nonmed",{nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[{product:"vape_no_nicotine",current:"yes",lastDate:asOf}]}).tobaccoBasis,"tobacco","Your Term nonmed includes zero-nicotine vapes");
// Product eligibility, state, visa, amount, travel and source scope.
equal(run("corebridge_legacy",{dob:"1966-10-08",faceAmount:25000,state:"NY"}).status,"unavailable","NY Corebridge product availability");
equal(run("corebridge_legacy",{dob:"1966-10-08",faceAmount:25000,foreignResidence:"yes"}).status,"unavailable","Foreign residence cannot receive Level");
equal(run("fg_quantum",{faceAmount:800000,citizenship:"permanent"}).status,"unavailable","Quantum noncitizen $300k cap");
review("fg_quantum",{citizenship:""},"Unknown citizenship is review, not ineligibility");
equal(run("fg_quantum",{faceAmount:200000,citizenship:"visa",visaType:"B2",visaExpiry:"2028-01-01"}).status,"unavailable","Quantum visa list enforced");
review("banner_opterm",{travelHistory:"yes",travels:[{country:"France",start:"2027-01-01",end:"2027-01-14",purpose:"Vacation"}]},"Country current risk sent to review");
equal(run("fg_quantum",{dob:"1965-10-08"}).status,"unavailable","Quantum issue-age max60");
equal(run("moo_tle",{dob:"1966-10-08",faceAmount:500000}).status,"unavailable","2026 TLE age60 max450k");
equal(run("foresters_yourterm_nonmed",{faceAmount:500000}).status,"unavailable","Foresters nonmed amount isn't the medical route");
for(const p of Object.values(PRODUCT_RULES).filter(p=>p.status!=="criteria"))equal(run(p.id).healthClass,null,"No final class from partial/unverified "+p.id);
// Corebridge benefit tiers; indication-specific prescriptions prevent false declines.
const core={dob:"1966-10-08",faceAmount:25000,policyPurpose:"final_expense"};
equal(run("corebridge_legacy",core).benefitTier,"level","Corebridge healthy Level benefit screen");
equal(run("corebridge_legacy",core).domains.nicotine.ceiling,null,"Corebridge tobacco basis does not imply a preferred health class");
const af=condition("atrial_fibrillation",{chronic24mo:"no",dailyAnticoagulant:"yes"});
o=run("corebridge_legacy",{...core,medicalHistory:"yes",conditions:[af],medicationHistory:"yes",medications:[rx("warfarin","atrial_fibrillation")]});equal(o.status,"estimated","Corebridge AF anticoagulant case not falsely declined");equal(o.benefitTier,"level","D106 p.4 non-chronic AF daily anticoagulant Level");equal(o.healthClass,null,"Benefit tier not disguised as Preferred");
equal(run("corebridge_legacy",{...core,medicalHistory:"yes",conditions:[{...af,chronic24mo:"yes"}],medicationHistory:"yes",medications:[rx("warfarin","atrial_fibrillation")]}).benefitTier,"graded","Chronic AF is Graded");
review("corebridge_legacy",{...core,medicationHistory:"yes",medications:[rx("warfarin","")]},"Warfarin alone needs indication review, not decline");
for(const [a1c,insulin,tier,status] of [[8.6,"no","level","estimated"],[8.6,"yes","graded","estimated"],[8.7,"no","graded","estimated"],[9.9,"no","graded","estimated"],[10,"no",null,"decline_screen"]]){
 o=run("corebridge_legacy",{...core,medicalHistory:"yes",conditions:[condition("diabetes",{a1c,a1cDate:"2026-09-01",insulin})],...(insulin === "yes"?{medicationHistory:"yes",medications:[rx("insulin","diabetes")]}:{})});equal(o.status,status,"Corebridge A1c "+a1c);equal(o.benefitTier,tier,"Corebridge diabetes tier "+a1c+insulin);
}
review("banner_opterm",{medicalHistory:"yes",conditions:[condition("other")]},"Unmodeled diagnosis cannot assume mild");
review("banner_opterm",{medicationHistory:"yes",medications:[rx("Unknown medicine","other")]},"Unmapped prescription does not count as clean history");
equal(run("amam_qsfp",{dob:"1966-10-08",faceAmount:25000,medicalHistory:"yes",conditions:[condition("stroke")],medicationHistory:"yes",medications:[rx("warfarin","stroke")]}).status,"decline_screen","D017 drug+indication+recent fill exclusion");
// Exact boundary / immutability checks.
equal(Engine.within("2024-10-08",24,asOf),false,"Exact lookback anniversary is outside past24months");equal(Engine.within("2024-10-09",24,asOf),true,"One day inside window");equal(Engine.within("not-a-date",24,asOf),false,"Invalid date not interpreted as recent");
equal(Engine.shift("2024-02-29",12),"2025-02-28","Leap-year calendar shift");equal(Engine.ageAt("1991-04-08",asOf,"last"),35,"Last birthday age");equal(Engine.ageAt("1991-04-08",asOf,"nearest"),36,"Nearest birthday age");
review("banner_opterm",{dob:"2027-01-01"},"Future DOB withheld");review("banner_opterm",{dob:"2026-02-30"},"Impossible DOB withheld");
const chart=JSON.stringify(BUILD_CHARTS.fg_quantum);run("fg_quantum",{dob:"1971-10-08",weightLb:239});equal(JSON.stringify(BUILD_CHARTS.fg_quantum),chart,"Age adjustment never mutates shared chart");
equal(run("moo_full",{weightLb:262}).tableRating.label,"1","MOO Table1 exact cap");equal(run("moo_full",{weightLb:262.1}).tableRating.label,"2","MOO cap plus fraction next table");
equal(run("banner_beyondterm",{weightLb:220}).domains.build.ceiling,"preferred","BeyondTerm70in220lb distinct chart");equal(run("banner_opterm",{weightLb:220}).healthClass,"standard_plus","OPTerm70in220lb remains distinct");
review("banner_beyondterm",{heightIn:67,weightLb:261},"Printed overlapping cell requires review");
equal(run("moo_full",{bpSys:140,bpDia:80}).healthClass,"preferred","MOO strict <140 PP systolic boundary");equal(run("moo_full",{cholTotal:250,cholHdl:50}).healthClass,"preferred","MOO strict ratio<5 PP boundary");
equal(run("transamerica_super",{bpTreatment:"yes",medicalHistory:"yes",conditions:[condition("hypertension")],medicationHistory:"yes",medications:[rx("lisinopril","hypertension")]}).healthClass,"preferred","TA BP treatment through49 excludes PP");
// Migration does not preserve favorable default answers or a forced carrier.
const migrated=InterviewState.migrate({carrier:"foresters",age:35,heightFt:5,heightIn:10,conditions:[{id:"diabetes",severity:"mild",control:"good"}],criminalActive:false,medicationsText:"warfarin"});
equal(migrated.productId,"","Old carrier cannot become product selection");equal(migrated.probationCurrent,"","Unchecked current-criminal box is not explicit no");equal(migrated.conditions[0].complications,undefined,"Legacy favorable condition defaults not retained");equal(migrated.heightIn,70,"Preserve entered height");equal(migrated.medications[0].name,"warfarin","Preserve entered prescription");
review("banner_opterm",migrated,"Migrated history must be reconfirmed");
equal(InterviewState.migrate({schemaVersion:2,productId:"banner_opterm",driving:"bad"}).driving.length,0,"Malformed saved list normalized");
const comparisons=Engine.compare({...clone(base),productId:"banner_opterm"},{asOf});ok(comparisons.length>=2,"Same-route term comparison available");ok(comparisons.every(o=>o.kind === "term" && o.route === "Fully underwritten"),"No final-expense or simplified ranks in medical term comparison");
for(const id of Object.keys(PRODUCT_RULES)) {o=run(id);ok(o.status && o.sources,"Every profile returns a reviewable result");if(o.status === "estimated")ok(o.range?.low === o.range?.high || o.kind === "final_expense","Every estimated range is supported");}
equal(run("transamerica_super",{dob:"1991-04-08"}).age,35,"D398 confirms Transamerica last-birthday age");
equal(run("banner_opterm",{dob:"1961-10-08",termYears:30}).status,"unavailable","OPTerm age65 cannot use30year term");
equal(run("banner_opterm",{faceAmount:50000}).status,"unavailable","OPTerm minimum100k");
equal(run("transamerica_super",{faceAmount:50000}).healthClass,"standard","TA preferred classes minimum100k");
equal(run("foresters_advantage_med",{faceAmount:50000}).healthClass,"standard","APII preferred-class minimum100k");
review("corebridge_legacy",{...core,medicalHistory:"yes",conditions:[condition("diabetes",{a1c:8.65,a1cDate:"2026-09-01",insulin:"no"})]},"Printed A1c gap not guessed");
review("corebridge_legacy",{...core,terminalIllness:"yes"},"Unspecified terminal prognosis not fabricated as12months");
equal(run("corebridge_legacy",{...core,terminalIllness:"yes",terminalMonths:12}).status,"decline_screen","Core terminal prognosis12months");
equal(run("corebridge_legacy",{...core,faceAmount:30000}).status,"unavailable","Core age60 Level maximum25k");
equal(run("corebridge_legacy",{...core,faceAmount:20000,existingCarrierCoverage:20000}).status,"unavailable","Core total AGL cap35k");
equal(run("uhl_simple20",{medicalHistory:"yes",conditions:[condition("cancer",{cancerType:"basal_cell"})]}).status,"manual_review","UHL basal cell not an invented cancer exclusion");
equal(run("uhl_otherterm",{medicalHistory:"yes",conditions:[condition("lupus",{lupusType:"discoid"})]}).status,"manual_review","UHL SLE exception not imposed on discoid lupus");
equal(run("transamerica_super",{drivingHistory:"yes",driving:[{type:"dui",date:"2019-01-01"}]}).healthClass,"preferred_plus","Old DUI doesn't trigger a lower unselected class review");
review("banner_opterm",{cotinineResult:"positive",cotinineDate:"2026-09-01"},"Positive specimen cannot silently pass never-use history");
review("banner_opterm",{bpTreatment:"yes"},"Treated condition must be disclosed");
review("banner_opterm",{conditions:"corrupt",bpTreatment:"yes"},"Malformed diagnosis list returns review without throwing");
review("foresters_yourterm_med",{nicotineHistory:"yes",nicotine:{product:"cigarette"}},"Malformed nicotine list safe");
equal(Engine.run("constructor",base,{asOf}).status,"manual_review","Prototype key is not a product");
for(const key of ["conditions","medications","family","driving","criminal","travels","hospitals","surgeries","nicotine"])review("banner_opterm",{[key]:[null,"bad",[]]},"Malformed record in "+key);
review("corebridge_legacy",{...core,medicalHistory:"yes",conditions:[condition("diabetes",{a1c:8.6,a1cDate:"2026-09-01",insulin:"yes"})]},"Insulin answer needs matching prescription disclosure");
review("corebridge_legacy",{...core,medicalHistory:"yes",conditions:[condition("hypertension")],medicationHistory:"yes",medications:[rx("warfarin","hypertension")]},"Known drug with unusual indication is reviewed");
review("transamerica_super",{weightLb:(28.00005*70*70/703)},"BMI printed precision gap withheld");
review("banner_opterm",{weightLb:196.5},"OPTerm printed pound gap withheld");
// Release 71: Eagle Select family limits are verified without guessing a plan or benefit tier.
const eagle = {dob:"1951-10-08",faceAmount:50000,policyPurpose:"final_expense"};
for (const [age,face,status] of [[39,5000,"unavailable"],[40,5000,"manual_review"],[75,50000,"manual_review"],[76,40000,"manual_review"],[85,40000,"manual_review"],[86,5000,"unavailable"],[40,4999,"unavailable"],[75,50001,"unavailable"],[76,40001,"unavailable"],[85,40001,"unavailable"]]) {
  o=run("americo",{...eagle,dob:`${2026-age}-10-08`,faceAmount:face});
  equal(o.status,status,`AM-ES-SPECS p.1 age${age} face${face}`);
  equal(o.healthClass,null,"Eagle Select family limits never assign a health class");
  equal(o.benefitTier,null,"Eagle Select family limits never assign a benefit tier");
}
o=run("americo",{...eagle,dob:"1950-04-08",faceAmount:40001});
equal(o.age,76,"Eagle Select uses last birthday rather than nearest birthday");
equal(o.status,"unavailable","Age76 reduced face maximum uses confirmed age basis");
equal(o.issues.find(i=>i.id==="face_limit").source.id,"AM-ES-SPECS","Amount boundary cites the exact reference sheet");
equal(run("americo",{...eagle,state:"NY"}).status,"unavailable","AM-ES-SPECS p.1 issuing company excludes New York");
o=review("americo",{...eagle,dob:"1950-10-08",faceAmount:40000,...smoke()},"Age76 nicotine case requires carrier plan selection, not an invented family exclusion");
equal(o.benefitTier,null,"Nicotine review cannot promise a level or graded tier");
o=review("americo",{...eagle,medicalHistory:"yes",conditions:[condition("diabetes")]},"Eagle Select does not borrow another final-expense medical screen");
equal(o.benefitTier,null,"Disclosed condition cannot produce an inferred Eagle Select tier");
for(const id of ["quility","national_life","john_hancock"]) {
  o=review(id,{},id+" incomplete current underwriting scope remains under review");
  ok(o.sources.length>0,id+" includes explicitly scoped identity references");
  ok(o.notes.some(n=>/application/.test(n)),id+" explains the required source gap");
}
o=Engine.run("quility",InterviewState.migrate({...clone(base),productId:"quility"}),{asOf});
equal(o.productId,"quility","Saved legacy QTP identity is not silently remapped");
equal(o.status,"manual_review","Saved QTP selection cannot inherit current BeyondTerm rating");
equal(o.healthClass,null,"Legacy identity source cannot establish a favorable rating");
equal(Engine.compare({...clone(base),productId:"quility"},{asOf}).length,0,"Unverified QTP cannot enter a current product comparison");
ok(Engine.compare({...clone(base),...eagle,productId:"americo"},{asOf}).every(r=>r.productId==="americo"),"Eagle Select does not mix with a different final-expense underwriting route");
// Release 72: Flex outer limits never turn a build component into a policy level.
const flexCase=(age,face=25000,term=10,extra={})=>run("banner_flex",{dob:`${2026-age}-10-08`,usSince:`${2026-age}-10-08`,faceAmount:face,termYears:term,...extra});
for (const [age,face,status] of [[19,25000,"unavailable"],[20,25000,"manual_review"],[44,500000,"manual_review"],[44,500001,"unavailable"],[45,250000,"manual_review"],[45,250001,"unavailable"],[54,250000,"manual_review"],[54,250001,"unavailable"],[55,100000,"manual_review"],[55,100001,"unavailable"],[65,100000,"manual_review"],[65,100001,"unavailable"],[66,25000,"unavailable"],[35,24999,"unavailable"]]) {
  o=flexCase(age,face);
  equal(o.status,status,`BF-INFO p.1 Flex age${age} face${face}`);
  equal(o.healthClass,null,"Flex limits never assign a health class");
  equal(o.benefitTier,null,"Flex limits never assign a benefit tier");
  if(o.issues.some(i=>i.id==="face_limit")) {
    equal(o.issues.find(i=>i.id==="face_limit").source.id,"BF-INFO","Flex amount limit cites the age/level table");
    equal(o.issues.find(i=>i.id==="face_limit").source.pages.join(","),"1","Flex amount decision cites physical page1");
  }
}
for(const [age,term,status] of [[65,10,"manual_review"],[60,15,"manual_review"],[61,15,"unavailable"],[55,20,"manual_review"],[56,20,"manual_review"],[60,20,"manual_review"],[61,20,"unavailable"],[55,25,"manual_review"],[56,25,"unavailable"],[35,30,"unavailable"],[35,35,"unavailable"],[35,40,"unavailable"]]) {
  o=flexCase(age,25000,term);
  equal(o.status,status,`BF-INFO p.1 Flex age${age} term${term}`);
  equal(o.healthClass,null,"Term availability never establishes a Flex class");
  const limit=o.issues.find(i=>["term_age","term_unavailable"].includes(i.id));
  if(limit)equal(limit.source.id,"BF-INFO","Flex term limit cites product information");
}
for(const [age,face,term,requiresLevel1] of [[44,250000,10,false],[44,250001,10,true],[45,100000,10,false],[45,100001,10,true],[55,50000,10,false],[55,50001,10,true],[55,25000,20,false],[56,25000,20,true],[35,25000,25,true]]) {
  o=flexCase(age,face,term);
  equal(o.issues.some(i=>i.id==="flex_level_limits"),requiresLevel1,`Level-dependent request age${age} amount${face} term${term}`);
  equal(o.status,"manual_review","Actual risk level remains carrier review");
}
o=flexCase(35,25000,30,{nicotineHistory:"unknown"});
equal(o.status,"unavailable","Unsupported Flex term is screened even without tobacco evidence");
o=flexCase(61,25000,20,{nicotineHistory:"unknown"});
equal(o.status,"unavailable","Flex term age caps apply to both tobacco bases");
for(const [dob,face,term] of [["1982-04-08",500000,10],["1972-04-08",250000,10],["1971-04-08",25000,25],["1966-04-08",25000,20]]) {
  o=run("banner_flex",{dob,usSince:dob,faceAmount:face,termYears:term});
  equal(o.status,"manual_review","Age-basis boundary cannot become an unsupported exclusion");
  ok(o.issues.some(i=>i.id==="flex_age_limits"),"Crossing a limit under nearest birthday requires explicit review");
  equal(o.ageBasis,"unconfirmed","Flex does not borrow OPTerm's age basis");
}
o=flexCase(35,25000,10,{state:"NY"});
equal(o.status,"unavailable","Flex is unavailable in New York");
equal(o.issues.find(i=>i.id==="state_limit").source.id,"BF-INFO","Flex state screen cites its own product sheet");
o=flexCase(35,500000,25,{weightLb:44*70*70/703});
equal(o.domains.build.level,1,"Printed BMI band remains a build component only");
equal(o.status,"manual_review","BMI Level1 does not establish policy Level1");
equal(o.healthClass,null,"BMI cannot promise a final Flex offer");
equal(run("banner_beyondterm",{faceAmount:500001,termYears:30}).status,"manual_review","Flex maximum is not borrowed by BeyondTerm");
equal(PRODUCT_RULES.banner_flex.status,"partial","Product-limit reconciliation does not promote underwriting criteria");
// Release 73: the optional Beyond/Flex add-back is scoped to valid recent loss.
const loss={heightIn:70,weightLb:375,priorWeightLb:425,weightChange:"loss",weightCause:"intentional",weightChangeDate:"2026-09-01"};
o=run("banner_flex",loss);
equal(o.status,"manual_review","Possible add-back alone cannot produce a Flex decline");
equal(o.domains.build.weight,375,"Current weight is retained as recorded evidence");
equal(o.domains.build.possibleWeight,400,"Half-loss calculation is retained as a carrier possibility");
ok(o.domains.build.bmi<55&&o.domains.build.possibleBmi>55,"Example crosses BMI55 only after the optional add-back");
ok(o.issues.some(i=>i.id==="flex_weight_limit_review"),"Potential threshold crossing is explicitly reviewed");
ok(!o.issues.some(i=>i.id==="flex_bmi_decline"),"An optional rating weight is not treated as actual BMI");
equal(o.domains.build.level,undefined,"Pending rating weight cannot establish a Flex build level");
equal(o.healthClass,null,"Weight-loss review withholds class");
equal(o.benefitTier,null,"Weight-loss review withholds benefit tier");
equal(o.issues.find(i=>i.id==="beyond_weight_adjustment").source.pages.join(","),"3","Add-back cites the physical build page");
for(const id of ["banner_beyondterm","banner_flex"]) {
  for(const [when,pending,windowReview] of [["2026-09-01",true,false],["2025-10-09",true,false],["2025-10-08",true,false],["2025-10-07",false,true],["2024-09-01",false,true],["2026-10-09",false,false],["",false,false],["2026-02-30",false,false]]) {
    o=run(id,{...loss,weightChangeDate:when});
    equal(o.domains.build.weight,375,id+" current weight retained for "+when);
    equal(o.domains.build.adjustmentPending===true,pending,id+" only a valid last12-month date permits a potential add-back");
    equal(o.issues.some(i=>i.id==="beyond_weight_window"),windowReview,id+" old dates require interview reconciliation");
    equal(o.healthClass,null,id+" date boundary never confirms a class");
    if(!pending)equal(o.domains.build.possibleWeight,undefined,id+" no stale/invalid weight adjustment");
    if(id==="banner_flex")equal(o.status,"manual_review","Date errors cannot cause an adjusted-weight decline");
  }
  o=run(id,{heightIn:68,weightLb:185,priorWeightLb:225,weightChange:"loss",weightChangeDate:"2026-09-01",weightCause:"intentional"});
  equal(o.domains.build.weight,185,"D077 printed example retains current185lb");
  equal(o.domains.build.possibleWeight,205,"D077 printed example considers205lb without fixing the rating");
  equal(o.domains.build.ceiling,undefined,"Discretionary rating weight withholds a fixed build ceiling");
  equal(o.status,"manual_review","Printed example is carrier review, not an offer");
  for(const extra of [{weightCause:"illness"},{weightCause:"pregnancy"},{weightCause:"surgery"},{weightCause:"unknown"},{priorWeightLb:350},{priorWeightLb:""},{weightChange:"gain",priorWeightLb:350},{weightLb:""}]) {
    o=run(id,{...loss,...extra});
    ok(!o.domains.build?.adjustmentPending,id+" excludes non-intentional, inconsistent or incomplete loss from optional add-back");
    equal(o.healthClass,null,id+" unconfirmed weight facts never assign a health class");
  }
}
o=run("banner_flex",{...loss,weightLb:390,priorWeightLb:430});
equal(o.status,"decline_screen","Current disclosed BMI above55 retains the published Flex exclusion");
ok(o.issues.some(i=>i.id==="flex_bmi_decline"),"Actual BMI exclusion is preserved");
o=run("banner_flex",{...loss,weightLb:55*70*70/703,priorWeightLb:430});
equal(o.status,"manual_review","Current BMI exactly55 is not >55");
o=run("banner_beyondterm",{weightLb:185,heightIn:68,weightChange:"none"});
equal(o.domains.build.ceiling,"preferred_plus","No-loss BeyondTerm build component remains unchanged");
o=run("banner_opterm",{weightLb:185,heightIn:68,priorWeightLb:225,weightChange:"loss",weightChangeDate:"2026-09-01",weightCause:"intentional"});
equal(o.domains.build.weight,205,"OPTerm's separate weight-loss rule is preserved");
o=run("foresters_yourterm_med",{weightLb:185,heightIn:68,priorWeightLb:225,weightChange:"loss",weightChangeDate:"2026-09-01",weightCause:"intentional",stableSince:"2026-09-01"});
equal(o.domains.build.weight,205,"Foresters' separate stability rule is preserved");
// Release 74: D077's Flex medical screens do not establish BeyondTerm rules.
const flexMedical=(conditions,extra={})=>run("banner_flex",{faceAmount:25000,termYears:10,medicalHistory:"yes",conditions,...extra});
const flexScreen=(conds,flag,extra={})=>{
  const result=flexMedical(conds,extra);
  equal(result.status,"decline_screen",flag+" produces the published product screen");
  equal(result.healthClass,null,flag+" is not a class offer");
  equal(result.benefitTier,null,flag+" is not a benefit offer");
  ok(result.issues.some(i=>i.id===flag && i.status==="decline" && i.source.id==="D077"),flag+" carries its source");
  return result;
};
const noFlexScreen=(conds,flag,extra={})=>{
  const result=flexMedical(conds,extra);
  equal(result.status,"manual_review",flag+" remains review without independent exclusion");
  ok(!result.issues.some(i=>i.id===flag && i.status==="decline"),flag+" not inferred");
  equal(result.healthClass,null,"Partial source still withholds class");
  return result;
};
for(const id of ["coronary_disease","stroke","als","parkinsons","alzheimers","dementia","end_stage_kidney","cirrhosis","hepatitis_b","hepatitis_c","hiv","transplant"]) {
  const c=condition(id,{status:"resolved",treatmentEnd:"2010-01-01",diagnosisDate:"2009-01-01"});
  flexScreen([c],"flex_history_"+id);
  equal(run("banner_beyondterm",{medicalHistory:"yes",conditions:[c]}).status,"manual_review",id+" Flex exclusion not borrowed by BeyondTerm");
}
noFlexScreen([condition("kidney_disease")],"flex_history_end_stage_kidney");
noFlexScreen([condition("heart_failure")],"flex_cardiomyopathy");
flexScreen([condition("heart_failure",{cardiomyopathy:"yes"})],"flex_cardiomyopathy");
for(const [id,months] of [["tia",24],["anxiety",24],["depression",60],["asthma",12],["hypertension",12]]) {
  const key=id==="tia"?"diagnosisDate":"hospitalDate";
  const flag=id==="tia"?"flex_tia_recent":"flex_"+id+"_hospital";
  const common=id==="asthma"?{attacksLastYear:0,missedWorkDays:0,activityRestricted:"no"}:id==="hypertension"?{bpUncontrolled:"no"}:{};
  const boundary=Engine.shift(asOf,-months);
  const next=new Date(boundary+"T00:00:00Z");next.setUTCDate(next.getUTCDate()+1);
  const recent=next.toISOString().slice(0,10);
  flexScreen([condition(id,{...common,hospitalized:id==="tia"?"no":"yes",[key]:recent})],flag);
  for(const d of [boundary,"2027-01-01","2026-02-30",""])noFlexScreen([condition(id,{...common,hospitalized:id==="tia"?"no":"yes",[key]:d})],flag);
}
flexScreen([condition("sleep_apnea")],"flex_apnea_oxygen",{oxygen:"yes"});
noFlexScreen([condition("sleep_apnea")],"flex_apnea_oxygen",{oxygen:"no",pendingCare:"yes",pendingDetails:"Recommended apnea testing"});
o=flexMedical([condition("sleep_apnea")],{pendingCare:"yes",pendingDetails:"Recommended apnea testing"});
ok(o.issues.some(i=>i.id==="flex_pending_scope" && i.source.pages.join(",")==="5,11"),"Pending apnea testing cites the acceptance/exclusion conflict");
const asthma=condition("asthma",{attacksLastYear:12,missedWorkDays:0,activityRestricted:"no"});
noFlexScreen([asthma],"flex_attacksLastYear");
flexScreen([{...asthma,attacksLastYear:13}],"flex_attacksLastYear");
for(const n of ["",null,true,[13],13.5,-1,"NaN","Infinity"])noFlexScreen([{...asthma,attacksLastYear:n}],"flex_attacksLastYear");
flexScreen([{...asthma,activityRestricted:"yes"}],"flex_asthma_activity");
o=noFlexScreen([{...asthma,missedWorkDays:15}],"flex_missedWorkDays");
ok(o.issues.some(i=>i.id==="flex_asthma_work_period"),"Undefined work-day counting period is explicitly reviewed");
const hypertension=condition("hypertension",{bpUncontrolled:"yes"});
noFlexScreen([hypertension],"flex_hypertension_uncontrolled",{bpControl:"no",bpSys:159,bpDia:104});
flexScreen([hypertension],"flex_hypertension_uncontrolled",{bpControl:"no",bpSys:160,bpDia:104});
flexScreen([hypertension],"flex_hypertension_uncontrolled",{bpControl:"no",bpSys:159,bpDia:105});
for(const extra of [{bpControl:"yes",bpSys:180},{bpControl:"no",bpSys:180,bpDate:"2027-01-01"},{bpControl:"no",bpSys:300},{bpControl:"no",bpSys:[180]},{bpControl:"no",bpSys:180,bpDia:""}])noFlexScreen([hypertension],"flex_hypertension_uncontrolled",extra);
noFlexScreen([{...hypertension,bpUncontrolled:"unknown"}],"flex_hypertension_uncontrolled",{bpControl:"no",bpSys:180});
const diabetes=condition("diabetes",{a1c:7,a1cDate:"2026-09-01",insulin:"no",diabetesFollowUp24mo:"yes",diabetesFollowUpDate:"2026-09-01",sugarUncontrolled:"no",kidneyComplications:"no"});
flexScreen([diabetes],"flex_diabetes_age",{dob:"1996-10-08"});
noFlexScreen([diabetes],"flex_diabetes_age",{dob:"1995-10-08"});
o=noFlexScreen([diabetes],"flex_diabetes_age",{dob:"1995-11-01"});
ok(o.issues.some(i=>i.id==="flex_diabetes_age_review"),"Unknown issue-age basis at 30/31 is reviewed");
flexScreen([{...diabetes,diabetesFollowUp24mo:"no",diabetesFollowUpDate:"2023-01-01"}],"flex_diabetes_followup");
noFlexScreen([{...diabetes,diabetesFollowUp24mo:"no"}],"flex_diabetes_followup");
for(const d of ["2024-10-08","2024-10-07","2027-01-01","", "2026-02-30"])noFlexScreen([{...diabetes,diabetesFollowUpDate:d}],"flex_diabetes_followup");
flexScreen([{...diabetes,sugarUncontrolled:"yes"}],"flex_diabetes_sugarUncontrolled");
flexScreen([{...diabetes,kidneyComplications:"yes"}],"flex_diabetes_kidneyComplications");
noFlexScreen([{...diabetes,a1c:11,complications:"yes",kidneyComplications:"no"}],"flex_diabetes_sugarUncontrolled");
noFlexScreen([{...diabetes,insulin:"yes"}],"flex_diabetes_sugarUncontrolled",{medicationHistory:"yes",medications:[rx("Insulin","diabetes")]});
const cancer=condition("cancer",{diagnosisDate:"2010-01-01",status:"resolved",treatmentEnd:"2011-01-01",lastCancerDate:"2011-01-01",cancerType:"breast",metastasis:"no",chemoRadiation:"no"});
noFlexScreen([cancer],"flex_cancer_recent_recurrent");
flexScreen([{...cancer,lastCancerDate:"2026-09-01"}],"flex_cancer_recent_recurrent");
flexScreen([{...cancer,treatmentEnd:"2026-09-01"}],"flex_cancer_recent_recurrent");
flexScreen([{...cancer,recurrence:"yes"}],"flex_cancer_recent_recurrent");
flexScreen([{...cancer,metastasis:"yes"}],"flex_cancer_spread");
for(const type of ["basal_cell","squamous_cell"]) {
  const skin={...cancer,cancerType:type,lastCancerDate:"2026-09-01",recurrence:"yes"};
  noFlexScreen([skin],"flex_cancer_recent_recurrent");
  flexScreen([{...skin,metastasis:"yes"}],"flex_cancer_spread");
  flexScreen([{...skin,chemoRadiation:"yes"}],"flex_skin_treatment");
}
for(const type of ["unknown","","bad_saved_type"])noFlexScreen([{...cancer,cancerType:type,lastCancerDate:"2026-09-01"}],"flex_cancer_recent_recurrent");
for(const date of ["2021-10-08","2027-01-01", "2026-02-30",""])noFlexScreen([{...cancer,lastCancerDate:date}],"flex_cancer_recent_recurrent");
for(const date of ["2016-10-09","2016-10-08","2027-01-01", "2026-02-30",""]) {
  o=run("banner_flex",{faceAmount:25000,termYears:10,substanceHistory:"yes",substanceLastDate:date});
  equal(o.status,date==="2016-10-09"?"decline_screen":"manual_review","D077 substance abuse ten-year dated boundary "+date);
}
o=run("banner_flex",{faceAmount:25000,termYears:10,outstandingRestitution:"yes"});equal(o.status,"decline_screen","Flex criminal fines screen");
for(const changes of [{outstandingRestitution:"yes"},{probationCurrent:"yes"},{criminalHistory:"yes",criminal:[criminal({convictionDate:"2024-01-01"})]}])equal(run("banner_beyondterm",changes).status,"manual_review","Flex criminal exclusions not borrowed by BeyondTerm");
for(const id of ["banner_beyondterm","banner_flex"]) {
  const extra={faceAmount:100000,termYears:10};
  for(const date of ["2026-10-08","2025-10-08","2024-10-08","2020-01-01"]) {
    o=run(id,{...extra,nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[{product:"cigarette",lastDate:date,current:date===asOf?"yes":"no"}]});
    equal(o.tobaccoBasis,"unknown",id+" does not invent a tobacco cutoff");
    equal(o.domains.nicotine.ceiling,null,id+" does not assign unsupported preferred ceilings");
    equal(o.healthClass,null,id+" remains a partial review route");
  }
  o=run(id,{...extra,medicalHistory:"yes",conditions:[condition("atrial_fibrillation",{diagnosisDate:"2026-01-01",dailyAnticoagulant:"yes"})],dob:"1976-10-08"});
  equal(o.status,"manual_review","AF acceptance/exclusion source conflict requires review");
  ok(o.issues.some(i=>i.id==="beyond_af_source_conflict" && i.source.pages.join(",")==="4,7,10"),"AF conflict shows exact competing pages");
}
equal(PRODUCT_RULES.banner_flex.status,"partial","Adding selected screens does not certify full Flex criteria");
equal(PRODUCT_RULES.banner_beyondterm.status,"partial","BeyondTerm still awaits full product application and classes");

// Release 75: Eagle Select source scope, dates, nicotine and chart ranges.
const amDefaults={dob:"1966-10-08",faceAmount:25000,termYears:"",policyPurpose:"final_expense",americoAdlHistory:"no",americoHospiceHistory:"no",americoOxygenHistory:"no",americoMobilityHistory:"no"};
const amRun=(changes={})=>run("americo",{...amDefaults,...changes});
const amMed=(id,extra={})=>({medicalHistory:"yes",conditions:[condition(id,extra)]});
const amScreen=(changes,flag)=>{const x=amRun(changes);equal(x.status,"decline_screen",flag+" screens the product");equal(x.healthClass,null,flag+" withholds class");equal(x.benefitTier,null,flag+" withholds benefit");ok(x.issues.some(i=>i.id===flag&&i.source.id==="AM-ES-GUIDE"&&i.source.pages.join(",")==="11"),flag+" cites its exact page");return x;};
for(const id of ["transplant","tissue_transplant","multiple_sclerosis","als","alzheimers","dementia","huntington","brain_tumor","parkinsons","liver_disease","cirrhosis"]){
  amScreen(amMed(id),"americo_knockout_"+id);
  const other=run("banner_beyondterm",{faceAmount:100000,termYears:10,...amMed(id)});equal(other.status,"manual_review",id+" does not borrow Eagle Select rules");
}
amScreen(amMed("lupus",{lupusType:"systemic"}),"americo_knockout_lupus");
for(const t of ["discoid","unknown",""]){o=amRun(amMed("lupus",{lupusType:t}));equal(o.status,"manual_review","Non-systemic/unknown lupus is not a listed knockout");}
amScreen(amMed("amputation",{dueToDisease:"yes"}),"americo_knockout_amputation");
for(const cause of ["no","unknown",""])equal(amRun(amMed("amputation",{dueToDisease:cause})).status,"manual_review","An injury or unknown amputation cause is not inferred as disease");
amScreen(amMed("cancer",{cancerType:"leukemia"}),"americo_knockout_cancer");
for(const type of ["basal_cell","breast","other","unknown",""])equal(amRun(amMed("cancer",{cancerType:type})).status,"manual_review","Other cancer types are not generalized to leukemia");
for(const id of ["hepatitis_b","hepatitis_c"]){amScreen(amMed(id,{liverDisease:"yes"}),"americo_knockout_"+id);equal(amRun(amMed(id,{liverDisease:"unknown"})).status,"manual_review","Confirm actual liver-disease diagnosis");}
for(const dt of ["2027-01-01","2026-02-30"])equal(amRun(amMed("als",{diagnosisDate:dt})).status,"manual_review","Contradictory diagnosis date requires review");
for(const key of ["Adl","Hospice","Oxygen","Mobility"]){
 const flag="americo"+key+"History",last="americo"+key+"LastDate";
 amScreen({[flag]:"yes",[last]:"2025-10-09"},"americo_recent_"+key);
 for(const dt of ["2025-10-08","2025-10-07","2027-01-01","2026-02-30",""]){o=amRun({[flag]:"yes",[last]:dt});equal(o.status,"manual_review","Old/boundary/invalid "+key+" date is reviewed");equal(o.healthClass,null,"No unsupported class");}
 o=amRun({[flag]:"yes",[last]:"2025-10-08"});ok(o.issues.some(i=>i.id==="americo_care_boundary_"+key),"Exact 12-month boundary is explicit");
 equal(amRun({[flag]:"no",[last]:"2026-01-01"}).status,"manual_review","No-care/date contradiction is reviewed");
 equal(amRun({[flag]:"unknown"}).status,"manual_review","Unknown care stays review");
 const other=run("banner_beyondterm",{faceAmount:100000,termYears:10,[flag]:"yes",[last]:asOf});equal(other.status,"manual_review","Americo dated screens do not affect another product");
 const migrated=InterviewState.migrate({...base,productId:"americo",[flag]:"yes",[last]:"2026-01-01"});equal(migrated[flag],"yes","New care answer survives restore");equal(migrated[last],"2026-01-01","New care date survives restore");
}
o=amRun({oxygen:"yes",americoOxygenHistory:"yes",americoOxygenLastDate:"2026-09-01"});equal(o.status,"manual_review","Current oxygen/date conflict is not silently declined");ok(o.issues.some(i=>i.id==="americo_care_conflict_Oxygen"),"Oxygen conflict is explained");
amScreen({oxygen:"yes",americoOxygenHistory:"yes",americoOxygenLastDate:asOf},"americo_recent_Oxygen");
o=amRun({pendingCare:"yes",pendingDetails:"HIV test pending"});equal(o.status,"manual_review","HIV-related generic pending care does not bypass exception");ok(o.issues.some(i=>i.id==="americo_pending_scope"),"Pending care cites scoped review");
for(const id of ["diabetes","stroke","tia","coronary_disease","asthma","copd"]){equal(amRun({...amMed(id),...smoke()}).status,"manual_review",id+" plus nicotine affects tier review, not a family knockout");}
for(const product of ["cigarette","cigar","pipe","chew","nicotine","vape"]){
 for(const [dt,basis] of [[asOf,"tobacco"],["2025-10-08","tobacco"],["2024-10-09","tobacco"],["2024-10-08","non_tobacco"],["2024-10-07","non_tobacco"]]){
  o=amRun({nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[{product,current:dt===asOf?"yes":"no",lastDate:dt}]});equal(o.tobaccoBasis,basis,"Eagle Select 24 months: "+product+" "+dt);equal(o.domains.nicotine.ceiling,null,"No final-expense Preferred Plus ceiling");equal(o.healthClass,null,"Nicotine basis is not a health offer");equal(o.benefitTier,null,"Nicotine basis is not a tier");equal(o.domains.nicotine.source.pages.join(","),"6","Nicotine definition cites guide physical p6");
 }
}
for(const changes of [{nicotineComplete:"no"},{nicotine:[{product:"cigarette",current:"yes",lastDate:"2024-01-01"}]},{nicotine:[{product:"cigarette",current:"no",lastDate:"2027-01-01"}]},{nicotine:[{product:"cigarette",current:"no",lastDate:"2026-02-30"}]},{nicotine:[{product:"cigarette",current:"unknown",lastDate:"2020-01-01"}]},{nicotine:[{product:"cessation",current:"no",lastDate:"2020-01-01"}]},{nicotine:[{product:"vape_no_nicotine",current:"no",lastDate:"2020-01-01"}]},{nicotine:[]},{nicotineHistory:"never",nicotine:[{product:"cigar",current:"no",lastDate:"2020-01-01"}]},{cotinineResult:"positive"},{nicotine:[true]}]){o=amRun({...smoke(),...changes});equal(o.tobaccoBasis,"unknown","Malformed/ambiguous nicotine evidence does not establish basis");equal(o.domains.nicotine.ceiling,null,"Unknown basis does not create class");}
o=amRun(smoke());ok(o.issues.some(i=>i.id==="americo_qsa_scope"&&i.source.pages.join(",")==="6,7"),"QSA is separate post-issue explanation");equal(o.tobaccoBasis,"tobacco","QSA does not classify nicotine policy as non-nicotine");
o=amRun();equal(o.tobaccoBasis,"non_tobacco","Explicit never use has preliminary non-nicotine basis");equal(o.domains.nicotine.ceiling,null,"Never use still has no health-class ceiling");
const amSourceBuild=[[79,198],[81,205],[84,212],[87,220],[90,227],[93,235],[96,243],[99,251],[102,259],[106,267],[109,275],[112,284],[116,292],[119,301],[122,310],[126,319],[130,328],[133,337],[137,346],[141,356],[144,365],[148,375],[152,385],[156,395]];
equal(Object.keys(BUILD_CHARTS.americo).length,24,"The source contains 24 whole-inch rows");
for(const [i,r] of amSourceBuild.entries()){
 const h=56+i;equal(BUILD_CHARTS.americo[h][0],r[0],"Source minimum transcribed correctly");equal(BUILD_CHARTS.americo[h][1],r[1],"Source maximum transcribed correctly");
 for(const w of [r[0],r[1]]){o=amRun({heightIn:Number(h),weightLb:w});equal(o.domains.build.minWeight,r[0],"Recorded chart minimum "+h);equal(o.domains.build.maxWeight,r[1],"Recorded chart maximum "+h);ok(!o.issues.some(i=>i.id==="americo_build_range"),"Exact chart edges match "+h);equal(o.healthClass,null,"Chart does not create class");equal(o.benefitTier,null,"Chart does not create tier");}
 for(const w of [r[0]-0.1,r[1]+0.1]){o=amRun({heightIn:Number(h),weightLb:w});ok(o.issues.some(i=>i.id==="americo_build_range"),"Outside chart requires review "+h);equal(o.status,"manual_review","Chart alone is not an automatic carrier declination");}
}
for(const h of [55,80,70.5]){o=amRun({heightIn:h});equal(o.status,"manual_review","Unpublished height/rounding remains review");ok(o.issues.some(i=>["americo_build_height","height_rounding"].includes(i.id)),"Unpublished height is explained");}
equal(PRODUCT_RULES.americo.status,"partial","Selected screens do not certify complete Americo application/tier criteria");

// Release 76: QSFP permanent coverage identity and product-family boundaries.
equal(PRODUCT_RULES.amam_qsfp.kind,"final_expense","QSFP is final-expense whole life, not term");
ok(PRODUCT_RULES.amam_qsfp.route.includes("whole life"),"QSFP route names permanent coverage explicitly");
equal(PRODUCT_RULES.amam_qsfp.status,"partial","Product identity does not complete underwriting criteria");
const qsfp=(changes={})=>run("amam_qsfp",{dob:"1966-10-08",faceAmount:25000,policyPurpose:"final_expense",...changes});
for(const termYears of ["",10,20,30,40,"unknown"]){
 o=qsfp({termYears});equal(o.kind,"final_expense","Restored term does not change permanent product identity");
 ok(!o.issues.some(i=>i.id==="missing_termYears"||i.id==="term_unavailable"||i.id==="term_age"),"QSFP never requires or validates a term");
 equal(o.status,"manual_review","Partial QSFP remains review regardless of stale term");
 equal(o.healthClass,null,"QSFP class remains unassigned");equal(o.benefitTier,null,"Whole-life identity does not assign level benefits");
}
const qsfpComparison=Engine.compare({...clone(base),dob:"1966-10-08",faceAmount:25000,policyPurpose:"final_expense",productId:"amam_qsfp"},{asOf});
ok(qsfpComparison.length>0,"Selected whole-life route remains represented");
ok(qsfpComparison.every(r=>r.kind==="final_expense"&&r.route.includes("whole life")),"QSFP comparison never mixes term or other routes");
for(const productId of ["moo_tle","sbli_easytrak","banner_opterm"]){
 const peers=Engine.compare({...clone(base),productId},{asOf});
 ok(!peers.some(r=>r.productId==="amam_qsfp"),"Term comparisons exclude QSFP in both directions");
 ok(peers.every(r=>r.kind==="term"),"Term route still compares term coverage only");
}
for(const [dob,expected] of [["1978-10-08","unavailable"],["1976-10-09","manual_review"],["1976-10-08","manual_review"],["1941-10-08","manual_review"],["1940-11-08","manual_review"],["1940-10-08","unavailable"]]){
 o=qsfp({dob});equal(o.status,expected,"QSFP issue-age boundary with unconfirmed age basis: "+dob);
 equal(o.healthClass,null,"Age eligibility is not a rating");equal(o.benefitTier,null,"Age eligibility is not a benefit offer");
 if(expected==="unavailable")ok(o.issues.some(i=>i.id==="age_limit"&&i.source.id==="AM-QSFP-INFO"&&i.source.pages.join(",")==="1"),"Issue-age screen cites product page");
 else ok(o.issues.some(i=>i.id==="age_basis"),"Ambiguous age basis remains explicit carrier review");
}
for(const [faceAmount,expected,flag] of [[2499,"unavailable","qsfp_face_minimum"],[2500,"manual_review","qsfp_minimum_conflict"],[4999,"manual_review","qsfp_minimum_conflict"],[5000,"manual_review",null],[50000,"manual_review",null],[50001,"manual_review","qsfp_class_amount"],[75000,"manual_review","qsfp_class_amount"],[75001,"manual_review","qsfp_class_amount"],[100000,"manual_review","qsfp_class_amount"],[100001,"unavailable","face_limit"]]){
 o=qsfp({faceAmount});equal(o.status,expected,"QSFP requested face boundary: "+faceAmount);
 if(flag)ok(o.issues.some(i=>i.id===flag),"Face boundary explains its source or conflict");
 else ok(!o.issues.some(i=>["qsfp_face_minimum","qsfp_minimum_conflict","qsfp_class_amount","face_limit"].includes(i.id)),"Common published face range does not fabricate a restriction");
 equal(o.healthClass,null,"Face request does not infer Preferred class");equal(o.benefitTier,null,"Face request does not infer level tier");
}
o=qsfp({faceAmount:2500});ok(o.issues.some(i=>i.id==="qsfp_minimum_conflict"&&i.source.id==="AM-QSFP-FAQ"&&i.source.pages.join(",")==="2"),"Conflicting minimum cites FAQ physical page 2");
equal(qsfp({state:"NY"}).status,"unavailable","QSFP excludes New York");
ok(qsfp({state:"NY"}).issues.some(i=>i.id==="state_limit"&&i.source.id==="AM-QSFP-INFO"),"NY screen uses product information");
equal(qsfp({medicalHistory:"yes",conditions:[condition("stroke")],medicationHistory:"yes",medications:[rx("warfarin","stroke")]}).status,"decline_screen","Corrected product family preserves scoped drug/indication exclusion");

// Release 77: EasyTrak product limits and financial ambiguity.
const easytrak=(changes={})=>run("sbli_easytrak",{sbliIncome:120000,...changes});
const dobForAge=age=>(2026-age)+"-10-08";
for(const [age,cap] of [[18,1000000],[40,1000000],[41,1000000],[50,1000000],[51,500000],[55,500000],[56,150000],[60,150000]]) {
 for(const [faceAmount,exceeded] of [[cap,false],[cap+1000,true]]) {
  o=easytrak({dob:dobForAge(age),faceAmount});equal(o.age,age,"SBLI uses nearest age at birthday");
  equal(o.issues.some(i=>i.id==="face_limit"),exceeded,"SBLI age "+age+" face "+faceAmount);
  equal(o.status,exceeded?"unavailable":"manual_review","SBLI cap boundary status");
  equal(o.healthClass,null,"A valid amount never creates a final SBLI class");
  if(exceeded)ok(o.issues.some(i=>i.id==="face_limit"&&i.source.id==="SB-ET-SPECS"&&i.source.pages.join(",")==="1"),"Age/face cap cites spec page 1");
 }
}
for(const [faceAmount,flag] of [[99000,"face_limit"],[100000,null],[100001,"sbli_face_increment"],[101000,null]]) {
 o=easytrak({faceAmount});equal(o.issues.some(i=>i.id==="sbli_face_increment"),flag==="sbli_face_increment","SBLI does not round unsupported face amounts");
 equal(o.status,flag?"unavailable":"manual_review","SBLI minimum / increment status");
}
for(const [age,term,available] of [[18,10,true],[50,30,true],[51,30,false],[60,20,true],[60,15,true],[61,10,false],[35,25,false],[35,35,false],[35,40,false],[35,0,false],[35,20,true]]) {
 o=easytrak({dob:dobForAge(age),faceAmount:100000,termYears:term,nicotineHistory:""});equal(o.status,available?"manual_review":"unavailable","SBLI selected term "+age+"/"+term+" independent of unanswered nicotine");
 equal(o.healthClass,null,"Term screen never fabricates class");
}
for(const [age,factor] of [[18,20],[40,20],[41,15],[50,15],[51,10],[55,10],[56,10],[60,10]]) {
 for(const income of [10000,9999]) {
  o=easytrak({dob:dobForAge(age),faceAmount:10000*factor,sbliIncome:income,policyPurpose:"family"});
  equal(o.issues.some(i=>i.id==="sbli_income_limit"),income===9999,"Income multiple applies at age "+age+" for family purpose");
  equal(o.status,age>=56&&factor*10000>150000?"unavailable":"manual_review","Financial screen remains review");
  if(income===9999)ok(o.issues.some(i=>i.id==="sbli_income_limit"&&i.source.id==="SB-ET-SPECS"&&i.status==="review"),"Income excess cites published spec without final rejection");
 }
}
for(const income of ["",null,"unknown","NaN",-1,1000000001]) {
 o=easytrak({sbliIncome:income});ok(o.issues.some(i=>i.id==="invalid_sbliIncome"),"Invalid EasyTrak income is unanswered: "+income);equal(o.healthClass,null,"Missing financial input withholds class");
}
for(const [employment,age,face] of [["spouse",35,100000],["student",25,100000],["seeking",35,100000],["retired",55,250000],["retired",60,150000]]) {
 o=easytrak({employment,dob:dobForAge(age),faceAmount:face,sbliIncome:0});equal(o.status,"manual_review","Permitted nonworking status not rejected for zero earned income");
 ok(o.issues.some(i=>i.id==="sbli_income_basis"),"Nonworking income basis needs carrier review");ok(!o.issues.some(i=>i.id==="sbli_income_limit"),"No invented nonworking income multiple");
}
for(const changes of [{employment:"student",dob:dobForAge(26),faceAmount:100000},{employment:"seeking",faceAmount:101000},{employment:"retired",dob:dobForAge(48),faceAmount:100000},{employment:"retired",dob:dobForAge(55),faceAmount:251000},{employment:"retired",dob:dobForAge(60),faceAmount:151000}])equal(easytrak(changes).status,"unavailable","Employment and global face caps intersect");
for(const [mortgageAmount,flag] of [[100000,false],[99999,true]]) {
 o=easytrak({policyPurpose:"mortgage",faceAmount:150000,sbliMortgageOnly:"yes",sbliMortgageAmount:mortgageAmount});equal(o.issues.some(i=>i.id==="sbli_mortgage_limit"),flag,"Mortgage-only 1.5x exact/over boundary");
 if(flag)ok(o.issues.some(i=>i.id==="sbli_mortgage_limit"&&i.status==="review"&&i.source.pages.join(",")==="2"),"Mortgage quote limit cites footnote on physical page 2");
}
for(const amount of ["",null,-1,"invalid"])ok(easytrak({policyPurpose:"mortgage",sbliMortgageOnly:"yes",sbliMortgageAmount:amount}).issues.some(i=>i.id==="invalid_sbliMortgageAmount"),"Missing or invalid mortgage amount is not treated as zero");
for(const sbliMortgageOnly of ["","unknown"])ok(easytrak({policyPurpose:"mortgage",sbliMortgageOnly}).issues.some(i=>i.id==="missing_sbliMortgageOnly"),"Old mortgage/debt selection does not imply mortgage-only");
for(const changes of [{policyPurpose:"mortgage",sbliMortgageOnly:"no",sbliMortgageAmount:0},{policyPurpose:"family",sbliMortgageOnly:"yes",sbliMortgageAmount:0}])ok(!easytrak(changes).issues.some(i=>i.id==="sbli_mortgage_limit"),"Unrelated debt/purpose ignores stale mortgage limit");
o=easytrak({replacement:"yes"});equal(o.status,"manual_review","Conflicting replacement editions no longer force unavailability");ok(o.issues.some(i=>i.id==="sbli_replacement_conflict"&&i.source.id==="SB-ET-GUIDE"),"Replacement difference is explicit source conflict");
equal(easytrak({state:"NY"}).status,"unavailable","SBLI NY excluded");ok(easytrak({state:"NY"}).issues.some(i=>i.id==="state_limit"&&i.source.id==="SB-ET-FAQ"&&i.source.pages.length===0),"Web FAQ citation has no invented PDF page");
// A six-month birthday boundary must use age nearest rather than attained age.
o=easytrak({dob:"1971-04-01",faceAmount:151000});equal(o.age,56,"Nearest birthday feeds EasyTrak caps");equal(o.status,"unavailable","Nearest-age cap screens request");
const oldEasyDraft=InterviewState.migrate({schemaVersion:2,productId:"sbli_easytrak",policyPurpose:"mortgage",income:45000,faceAmount:150000});
for(const k of ["sbliIncome","sbliMortgageOnly","sbliMortgageAmount"])equal(oldEasyDraft[k],"","New financial answer remains unanswered in old v2 draft: "+k);
const restoredEasy=InterviewState.migrate({...oldEasyDraft,sbliIncome:50000,sbliMortgageOnly:"yes",sbliMortgageAmount:100000});
equal(restoredEasy.sbliIncome,50000,"New explicit income survives reload");equal(restoredEasy.sbliMortgageOnly,"yes","New explicit mortgage purpose survives reload");equal(restoredEasy.sbliMortgageAmount,100000,"New explicit mortgage amount survives reload");
for(const id of ["banner_opterm","amam_qsfp"])ok(!run(id,{sbliIncome:0,sbliMortgageOnly:"yes",sbliMortgageAmount:0}).issues.some(i=>i.id.startsWith("sbli_")),"EasyTrak financial data cannot affect "+id);
equal(run("fg_quantum",{replacement:"yes"}).status,"unavailable","Quantum replacement exclusion preserved");

o=easytrak();equal(o.domains.nicotine.ceiling,null,"EasyTrak never-use answer does not infer Preferred Plus from differing class editions");equal(o.tobaccoBasis,"non_tobacco","Consistent never use keeps disclosed basis");
o=easytrak({nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[{product:"cigarette",lastDate:"2020-01-01",current:"no"}]});equal(o.tobaccoBasis,"unknown","No generic twelve-month SBLI lookback");equal(o.domains.nicotine.ceiling,null,"Old nicotine use does not infer a favorable ceiling");ok(o.issues.some(i=>i.id==="sbli_nicotine_scope"),"Past nicotine use requires current application");
o=easytrak({nicotineHistory:"yes",nicotineComplete:"yes",nicotine:[{product:"vape",lastDate:asOf,current:"yes"}]});equal(o.tobaccoBasis,"tobacco","Current vaping aligns with FAQ nicotine definition");equal(o.domains.nicotine.ceiling,null,"Current nicotine basis is not a class offer");
console.log(`Passed ${checks} source-derived underwriting assertions.`);
