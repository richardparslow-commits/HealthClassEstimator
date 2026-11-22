"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),http=require("node:http");
const {chromium}=require("playwright");
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
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,"http://localhost").pathname),file=path.resolve(root,"."+ (name==="/"?"/index.html":name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404);return res.end();}
  res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");res.end(data);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const browser=await chromium.launch({headless:true,...(process.env.HCE_BROWSER_PATH?{executablePath:process.env.HCE_BROWSER_PATH}:{})});
 try{
  const page=await browser.newPage(),exceptions=[];page.on("pageerror",e=>exceptions.push(e.message));
  await page.goto("http://127.0.0.1:"+server.address().port);
  await page.locator("#dob").waitFor();
  assert.equal(await page.locator("#steps-nav button").count(),11);
  await page.locator("#ack-check").check();await page.locator("#ack-accept").click();
  assert.equal(await page.evaluate(()=>document.activeElement?.id),"dob");
  assert.equal(await page.locator("#productId").count(),0);
  await page.locator("#steps-nav button").nth(0).click();
  assert.equal(await page.locator("#citizenshipCountry").count(),0);
  await page.locator("#citizenship").selectOption("visa");
  assert.equal(await page.locator("#citizenshipCountry").count(),1);
  assert.equal(await page.locator("#visaType").count(),1);
  await page.locator("#steps-nav button").nth(4).click();
  assert.equal(await page.locator("#conditions-0-id").count(),0);
  await page.locator("#medicalHistory").selectOption("yes");
  await page.getByRole("button",{name:"Add physical medical condition"}).click();
  await page.locator("#conditions-0-id").selectOption("diabetes");
  assert.equal(await page.locator("#conditions-0-a1c").count(),1);
  assert.equal(await page.locator("#conditions-0-apneaTherapy").count(),0);
  await page.locator("#steps-nav button").nth(5).click();
  await page.locator("#mentalRiskNow").selectOption("yes");
  assert.match(await page.locator("#step-content").innerText(),/988/);
  await page.locator("#steps-nav button").nth(8).click();
  assert.equal(await page.locator("#licenseState").count(),0);
  await page.locator("#licenseStatus").selectOption("valid");
  assert.equal(await page.locator("#licenseState").count(),1);
  assert.equal(await page.locator("#licenseNumber").count(),0);
  await page.locator("#steps-nav button").nth(10).click();
  assert.equal(await page.locator("#historyConfirmed").count(),1);
  await page.locator("#btn-next").click();
  assert.match(await page.locator("#results-content").innerText(),/No insurer, product, or route was selected/);
  assert.ok(!exceptions.length,JSON.stringify(exceptions));
  console.log("PASS: 11 sections, "+staticQuestions+" unique top-level questions, "+repeatQuestions+" repeated-entry follow-ups; conditional flows, neutral result, privacy identifier exclusions.");
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
