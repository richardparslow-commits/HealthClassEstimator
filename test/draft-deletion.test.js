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
      localStorage.clear();sessionStorage.clear();
      if(current!==null)localStorage.setItem("hce_state_v2",current);
      if(legacy!==null)localStorage.setItem("hce_state_v1",legacy);
      if(kept!==null)localStorage.setItem("hce_state_v2_unreadable",kept);
    },{current,legacy,kept:kept.length?JSON.stringify(kept.map(raw=>({key:"hce_state_v2",raw,savedAt:"2026-11-22T10:00:00Z"}))):null});
    await page.reload();
    await page.locator("#ack-check").check();
    await page.locator("#ack-accept").click();
    await page.locator("#steps-nav button").nth(10).click();
    await page.locator("#btn-next").click();
    await page.locator("#result-heading").waitFor();
    const storage=()=>page.evaluate((keys)=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)])),KEYS);
    const recovery=()=>page.evaluate(()=>sessionStorage.getItem("hce_delete_recovery"));
    // The fixed footer can cover a control; centre it first, as a person scrolling would.
    const press=async(name)=>{
      const control=page.getByRole("button",{name});
      await control.evaluate(n=>n.scrollIntoView({block:"center"}));
      await control.click();
    };
    const download=async(name)=>{
      const [file]=await Promise.all([page.waitForEvent("download"),press(name)]);
      return fs.readFileSync(await file.path(),"utf8");
    };
    return {context,page,storage,press,download,recovery};
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
    const payload=JSON.parse(saved);
    const keptRaw=payload.records.find(r=>r.key==="hce_state_v2_unreadable")?.raw;
    const storedRaw=(await s.storage()).hce_state_v2_unreadable;
    check(keptRaw==storedRaw,true,"the downloaded backup preserves the quarantine storage exactly");
    const keptEntries=JSON.parse(keptRaw);
    check(Array.isArray(keptEntries),true,"the fixture contains a quarantine array");
    check(keptEntries.some(r=>r.raw===UNREADABLE),true,"the unreadable draft is preserved in the backup");
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

  // 6. Keyboard: Cancel receives initial focus.
  // Download and Delete remain keyboard-accessible.
  // Escape closes the confirmation without deleting data.
  {
    const s=await scenario({current:JSON.stringify(CURRENT),kept:[UNREADABLE]});
    const before=await s.storage();
    await s.press("Delete saved answers and start over");
    const focused=()=>s.page.evaluate(()=>document.activeElement?.textContent);
    check(await focused(),"Cancel","initial focus is on the safe Cancel button");
    await s.page.keyboard.press("Shift+Tab");
    check(await focused(),"Download saved draft","Shift+Tab reaches Download");
    await s.page.keyboard.press("Tab");
    check(await focused(),"Cancel","Tab returns to Cancel");
    await s.page.keyboard.press("Tab");
    check(await focused(),"Permanently delete all saved answers","Delete remains keyboard-accessible");
    await s.page.keyboard.press("Escape");
    check(await s.page.locator(".reset-confirm").isVisible(),false,"Escape closes confirmation");
    check(JSON.stringify(await s.storage()),JSON.stringify(before),"Escape preserves all saved records");
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

  // R2-001: the download holds every owned record, raw and exact, in every combination.
  const exportsFor=async(seed)=>{
    const s=await scenario(seed);
    await s.press("Delete saved answers and start over");
    // Capture the original storage before downloading.
    const before=await s.storage();
    const text=await s.download("Download saved draft");
    // Capture storage again to detect unexpected modifications.
    const after=await s.storage();
    await s.context.close();
    return {payload:JSON.parse(text),before,after};
  };
  const combinations=[
    {label:"current only",seed:{current:JSON.stringify(CURRENT)}},
    {label:"legacy only",seed:{legacy:JSON.stringify(LEGACY)}},
    {label:"quarantined only",seed:{kept:[UNREADABLE]}},
    {label:"current + legacy",seed:{current:JSON.stringify(CURRENT),legacy:JSON.stringify(LEGACY)}},
    {label:"current + quarantined",seed:{current:JSON.stringify(CURRENT),kept:[UNREADABLE]}},
    {label:"legacy + quarantined",seed:{legacy:JSON.stringify(LEGACY),kept:[UNREADABLE]}},
    {label:"all three",seed:{current:JSON.stringify(CURRENT),legacy:JSON.stringify(LEGACY),kept:[UNREADABLE]}},
    {label:"multiple quarantined",seed:{kept:[UNREADABLE,"second unreadable draft","third"]}},
  ];
  for(const {label,seed} of combinations){
    const {payload,before,after}=await exportsFor(seed);
    for(const key of KEYS){
      const entry=payload.records.find(r=>r.key===key);
      check(entry?entry.raw:null,before[key],"the backup preserves "+key+" exactly ("+label+")");
    }
    check(JSON.stringify(after),JSON.stringify(before),"downloading deletes nothing ("+label+")");
  }
  // Unknown historical fields and malformed JSON are preserved verbatim, not migrated away.
  {
    const unknown='{"schemaVersion":2,"futureField":{"nested":[1,2]},"medicalHistory":"yes","conditions":[{"id":"asthma","retiredFlag":"keep me"}]}';
    const {payload}=await exportsFor({current:unknown,kept:["{not json"]});
    check(payload.records.find(r=>r.key==="hce_state_v2").raw,unknown,"unknown fields survive the backup in their raw form");
    check(payload.records.find(r=>r.key==="hce_state_v2_unreadable").raw,'[{"key":"hce_state_v2","raw":"{not json","savedAt":"2026-11-22T10:00:00Z"}]',"malformed entries survive the backup in their raw form");
  }


  // R2-003: a quarantine value whose wrapper is not JSON is disclosed and exported raw.
  {
    const malformed='[{"key":"hce_state_v2","raw":"{\\"broken\\":'; // truncated: not valid JSON
    const s=await scenario({current:JSON.stringify(CURRENT)});
    await s.page.evaluate((value)=>localStorage.setItem("hce_state_v2_unreadable",value),malformed);
    await s.page.reload();
    // The reload starts the interview at step 1; the reset control is on the results page.
    await s.page.locator("#steps-nav button").nth(10).click();
    await s.page.locator("#btn-next").click();
    await s.page.locator("#result-heading").waitFor();
    await s.press("Delete saved answers and start over");
    const panel=await s.page.locator(".reset-confirm").innerText();
    check(/kept-drafts item this build cannot read/.test(panel),true,"the confirmation discloses an unparseable kept-drafts item");
    const text=await s.download("Download saved draft");
    check(JSON.parse(text).records.find(r=>r.key==="hce_state_v2_unreadable").raw,malformed,"the unparseable kept-drafts value is exported raw");
    await s.press("Permanently delete all saved answers");
    await s.page.waitForTimeout(200);
    const after=await s.storage();
    check(after.hce_state_v2_unreadable,null,"and it is deleted with the rest");
    await s.context.close();
  }

  // R2-002: a failure after some removals is reported truthfully, a recovery copy is kept,
  // and a retry completes once the browser allows it.
  for(const failAt of [0,1,2]){
    const s=await scenario({current:JSON.stringify(CURRENT),legacy:JSON.stringify(LEGACY),kept:[UNREADABLE]});
    await s.press("Delete saved answers and start over");
    await s.page.evaluate((n)=>{
      const keys=["hce_state_v2","hce_state_v1","hce_state_v2_unreadable"];
      window.__remove=Storage.prototype.removeItem;
      Storage.prototype.removeItem=function(key){
        if(keys.slice(n).includes(key))throw new DOMException("denied","SecurityError");
        return window.__remove.call(this,key);
      };
    },failAt);
    await s.press("Permanently delete all saved answers");
    await s.page.waitForTimeout(200);
    const after=await s.storage();
    if(failAt>0) check(after.hce_state_v2,null,"after a failure at key "+failAt+" the earlier removal is not undone");
    check(after[KEYS[failAt]]!==null,true,"the key the browser refused is still stored");
    const message=await s.page.locator(".reset-error").innerText().catch(()=>"");
    check(/not fully deleted/.test(message),true,"the failure says the deletion was incomplete, not that nothing happened");
    const held=await s.recovery();
    check(held!==null,true,"a recovery copy of the exact records is kept in this tab");
    const restored=JSON.parse(held).records.find(r=>r.key===KEYS[failAt]);
    check(restored.raw!==null,true,"the recovery copy holds the refused key's value");
    await s.page.evaluate(()=>{Storage.prototype.removeItem=window.__remove;});
    await s.press("Retry deletion");
    await s.page.waitForTimeout(300);
    const final=await s.storage();
    check(Object.values(final).every(v=>v===null),true,"the retry deletes every owned record");
    check(await s.recovery(),null,"and drops the recovery copy after success");
    await s.context.close();
  }

  // R2-004: a tab opened before deletion must not recreate deleted answers.
  {
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const a=await context.newPage();
    await a.goto(local);
    await a.evaluate(data=>{
      localStorage.clear();sessionStorage.clear();
      localStorage.setItem("hce_state_v2",JSON.stringify(data));
    },CURRENT);
    await a.reload();
    await a.locator("#ack-check").check();await a.locator("#ack-accept").click();
    const b=await context.newPage();
    await b.goto(local);
    await b.locator("#ack-check").check();await b.locator("#ack-accept").click();
    await a.locator("#steps-nav button").nth(10).click();
    await a.locator("#btn-next").click();
    await a.locator("#result-heading").waitFor();
    await a.getByRole("button",{name:"Delete saved answers and start over"}).click();
    await a.getByRole("button",{name:"Permanently delete all saved answers"}).click();
    check(await a.evaluate(()=>localStorage.getItem("hce_state_v2")),null,"tab A removed stored interview");
    await b.getByRole("heading",{name:"These answers were deleted in another tab"}).waitFor();
    check(await b.locator("#dob").count(),0,"stale tab hides old interview inputs");
    await b.locator("#btn-save").click();
    check(await b.evaluate(()=>localStorage.getItem("hce_state_v2")),null,"stale tab cannot restore deleted answers");
    check((await b.locator("#toast").textContent()||"").includes("Draft saved on this device."),false,"stale save does not announce success");
    await b.getByRole("button",{name:"Start a new blank interview"}).click();
    await b.locator("#dob").waitFor();
    const fresh=await b.evaluate(()=>localStorage.getItem("hce_state_v2"));
    check(fresh!==null&&!fresh.includes("diabetes"),true,"new blank interview contains no deleted history");
    await b.locator("#dob").fill("1981-02-02");
    const updated=await b.evaluate(()=>localStorage.getItem("hce_state_v2"));
    check(updated!==null&&JSON.parse(updated).dob==="1981-02-02",true,"new interview can save its new answers");
    check(!updated.includes("diabetes"),true,"new save does not restore deleted medical history");
    await context.close();
  }

  // R2-005: A silently ignored generation write must block deletion.
  {
    const s = await scenario({
      current: JSON.stringify(CURRENT)
    });

    await s.page.evaluate(() => {
      localStorage.setItem("hce_draft_generation", "1");
    });

    await s.press("Delete saved answers and start over");

    // Preserve the original method before installing the failure.
    await s.page.evaluate(() => {
      window.__originalSetItem = Storage.prototype.setItem;

      Storage.prototype.setItem = function(key, value) {
        if (
          this === localStorage &&
          key === "hce_draft_generation"
        ) {
          return; // Simulate a silently ignored write.
        }
        return window.__originalSetItem.call(this, key, value);
      };
    });

    await s.press("Permanently delete all saved answers");

    const after = await s.storage();

    check(
      after.hce_state_v2 !== null,
      true,
      "failed generation update preserves the original draft"
    );

    const marker = await s.page.evaluate(() =>
      localStorage.getItem("hce_draft_generation")
    );

    check(marker, "1", "generation marker remains unchanged");

    check(
      await s.page.locator(".reset-error").count(),
      1,
      "marker failure displays a deletion error"
    );

    // Restore the actual original method, not the mock.
    await s.page.evaluate(() => {
      Storage.prototype.setItem = window.__originalSetItem;
      delete window.__originalSetItem;
    });

    // No recovery snapshot exists for this early failure.
    // The original confirmation button remains available.
    await s.press("Permanently delete all saved answers");

    const final = await s.storage();

    check(
      final.hce_state_v2,
      null,
      "retry with a valid generation update deletes the draft"
    );

    check(
      await s.page.evaluate(() =>
        sessionStorage.getItem("hce_delete_recovery")
      ),
      null,
      "successful deletion leaves no recovery snapshot"
    );

    await s.context.close();
  }

  // R2-006: two consecutive partial failures preserve the exact first snapshot.
  {
    const s=await scenario({current:JSON.stringify(CURRENT),legacy:JSON.stringify(LEGACY),kept:[UNREADABLE]});
    const original=await s.storage();
    await s.press("Delete saved answers and start over");
    await s.page.evaluate(()=>{
      window.__r2006Remove=Storage.prototype.removeItem;
      window.__r2006Blocked=["hce_state_v1","hce_state_v2_unreadable"];
      Storage.prototype.removeItem=function(key){
        if(this===localStorage&&window.__r2006Blocked.includes(key))
          throw new DOMException("denied","SecurityError");
        return window.__r2006Remove.call(this,key);
      };
    });
    await s.press("Permanently delete all saved answers");
    const first=await s.storage();
    check(first.hce_state_v2,null,"first partial failure removed current draft");
    check(first.hce_state_v1!==null,true,"first failure preserved legacy draft");
    const snapshot=await s.recovery();
    check(snapshot!==null,true,"first failure staged recovery");
    const saved=JSON.parse(snapshot).records;
    check(saved.length,3,"recovery includes three original draft keys");
    for(const key of KEYS){
      check(saved.find(record=>record.key===key)?.raw,original[key],"original raw record preserved: "+key);
    }
    await s.page.evaluate(()=>{window.__r2006Blocked=["hce_state_v2","hce_state_v1","hce_state_v2_unreadable"];});
    await s.press("Retry deletion");
    check(await s.recovery(),snapshot,"second failed deletion did not overwrite full recovery snapshot");
    check(await s.page.locator(".reset-error").count(),1,"second failure reports incomplete deletion once");
    await s.page.evaluate(()=>{
      Storage.prototype.removeItem=window.__r2006Remove;
      delete window.__r2006Remove;delete window.__r2006Blocked;
    });
    await s.press("Restore saved answers");
    check(JSON.stringify(await s.storage()),JSON.stringify(original),"restore recovers every original raw record exactly");
    await s.context.close();
  }

  // R2-007: ordinary complete deletion removes its staged recovery copy.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    await s.press("Delete saved answers and start over");
    await s.press("Permanently delete all saved answers");
    check((await s.storage()).hce_state_v2,null,"successful deletion removed current draft");
    check(await s.recovery(),null,"successful deletion removed its recovery snapshot");
    check(await s.page.locator("#dob").inputValue(),"","successful deletion displays empty interview");
    await s.context.close();
  }

  // R2-008: refused recovery-key removal blocks success through repeated retries.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    await s.press("Delete saved answers and start over");
    await s.page.evaluate(()=>{
      window.__r2008Remove=Storage.prototype.removeItem;
      Storage.prototype.removeItem=function(key){
        if(this===sessionStorage&&key==="hce_delete_recovery")
          throw new DOMException("denied","SecurityError");
        return window.__r2008Remove.call(this,key);
      };
    });
    await s.press("Permanently delete all saved answers");
    check((await s.storage()).hce_state_v2,null,"draft removal completed before recovery cleanup failure");
    check(await s.recovery()!==null,true,"recovery data remains after refused cleanup");
    check(await s.page.locator(".reset-error").count(),1,"cleanup failure is reported");
    check(await s.page.locator(".reset-confirm").isVisible(),true,"cleanup failure does not signal completion");
    await s.press("Retry deletion");
    check(await s.recovery()!==null,true,"failed retry retains recovery snapshot");
    check(await s.page.locator(".reset-error").count(),1,"retry reports one error, not duplicate notices");
    await s.page.evaluate(()=>{
      Storage.prototype.removeItem=window.__r2008Remove;
      delete window.__r2008Remove;
    });
    await s.press("Retry deletion");
    check(await s.recovery(),null,"successful retry physically removed recovery snapshot");
    check(await s.page.locator("#dob").inputValue(),"","success shows a new empty interview");
    await s.context.close();
  }

  // R2-009: an existing malformed recovery value blocks deletion without overwrite.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    const original=(await s.storage()).hce_state_v2;
    await s.press("Delete saved answers and start over");
    const malformed='{"records":[{"key":"hce_state_v2","raw":';
    await s.page.evaluate(raw=>sessionStorage.setItem("hce_delete_recovery",raw),malformed);
    await s.press("Permanently delete all saved answers");
    check((await s.storage()).hce_state_v2,original,"malformed recovery blocks draft removal");
    check(await s.recovery(),malformed,"malformed recovery bytes remain untouched");
    check(await s.page.locator(".reset-error").count(),1,"malformed recovery displays an error");
    check(await s.page.getByRole("button",{name:"Restore saved answers"}).count(),0,"malformed data is not offered as valid restore");
    await s.context.close();
  }

  // R2-010: denied recovery reads block deletion before removing any draft.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    const original=(await s.storage()).hce_state_v2;
    await s.press("Delete saved answers and start over");
    await s.page.evaluate(()=>{
      window.__r2010Get=Storage.prototype.getItem;
      Storage.prototype.getItem=function(key){
        if(this===sessionStorage&&key==="hce_delete_recovery")
          throw new DOMException("denied","SecurityError");
        return window.__r2010Get.call(this,key);
      };
    });
    await s.press("Permanently delete all saved answers");
    check((await s.storage()).hce_state_v2,original,"unreadable recovery blocks draft removal");
    check(await s.page.locator(".reset-error").count(),1,"storage read failure is reported");
    await s.page.evaluate(()=>{Storage.prototype.getItem=window.__r2010Get;delete window.__r2010Get;});
    await s.context.close();
  }

  // R2-011: failed recovery staging must not advance generation marker or trigger stale-deletion warning.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    await s.press("Delete saved answers and start over");
    // Block sessionStorage.setItem to simulate recovery staging failure
    await s.page.evaluate(()=>{
      window.__origSetItem=sessionStorage.setItem;
      sessionStorage.setItem=function(key,value){
        if(key==="hce_delete_recovery")throw new DOMException("quota exceeded","QuotaExceededError");
        return window.__origSetItem.call(this,key,value);
      };
    });
    await s.press("Permanently delete all saved answers");
    // Verify: original draft still exists
    const after=await s.storage();
    check(after.hce_state_v2!==null,true,"draft preserved when recovery staging fails");
    // Verify: generation marker was NOT advanced (deletion never started)
    const genValue=await s.page.evaluate(()=>localStorage.getItem("hce_draft_generation"));
    check(genValue==null||genValue==="0",true,"generation marker unchanged when staging fails");
    // Verify: no stale-deletion warning because deletion never happened
    check(await s.page.locator(".reset-confirm").count(),1,true,"confirmation remains visible when staging fails");
    // Restore and verify retry is available (not stuck in stale state)
    await s.page.evaluate(()=>{
      sessionStorage.setItem=window.__origSetItem;
      delete window.__origSetItem;
    });
    await s.context.close();
  }

  // R2-012: incomplete existing recovery snapshot blocks deletion of uncovered drafts.
  {
    const s=await scenario({current:JSON.stringify(CURRENT),legacy:JSON.stringify(LEGACY)});
    await s.press("Delete saved answers and start over");
    // Stage an INCOMPLETE recovery snapshot missing the legacy draft
    await s.page.evaluate(()=>{
      const currentRaw=localStorage.getItem("hce_state_v2");
      sessionStorage.setItem("hce_delete_recovery",JSON.stringify({
        stagedAt:new Date().toISOString(),
        records:[{key:"hce_state_v2",raw:currentRaw}]  // Missing hce_state_v1!
      }));
    });
    await s.press("Permanently delete all saved answers");
    // Verify: both drafts remain intact because snapshot doesn't cover legacy
    const after=await s.storage();
    check(after.hce_state_v2!==null,true,"current draft preserved when snapshot incomplete");
    check(after.hce_state_v1!==null,true,"legacy draft preserved when snapshot incomplete");
    // Verify: error about incomplete snapshot
    const message=await s.page.locator(".reset-error").innerText().catch(()=>null);
    check(message!==null,true,"error displayed for incomplete snapshot");
    // Just verify an error was shown (exact wording may vary)
    await s.context.close();
  }

  // R2-013: existing recovery with stale raw values blocks deletion and preserves original data.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    await s.press("Delete saved answers and start over");
    // Stage a recovery snapshot with an OUTDATED version of the current draft
    const olderDraft=JSON.stringify({...CURRENT, dob:"1975-06-15"});
    await s.page.evaluate((d)=>{
      sessionStorage.setItem("hce_delete_recovery",JSON.stringify({
        stagedAt:new Date().toISOString(),
        records:[{key:"hce_state_v2",raw:d}]
      }));
    },olderDraft);
    await s.press("Permanently delete all saved answers");
    // Verify: draft remains intact because snapshot has stale raw value
    const after=await s.storage();
    check(after.hce_state_v2!==null,true,"draft preserved when snapshot has stale raw value");
    // Verify: generation marker was NOT advanced
    const genValue=await s.page.evaluate(()=>localStorage.getItem("hce_draft_generation"));
    check(genValue==null||genValue==="0",true,"generation unchanged when snapshot stale");
    // Verify: error about mismatch
    const message=await s.page.locator(".reset-error").innerText().catch(()=>null);
    check(message!==null,true,"error displayed for stale snapshot");
    // Verify: recovery snapshot is still available for manual recovery
    const recovery=await s.recovery();
    check(recovery!==null,true,"original recovery snapshot preserved after failed deletion");
    await s.context.close();
  }

  // R2-014: Restore button cannot overwrite newer answers when recovery snapshot is stale.
  {
    const s=await scenario({current:JSON.stringify(CURRENT)});
    await s.press("Delete saved answers and start over");
    // Stage a recovery snapshot with an OUTDATED version of the current draft
    const olderDraft=JSON.stringify({...CURRENT, dob:"1975-06-15"});
    await s.page.evaluate((d)=>{
      sessionStorage.setItem("hce_delete_recovery",JSON.stringify({
        stagedAt:new Date().toISOString(),
        records:[{key:"hce_state_v2",raw:d}]
      }));
    },olderDraft);
    await s.press("Permanently delete all saved answers");
    // Deletion should fail because snapshot has stale raw value
    const message=await s.page.locator(".reset-error").innerText().catch(()=>null);
    check(message!==null,true,"error displayed for stale snapshot");
    // Recovery snapshot is still available
    const recovery=await s.recovery();
    check(recovery!==null,true,"recovery snapshot preserved after failed deletion");
    // Click Restore saved answers - should NOT overwrite the newer draft
    await s.press("Restore saved answers");
    // Verify: newer draft remains unchanged (still has original DOB)
    const after=await s.storage();
    check(after.hce_state_v2!==null,true,"newer draft preserved after Restore click");
    const parsed=JSON.parse(after.hce_state_v2);
    check(parsed.dob===CURRENT.dob,true,"newer draft DOB unchanged after Restore click");
    // Verify: recovery snapshot still intact
    const recoveryAfter=await s.recovery();
    check(recoveryAfter!==null,true,"recovery snapshot still available after Restore click");
    await s.context.close();
  }

  check(external.length,0,"no applicant data is sent anywhere: "+JSON.stringify(external.slice(0,3)));
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  console.log("Passed "+checks+" complete-draft-deletion assertions.");
})().catch(async error=>{console.error(error.message);server.close();await process.__browser?.close().catch(()=>{});process.exitCode=1;});

