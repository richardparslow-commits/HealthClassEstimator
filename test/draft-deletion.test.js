"use strict";
// HCE-AUD-001 regression: "Delete saved answers and start over" must ask first and then
// remove every application-owned draft record, including quarantined unreadable drafts,
// and must not claim success when the browser refuses. All data here is synthetic.
const {chromium}=require("playwright");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const server=http.createServer((request,response)=>{
  const name=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
  const file=path.resolve(root,"."+(name==="/"?"/index.html":name));
  if(!file.startsWith(root+path.sep)){response.writeHead(403);response.end();return;}
  fs.readFile(file,(error,data)=>{
    if(error){response.writeHead(404);response.end();return;}
    response.setHeader("Content-Type",file.endsWith(".js")?"text/javascript":file.endsWith(".css")?"text/css":"text/html");
    response.end(data);
  });
});
// A draft this build cannot parse: the shape a real interrupted save leaves behind.
const UNREADABLE='{"schemaVersion":2,"medicalHistory":"yes","conditions":[{"id":"diabetes"}],"broken":';
const CURRENT={schemaVersion:2,dob:"1980-01-01",medicalHistory:"yes",conditions:[{id:"diabetes",status:"current",diagnosisDate:"2020-01-01"}]};
const LEGACY={conditions:[{id:"12"}],dob:"1970-01-01"};
const KEYS=["hce_state_v2","hce_state_v1","hce_state_v2_unreadable"];
let checks=0;
const check=(actual,expected,label)=>{assert.equal(actual,expected,label);checks++;};

(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const browser=process.__browser=await chromium.launch({headless:true,...(process.env.HCE_BROWSER_PATH?{executablePath:process.env.HCE_BROWSER_PATH}:{})});
  const local="http://127.0.0.1:"+server.address().port;
  const external=[];
  // Each case gets a fresh context: one case's storage must not answer another's.
  async function scenario({current=null,legacy=null,kept=[]}){
    const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
    const page=await context.newPage();
    page.on("request",r=>{if(!r.url().startsWith(local)&&!r.url().startsWith("data:"))external.push(r.url());});
    await page.goto(local);
    await page.evaluate(({current,legacy,kept})=>{
      localStorage.clear();
      if(current)localStorage.setItem("hce_state_v2",current);
      if(legacy)localStorage.setItem("hce_state_v1",legacy);
      if(kept.length)localStorage.setItem("hce_state_v2_unreadable",JSON.stringify(kept.map(raw=>({key:"hce_state_v2",raw,savedAt:"2026-11-22T10:00:00Z"}))));
    },{current,legacy,kept});
    await page.reload();
    await page.locator("#ack-check").check();
    await page.locator("#ack-accept").click();
    await page.locator("#steps-nav button").nth(10).click();
    await page.locator("#btn-next").click();
    await page.locator("#result-heading").waitFor();
    const storage=()=>page.evaluate((keys)=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),KEYS);
    // The fixed footer can cover a control; centre it first, as a person scrolling would.
    const press=async(name)=>{
      const control=page.getByRole("button",{name});
      await control.evaluate(n=>n.scrollIntoView({block:"center"}));
      await control.click();
    };
    return {context,page,storage,press};
  }

  // 1. One press asks; it deletes nothing until the question is answered, and cancel
  // 1. One press asks; it deletes nothing until the question is answered, and cancel
  //    leaves every record (including the unreadable draft) exactly as it was.
  {
    const s=await scenario({current:JSON.stringify(CURRENT),kept:[UNREADABLE]});
    await s.press("Delete saved answers and start over");
    check(await s.page.getByRole("heading",{name:"Delete all saved answers?"}).count(),1,"the reset asks before deleting");
    const text=await s.page.locator(".reset-confirm").innerText();
    check(/unreadable saved draft/.test(text),true,"the question names the unreadable drafts that will also be deleted");
    check(/cannot be undone/i.test(text),true,"the question says it cannot be undone");
    const before=await s.storage();
    check(before.hce_state_v2!==null,true,"nothing is deleted while the question is open");
    check(before.hce_state_v2_unreadable!==null,true,"the unreadable draft is still there while the question is open");
    await s.press("Cancel");
    const after=await s.storage();
    check(after.hce_state_v2,before.hce_state_v2,"cancelling keeps the current draft");
    check(after.hce_state_v2_unreadable,before.hce_state_v2_unreadable,"cancelling keeps the unreadable draft");
    check(await s.page.locator(".reset-confirm").isVisible(),false,"cancelling closes the question");
    await s.context.close();
  }

  // 2. Downloading before deleting writes a file and deletes nothing.
  {
    const s=await scenario({current:JSON.stringify(CURRENT),kept:[UNREADABLE]});
    await s.press("Delete saved answers and start over");
    const [download]=await Promise.all([s.page.waitForEvent("download"),s.press("Download saved draft")]);
    const saved=fs.readFileSync(await download.path(),"utf8");
    check(/diabetes/.test(saved),true,"the download holds the saved draft");
    check(JSON.parse(saved).some(r=>(r.raw??r.draft)===UNREADABLE),true,"and the unreadable draft, as raw text");
    const after=await s.storage();
    check(after.hce_state_v2_unreadable!==null,true,"downloading deletes nothing");
    await s.context.close();
  }

  // 3. Confirmed deletion removes current, legacy and every quarantined record (one,
  //    several, malformed and hostile), and a reload does not bring any of them back.
  {
    const s=await scenario({current:JSON.stringify(CURRENT),legacy:JSON.stringify(LEGACY),kept:[UNREADABLE,"not json either\u0000",'<script>window.__x=1</script>']});
    await s.press("Delete saved answers and start over");
    await s.press("Permanently delete all saved answers");
    await s.page.waitForTimeout(200);
    const after=await s.storage();
    check(after.hce_state_v2,null,"the current draft is deleted");
    check(after.hce_state_v1,null,"the legacy draft is deleted");
    check(after.hce_state_v2_unreadable,null,"all quarantined drafts are deleted");
    check(await s.page.locator("#dob").inputValue(),"","the interview is empty after deletion");
    check(await s.page.locator(".migration-notice").count(),0,"the unreadable-draft warning is gone once its data is gone");
    await s.page.reload();
    const reloaded=await s.page.evaluate((keys)=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),KEYS);
    check(Object.values(reloaded).every(v=>v===null),true,"a reload does not bring the drafts back");
    check(await s.page.evaluate(()=>window.__x===1),false,"the hostile draft's script never ran");
    await s.context.close();
  }

  // 4. A browser that refuses removal is reported, the data stays, and a retry works.
  {
    const s=await scenario({current:JSON.stringify(CURRENT),kept:[UNREADABLE]});
    await s.press("Delete saved answers and start over");
    await s.page.evaluate(()=>{window.__remove=Storage.prototype.removeItem;Storage.prototype.removeItem=function(){throw new DOMException("denied","SecurityError");};});
    await s.press("Permanently delete all saved answers");
    await s.page.waitForTimeout(200);
    const after=await s.storage();
    check(after.hce_state_v2_unreadable!==null,true,"a refused deletion keeps the data");
    check(await s.page.locator(".reset-error").count(),1,"the refusal is shown, not swallowed");
    await s.page.evaluate(()=>{Storage.prototype.removeItem=window.__remove;});
    await s.press("Permanently delete all saved answers");
    await s.page.waitForTimeout(200);
    const retried=await s.storage();
    check(retried.hce_state_v2_unreadable,null,"an applicant can retry once the browser allows it");
    await s.context.close();
  }

  // 5. Reset after a migrated older draft still deletes everything.
  {
    const s=await scenario({legacy:JSON.stringify(LEGACY)});
    await s.press("Delete saved answers and start over");
    await s.press("Permanently delete all saved answers");
    await s.page.waitForTimeout(200);
    const after=await s.storage();
    check(after.hce_state_v1,null,"a migrated legacy draft is deleted");
    await s.context.close();
  }

  // 6. Keyboard: focus starts on the delete action, Tab reaches download and cancel, and
  //    Enter on cancel closes the question.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    await s.press("Delete saved answers and start over");
    check(await s.page.evaluate(()=>document.activeElement?.textContent),"Permanently delete all saved answers","focus starts on the delete action");
    await s.page.keyboard.press("Shift+Tab");
    check(await s.page.evaluate(()=>document.activeElement?.textContent),"Cancel","Shift+Tab reaches cancel");
    await s.page.keyboard.press("Shift+Tab");
    check(await s.page.evaluate(()=>document.activeElement?.textContent),"Download saved draft","and the download action before it");
    await s.page.keyboard.press("Tab");await s.page.keyboard.press("Enter");
    check(await s.page.locator(".reset-confirm").isVisible(),false,"Enter on cancel closes the question");
    await s.context.close();
  }

  // 7. Embedded in a tall iframe (the Streamlit shape), the question is reachable too.
  {
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage();
    await page.goto(local);
    await page.evaluate(()=>{document.body.innerHTML='<iframe style="width:100%;height:2400px" src="/index.html"></iframe>';});
    const frame=page.frameLocator("iframe");
    await frame.locator("#ack-check").check();
    await frame.locator("#ack-accept").click();
    check(await frame.locator("#ack-gate").isVisible(),false,"the gate yields inside the embedded frame");
    check(await frame.locator("#steps-nav button").count(),11,"all eleven steps render inside the embedded frame");
    check(await frame.locator("#btn-next").count(),1,"the footer controls render inside the embedded frame");
    await context.close();
  }

  check(external.length,0,"no applicant data is sent anywhere: "+JSON.stringify(external.slice(0,3)));
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  console.log("Passed "+checks+" complete-draft-deletion assertions.");
})().catch(async error=>{console.error(error.message);server.close();await process.__browser?.close().catch(()=>{});process.exitCode=1;});

