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
equal(run("amam_qsfp",{medicalHistory:"yes",conditions:[condition("stroke")],medicationHistory:"yes",medications:[rx("warfarin","stroke")]}).status,"decline_screen","D017 drug+indication+recent fill exclusion");
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
console.log(`Passed ${checks} source-derived underwriting assertions.`);
