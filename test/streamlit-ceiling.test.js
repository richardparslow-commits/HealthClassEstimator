"use strict";
/* Fixtures for scripts/streamlit-ceiling.js, and the wiring that calls it.

   The canary answers "does the newest Streamlit run the deployed wrapper?". This
   script answers the question that makes that answer matter: "does that mean the
   ceiling should move, and what exactly is the new pin?". The fixtures below are
   the cases a requirements.txt actually takes — the deployed pin, a release inside
   it, one above it, one below the floor, an exact pin, no ceiling at all, a
   compatible-release pin, a prerelease — plus the file edits that must leave every
   other byte alone. The last block reads the workflow, because a decision nobody
   acts on is the chore this was built to replace: a green canary above the ceiling
   has to end in a pull request that links the run. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  decide,
  applyDecision,
  pullRequestBody,
  pullRequestTitle,
  compareVersions,
  parseSpecifier,
  contains,
} = require("../scripts/streamlit-ceiling.js");

const root = path.resolve(__dirname, "..");
let checks = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks++;
}
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}

// The deployed repository's requirements.txt, as it stands.
const PIN = "streamlit>=1.66,<2\n";
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hce-ceiling-"));

/* --- the verdict --------------------------------------------------------- */

const inside = decide(PIN, "1.66.0");
equal(inside.needed, false, "the pinned release is inside the deployed pin");
ok(/inside the deployed pin/.test(inside.reason), "that verdict says so");
equal(inside.from, "streamlit>=1.66,<2", "the pin it judged is reported");

equal(decide(PIN, "1.67.0").needed, false, "a newer release inside the ceiling needs no lift");

const above = decide(PIN, "2.0.0");
equal(above.needed, true, "a release above the ceiling argues for a lift");
equal(above.to, "streamlit>=1.66,<3", "the ceiling moves to the next major above the proved release");
equal(above.ceiling.from, "<2", "the clause that excluded it is named");
equal(above.ceiling.to, "<3", "and so is its replacement");
ok(above.reason.includes("2.0.0"), "the reason names the release that was proved");
equal(decide(PIN, "3.4.1").to, "streamlit>=1.66,<4", "a 3.x release raises the ceiling to <4, not <3");

const prerelease = decide(PIN, "2.0.0rc1");
equal(prerelease.needed, false, "a prerelease does not move a ceiling");
ok(/prerelease/.test(prerelease.reason), "the reason says why");

const none = decide("pandas==2.2\n", "2.0.0");
equal(none.needed, false, "a file with no streamlit line has nothing to raise");
ok(/does not name streamlit/.test(none.reason), "the reason says so");
equal(none.line, null, "and no line is invented");

const exact = decide("streamlit==1.66.0\n", "2.0.0");
equal(exact.needed, false, "an exact pin is not widened automatically");
ok(/policy decision/.test(exact.reason), "the reason says a person decides");

const open = decide("streamlit>=1.66\n", "2.0.0");
equal(open.needed, false, "a pin with no ceiling has no ceiling to raise");

const below = decide("streamlit>=3.0,<4\n", "2.0.0");
equal(below.needed, false, "a release below the floor is not a ceiling question");
ok(/below the deployed floor/.test(below.reason), "the reason says so");

const inclusive = decide("streamlit>=1.0,<=1.9\n", "2.0.0");
equal(inclusive.needed, true, "a release above an inclusive ceiling argues for a lift");
equal(inclusive.to, "streamlit>=1.0,<3", "the inclusive ceiling becomes an exclusive one at the next major");

const compatible = decide("streamlit~=1.66.0\n", "1.67.0");
equal(compatible.needed, true, "a compatible-release pin has a ceiling even without a `<`");
equal(compatible.to, "streamlit>=1.66.0,<2", "and it is spelled out when it is widened");

equal(decide("streamlit>=abc\n", "2.0.0").needed, false, "a specifier this script cannot read is not guessed at");

/* --- ordering ------------------------------------------------------------ */

equal(compareVersions("1.9", "1.10"), -1, "1.9 sorts before 1.10");
equal(compareVersions("2.0.0rc1", "2.0.0"), -1, "a prerelease sorts before its release");
equal(compareVersions("1.66", "1.66.0"), 0, "a missing patch level is the same release");
equal(parseSpecifier(">=1.66, <2").length, 2, "a spaced specifier set parses");
equal(parseSpecifier(">=1.66,wat"), null, "an unparseable clause is reported, not dropped");
equal(contains(parseSpecifier(">=1.66,<2"), "1.66.0"), true, "the pin contains the deployed release");

/* --- the edit ------------------------------------------------------------ */

const mixed = "# the deployed ceiling\nstreamlit>=1.66,<2  # keep the canary honest\npandas==2.2\n";
equal(
  applyDecision(mixed, decide(mixed, "2.0.0")),
  "# the deployed ceiling\nstreamlit>=1.66,<3  # keep the canary honest\npandas==2.2\n",
  "only the ceiling changes; the comment, the other pin and the order stay"
);
equal(applyDecision(PIN, decide(PIN, "1.66.0")), PIN, "a lift that is not needed leaves the file byte-identical");

const crlf = "pandas==2.2\r\nstreamlit>=1.66,<2\r\n";
equal(applyDecision(crlf, decide(crlf, "2.0.0")), "pandas==2.2\r\nstreamlit>=1.66,<3\r\n", "CRLF line endings survive the edit");

const decorated = 'streamlit[cli]>=1.66,<2 ; python_version >= "3.11"\n';
equal(
  applyDecision(decorated, decide(decorated, "2.0.0")),
  'streamlit[cli]>=1.66,<3 ; python_version >= "3.11"\n',
  "extras and an environment marker survive the edit"
);

const applied = decide(mixed, "2.0.0");
equal(applyDecision(applyDecision(mixed, applied), decide(PIN, "2.0.0")), "# the deployed ceiling\nstreamlit>=1.66,<3  # keep the canary honest\npandas==2.2\n", "applying the same lift twice changes nothing");

/* --- the review ---------------------------------------------------------- */

const body = pullRequestBody(above, {
  runUrl: "https://github.com/o/r/actions/runs/42",
  deployedSha: "abc1234",
  deployedRepo: "richardparslow-commits/health_app.py",
});
ok(body.includes("https://github.com/o/r/actions/runs/42"), "the review links the canary run that justified it");
ok(body.includes("streamlit>=1.66,<2") && body.includes("streamlit>=1.66,<3"), "the review shows the pin before and after");
ok(body.includes("abc1234"), "the review names the deployed commit the check ran against");
ok(body.includes("2.0.0"), "the review names the release that was proved");
equal(pullRequestTitle(above), "Raise the Streamlit ceiling for Streamlit 2.0.0", "the title names the release, not a raw ceiling token");

/* --- the command --------------------------------------------------------- */

function cli(args) {
  try {
    return { status: 0, out: execFileSync(process.execPath, [path.join(root, "scripts/streamlit-ceiling.js"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
  } catch (error) {
    return { status: typeof error.status === "number" ? error.status : 1, out: String(error.stdout || ""), err: String(error.stderr || "") };
  }
}

const file = path.join(scratch, "requirements.txt");
fs.writeFileSync(file, PIN);
const json = cli(["--requirements", file, "--installed", "2.0.0", "--json"]);
const parsed = JSON.parse(json.out);
equal(json.status, 0, "the command exits 0 after reaching a decision");
equal(parsed.needed, true, "the JSON carries the decision");
equal(parsed.title, "Raise the Streamlit ceiling for Streamlit 2.0.0", "and the title the review will use");

const appliedCli = cli(["--requirements", file, "--installed", "2.0.0", "--apply", "--json"]);
equal(JSON.parse(appliedCli.out).needed, true, "--apply still prints only the decision on stdout");
equal(fs.readFileSync(file, "utf8"), "streamlit>=1.66,<3\n", "--apply wrote the raised pin");
const again = cli(["--requirements", file, "--installed", "2.0.0", "--apply", "--json"]);
equal(JSON.parse(again.out).needed, false, "a second run finds nothing to do");
equal(fs.readFileSync(file, "utf8"), "streamlit>=1.66,<3\n", "and does not touch the file");

const bodyFile = path.join(scratch, "pr.md");
const baseFile = path.join(scratch, "base.txt");
fs.writeFileSync(baseFile, PIN);
cli(["--requirements", baseFile, "--installed", "2.0.0", "--body", bodyFile, "--run-url", "https://github.com/o/r/actions/runs/7"]);
ok(fs.readFileSync(bodyFile, "utf8").includes("actions/runs/7"), "--body writes the review text with the run in it");

equal(cli(["--requirements", file]).status, 1, "a missing --installed is a usage error, not a verdict");
equal(cli(["--requirements", file, "--installed", "2.0.0", "--nonsense"]).status, 1, "an unknown flag fails rather than being ignored");

/* --- the wiring ---------------------------------------------------------- */

const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "streamlit-canary.yml"), "utf8");
ok(/^  propose-ceiling:$/m.test(workflow), "the canary has a job that proposes the lift");
ok(/needs\.canary\.outputs\.ceiling_needed == 'true'/.test(workflow), "that job runs only when the canary decided a lift is warranted");
ok(/steps\.check\.outcome == 'success' && env\.CHANNEL == 'latest'/.test(workflow), "only a green run on the stable channel decides anything");
ok(/needs\.canary\.outputs\.ceiling_needed|ceiling_needed: \$\{\{ steps\.ceiling\.outputs\.needed \}\}/.test(workflow), "the decision is carried out of the canary job as an output");
ok(/--requirements deployed-requirements\.txt/.test(workflow), "the pin is read from the deployed default branch, not from the proposal branch");
ok(/--apply --body ceiling-pr\.md --json|--json --body ceiling-pr\.md/.test(workflow), "the proposal is generated by the script, not restated in YAML");
ok(/gh pr create --repo "\$DEPLOYED_REPO"/.test(workflow), "the review is opened with gh");
ok(/--body-file ceiling-pr\.md/.test(workflow), "and carries the generated body");
ok(/gh pr comment "\$existing"/.test(workflow), "a later run adds to the open review instead of opening a second");
ok(/gh pr edit "\$existing" --repo "\$DEPLOYED_REPO" --body-file ceiling-pr\.md/.test(workflow), "and rewrites the review's description when the branch moves");
ok(/STREAMLIT_PUSH_TOKEN is not set, so no pull request could be opened/.test(workflow), "a warranted lift that could not be proposed says exactly that");
ok(/--deployed-sha "\$\{\{ needs\.canary\.outputs\.deployed_sha \}\}"/.test(workflow), "the review records the deployed commit the canary tested");
// The body is written by the run that reads the deployed pin, and that run is the
// only one that can name itself: a body generated without the URL would be a
// review nobody can trace back to the evidence for it.
ok(
  /--body ceiling-pr\.md \\\n\s*--run-url "\$RUN_URL"/.test(workflow),
  "the generated review is given the run it has to link"
);

fs.rmSync(scratch, { recursive: true, force: true });
console.log("Passed " + checks + " Streamlit ceiling assertions.");
