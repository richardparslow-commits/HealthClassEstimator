"use strict";
/* Fixtures for scripts/python_pin.py and the workflows that honour it.

   Three runs execute the deployed wrapper — a local checkout, CI and Streamlit
   Cloud — and before this they could each pick a different interpreter: the dev
   container said 3.11, both workflows said 3.12, and Cloud runs whatever the app
   was deployed with. The fix is one declaration in the deployed repository
   (`.python-version`) that local tools and CI read, plus a live check that fails
   when the interpreter running it is not the declared one.

   These fixtures cover the verdicts: the declared version, a run that is not it, a
   dev container that disagrees, a missing or unreadable declaration, a version
   Cloud does not offer, and a patch-level pin. The last block reads the workflows,
   because a declaration nothing honours is documentation of an intention: CI has
   to read the same file, and it has to read it after the deployment is checked out.

   Needs python3, which this repository's Streamlit checks need anyway.
*/
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const modulePath = path.join(root, "scripts", "python_pin.py");
let checks = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  checks++;
}
function ok(actual, label) {
  assert.ok(actual, label);
  checks++;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "hce-python-pin-"));
const driver = path.join(scratch, "driver.py");
fs.writeFileSync(
  driver,
  [
    "import importlib.util, json, sys",
    "spec = importlib.util.spec_from_file_location('python_pin', sys.argv[1])",
    "module = importlib.util.module_from_spec(spec)",
    "spec.loader.exec_module(module)",
    "running = tuple(int(part) for part in sys.argv[3].split('.'))",
    "print(json.dumps(module.check(sys.argv[2], running)))",
  ].join("\n")
);

function pin(directory, contents) {
  if (contents === null) return;
  fs.writeFileSync(path.join(directory, ".python-version"), contents);
}

function container(directory, image) {
  if (image === null) return;
  fs.mkdirSync(path.join(directory, ".devcontainer"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, ".devcontainer", "devcontainer.json"),
    JSON.stringify({ name: "Python 3", image }, null, 2)
  );
}

// The devcontainer file as written by hand rather than by JSON.stringify.
function rawContainer(directory, text) {
  fs.mkdirSync(path.join(directory, ".devcontainer"), { recursive: true });
  fs.writeFileSync(path.join(directory, ".devcontainer", "devcontainer.json"), text);
}

// A checkout that declares 3.12 everywhere.
function checkout(name, { pinText = "3.12\n", image = "mcr.microsoft.com/devcontainers/python:1-3.12-bookworm" } = {}) {
  const directory = path.join(scratch, name);
  fs.mkdirSync(directory, { recursive: true });
  pin(directory, pinText);
  container(directory, image);
  return directory;
}

function check(directory, running) {
  const result = execFileSync("python3", [driver, modulePath, directory, running], { encoding: "utf8" });
  return JSON.parse(result);
}

const agree = check(checkout("agree"), "3.12.7");
equal(agree.status, "PASS", "the declared version, the dev container and this run agree");
equal(agree.pin, "3.12", "the declaration is read");
equal(agree.devcontainer, "3.12", "the dev container's interpreter is read from its image");
ok(agree.message.includes("3.12.7"), "the pass names the interpreter that actually ran");

const older = check(checkout("older"), "3.9.6");
equal(older.status, "FAIL", "running an interpreter the deployment does not declare fails");
ok(older.message.includes("3.9.6") && older.message.includes("3.12"), "the failure names both versions");
ok(/python3\.12/.test(older.message), "and says how to run it locally");
ok(/Advanced settings/.test(older.message), "and where Cloud's interpreter is chosen");

const drifted = check(checkout("drifted", { image: "mcr.microsoft.com/devcontainers/python:1-3.11-bookworm" }), "3.12.7");
equal(drifted.status, "FAIL", "a dev container on another minor fails even when this run is right");
ok(drifted.message.includes("3.11") && drifted.message.includes("3.12"), "the failure names both sides");

const absent = check(checkout("absent", { pinText: null }), "3.12.7");
equal(absent.status, "FAIL", "a deployment that does not declare its interpreter fails");
ok(absent.message.includes(".python-version"), "the failure names the missing file");

const empty = check(checkout("empty", { pinText: "\n" }), "3.12.7");
equal(empty.status, "FAIL", "an empty declaration fails");

const malformed = check(checkout("malformed", { pinText: "python-3.12\n" }), "3.12.7");
equal(malformed.status, "FAIL", "a runtime.txt-style declaration is refused, because CI cannot read it");
ok(malformed.message.includes("python-3.12"), "the failure quotes what it found");

const unsupported = check(checkout("unsupported", { pinText: "3.10\n" }), "3.10.14");
equal(unsupported.status, "FAIL", "a version Cloud does not offer fails rather than deploying");
ok(/3\.11, 3\.12, 3\.13, 3\.14, 3\.15/.test(unsupported.message), "the failure lists what Cloud does offer");

const precise = check(checkout("precise", { pinText: "3.12.7\n" }), "3.12.7");
equal(precise.status, "PASS", "a patch-level declaration is satisfied by that patch");
const preciseDrift = check(checkout("precise-drift", { pinText: "3.12.7\n" }), "3.12.9");
equal(preciseDrift.status, "FAIL", "and not by another patch of the same minor");

const noContainer = check(checkout("no-container", { image: null }), "3.12.7");
equal(noContainer.status, "FAIL", "a checkout with no dev container fails");
ok(noContainer.message.includes("devcontainer"), "the failure names the file it looked for");

const containerWithoutPython = check(checkout("no-python-image", { image: "ubuntu:24.04" }), "3.12.7");
equal(containerWithoutPython.status, "FAIL", "a dev container with no Python image fails");

const brokenJsonDirectory = checkout("broken-json");
rawContainer(brokenJsonDirectory, '{\n  "image": "mcr.microsoft.com/devcontainers/python:1-3.12-bookworm",\n');
const brokenJson = check(brokenJsonDirectory, "3.12.7");
equal(brokenJson.status, "FAIL", "an unreadable devcontainer.json fails rather than passing by omission");
ok(/not valid JSON/.test(brokenJson.message), "the failure says the file could not be parsed");

/* --- the workflows ------------------------------------------------------- */

const deploy = fs.readFileSync(path.join(root, ".github", "workflows", "deploy-streamlit.yml"), "utf8");
const canary = fs.readFileSync(path.join(root, ".github", "workflows", "streamlit-canary.yml"), "utf8");
const live = fs.readFileSync(path.join(root, "scripts", "verify-streamlit-live.py"), "utf8");

equal(
  (deploy.match(/python-version-file: streamlit-app\/\.python-version/g) || []).length,
  1,
  "the deploy workflow installs the interpreter the deployment declares"
);
equal(
  (canary.match(/python-version-file: streamlit-app\/\.python-version/g) || []).length,
  1,
  "and so does the canary"
);
ok(!/python-version: "3\./.test(deploy), "the deploy workflow no longer restates a version in YAML");
ok(!/python-version: "3\./.test(canary), "the canary does not either");
ok(
  deploy.indexOf("path: streamlit-app") < deploy.indexOf("python-version-file"),
  "the deployment is checked out before its declaration is read"
);
ok(
  canary.indexOf("git clone --quiet --depth 1 --single-branch") < canary.indexOf("python-version-file"),
  "the canary fetches the deployment before reading its declaration"
);
ok(
  (deploy.match(/Require the deployed repository to declare its interpreter/g) || []).length === 1 &&
    (canary.match(/Require the deployed repository to declare its interpreter/g) || []).length === 1,
  "both workflows fail with an instruction when the declaration is missing"
);
ok(/\.python-version containing 3\.12/.test(deploy) && /\.python-version containing 3\.12/.test(canary), "that instruction says what to add");
ok(/import python_pin/.test(live), "the live check reads the same declaration");
ok(/python_pin\.check\(base, sys\.version_info\)/.test(live), "and compares it with the interpreter it is running");
ok(/total = 4/.test(live), "the interpreter is a case of its own, not a remark");

fs.rmSync(scratch, { recursive: true, force: true });
console.log("Passed " + checks + " Python pin assertions.");
