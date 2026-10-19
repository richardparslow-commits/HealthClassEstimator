"use strict";
// Optional browser verification. npm install --no-save playwright; npx playwright install chromium;
// npm run test:ui. HCE_BROWSER_PATH may point to an existing Chromium binary.
const {chromium}=require("playwright"),fs=require("fs"),path=require("path"),http=require("http"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const expectedVersion=fs.readFileSync(path.join(root,"index.html"),"utf8").match(/var HCE_VERSION = "(\d+)"/)[1];
// The host page an embedder makes when it gives the app a frame far taller than the window
// it is shown in: Streamlit's `st.iframe(..., height=2400)` is this, measured on the
// deployed app on 2026-10-17 with the interview's Next button 1,361px below the fold.
const OVERSIZED_HOST='<iframe style="width:100%;height:2400px;border:0" src="/dist/app.html"></iframe>';
const server=http.createServer((req,res)=>{
  const name=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  if(name === "/oversized-host"){res.writeHead(200,{"Content-Type":"text/html"});res.end("<!doctype html><html><body style=\"margin:0\">"+OVERSIZED_HOST+"</body></html>");return;}
  const file=path.resolve(root,"."+(name === "/"?"/index.html":name));
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
    // The gate is embedded in a frame whose height the predictor page fixes, so its way
    // forward has to be on screen inside that frame. It used to be the last thing in a
    // scroller nobody knew scrolled: 1,300px below the fold on a phone. The card now fits
    // the frame and only its text moves, so assert that rather than assume it.
    const acceptOnScreen=()=>page.evaluate(()=>{const r=document.getElementById("ack-accept").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;});
    assert.equal(await acceptOnScreen(),true,"The acknowledgment's continue button is on screen without scrolling");
    await page.setViewportSize({width:390,height:844});assert.equal(await acceptOnScreen(),true,"and in a phone-sized frame");
    await page.setViewportSize({width:390,height:420});assert.equal(await acceptOnScreen(),true,"and in a landscape phone's frame, where the card scrolls instead");
    assert.equal(await page.evaluate(()=>{const c=document.querySelector(".ack-card");return c.scrollHeight>c.clientHeight?getComputedStyle(c).overflowY==="auto":true;}),true,"and the acknowledgment text stays reachable there");
    // A browser tab is window-shaped, so the oversized-frame panel must not apply to it.
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains("oversized-frame")),false,"a browser tab is not treated as an embedder's oversized frame");
    await page.setViewportSize({width:1280,height:900});
    await page.locator("#ack-check").check();await page.locator("#ack-accept").click();
    assert.equal(await page.locator(".app-main").evaluate(n=>n.inert),false);
    await sel("productId","banner_opterm");
    // Choosing a product re-renders the step; keyboard focus must stay on the question, not the document.
    assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),"productId","Focus stays on the product question after the step re-renders");
    await fill("dob","1991-10-08");await sel("sex","male");await sel("state","TX");await fill("faceAmount",500000);await sel("termYears","20");
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
    // A medicine's condition link follows the diagnosis it names: removing that diagnosis clears
    // the link, so the screen and the stored answer agree and the engine asks for it again.
    await nav("Medical history");await page.getByRole("button",{name:"Remove this entry"}).first().click();
    await nav("Prescriptions");assert.equal(await page.locator("#medications-0-conditionId").inputValue(),"","Removing the condition unlinks its medicine on screen");
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("hce_state_v2")).medications[0].conditionId),"","and in the stored answer");
    assert.deepEqual(errors,[],"No browser errors");assert.deepEqual(external,[],"Answers never trigger external requests");
    // Old defaults are imported only as facts needing reconfirmation.
    await page.evaluate(()=>{localStorage.removeItem("hce_state_v2");localStorage.setItem("hce_state_v1",JSON.stringify({carrier:"foresters",age:35,heightFt:5,heightIn:10,conditions:[{id:"diabetes",severity:"mild",control:"good"}],criminalActive:false}));});
    await page.reload();await page.locator("#productId").waitFor({state:"attached"});assert.equal(await page.locator("#productId").inputValue(),"");assert.match(await page.locator(".migration-notice").innerText(),/reconfirm/);await nav("Criminal history");assert.equal(await page.locator("#probationCurrent").inputValue(),"");
    // A legacy condition whose id is not text must not wipe the draft: it is kept as an
    // "Another diagnosis" entry to reconfirm, and the diagnosis beside it survives a save.
    await page.evaluate(()=>{localStorage.removeItem("hce_state_v2");localStorage.setItem("hce_state_v1",JSON.stringify({heightFt:5,heightIn:10,weightLb:165,conditions:[{id:12},{id:"diabetes"}]}));});
    await page.reload();await page.locator("#productId").waitFor({state:"attached"});
    await nav("Medical history");assert.equal(await page.locator(".history-entry").count(),2,"Both legacy diagnoses are kept after migration");
    assert.equal(await page.locator("#conditions-0-id").inputValue(),"other","The non-text id is kept as another diagnosis to reconfirm");
    assert.equal(await page.locator("#conditions-0-name").inputValue(),"12","and its legacy id is shown as the name to reconfirm");
    assert.equal(await page.locator("#conditions-1-id").inputValue(),"diabetes","The valid legacy diagnosis is unchanged");
    await fill("conditions-0-name","Heart murmur");
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem("hce_state_v2")).conditions.map(c=>c.id)),["other","diabetes"],"Saving keeps both diagnoses in storage");
    // A draft this build cannot read is copied aside before anything overwrites it, so
    // starting over costs a session of answers instead of every answer saved.
    await page.evaluate(()=>{for(const k of ["hce_state_v2","hce_state_v1","hce_state_v2_unreadable"])localStorage.removeItem(k);localStorage.setItem("hce_state_v2","{not json");});
    await page.reload();await page.locator("#productId").waitFor({state:"attached"});
    assert.match(await page.locator(".migration-notice").innerText(),/could not be read/,"An unreadable draft is reported, not silently replaced");
    assert.equal(await page.locator("details.kept-draft").count(),1,"The kept draft can be opened");
    assert.equal(await page.locator(".kept-draft textarea").first().isVisible(),false,"and stays closed until asked for");
    await page.locator("details.kept-draft summary").click();
    assert.equal(await page.locator(".kept-draft textarea").first().inputValue(),"{not json","showing the text that could not be read");
    const [download]=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Download the kept draft"}).click()]);
    assert.match(download.suggestedFilename(),/^health-class-draft-kept-\d{4}-\d{2}-\d{2}\.txt$/,"with a dated file name");
    assert.equal(fs.readFileSync(await download.path(),"utf8"),"{not json","and downloads the same text");
    await sel("productId","banner_opterm");
    const kept=await page.evaluate(()=>{const q=JSON.parse(localStorage.getItem("hce_state_v2_unreadable"));return {raw:q[0].raw,key:q[0].key,current:JSON.parse(localStorage.getItem("hce_state_v2")).productId};});
    assert.equal(kept.raw,"{not json","The unreadable text is kept word for word");
    assert.equal(kept.key,"hce_state_v2","and names the key it came from");
    assert.equal(kept.current,"banner_opterm","while the new draft saves beside it");
    // A saved value that parses but is not an object is unreadable too, and is kept as well.
    await page.evaluate(()=>{localStorage.removeItem("hce_state_v2");localStorage.setItem("hce_state_v2","[1,2]");});
    await page.reload();await page.locator("#productId").waitFor({state:"attached"});
    assert.match(await page.locator(".migration-notice").innerText(),/could not be read/);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("hce_state_v2_unreadable")).length),2,"Both unreadable drafts are kept");
    // Once it has been downloaded, a kept draft can be deleted from this browser — one at a
    // time, and only after saying so: it is the applicant's only copy until they act.
    await page.locator("details.kept-draft summary").click();
    const deleteKept=page.getByRole("button",{name:"Delete this kept draft"});
    assert.equal(await deleteKept.count(),2,"Each kept draft can be deleted on its own");
    await deleteKept.first().click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("hce_state_v2_unreadable")).length),2,"Asking to delete removes nothing yet");
    await page.getByRole("button",{name:"Keep it"}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("hce_state_v2_unreadable")).length),2,"and keeping it leaves both drafts kept");
    await deleteKept.first().click();await page.getByRole("button",{name:"Delete permanently"}).click();
    const afterFirst=await page.evaluate(()=>({kept:JSON.parse(localStorage.getItem("hce_state_v2_unreadable")),notice:!!document.querySelector(".migration-notice"),open:document.querySelector("details.kept-draft")?.open}));
    assert.equal(afterFirst.kept.length,1,"Confirming deletes that draft and only that one");
    assert.equal(afterFirst.kept[0].raw,"[1,2]","leaving the other kept draft word for word");
    assert.equal(afterFirst.open,true,"and the panel stays open on the draft that is left");
    await deleteKept.first().click();await page.getByRole("button",{name:"Delete permanently"}).click();
    const afterLast=await page.evaluate(()=>({kept:localStorage.getItem("hce_state_v2_unreadable"),panel:!!document.querySelector("details.kept-draft"),notice:!!document.querySelector(".migration-notice"),focus:document.activeElement&&document.activeElement.tagName}));
    assert.equal(afterLast.kept,null,"Deleting the last kept draft removes the storage key rather than an empty list");
    assert.equal(afterLast.panel,false,"the panel goes with it");
    assert.equal(afterLast.notice,false,"and so does the notice that a draft was kept");
    assert.equal(afterLast.focus,"H2","with focus on the step heading, not the document");
    // Validate the actual deployment build has all four scripts in order.
    await page.goto(local+"/dist/app.html");await page.locator("#productId").waitFor({state:"attached"});assert.equal(await page.evaluate(()=>window.HCE_VERSION),expectedVersion);assert.deepEqual(errors,[]);
    // An embedder can make this document's viewport far taller than the window it is shown
    // in, and everything the app positioned against the viewport then landed at the bottom
    // of a document the visitor cannot see the whole of. The app now takes the height of
    // the window it is actually shown in and scrolls inside itself, so this is the
    // deployed geometry — a 2,400px frame in a 900px window — judged from inside the app.
    const framed=await context.newPage();
    await framed.goto(local+"/oversized-host");
    const estimator=await (async()=>{for(let i=0;i<60;i++){const f=framed.frames().find(c=>c.url().includes("/dist/app.html"));if(f&&await f.evaluate(()=>!!document.getElementById("btn-next")).catch(()=>false))return f;await framed.waitForTimeout(200);}return null;})();
    assert.ok(estimator,"the oversized frame loads the build");
    assert.equal(await estimator.evaluate(()=>{const r=document.getElementById("ack-accept").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth;}),true,"the acknowledgment's way forward is inside the window, not at the bottom of the frame");
    assert.equal(await estimator.evaluate(()=>{const r=document.getElementById("btn-next").getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true,"and so is the interview's, before it has been reached");
    await estimator.locator("#ack-check").check();await estimator.locator("#ack-accept").click();
    const panel=await estimator.evaluate(()=>{const b=document.body,f=document.querySelector(".app-footer").getBoundingClientRect();return {scrolls:b.scrollHeight>b.clientHeight,band:Math.round(b.getBoundingClientRect().height),footerBottom:Math.round(f.bottom)};});
    assert.equal(panel.scrolls,true,"the app scrolls inside the panel, so a question taller than it is still reachable");
    assert.ok(panel.footerBottom<=panel.band&&panel.footerBottom>=panel.band-160,"with the footer at the panel's bottom edge");
    const scrolled=await estimator.evaluate(()=>{const b=document.body;b.scrollTop=b.scrollHeight;const f=document.querySelector(".app-footer").getBoundingClientRect();return {footerBottom:Math.round(f.bottom),band:Math.round(b.getBoundingClientRect().height)};});
    assert.ok(scrolled.footerBottom<=scrolled.band&&scrolled.footerBottom>=scrolled.band-160,"still there when the content scrolls under it");
    const advanced=await estimator.evaluate(()=>{document.body.scrollTop=document.body.scrollHeight;document.getElementById("btn-next").click();return new Promise(resolve=>setTimeout(()=>resolve({scrollTop:Math.round(document.body.scrollTop),heading:document.querySelector("#step-content h2").textContent}),120));});
    assert.equal(advanced.scrollTop,0,"a step change returns the panel to the top, where the new question is");
    assert.equal(advanced.heading,"Residency & travel","and the next step is the one on screen");
    await framed.close();
    console.log("Passed browser flows: complete interview, product persistence, probation gate, AF prescription exception, mobile layout, migration, privacy requests, embedded build and the oversized-frame panel.");
  } catch(e) {console.error("Page text:",(await page.locator("body").innerText()).slice(-1800)); await page.screenshot({path:path.join(root,"..","ui-failure.png"),fullPage:true});throw e;} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
