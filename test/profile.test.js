"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname,"..");
const context = vm.createContext({Date,console});
const source = ["rules","state","engine"].map(name=>fs.readFileSync(path.join(root,"js",name+".js"),"utf8")).join("\n");
vm.runInContext(source+"\nglobalThis.testApi={Engine,InterviewState};",context);
const {Engine,InterviewState}=context.testApi;
const asOf="2026-11-22";
const healthy={
  dob:"1991-10-08",heightIn:70,weightLb:165,weightChange:"none",
  bpSys:118,bpDia:74,cholTotal:180,cholHdl:60,
  nicotineHistory:"never",nicotine:[],
  medicalHistory:"no",conditions:[],medicalComplete:"yes",
  medicationHistory:"no",medications:[],medicationsComplete:"yes",
  hospitalHistory:"no",hospitals:[],surgeryHistory:"no",surgeries:[],
  familyHistory:"no",family:[],familyComplete:"yes",
  pendingCare:"no",activeSymptoms:"no",oxygen:"no",dialysis:"no",
  adlAssistance:"no",careFacility:"no",homeHealth:"no",
  terminalIllness:"no",substanceHistory:"no",disabled:"no",
  historyConfirmed:"yes"
};
const screen=(changes={})=>Engine.profile({...healthy,...changes},{asOf});
let checks=0;
function equal(a,b,label){assert.equal(a,b,label);checks++;}
function contains(list,pattern,label){assert.ok(list.some(x=>pattern.test(x)),label);checks++;}
const clear=screen();
equal(clear.status,"profile_complete","Complete clean reported history has no flagged evidence");
equal(clear.age,35,"Age is based on last birthday, not any insurer convention");
equal(clear.healthClass,null,"No brand-specific health class is inferred");
equal(clear.benefitTier,null,"No benefit design is inferred");
equal(clear.productId,null,"Product is deliberately unset");
equal(clear.carrier,null,"Carrier is deliberately unset");
equal(clear.route,null,"Route is deliberately unset");
contains(clear.measurements,/BMI/, "BMI calculation is descriptive, not a class");
equal(screen({medicalHistory:""}).status,"needs_details","Empty medical history blocks completion");
equal(screen({historyConfirmed:"no"}).status,"needs_details","Explicit confirmation required");
equal(screen({dob:"2030-01-01"}).status,"needs_details","Future date cannot generate age");
equal(screen({heightIn:0}).status,"needs_details","Invalid height blocks completion");
equal(screen({bpSys:500}).status,"needs_details","Invalid blood pressure blocks completion");
equal(screen({medicalHistory:"yes",conditions:[]}).status,"needs_details","Reported diagnosis needs details");
const condition={id:"diabetes",name:"Diabetes",diagnosisDate:"2021-05-01",status:"current"};
const diagnosed=screen({medicalHistory:"yes",conditions:[condition]});
equal(diagnosed.status,"review","Reported medical conditions require review, not automatic denial");
equal(diagnosed.healthClass,null,"No medical diagnosis creates a class or decline");
contains(diagnosed.concerns,/medical history/, "Individualized physical-history review note");
const nicotine=screen({nicotineHistory:"yes",nicotine:[{product:"cigarette",current:"yes",lastDate:"2026-11-22"}],nicotineComplete:"yes"});
equal(nicotine.status,"review","Nicotine history is not assumed non-tobacco");
equal(nicotine.healthClass,null,"Nicotine use is not assigned a fabricated rating");
equal(screen({nicotineHistory:"never",nicotine:[{product:"cigar"}]}).status,"needs_details","Contradictory history must be reconciled");
equal(screen({terminalIllness:"yes"}).status,"review","High-risk disclosure is not treated as carrier decline");
equal(screen({pendingCare:"yes"}).status,"needs_details","Pending care requires details");
equal(screen({criminalHistory:"yes"}).status,"review","Nonmedical disclosures are displayed separately");
contains(screen({criminalHistory:"yes"}).otherReview,/criminal history/, "Nonmedical issue in its own section");
const migrated=InterviewState.migrate({schemaVersion:2,productId:"banner_opterm",carrier:"Banner Life",...healthy});
equal(migrated.productId,undefined,"Old saved carrier/product selection is removed");
equal(Engine.profile({...migrated,productId:"moo_full"},{asOf}).healthClass,null,"A stale product ID cannot switch on carrier scoring");
equal(Engine.profile({...migrated,productId:"moo_full"},{asOf}).status,"profile_complete","A stale ID cannot alter the neutral assessment");
equal(Engine.run("banner_opterm",healthy,{asOf}).productId,"banner_opterm","Legacy explicitly invoked rule API remains available for test compatibility");
console.log("Passed "+checks+" product-neutral profile, validation, migration and no-inferred-class assertions.");
