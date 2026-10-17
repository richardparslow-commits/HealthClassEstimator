"use strict";
/* Fixtures for scripts/check-consumer-parity.js.

   The check exists because release 78 shipped underwriting logic that lived only
   inside the website's embedded copy (ISSUE-001). These cases prove it separates
   a consumer's legitimate embed adaptations from a real fork of the rules — and, once
   the consumer declares those adaptations, that it holds the page to the build plus
   them exactly instead of describing its own card as invented logic. It also holds a
   served page to the deployment it claims to be: the website's page read at a named
   commit, which the verdict then names.
*/
const fs=require("fs"),path=require("path"),os=require("os"),http=require("http"),assert=require("node:assert/strict"),{execFileSync,execFile}=require("child_process");
const root=path.resolve(__dirname,".."),checker=path.join(root,"scripts/check-consumer-parity.js");
const buildPath=path.join(root,"dist/app.html");
if(!fs.existsSync(buildPath))throw new Error("dist/app.html is missing — run: npm run build");
const build=fs.readFileSync(buildPath,"utf8");
let checks=0;
function equal(actual,expected,label){assert.equal(actual,expected,label);checks++;}
function ok(actual,label){assert.ok(actual,label);checks++;}

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"hce-parity-"));
const write=(name,content)=>{const p=path.join(dir,name);fs.writeFileSync(p,content);return p;};
// Never throw on a non-zero exit: the exit status is the assertion.
function check(consumer,buildFile=buildPath,extra=[]){
  try{return{status:0,out:execFileSync(process.execPath,[checker,"--consumer",consumer,"--build",buildFile,...extra],{encoding:"utf8",stdio:["ignore","pipe","pipe"]})};}
  catch(e){return{status:e.status,out:String(e.stdout||""),err:String(e.stderr||"")};}
}

// 1. A consumer that is the build untouched passes byte-for-byte.
let r=check(write("baseline.html",build));
equal(r.status,0,"unmodified build passes");
ok(/byte-identical/.test(r.out),"unmodified build is reported as byte-identical");

// 2a. A rule line that exists only in the copy — the ISSUE-001 shape. This is the
//     case the check exists for: no branch has it, and a rebuild would delete it.
const unversioned=write("rule-fork.html",build.replace('      "M-TLE-HIGHLIGHT"\n','      "M-TLE-HIGHLIGHT"\n      "M-TLE-UNVERSIONED-FIXTURE"\n'));
r=check(unversioned);
equal(r.status,1,"a rules.js fork fails the check");
ok(/underwriting rules\s+DIFFERS/.test(r.out),"the rules fork is attributed to the rules component");
ok(/FAIL — this consumer and the build disagree on underwriting logic/.test(r.out),"failure explains the single-source-of-truth breach");
ok(/never edit its copy to\s+match: that is how ISSUE-001 happened/i.test(r.out),"failure names the way this went wrong before");
ok(/rules: 1 consumer-only line\(s\) are not in this build/.test(r.out),"an unversioned line is named as missing here");
ok(/consumer only: "M-TLE-UNVERSIONED-FIXTURE"/.test(r.out),"failure quotes the unversioned line");
ok(/Port each unmatched consumer-only line above into js\/rules\.js/.test(r.out),"failure tells the maintainer to port it, with a test");

// 2b. The copy holds an earlier version of a line the build has since rewritten:
//     that is "republish", not "port", and saying otherwise would undo the fix.
r=check(write("rule-rewrite.html",build.replace('      "M-TLE-HIGHLIGHT"\n','      "M-TLE-HIGHLIGHT" //fixture\n')));
equal(r.status,1,"an earlier version of a rule still fails the check");
ok(/rules: the copy holds earlier versions of 1 line\(s\) that this build has since rewritten/.test(r.out),"a rewrite is described as the copy being behind");
ok(/republish, do not port/.test(r.out),"a rewrite names republishing as the fix");
ok(!/Port each unmatched/.test(r.out),"a rewrite never asks for the fix to be ported back");
equal(check(write("engine-drift.html",build.replace("const Engine =","const Engine = /* fixture */"))).status,1,"an engine.js fork fails the check");
equal(check(write("state-drift.html",build.replace("const InterviewState =","const InterviewState = /* fixture */"))).status,1,"a state.js fork fails the check");

// 3. Presentational drift is reported but does not fail — a consumer may adapt.
r=check(write("app-drift.html",build.replace("const App =","const App = /* fixture */")));
equal(r.status,0,"an app.js-only difference passes");
ok(/presentation app\s+DIFFERS/.test(r.out),"an app.js difference is reported, not hidden");
ok(/PASS — underwriting logic matches the build/.test(r.out),"pass states that underwriting logic matched");

// 4. The shape the website actually uses: own CSP, same-origin contact links,
//    injected adapter script/style, and an app.js edit. Only the app.js edit is drift.
const siteShape=build
  .replace("<head>","<head>\n  <meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self'; style-src 'unsafe-inline'\">")
  .replace(/href="[^"]*\/contact"/g,'href="/contact" target="_parent"')
  .replace("const App =","const App = /* fixture */")
  .replace("</body>","<style>\n.scroll-region:focus-visible{outline:2px solid}\n</style>\n<script>\ndocument.querySelectorAll(\"table\").forEach(t=>t.setAttribute(\"role\",\"table\"));\n</script>\n</body>");
const site=write("site-shape.html",siteShape);
r=check(site);
equal(r.status,0,"embed adaptations do not fail the check");
ok(/underwriting rules\s+identical/.test(r.out),"the site's rules match the build");
ok(/underwriting state\s+identical/.test(r.out),"the site's state matches the build");
ok(/underwriting engine\s+identical/.test(r.out),"the site's engine matches the build");
ok(!/consumer only:.*Content-Security-Policy/.test(r.out),"the consumer's own CSP is folded out");
ok(!/consumer only:.*href="\/contact"/.test(r.out),"same-origin contact links are folded out");
ok(!/consumer only:.*scroll-region:focus-visible/.test(r.out),"an injected adapter style is folded out");
ok(!/consumer only:.*role","table/.test(r.out),"an injected adapter script is folded out");
equal(siteShape.split("\n").filter(l=>/http-equiv="Content-Security-Policy"/.test(l)).length,1,"fixture really carries a consumer-only CSP line");
equal(siteShape.split("\n").filter(l=>/href="\/contact"/.test(l)).length,2,"fixture really rewrites both broker contact links");

// 4b. A page element removed only in the copy is still reported, so the markup
//     comparison cannot pass vacuously.
const removed=write("removed-element.html",build.replace(/<h1[^>]*>[\s\S]*?<\/h1>/,""));
r=check(removed);
equal(r.status,0,"a removed page element is presentational, not underwriting drift");
ok(/presentation markup\s+DIFFERS/.test(r.out),"a removed page element is reported");
ok(/build only/.test(r.out),"the removed element is shown as build-only");

// 4c. A copy pasted elsewhere loses the final newline: packaging, not drift.
r=check(write("no-final-newline.html",build.replace(/\n(\n<\/script>)/g,"$1")));
equal(r.status,0,"a lost final newline does not fail the check");
ok(/underwriting rules\s+identical\s+—\s+identical apart from 1 trailing whitespace/.test(r.out),"the lost newline is reported as trailing whitespace, not silently ignored");

// 4d. A copy is missing a source record the build has — the ISSUE-001 shape in the
//     other direction. Behind means republish; forked means port first.
const droppedRecord=build.replace('      "M-TLE-HIGHLIGHT"\n','');
ok(droppedRecord!==build,"fixture removes a record that really is in the build");
r=check(write("behind.html",droppedRecord));
equal(r.status,1,"a copy missing a source record still fails");
ok(/rules: the copy is behind the build/.test(r.out),"the failure distinguishes behind from forked");
ok(!/Port each unmatched/.test(r.out),"a copy that is simply behind is not asked for a port");
ok(/build only\s+:\s+"M-TLE-HIGHLIGHT"/.test(r.out),"the record the copy is missing is quoted from the build side");

// 5. The website's route file keeps the embed as a JavaScript string literal.
const escaped=build.replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/\r?\n/g,"\\n");
const wrapper=write("route.tsx",'const TITLE = "Health class";\n// Self-contained release from the reviewed source.\nconst ESTIMATOR_HTML =\n  \''+escaped+'\';\n\nexport default TITLE;\n');
r=check(wrapper);
equal(r.status,0,"an embed stored as a string literal is read and compared");
ok(/byte-identical/.test(r.out),"the string-literal embed matches the build byte-for-byte");

// 5b. The website delivers the embed through an iframe srcDoc attribute, so the
//     served document has real newlines and entity-escaped markup. React renders the
//     prop as `srcDoc`; a lowercase `srcdoc` page must read the same. When a page
//     carries a stale inline copy as well, the frame an applicant actually runs wins.
const entityEscape=(s)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
for(const [attr,label] of [["srcDoc","React's srcDoc"],["srcdoc","the HTML srcdoc"]])
{
  const page=write("page-"+attr+".html",'<html><body><h1>Health class predictor</h1><iframe id="health-class-estimator" '+attr+'="'+entityEscape(build)+'"></iframe></body></html>');
  r=check(page);
  equal(r.status,0,label+" attribute is read and matches the build");
  ok(/iframe srcDoc in/.test(r.out),label+" is reported as the document compared");
  ok(/byte-identical/.test(r.out),label+" compares against the unescaped document");
}
const pageWithStaleInline=write("page-stale-inline.html",'<html><body>'+build.replace("const Engine =","const Engine = /* stale-inline */")+'<iframe srcDoc="'+entityEscape(build)+'"></iframe></body></html>');
r=check(pageWithStaleInline);
equal(r.status,0,"the rendered frame is preferred over a stale inline copy on the same page");
ok(/iframe srcDoc in/.test(r.out),"the frame is the document that gets compared");
equal(check(write("page-inline-only.html","<html><body>"+build.replace("const Engine =","const Engine = /* stale-inline */")+"</body></html>")).status,1,"a page inlining the estimator directly is still compared");

// 6. An unreadable consumer is a failure, not a silent pass.
r=check(write("nothing.html","<html><body>no estimator here</body></html>"));
equal(r.status,1,"a consumer with no embedded estimator fails");
ok(/No embedded estimator found/.test(r.err),"the failure says what was missing");
equal(check(path.join(dir,"missing-file.html")).status,1,"an unreadable consumer fails");

// 5c. The website's route file splices its own adapter constants into the literal
//     at render time. The delivered document is what gets compared, so the adapters
//     are not mistaken for drift — and a stale literal inside it still fails.
const routeFile=(literal,extraAdapters="")=>
  "import { Link } from \"@tanstack/react-router\";\n\n"+
  "const TITLE = \"Health class estimator\";\n"+
  "const ESTIMATOR_HTML =\n  '"+literal+"';\n\n"+
  "const ESTIMATOR_NAVIGATION_ADAPTER = `\n<script>\n(function(){document.title=\"nav adapter\";})();\n<\/script>\n`;\n\n"+
  "const ESTIMATOR_CONTACT_ADAPTER = `\n<style>\n.some-adapter-style { color: red; }\n</style>\n<script>\n\n(function(){window.addEventListener(\"message\",function(){});})();\n<\/script>\n`;\n\n"+
  "export function Page() {\n  return <iframe srcDoc={ESTIMATOR_HTML.replace(\"<\/body>\", ESTIMATOR_NAVIGATION_ADAPTER + ESTIMATOR_CONTACT_ADAPTER + \"<\/body>\")} />;\n}\n"+extraAdapters;
const escapedBuild=build.replace(/\\/g,"\\\\").replace(/'/g,"\\'").replace(/\r?\n/g,"\\n");
r=check(write("route-composed.tsx",routeFile(escapedBuild)));
equal(r.status,0,"a route file that splices adapters into the literal passes");
ok(/adapter constants spliced into its srcDoc/.test(r.out),"the comparison says it rebuilt the delivered document");
ok(/underwriting rules\s+identical/.test(r.out),"the spliced literal's rules are compared, not the adapters");
ok(/folded out; the delivered document differs only by its CSP/.test(r.out),"the verdict distinguishes adaptations from drift");
r=check(write("route-composed-stale.tsx",routeFile(escapedBuild.replace('      "M-TLE-HIGHLIGHT"\\n','                              '))));
equal(r.status,1,"a stale literal inside a spliced route file still fails");
ok(/underwriting rules\s+DIFFERS/.test(r.out),"the stale component is named");

// 6b. A --build that is not the built artifact fails loudly instead of comparing nothing.
r=check(write("other-baseline.html",build),write("not-a-build.html","<html><body>an unrelated file</body></html>"));
equal(r.status,1,"an unrecognisable build fails the check");
ok(/does not contain all four components/.test(r.err),"the failure names what the build was missing");

// 8. --expect-identical is what the Streamlit artifact comparison uses: that
//    consumer receives the build output verbatim, so a presentational difference
//    is a failure there even though it is a warning for a consumer that adapts
//    its embed. Without the flag the same fixture passes, which is the point.
r=check(write("forced-baseline.html",build),buildPath,["--expect-identical"]);
equal(r.status,0,"a byte-identical consumer passes --expect-identical");
ok(/byte-identical/.test(r.out),"the pass still reports byte identity");
const presentationOnly=write("forced-presentation.html",build.replace("const App =","const App = /* fixture */"));
equal(check(presentationOnly).status,0,"the same fixture passes the ordinary comparison");
r=check(presentationOnly,buildPath,["--expect-identical"]);
equal(r.status,1,"a presentational difference fails --expect-identical");
ok(/requires the consumer to be\s+byte-identical/.test(r.out),"the failure says what it required");
ok(!/PASS — underwriting logic matches the build/.test(r.out),"the forced comparison does not pass with a presentational note");
// The failing run exits 1, so execFileSync throws and its stdout carries the JSON.
let forcedJson,forcedStatus=0;
try{forcedJson=JSON.parse(execFileSync(process.execPath,[checker,"--consumer",presentationOnly,"--build",buildPath,"--expect-identical","--json"],{encoding:"utf8"}));}
catch(e){forcedStatus=e.status;forcedJson=JSON.parse(String(e.stdout||"{}"));}
equal(forcedStatus,1,"--expect-identical exits 1 when the documents differ");
equal(forcedJson.ok,false,"--json reports the byte-identity failure as not ok");
equal(forcedJson.documentIdentical,false,"--json records that the documents differ");
equal(forcedJson.expectIdentical,true,"--json records that byte identity was required");

// 7. JSON output carries the machine-readable verdict.
const parsed=JSON.parse(execFileSync(process.execPath,[checker,"--consumer",write("json.html",build),"--build",buildPath,"--json"],{encoding:"utf8"}));
equal(parsed.ok,true,"--json reports ok for a matching consumer");
equal(parsed.results.filter(x=>x.critical).length,3,"--json marks the three underwriting components critical");

// 9. The website adapts the build, and says how in consumers/website.json. Those
//    adaptations have to read as declared rather than as an edit made in the copy, and
//    the page has to be held to the composition exactly — otherwise a page serving an
//    older build passes whenever the release changed nothing underwriting-level.
const declaration=require("../consumers/website.json");
const {composeDeclared,loadDeclarations,verifyReleaseClaims,buildVersion,claimPattern}=require("../scripts/check-consumer-parity.js");
// The page's generator, written here independently of the checker: place the added
// lines, rewrite the links, drop the statement. `skip` leaves an adaptation out, which
// is how the fixtures place the page in the states that must fail.
function compose(source,skip=[]){
  let doc=source;
  for(const a of declaration.adaptations){
    if(skip.includes(a.id))continue;
    for(const r of a.rewrites??[])doc=doc.split(r.from).join(r.to);
    if(a.inserts){
      const anchor=a.inserts.before??a.inserts.after,lines=doc.split("\n");
      const at=lines.findIndex(l=>l.includes(anchor));
      if(at<0)throw new Error("fixture cannot place "+a.id);
      lines.splice(a.inserts.before!==undefined?at:at+1,0,...a.inserts.lines);
      doc=lines.join("\n");
    }
    for(const anchor of a.omits??[]){
      const lines=doc.split("\n"),at=lines.findIndex(l=>l.includes(anchor));
      if(at<0)throw new Error("fixture cannot omit "+a.id);
      let depth=0,end=-1;
      for(let i=at;i<lines.length;i++){
        for(const ch of lines[i]){if(ch==="{"||ch==="("||ch==="[")depth++;else if(ch==="}"||ch===")"||ch==="]")depth--;}
        if(depth===0&&i>at){end=i;break;}
      }
      lines.splice(at,end-at+1);doc=lines.join("\n");
    }
  }
  return doc;
}
const pageAdapters="<style>\n  .page-adapter{display:none}\n</style>\n<script>\n(function(){document.title=\"page adapter\";})();\n</script>\n";
// The page states its release outside the embedded document: the footer, the FAQ
// answer (also serialised into FAQPage structured data, so twice) and the schema.org
// softwareVersion. A page that is this build has to carry them, saying this release.
const pageChrome="<p>Release 80 · Updated October 16, 2026 (UTC) · Maintained by Richard Parslow</p>\n"+
  "<p>This page runs HealthClassEstimator release 80, generated from the reviewed build.</p>\n"+
  '<script type="application/ld+json">{"@type":"SoftwareApplication","softwareVersion":"80"}</script>\n'+
  '<script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"acceptedAnswer":{"text":"This page runs HealthClassEstimator release 80, generated from the reviewed build."}}]}</script>\n';
// The real page delivers the estimator through an iframe srcDoc, with its release
// claims in the page around the frame. Building the fixture the same way keeps the
// claims out of the document being compared, which is what the live read sees too.
const pageOf=(doc)=>'<html><body><main>'+pageChrome+'</main><iframe id="health-class-estimator" srcDoc="'+entityEscape(doc.replace("</body>",pageAdapters+"</body>"))+'\"></iframe></body></html>';
const sourceOf=(doc)=>doc.replace("</body>",pageAdapters+"</body>");
const declaredDocument=compose(build);
const declaredPage=pageOf(declaredDocument);
const declared=["--declarations",path.join(root,"consumers/website.json")];
let r2=check(write("declared-page.html",declaredPage),buildPath,declared);
equal(r2.status,0,"the page that is this build plus its declared adaptations passes\n"+r2.out+r2.err);
ok(/Declared : consumers\/website.json/.test(r2.out),"the report names the declarations it applied");
ok(/declared in consumers\/website.json: result-contact-card, no-comparison-table/.test(r2.out),"the pass names the adaptations, not a warning");
ok(/The page runs this build/.test(r2.out),"the pass says the page is this build");
ok(!/check whether the copy invented them/.test(r2.out),"the page's own contact card is no longer called invented");
ok(!/Bring anything you want to keep back into/.test(r2.out),"nothing is suggested to be ported back from the page");
ok(!/the page's declared adaptations no longer hold/.test(r2.out),"a matching page has no declaration problems");
equal(composeDeclared(build,declaration.adaptations,[]),declaredDocument,"the checker composes the page the way an independent application does");
const declaredJson=JSON.parse(execFileSync(process.execPath,[checker,"--consumer",write("declared-json.html",declaredPage),"--build",buildPath,...declared,"--json"],{encoding:"utf8"}));
equal(declaredJson.declarations.exact,true,"--json records that the page is the composition exactly");
equal(declaredJson.declarations.problems.length,0,"--json carries no declaration problems");
equal(declaredJson.declarations.ids.length,4,"--json names all four adaptations");
ok(declaredJson.declarations.composed>200000,"--json records how much of the page the composition covers");

// 9b. A line nobody declared is drift, even inside a page that carries every declared
//     adaptation: the page is generated, so it cannot quietly grow a screen.
const extra=write("declared-extra.html",pageOf(declaredDocument.replace('    const contactBox=node("section","card");','    const extraScreen=node("div","card");\n    const contactBox=node("section","card");')));
r2=check(extra,buildPath,declared);
equal(r2.status,1,"an undeclared line on top of the declared page fails");
ok(/not this build with its declared adaptations/.test(r2.out),"the failure says the page is not the composition");
ok(/not declared in consumers\/website.json/.test(r2.out),"the undeclared line is named as undeclared");
ok(/consumer only: const extraScreen=node\("div","card"\);/.test(r2.out),"the undeclared line is quoted");
ok(!/consumer only: const contactBox/.test(r2.out),"the declared card is not listed as unexplained");

// 9b-bis. A page serving an older build fails even when the release changed only
//        presentation. This is the case the old check passed with a warning: a page one
//        stylesheet revision behind, with every underwriting component identical.
r2=check(write("older-page.html",pageOf(compose(build.replace("#d79124","#d79125")))),buildPath,declared);
equal(r2.status,1,"a page serving an older build fails, presentation-only change or not");
ok(/underwriting engine\s+identical/.test(r2.out),"the underwriting components in that fixture really do match");
ok(/the page is not this build with its declared adaptations/.test(r2.out),"the failure says the page is a different build");

// 9c. The page may not carry what it declares omitted — the claim applicants read.
r2=check(write("declared-table.html",pageOf(compose(build,["no-comparison-table"]))),buildPath,declared);
equal(r2.status,1,"a page that still carries the omitted table fails");
ok(/no-comparison-table: the page still carries/.test(r2.out),"the failure names the adaptation and the statement");
ok(/which it declares omitted/.test(r2.out),"the failure says what the page claims");

// 9d. A page that drops a declared addition is not the composition either, and the note
//     names the adaptation rather than leaving a diff to be interpreted.
r2=check(write("declared-no-card.html",pageOf(compose(build,["result-contact-card"]))),buildPath,declared);
equal(r2.status,1,"a page missing a declared adaptation fails");
ok(/result-contact-card: the page no longer carries/.test(r2.out),"the note names the missing adaptation");
ok(/not this build with its declared adaptations/.test(r2.out),"the exactness failure is reported too");

// 9e. A release that moves an anchor the page's generator inserts at, removes at, or
//     rewrites must fail here: the page could no longer be regenerated from this build,
//     and nothing else in this repository can see that.
r2=check(write("anchor-page.html",declaredPage),write("build-no-insert-anchor.html",build.replace('const refs=node("section","card");','const refs2=node("section","card");')),declared);
equal(r2.status,1,"a build that lost the insertion anchor fails");
ok(/result-contact-card: this build no longer carries the line it is inserted at/.test(r2.out),"the failure names the insertion anchor");
ok(/the page's generator inserts there and will fail/.test(r2.out),"the failure says what breaks in the page's generator");
r2=check(write("anchor-page2.html",declaredPage),write("build-no-omit-anchor.html",build.replace("const comparisons=Engine.compare(state);","const comparisons=[];")),declared);
equal(r2.status,1,"a build that lost the omitted statement fails");
ok(/no-comparison-table: this build no longer carries the statement that starts/.test(r2.out),"the failure names the omitted statement");
r2=check(write("anchor-page3.html",declaredPage),write("build-one-link.html",build.replace('href="https://lifeinsurancebrokeradvocate.com/contact" target="_blank"','href="https://lifeinsurancebrokeradvocate.com/contact"')),declared);
equal(r2.status,1,"a build with one broker link fewer fails");
ok(/same-origin-contact-links: expected 2 occurrence\(s\)/.test(r2.out),"the failure counts the links the page rewrites");

// 9f. Declarations that are not there, and declarations that do not apply: a different
//     consumer must never be explained with this page's adaptations.
r2=check(write("plain.html",build),buildPath,["--declarations",path.join(dir,"absent.json")]);
equal(r2.status,1,"a missing declarations file fails");
ok(/Declarations not found/.test(r2.err),"the failure names the file it looked for");
equal(loadDeclarations("https://example.com/tools/health-class-predictor",null),null,"another origin gets no declarations");
equal(loadDeclarations(path.join(dir,"plain.html"),null),null,"a local file gets no declarations unless they are named");
const live=loadDeclarations("https://lifeinsurancebrokeradvocate.com/tools/health-class-predictor",null);
equal(live?.adaptations.length,4,"the page the declarations name loads them");
equal(live?.file,"consumers/website.json","the loaded declaration names its file");

// 11. The page can be judged against the deployment it claims to be: a commit of the
//     website repository, read at one commit, whose page must be this build plus the
//     declarations — and the served page must be that page. Without it a green run
//     says the page matches the build and leaves open which deployment was read.
const DEPLOY_COMMIT="37d743eb0d732d737d31e4487f480e9c07c7c068";
const DEPLOY_REPO="richardparslow-commits/life-policy-light";
const deployedArgs=(page)=>["--deployed",page,"--deployed-commit",DEPLOY_COMMIT,"--deployed-repo",DEPLOY_REPO,...declared];
let r3=check(write("deployed-live.html",declaredPage),buildPath,deployedArgs(write("deployed-committed.html",declaredPage)));
equal(r3.status,0,"a page that is the named deployment passes");
ok(/Deployment: richardparslow-commits\/life-policy-light@37d743e/.test(r3.out),"the verdict names the deployment by commit");
ok(/the live page is the page that commit produces/.test(r3.out),"the verdict says the served page is that commit's page");
ok(/The deployment judged is richardparslow-commits\/life-policy-light@37d743e/.test(r3.out),"the pass names the deployment it judged, not just the build");
const deployedJson=JSON.parse(execFileSync(process.execPath,[checker,"--consumer",write("deployed-json.html",declaredPage),"--build",buildPath,...deployedArgs(path.join(dir,"deployed-committed.html")),"--json"],{encoding:"utf8"}));
equal(deployedJson.deployment.commit,DEPLOY_COMMIT,"--json carries the full commit that was judged");
equal(deployedJson.deployment.identical,true,"--json records that the served page is that commit's page");
equal(deployedJson.deployment.problems.length,0,"--json carries no deployment problems");
equal(deployedJson.ok,true,"--json still reports the comparison as ok");

// 11b. The served page is not the commit: it has not been redeployed (or something
//      else is serving it). The difference is reported at its first character.
r3=check(write("deployed-live-stale.html",declaredPage.replace("page adapter","page adapter two")),buildPath,deployedArgs(path.join(dir,"deployed-committed.html")));
equal(r3.status,1,"a live page that is not the named commit fails");
ok(/the live page is not the page richardparslow-commits\/life-policy-light@37d743e produces/.test(r3.out),"the failure names the deployment and the mismatch");
ok(/first difference at character \d+/.test(r3.out),"the failure locates the difference");
ok(/has not been redeployed/.test(r3.out),"the failure says what a live mismatch means");
ok(/underwriting engine\s+identical/.test(r3.out),"the served page still matches the build's logic, so the fault is the deployment");
const staleJson=JSON.parse(check(write("deployed-live-stale-json.html",declaredPage.replace("page adapter","page adapter two")),buildPath,[...deployedArgs(path.join(dir,"deployed-committed.html")),"--json"]).out);
equal(staleJson.declarations.exact,true,"the served page is still this build plus its declarations");
equal(staleJson.deployment.identical,false,"--json says the served page is not the named commit");
equal(staleJson.ok,false,"--json reports the deployment mismatch as not ok");

// 11c. The committed page itself is behind this build: the repository needs the release,
//      not a redeploy. Naming the commit is what makes that distinguishable.
r3=check(write("deployed-live2.html",pageOf(compose(build,["result-contact-card"]))),buildPath,deployedArgs(write("deployed-behind.html",pageOf(compose(build,["result-contact-card"])))));
equal(r3.status,1,"a committed page that is not this build fails");
ok(new RegExp(DEPLOY_REPO+"@37d743e: the page is not this build with its declared adaptations").test(r3.out),"the failure attributes the composition problem to the commit");
ok(/note: result-contact-card: the page no longer carries/.test(r3.out),"and the note names the adaptation the commit is missing");
ok(/deployed repository is behind it/.test(r3.out),"the failure says what a behind commit means");

// 11d. Half a pair is a usage error, not a verdict about a page nobody read.
r3=check(write("deployed-pair.html",declaredPage),buildPath,["--deployed",path.join(dir,"deployed-committed.html"),...declared]);
equal(r3.status,1,"a deployment page without a commit fails");
ok(/--deployed needs --deployed-commit/.test(r3.err),"the failure says what the pair needs");
r3=check(write("deployed-pair2.html",declaredPage),buildPath,["--deployed-commit",DEPLOY_COMMIT,...declared]);
equal(r3.status,1,"a commit without a page fails");
ok(/pass --deployed <path>/.test(r3.err),"the failure says which half is missing");
r3=check(write("deployed-missing-page.html",declaredPage),buildPath,deployedArgs(path.join(dir,"no-such-committed-page.tsx")));
equal(r3.status,1,"a named commit whose page was not fetched fails");
ok(new RegExp("The page at @37d743e was not found at ").test(r3.err),"the failure names the commit and the file it looked for");
ok(/drop --deployed to compare only the live page/.test(r3.err),"and says how to run the live-only comparison instead");
equal(check(write("deployed-none.html",declaredPage),buildPath,declared).status,0,"omitting both keeps the old comparison working");
ok(!/Deployment:/.test(check(write("deployed-none2.html",declaredPage),buildPath,declared).out),"and the verdict does not claim a deployment it never read");

// 11e. The wiring, read from the workflow: the live comparison has to be given the
//      deployment, or the check quietly goes back to not naming what it judged. The
//      website repository is private, so the read needs a token and the workflow has to
//      say so rather than failing with a bare authentication error.
const parityWorkflow=fs.readFileSync(path.join(root,".github/workflows/consumer-parity.yml"),"utf8");
ok(/Read the deployed website at one commit/.test(parityWorkflow),"the website job reads the deployment at a commit");
ok(/--deployed deployed-page\.tsx/.test(parityWorkflow),"the live comparison is given that page");
ok(/--deployed-commit "\$DEPLOYED_WEBSITE_COMMIT"/.test(parityWorkflow),"and the commit, so the verdict can name it");
ok(/website_ref/.test(parityWorkflow),"an older deploy can be judged by naming its ref");
ok(/WEBSITE_READ_TOKEN/.test(parityWorkflow),"the private repository's read has a token to use");
ok(/This job names the deployment it judged and does not pass without reading it/.test(parityWorkflow),"and refusing to read the commit is a failure, not a quieter check");

// 12. The page can serve the right bytes and still claim the wrong release. That is
//     what schema.org softwareVersion did — 78 while the page ran 80 — and an earlier
//     investigation read the page's own words and concluded release 78 was live. The
//     claims are declared once (consumers/website.json) and checked against the build's
//     HCE_VERSION wherever this run read them: the committed page's source, and the
//     served page.
equal(buildVersion(build),"80","the build's version is read from HCE_VERSION");
ok(declaration.releaseClaims.length>=5,"the page declares each place it states its release");
ok(declaration.releaseClaims.every((c)=>c.pattern.includes("{version}")),"every claim names where its number goes");
const chromeWith=(version)=>pageChrome.replace(/release 80|Release 80/g,"release "+version).replace(/"softwareVersion":"80"/,'"softwareVersion":"'+version+'"');
const claimed=(page)=>check(write("claims-"+Math.random().toString(16).slice(2)+".html",page),buildPath,declared);
// The passing fixture states the build's release everywhere it declares, and says so.
const declaredPass=check(write("claims-pass.html",declaredPage),buildPath,declared);
equal(declaredPass.status,0,"a page that states this release in every declared place passes");
ok(/Release  : 80 — 3 claim\(s\) agree, 0 disagree, 4 on a surface this run did not read/.test(declaredPass.out),"the served page's claims agree, and the source-only ones are reported as not read");
ok(/It states release 80 in all 3 of the places it declares/.test(declaredPass.out),"the declared pass says the page states this release");
// The real bug, as a fixture: only the structured data is behind.
const staleJsonLd=write("claims-stale-json.html",pageOf(declaredDocument).replace('"softwareVersion":"80"','"softwareVersion":"78"'));
r3=check(staleJsonLd,buildPath,declared);
equal(r3.status,1,"a page whose structured data names an older release fails");
ok(/FAIL — the page states a release that is not this build/.test(r3.out),"the failure says what kind of problem it is");
ok(/"structured-data-version-served" states release 78, this build is release 80/.test(r3.out),"the failing claim and both numbers are named");
ok(/regenerate the page from this build; do not correct the number by hand/.test(r3.out),"the fix is regeneration, not editing the claim");
ok(/underwriting engine\s+identical/.test(r3.out),"the tool itself was the right build, so the fault is the claim alone");
// A claim the page stopped carrying is the same drift in a quieter form.
r3=claimed(pageOf(declaredDocument).replace(/<p>Release 80 · Updated[^<]*<\/p>/,""));
equal(r3.status,1,"a page that stopped stating its release fails");
ok(/"footer-stamp" appears 0 time\(s\)/.test(r3.out),"the missing claim is named with its count");
// A claim stated twice is not the declaration either.
r3=claimed(pageOf(declaredDocument).replace("</main>","<p>Release 80 · Updated again</p></main>"));
equal(r3.status,1,"a duplicated claim fails");
ok(/"footer-stamp" appears 2 time\(s\)/.test(r3.out),"the duplicate is counted");
// A release bump moves every claim at once; nothing may be left behind.
r3=check(write("claims-next-build.html",pageOf(declaredDocument)),write("build-81.html",build.replace('window.HCE_VERSION = "80"','window.HCE_VERSION = "81"')),declared);
equal(r3.status,1,"a page that has not moved to the next release fails");
ok(/"footer-stamp" states release 80, this build is release 81/.test(r3.out),"each stale claim is reported against the new build");
// The rules themselves, as units: a surface this run did not read is not a pass.
const unitClaims=[{id:"both",pattern:"release {version}",count:1,in:["source","page"]}];
let unit=verifyReleaseClaims(unitClaims,{source:{text:"release 80",label:"source"},page:{text:"release 80",label:"page"}},"80");
equal(unit.problems.length,0,"agreeing claims raise nothing");
equal(unit.checked.filter((c)=>c.state==="agrees").length,2,"each surface is reported separately");
unit=verifyReleaseClaims(unitClaims,{page:{text:"release 80",label:"the served page"}},"80");
equal(unit.problems.length,0,"a surface that was not read raises nothing");
equal(unit.checked.find((c)=>c.where==="source").state,"not read","and is reported as not read, not passed");
unit=verifyReleaseClaims(unitClaims,{page:{text:"release 78 release 78",label:"the served page"}},"80");
equal(unit.problems.length,1,"one claim disagrees once, however many wrong numbers it carries");
ok(/states release 78, 78, this build is release 80/.test(unit.problems[0]),"every wrong number is listed");
let threw=null;try{claimPattern("no placeholder here")}catch(e){threw=e.message}
ok(/must contain \{version\} exactly once/.test(threw||""),"a claim that names no version is a declaration error, not a silent pass");

// 10. A live consumer is read through a URL no cache can answer for. The website is
//    fronted by Cloudflare and its document is marked `no-cache, must-revalidate,
//    max-age=0` — a revalidation instruction, not a promise that no shared cache
//    still holds the previous deployment. A run minutes after a deploy used to be
//    able to compare the old page; now the request carries a nonce no cache can
//    have an entry for, and a cached answer is retried and then refused.
const runAsync=(consumer)=>new Promise(resolve=>execFile(process.execPath,[checker,"--consumer",consumer,"--build",buildPath],{encoding:"utf8",stdio:["ignore","pipe","pipe"]},(error,stdout,stderr)=>resolve({status:error?(typeof error.code==="number"?error.code:1):0,out:String(stdout||""),err:String(stderr||"")})));
const stale=build.replace("const Engine =","const Engine = /* cached-copy */");
const stalePage='<html><body><iframe srcDoc="'+entityEscape(stale)+'"></iframe></body></html>';
const livePage='<html><body><iframe srcDoc="'+entityEscape(build)+'"></iframe></body></html>';
const nonceOf=(target)=>{try{return new URL(target,"http://127.0.0.1").searchParams.get("hce-parity");}catch{return null;}};
(async()=>{
  const requests=[];let reply;
  const server=http.createServer((req,res)=>{requests.push({url:req.url,headers:req.headers});reply(res);});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const live="http://127.0.0.1:"+server.address().port+"/tools/health-class-predictor";
  try{
    reply=(res)=>{res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(livePage);};
    const first=await runAsync(live);
    equal(first.status,0,"a live page is read and matches the build");
    ok(first.out.includes("Consumer : "+live),"the verdict names the clean URL");
    ok(!/hce-parity=/.test(first.out),"the cache nonce is not reported as part of the consumer");
    ok(/requested with a fresh nonce/.test(first.out),"the verdict says the page was read through a nonce");
    ok(/byte-identical/.test(first.out),"the live frame compares against the unescaped build");
    equal(requests.length,1,"one request answers the comparison");
    const firstNonce=nonceOf(requests[0].url);
    ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(firstNonce||""),"the request carries a random UUID nonce");
    ok(/no-store/.test(requests[0].headers["cache-control"]||""),"the request asks caches neither to store nor to answer");
    equal(requests[0].headers["pragma"],"no-cache","the request also sends the legacy bypass header");
    requests.length=0;
    equal((await runAsync(live)).status,0,"a second live run passes");
    equal(requests.length,1,"the second run made one request");
    ok(nonceOf(requests[0].url)!==firstNonce,"each run uses a new nonce, so no cache can hold the answer");

    // A cached answer is refused: comparing the previous deployment would report
    // drift, or pass, about a page this run never fetched.
    requests.length=0;
    reply=(res)=>{res.writeHead(200,{"content-type":"text/html; charset=utf-8","cf-cache-status":"HIT"});res.end(stalePage);};
    const cached=await runAsync(live);
    equal(cached.status,1,"a cached answer fails the run");
    ok(/answered from a cache \(cf-cache-status: HIT\)/.test(cached.err),"the failure names the cache that answered");
    ok(!/underwriting engine\s+DIFFERS/.test(cached.out),"cached bytes are refused, not compared");
    equal(requests.length,3,"a cached answer is retried before it is refused");
    equal(new Set(requests.map(r=>nonceOf(r.url))).size,3,"each retry asks a URL the cache has not seen");

    // Cached once, fresh next: the fresh answer is the one that gets compared.
    requests.length=0;
    reply=(res)=>{const hit=requests.length===1;res.writeHead(200,{"content-type":"text/html; charset=utf-8","cf-cache-status":hit?"STALE":"MISS"});res.end(hit?stalePage:livePage);};
    const retried=await runAsync(live);
    equal(retried.status,0,"a cache hit is retried and the fresh answer passes");
    ok(/byte-identical/.test(retried.out),"the retried comparison reads the deployment, not the cached copy");
    equal(requests.length,2,"the retry happened once");

    // `age` alone marks a shared cache's copy, with no cf-cache-status to read.
    requests.length=0;
    reply=(res)=>{res.writeHead(200,{"content-type":"text/html; charset=utf-8",age:"900","cf-cache-status":"DYNAMIC"});res.end(stalePage);};
    const aged=await runAsync(live);
    equal(aged.status,1,"an aged response fails the run");
    ok(/age: 900/.test(aged.err),"the failure names the age of the cached copy");
  }finally{
    if(server.closeAllConnections)server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    fs.rmSync(dir,{recursive:true,force:true});
  }
  console.log("Passed "+checks+" consumer-parity assertions.");
})().catch(error=>{console.error(error.message);process.exitCode=1;});
