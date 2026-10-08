"use strict";
// Optional browser verification. npm install --no-save playwright; npx playwright install chromium;
// npm run test:ui. HCE_BROWSER_PATH may point to an existing Chromium binary.
const {chromium}=require("playwright"),fs=require("fs"),path=require("path"),http=require("http"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,"http://localhost").pathname),file=path.resolve(root,"."+(name === "/"?"/index.html":name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");res.end(data);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=await chromium.launch({headless:true,...(process.env.HCE_BROWSER_PATH?{executablePath:process.env.HCE_BROWSER_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  // Source scenarios use a fixed assessment date; later runs must not age them.
  await context.addInitScript(()=>{
    const OriginalDate=Date;
    window.Date=class extends OriginalDate {
      constructor(...args){super(...(args.length?args:["2026-10-08T12:00:00Z"]));}
      static now(){return new OriginalDate("2026-10-08T12:00:00Z").getTime();}
    };
  });
  const page=await context.newPage(),errors=[];
  page.on("pageerror",e=>{errors.push(e.message);console.error("Browser error:",e.message);});
  const local="http://127.0.0.1:"+server.address().port;
  const external=[];page.on("request",r=>{if(!r.url().startsWith(local))external.push(r.url());});
  const sel=async(key,value)=>page.locator("[data-field='"+key+"']").selectOption(value);
  const fill=async(key,value)=>page.locator("[data-field='"+key+"']").fill(String(value));
  const next=()=>page.locator("#btn-next").click();
  const nav=label=>page.getByRole("button",{name:new RegExp("^\\d+\\. "+label+"$")}).click();
  try{
    page.setDefaultTimeout(10000);
    await page.goto(local);await page.locator("#productId").waitFor({state:"attached"});
    assert.equal(await page.locator(".app-main").evaluate(n=>n.inert),true,"Acknowledgment makes interview inert");
    await page.locator("#ack-check").check();await page.locator("#ack-accept").click();
    assert.equal(await page.locator(".app-main").evaluate(n=>n.inert),false);
    await sel("productId","banner_opterm");await fill("dob","1991-10-08");await sel("sex","male");await sel("state","TX");await fill("faceAmount",500000);await sel("termYears","20");
    await sel("policyPurpose","income");await fill("income",120000);await fill("existingCoverage",0);await sel("replacement","no");await sel("financing","no");await sel("employment","employed");await fill("occupation","Office worker");
    for(const k of ["hazardousOccupation","aviation","hazardousSports","militaryDeployment"])await sel(k,"no");await next();
    await sel("usResident","yes");await sel("citizenship","citizen");await fill("usSince","1991-10-08");await sel("intentStay","yes");await sel("foreignResidence","no");await sel("healthInsurance","yes");await sel("travelHistory","no");await next();
    await sel("nicotineHistory","never");await next();await fill("heightIn",70);await fill("weightLb",165);await sel("weightChange","none");await next();
    await fill("bpSys",120);await fill("bpDia",78);await fill("bpDate","2026-09-01");await sel("bpBasis","average_2yr");await sel("bpTreatment","no");await sel("bpControl","yes");await fill("cholTotal",190);await fill("cholHdl",60);await fill("cholDate","2026-09-01");await sel("cholBasis","average_2yr");await sel("cholTreatment","no");await next();
    await sel("drivingHistory","no");await sel("licenseStatus","valid");await sel("drivingComplete","yes");await next();
    await sel("criminalHistory","no");for(const k of ["incarcerated","pendingCharges","probationCurrent","paroleCurrent","outstandingRestitution"])await sel(k,"no");await sel("criminalComplete","yes");await next();
    for(const k of ["medicalHistory","hospitalHistory","surgeryHistory","pendingCare","activeSymptoms","oxygen","dialysis","adlAssistance","careFacility","homeHealth","terminalIllness","disabled","substanceHistory","priorInsuranceAdverse"])await sel(k,"no");await sel("medicalComplete","yes");await sel("marijuana","none");await next();
    await sel("medicationHistory","no");await sel("medicationsComplete","yes");await next();await sel("familyHistory","no");await sel("familyComplete","yes");await next();await sel("historyConfirmed","yes");await next();
    assert.match(await page.locator(".result-hero h2").innerText(),/Preferred Plus.*Non-tobacco/);
    const contrast=await page.locator(".result-hero").evaluate(el=>{
      const luminance=color=>{
        const rgb=color.match(/[\d.]+/g).slice(0,3).map(v=>Number(v)/255).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
        return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
      };
      const a=luminance(getComputedStyle(el.querySelector("h2")).color),b=luminance(getComputedStyle(el).backgroundColor);
      return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
    });
    assert.ok(contrast>=4.5,"Result heading has readable text contrast");
    assert.match(await page.locator("#results-content").innerText(),/Complete for modeled screens/);
    assert.doesNotMatch(await page.locator("#results-content").innerText(),/Level benefit screen|Eagle Select/);
    await page.reload();await page.locator("#productId").waitFor({state:"attached"});assert.equal(await page.locator("#productId").inputValue(),"banner_opterm","Product selection persists");
    await sel("productId","foresters_yourterm_med");await fill("existingCarrierCoverage",0);await sel("forestersDeployment","no");await nav("Criminal history");await sel("probationCurrent","yes");await nav("Review");await next();assert.match(await page.locator(".result-hero h2").innerText(),/Outside this product/);
    // Restore one explicit current-status answer and exercise Corebridge AF+Rx.
    await nav("Criminal history");await sel("probationCurrent","no");await nav("Product & profile");await sel("productId","corebridge_legacy");await fill("dob","1966-10-08");await fill("faceAmount",25000);await fill("existingCarrierCoverage",0);await sel("policyPurpose","final_expense");
    await nav("Medical history");await sel("medicalHistory","yes");await page.getByRole("button",{name:"Add condition",exact:true}).click();await sel("conditions-0-id","atrial_fibrillation");await fill("conditions-0-diagnosisDate","2020-01-01");await sel("conditions-0-status","current");await fill("conditions-0-treatment","Daily anticoagulant and regular follow-up");
    for(const k of ["complications","recurrence","hospitalized","chronic24mo"])await sel("conditions-0-"+k,"no");await sel("conditions-0-dailyAnticoagulant","yes");
    await nav("Prescriptions");await sel("medicationHistory","yes");await page.getByRole("button",{name:"Add prescription",exact:true}).click();await fill("medications-0-name","warfarin");await fill("medications-0-dose","5 mg daily");await fill("medications-0-indication","Atrial fibrillation");await sel("medications-0-conditionId","atrial_fibrillation");await sel("medications-0-current","yes");await fill("medications-0-start","2020-01-01");await fill("medications-0-lastFill","2026-09-01");await nav("Review");await next();assert.equal(await page.locator(".result-hero h2").innerText(),"Level benefit screen");
    assert.doesNotMatch(await page.locator("#results-content").innerText(),/Preferred Plus/,"Final-expense factors do not imply a preferred health class");
    await page.screenshot({path:path.join(root,"..","ui-result.png"),fullPage:true});
    // Mobile fields and event controls fit without horizontal page overflow.
    await page.setViewportSize({width:390,height:844});await nav("Medical history");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,"Mobile interview has no page overflow");
    assert.equal(await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector(".app-main")).paddingBottom)>=document.querySelector(".app-footer").getBoundingClientRect().height),true,"Wrapped footer leaves room for the last fields");
    await nav("Product & profile");assert.equal(await page.locator("#dob").inputValue(),"1966-10-08");
    assert.deepEqual(errors,[],"No browser errors");assert.deepEqual(external,[],"Answers never trigger external requests");
    // Old defaults are imported only as facts needing reconfirmation.
    await page.evaluate(()=>{localStorage.removeItem("hce_state_v2");localStorage.setItem("hce_state_v1",JSON.stringify({carrier:"foresters",age:35,heightFt:5,heightIn:10,conditions:[{id:"diabetes",severity:"mild",control:"good"}],criminalActive:false}));});
    await page.reload();await page.locator("#productId").waitFor({state:"attached"});assert.equal(await page.locator("#productId").inputValue(),"");assert.match(await page.locator(".migration-notice").innerText(),/reconfirm/);await nav("Criminal history");assert.equal(await page.locator("#probationCurrent").inputValue(),"");
    // Validate the actual deployment build has all four scripts in order.
    await page.goto(local+"/dist/app.html");await page.locator("#productId").waitFor({state:"attached"});assert.equal(await page.evaluate(()=>window.HCE_VERSION),"69");assert.deepEqual(errors,[]);
    console.log("Passed browser flows: complete interview, product persistence, probation gate, AF prescription exception, mobile layout, migration, privacy requests and embedded build.");
  } catch(e) {console.error("Page text:",(await page.locator("body").innerText()).slice(-1800)); await page.screenshot({path:path.join(root,"..","ui-failure.png"),fullPage:true});throw e;} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
