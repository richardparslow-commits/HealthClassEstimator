"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),http=require("node:http");
const root=path.resolve(__dirname,".."),src=fs.readFileSync(path.join(root,"js/intake-questions.js"),"utf8");
const context=vm.createContext({});
vm.runInContext(src+"\nglobalThis.bank=IntakeQuestions;",context);
const bank=context.bank;
assert.equal(bank.sections.length,11,"Exactly the eleven requested sections");
const ids=new Set(),labels=new Set(),groups=[];
let staticQuestions=0,repeatQuestions=0;
for(const section of bank.sections){
 assert.ok(section.title&&Array.isArray(section.groups));
 groups.push(section.title);
 for(const group of section.groups)for(const q of group.questions){
  assert.ok(q.id&&q.label);
  assert.ok(!ids.has(q.id),"Top-level input key repeated: "+q.id);ids.add(q.id);
  const canonical=q.label.trim().toLowerCase().replace(/[^a-z0-9]+/g," ");
  assert.ok(!labels.has(canonical),"Question repeated: "+q.label);labels.add(canonical);
  assert.ok(!/^(?:what is|please provide|enter) .*?(?:ssn|social security|bank account number|routing number|driver.s license number|policy number|passport number|taxpayer identification number)/i.test(q.label),"Forbidden identity prompt");
  if(q.type==="repeat"){
   const row=new Set();
   for(const sub of q.fields){
    assert.ok(!row.has(sub.id),"Duplicate answer in repeated "+q.id+": "+sub.id);row.add(sub.id);
    repeatQuestions++;
   }
  }else staticQuestions++;
 }
}
assert.ok(ids.has("mentalRiskNow")&&ids.has("medicalHistory")&&ids.has("criminalHistory")&&ids.has("bankruptcyHistory"));
console.log("Passed static deduplicated 11-section question schema, IDs and identifier exclusions.");

// Migrating a saved earlier interview must preserve answers, split old mental
// diagnoses into their new section, and discard all unknown private IDs.
vm.runInContext(fs.readFileSync(path.join(root,"js/state.js"),"utf8")+"\nglobalThis.stateAPI=InterviewState;",context);
const migrated=context.stateAPI.migrate({
  schemaVersion:2,productId:"legacy-carrier",ssn:"never-copy",
  bankAccount:"never-copy",licenseNumber:"never-copy",policyNumber:"never-copy",
  medicalHistory:"yes",conditions:[
    {id:"depression",name:"Depression",diagnosisDate:"2022-03-01",status:"current"},
    {id:"diabetes",name:"Diabetes",diagnosisDate:"2020-01-01",status:"current"}
  ]
});
assert.equal(migrated.mentalConditions.length,1);
assert.equal(migrated.mentalConditions[0].condition,"depression");
assert.equal(migrated.conditions.length,1);
assert.equal(migrated.conditions[0].id,"diabetes");
for(const key of ["productId","ssn","bankAccount","licenseNumber","policyNumber"])
  assert.equal(Object.hasOwn(migrated,key),false,"Forbidden or legacy key should be discarded: "+key);
assert.equal(migrated.intakeRevision,"2026-11");
console.log("Passed mental-history draft migration and forbidden-field scrubbing.");
