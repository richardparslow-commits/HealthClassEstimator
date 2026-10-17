"use strict";
/* Fixtures for scripts/check-workflow-fetches.js.

   The consumer-parity jobs read the deployed copy with raw.githubusercontent.com until
   ae6ab00, in three shapes: a `run:` shell assignment, an `env:` expression, and the
   `workflow_dispatch` input's default. That CDN keeps serving the previous commit for
   minutes after a push (measured ~3 minutes on 2026-10-16), so a run dispatched just
   after a deploy compared the release before it, and two files fetched separately could
   come from two different commits. Those fixtures are the shapes that have to fail; the
   cases at the end prove the guard does not fail on the explanation of the bug, on the
   GitHub API, or on a directory with nothing in it. */
const fs=require("fs"),path=require("path"),os=require("os"),assert=require("node:assert/strict"),{execFileSync}=require("child_process");
const root=path.resolve(__dirname,".."),check=path.join(root,"scripts/check-workflow-fetches.js");
let checks=0;
function equal(actual,expected,label){assert.equal(actual,expected,label);checks++;}
function ok(actual,label){assert.ok(actual,label);checks++;}

const dir=fs.mkdtempSync(path.join(os.tmpdir(),"hce-workflows-"));
const write=(sub,name,content)=>{const d=path.join(dir,sub);fs.mkdirSync(d,{recursive:true});const p=path.join(d,name);fs.writeFileSync(p,content);return path.dirname(p);};
// Never throw on a non-zero exit: the status is the assertion.
function run(target,args=[check,"--dir",target]){
  try{return{status:0,out:execFileSync(process.execPath,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"]})};}
  catch(e){return{status:typeof e.status==="number"?e.status:1,out:String(e.stdout||""),err:String(e.stderr||"")};}
}
const gitFetch=
"      - name: Check out the deployed repository at one commit\n"+
"        run: |\n"+
"          git init --quiet deployed\n"+
"          git -C deployed remote add origin \"https://github.com/o/r.git\"\n"+
"          git -C deployed fetch --quiet --depth 1 origin main\n"+
"          git -C deployed checkout --quiet --detach FETCH_HEAD\n"+
"          echo \"Read o/r at $(git -C deployed rev-parse HEAD)\"\n";

// 1. The repository's own workflows pass, and every one of them was scanned: a guard
//    that read three of four files would pass for the wrong reason.
const repoWorkflows=path.join(root,".github","workflows");
const shipped=fs.readdirSync(repoWorkflows).filter((name)=>/\.ya?ml$/i.test(name));
let r=run(repoWorkflows);
equal(r.status,0,"the repository's own workflows pass");
ok(r.out.includes("Passed: "+shipped.length+" workflow file"),"every workflow file in the repository was scanned");
ok(/read no repository file over raw\.githubusercontent\.com/.test(r.out),"the pass says what was looked for");

// 2. Shape one, from the code ae6ab00 removed: a shell assignment in a run block.
r=run(write("run","deploy.yml",
"name: deploy\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Fetch the published copy\n        run: |\n"+
"          base=\"https://raw.githubusercontent.com/$REPO/main\"\n          curl -sSfL \"$base/app_embedded.html\" -o app_embedded.html\n"));
equal(r.status,1,"a CDN read in a run block fails the check");
ok(r.out.includes("deploy.yml:8"),"the failure names the file and line");
ok(/FAIL — a workflow reads a repository file over raw\.githubusercontent\.com/.test(r.out),"the failure says what it found");
ok(/git -C deployed fetch --quiet --depth 1 origin <ref>/.test(r.out),"the failure shows the one-commit fetch to use instead");
ok(/edited outside the build/.test(r.out),"the failure explains the misleading report this prevents");
ok(/A comment naming the CDN is not a fetch/.test(r.out),"the failure says how to keep the explanation");

// 3. Shape two: the same host inside an env expression, where no shell is involved.
r=run(write("env","deploy.yml",
"name: deploy\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    env:\n"+
"      SOURCE: ${{ inputs.streamlit_source || 'https://raw.githubusercontent.com/richardparslow-commits/health_app.py/main/app_embedded.html' }}\n    steps:\n"+gitFetch));
equal(r.status,1,"a CDN URL in an env expression fails the check");
ok(r.out.includes("deploy.yml:6"),"the env map's line is named");

// 4. Shape three: the workflow_dispatch input default the old job shipped with.
r=run(write("input","deploy.yml",
"on:\n  workflow_dispatch:\n    inputs:\n      streamlit_source:\n        description: Source URL to verify\n        required: false\n"+
"        default: https://raw.githubusercontent.com/richardparslow-commits/health_app.py/main/app_embedded.html\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n"+gitFetch));
equal(r.status,1,"a CDN URL as an input default fails the check");
ok(r.out.includes("deploy.yml:7"),"the input default's line is named");

// 5. The legacy hostname is the same CDN, and .yaml is as much a workflow as .yml.
r=run(write("legacy","deploy.yaml","name: deploy\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - run: wget -q https://raw.github.com/o/r/main/app.html\n"));
equal(r.status,1,"the legacy CDN hostname and a .yaml file are checked");

// 6. Two violations are both reported: fixing the first must not hide the second.
write("both","a.yml","name: a\njobs:\n  x:\n    runs-on: ubuntu-latest\n    steps:\n      - run: curl -sSf https://raw.githubusercontent.com/o/r/main/app_embedded.html\n");
write("both","b.yml","name: b\njobs:\n  y:\n    runs-on: ubuntu-latest\n    steps:\n      - run: curl https://raw.githubusercontent.com/o/r/main/other.html\n");
r=run(path.join(dir,"both"));
equal(r.status,1,"a directory with two CDN reads fails");
equal((r.out.match(/raw\.githubusercontent\.com\/o\/r\/main\//g)||[]).length,2,"both reads are quoted, so the second is not hidden by the first");

// 7. Naming the CDN in prose is not a fetch: the explanation in a workflow header and a
//    shell comment inside a run block both survive, with the git fetch beside them.
const documented=
"name: deploy\n"+
"# This job used to read raw.githubusercontent.com, which serves the previous commit\n"+
"# for minutes after a push; see the CDN note in docs/single-builder-plan.md.\n"+
"jobs:\n"+
"  sync:\n"+
"    runs-on: ubuntu-latest\n"+
"    steps:\n"+
"      - name: Check out one commit\n"+
"        run: |\n"+
"          # Never raw.githubusercontent.com here: it can serve a pre-push copy.\n"+
"          git init --quiet deployed\n"+
"          git -C deployed fetch --quiet --depth 1 origin main\n";
r=run(write("documented","deploy.yml",documented));
equal(r.status,0,"a workflow that explains the bug and fetches with git passes");

// 8. The check is narrow: the API and release-asset hosts are not this CDN, and a
//    non-workflow file in the directory is not a workflow.
const narrow=write("narrow","deploy.yml","name: deploy\njobs:\n  sync:\n    runs-on: ubuntu-latest\n    steps:\n      - run: curl -sSf https://api.github.com/repos/o/r/commits/main\n      - run: curl -sSfL https://objects.githubusercontent.com/asset.tar.gz\n");
r=run(narrow);
equal(r.status,0,"the GitHub API and release assets are not treated as this CDN");
fs.writeFileSync(path.join(narrow,"notes.md"),"The old run read https://raw.githubusercontent.com/o/r/main/app.html\n");
r=run(narrow);
equal(r.status,0,"a markdown file in the directory is not scanned as a workflow");
ok(/Passed: 1 workflow file/.test(r.out),"only workflow files are counted");

// 9. A directory with nothing to check fails: an empty scan would pass for the wrong
//    reason, which is the failure mode this guard exists to avoid.
fs.mkdirSync(path.join(dir,"empty"));
r=run(path.join(dir,"empty"));
equal(r.status,1,"a directory with no workflows fails instead of passing");
ok(/No workflow files found/.test(r.err),"the failure says there was nothing to check");

// 10. --dir without a value is a mistake, not a silent scan of the repository.
r=run(null,[check,"--dir"]);
equal(r.status,1,"a missing --dir value fails");
ok(/--dir needs a directory/.test(r.err),"--dir without a value says what it needed");

// 11. The exported scan is the one the command runs, so a direct caller cannot get a
//     different answer from the same fixtures.
const {findCdnReads}=require("../scripts/check-workflow-fetches.js");
equal(findCdnReads(repoWorkflows).findings.length,0,"the exported scan finds nothing in the repository's workflows");
equal(findCdnReads(path.join(dir,"both")).findings.map((f)=>path.basename(f.file)).join(","),"a.yml,b.yml","the exported scan reports every workflow file it read");

fs.rmSync(dir,{recursive:true,force:true});
console.log("Passed "+checks+" workflow-fetch assertions.");
