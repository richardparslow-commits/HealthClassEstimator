"use strict";
/* Fixtures for scripts/check-consumer-parity.js.

   The check exists because release 78 shipped underwriting logic that lived only
   inside the website's embedded copy (ISSUE-001). These cases prove it separates
   a consumer's legitimate embed adaptations from a real fork of the rules.
*/
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("node:assert/strict"),{execFileSync}=require("child_process");
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

fs.rmSync(dir,{recursive:true,force:true});
console.log("Passed "+checks+" consumer-parity assertions.");
