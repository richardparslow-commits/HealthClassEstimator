"use strict";
// Product-neutral browser regression: no carrier selection, consent gate, saved
// histories, guarded results and the embedded build must continue to work.
const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const version=fs.readFileSync(path.join(root,"index.html"),"utf8").match(/var HCE_VERSION = "(\d+)"/)[1];
const server=http.createServer((request,response)=>{
  const name=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
  if(name==="/oversized-host"){
    response.writeHead(200,{"Content-Type":"text/html"});
    response.end('<!doctype html><iframe style="width:100%;height:2400px" src="/dist/app.html"></iframe>');
    return;
  }
  const file=path.resolve(root,"."+(name==="/"?"/index.html":name));
  if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){response.writeHead(404);response.end();return;}
    response.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");
    response.end(data);
  });
});
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({headless:true,...(process.env.HCE_BROWSER_PATH?{executablePath:process.env.HCE_BROWSER_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(()=>{
    const OriginalDate=Date;
    window.Date=class extends OriginalDate {
      constructor(...args){super(...(args.length?args:["2026-11-22T12:00:00Z"]));}
      static now(){return new OriginalDate("2026-11-22T12:00:00Z").getTime();}
    };
  });
  const page=await context.newPage(),errors=[],external=[];
  page.on("pageerror",e=>errors.push(e.message));
  const local="http://127.0.0.1:"+server.address().port;
  page.on("request",r=>{if(!r.url().startsWith(local))external.push(r.url());});
  const nav=label=>page.getByRole("button",{name:new RegExp("^\\d+\\. "+label+"$")}).click();
  const healthy={
    schemaVersion:2,productId:"banner_opterm",dob:"1991-10-08",heightIn:70,weightLb:165,
    weightChange:"none",bpSys:118,bpDia:74,cholTotal:180,cholHdl:60,
    nicotineHistory:"never",nicotine:[],medicalHistory:"no",conditions:[],medicalComplete:"yes",
    medicationHistory:"no",medications:[],medicationsComplete:"yes",
    hospitalHistory:"no",hospitals:[],surgeryHistory:"no",surgeries:[],
    familyHistory:"no",family:[],familyComplete:"yes",
    pendingCare:"no",activeSymptoms:"no",oxygen:"no",dialysis:"no",
    adlAssistance:"no",careFacility:"no",homeHealth:"no",terminalIllness:"no",
    substanceHistory:"no",disabled:"no",historyConfirmed:"yes"
  };
  try {
    page.setDefaultTimeout(10000);
    await page.goto(local);
    await page.locator("#dob").waitFor();
    assert.equal(await page.locator(".app-main").evaluate(n=>n.inert),true,"Consent gate blocks interview");
    assert.equal(await page.locator("#productId").count(),0,"No carrier/product control");
    assert.equal(await page.getByText("Carrier, product and underwriting route",{exact:true}).count(),0);
    const onScreen=()=>page.evaluate(()=>{
      const r=document.querySelector("#ack-accept").getBoundingClientRect();
      return r.top>=0&&r.bottom<=innerHeight;
    });
    assert.equal(await onScreen(),true,"Acknowledgment action visible on desktop");
    await page.setViewportSize({width:390,height:844});
    assert.equal(await onScreen(),true,"Acknowledgment action visible on mobile");
    await page.setViewportSize({width:1280,height:900});
    await page.locator("#ack-check").check();
    await page.locator("#ack-accept").click();
    assert.equal(await page.locator(".app-main").evaluate(n=>n.inert),false);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),"dob","Consent focuses the first applicant field");

    await page.locator("#dob").fill("1991-10-08");
    await nav("Height & weight");
    await page.locator("#heightIn").fill("70");await page.locator("#weightLb").fill("165");
    await nav("Review");
    assert.match(await page.locator("#review-details").innerText(),/Details still needed/);
    await page.locator("#btn-next").click();
    assert.match(await page.locator("#result-heading").innerText(),/Additional information needed/);
    assert.match(await page.locator("#results-content").innerText(),/No insurer, product, or route was selected/);
    assert.equal(await page.locator("#productId").count(),0);
    assert.doesNotMatch(await page.locator("#results-content").innerText(),/Other products with the same coverage type and route/);
    await page.getByRole("button",{name:"Delete saved answers and start over"}).click();
    assert.equal(await page.locator("#dob").inputValue(),"","Reset clears applicant data");

    // Old saved carrier IDs are ignored, while the applicant's history is retained.
    await page.evaluate(data=>localStorage.setItem("hce_state_v2",JSON.stringify(data)),healthy);
    await page.reload();
    await page.locator("#dob").waitFor();
    assert.equal(await page.locator("#dob").inputValue(),"1991-10-08");
    assert.equal(await page.locator("#productId").count(),0);
    assert.equal(await page.evaluate(()=>Object.hasOwn(JSON.parse(localStorage.getItem("hce_state_v2")),"productId")),true,
      "The old draft is not rewritten until a user makes another change");
    await nav("Review");await page.locator("#btn-next").click();
    assert.match(await page.locator("#result-heading").innerText(),/Reported health profile collected/);
    assert.doesNotMatch(await page.locator("#results-content").innerText(),/Banner Life|OPTerm|Preferred Plus|Graded benefit screen/);
    await page.locator("#btn-back").click();await nav("Applicant profile");
    await page.locator("#dob").fill("1990-10-08");
    assert.equal(await page.evaluate(()=>Object.hasOwn(JSON.parse(localStorage.getItem("hce_state_v2")),"productId")),false,
      "Next save actively discards the legacy carrier selection");

    // Deployed standalone build must carry the same neutral UI and release.
    await page.goto(local+"/dist/app.html");await page.locator("#dob").waitFor();
    assert.equal(await page.evaluate(()=>window.HCE_VERSION),version);
    assert.equal(await page.locator("#productId").count(),0);
    const framed=await context.newPage();
    await framed.goto(local+"/oversized-host");
    const frame=framed.frameLocator("iframe");
    await frame.locator("#dob").waitFor();
    assert.equal(await frame.locator("#productId").count(),0);
    assert.equal(await frame.locator("#ack-accept").isVisible(),true);
    await framed.close();
    assert.deepEqual(errors,[],"No uncaught browser errors");
    assert.deepEqual(external,[],"Applicant interaction makes no external requests");
    console.log("Passed product-neutral browser flows, consent accessibility, migration, stored-data scrubbing, responsive layout, embedded build and local-only privacy.");
  } finally {
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
