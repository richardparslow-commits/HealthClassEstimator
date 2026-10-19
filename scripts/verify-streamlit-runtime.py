#!/usr/bin/env python3
"""Exercise the deployed health_app.py the way Streamlit does — on purpose.

Streamlit renders the wrapper at import time, so a pair that fails verification
fails as an import-time error. This script stages the published wrapper and its
artifact/manifest pair, then proves the contract in both directions by importing
the module with the small part of the Streamlit API it touches stubbed out:

  * the pair as published is served byte for byte, and
  * a tampered artifact, a missing artifact, a missing manifest, a manifest
    naming a different file as its artifact, and a manifest whose release
    version lies are each refused with a clear error.

Why this exists: the deployed repository used to carry a second implementation
of the build (build_app_html()) that inlined loose assets whenever the artifact
was absent, and it drifted from the reviewed builder in three places before it
was removed. Nothing read that path. This script is the check that the wrapper
contains no build logic of its own and verifies what it serves — run it against
the previous implementation and the tampered/missing/lying cases fail, because
that implementation served whatever it found.

Usage:
    python3 scripts/verify-streamlit-runtime.py <directory>

<directory> must contain health_app.py, app_embedded.html and
app_embedded.manifest.json — a checkout of the deployed repository, or a copy
staged by the release workflow before it pushes.

Exit status: 0 when every case behaved as the contract requires; 1 otherwise,
including when a case unexpectedly succeeds (that is the previous
implementation's behaviour, and it must not come back).
"""
import argparse
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile

REQUIRED = ("health_app.py", "app_embedded.html", "app_embedded.manifest.json")

# Imported in a subprocess so an import-time refusal is captured without module
# caching interfering. `served` collects the document handed to the component.
IMPORT_SNIPPET = '''
import pathlib, sys, types

root = pathlib.Path(sys.argv[1])
served = []
st = types.ModuleType("streamlit")
# Both the API the wrapper renders through today and the one it replaced: this
# harness has to be able to run the previous deployed wrapper too, or the proof
# that it fails the old code could not be repeated.
st.iframe = lambda document, *a, **k: served.append(document)
st.components = types.SimpleNamespace(v1=types.SimpleNamespace(html=lambda document, *a, **k: served.append(document)))
st.set_page_config = st.markdown = st.caption = lambda *a, **k: None
sys.modules["streamlit"] = st
sys.path.insert(0, str(root))
import health_app  # renders at import, exactly as the deployed app does

artifact = (root / "app_embedded.html").read_bytes()
same = served[0].encode("utf-8") == artifact
print("SERVED-EXACT" if same else "SERVED-DIFFERENT")
'''


def run_health_app(directory):
    # `-B`: the successful case imports the directory it is given, which is the staged
    # checkout a release then commits. Without this the import writes
    # `__pycache__/health_app.cpython-*.pyc` into that checkout, and the sync committed it
    # to the deployed repository on every release. Verifying a tree must not change it.
    return subprocess.run(
        [sys.executable, "-B", "-c", IMPORT_SNIPPET, str(directory)],
        capture_output=True,
        text=True,
    )


def output_of(result):
    text = (result.stdout + result.stderr).strip().splitlines()
    return " | ".join(line.strip() for line in text[-3:]) if text else "(no output)"


def stage(base, into):
    into.mkdir(parents=True, exist_ok=True)
    for name in REQUIRED:
        shutil.copyfile(base / name, into / name)
    return into


def tamper(directory):
    artifact = directory / "app_embedded.html"
    data = bytearray(artifact.read_bytes())
    data[len(data) // 2] ^= 0x20
    artifact.write_bytes(bytes(data))


def lie_about_version(directory):
    manifest_path = directory / "app_embedded.manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["hce_version"] = str(int(manifest["hce_version"]) + 1)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def name_a_different_artifact(directory):
    """The manifest describes bytes it does not name — a pair from two builds."""
    manifest_path = directory / "app_embedded.manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["artifact"] = "streamlit_embedded.html"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def remove(name):
    def doctor(directory):
        (directory / name).unlink()

    return doctor


def expected_served(base):
    def case(directory):
        result = run_health_app(directory)
        if result.returncode == 0 and "SERVED-EXACT" in result.stdout:
            return True, "the published pair is served byte for byte"
        return False, "the pair must load and be served exactly (exit %d: %s)" % (
            result.returncode,
            output_of(result),
        )

    return case


def expected_refusal(problem, doctor, token):
    def case(directory):
        result = run_health_app(directory)
        text = result.stdout + result.stderr
        if result.returncode == 0:
            return False, "%s was served instead of refused (exit 0)" % problem
        if token not in text:
            return False, "%s was refused, but the error never mentions %r: %s" % (
                problem,
                token,
                output_of(result),
            )
        return True, "%s is refused with a message naming %s" % (problem, token)

    return case


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("directory", help="checkout holding health_app.py and its artifact pair")
    args = parser.parse_args()
    base = pathlib.Path(args.directory).resolve()

    missing = [name for name in REQUIRED if not (base / name).exists()]
    if missing:
        print("FAIL — %s is missing %s; nothing to verify." % (base, ", ".join(missing)))
        return 1

    cases = [
        ("valid pair", expected_served(base), None),
        ("tampered artifact", expected_refusal("the tampered artifact", tamper, "sha256"), tamper),
        ("missing artifact", expected_refusal("a missing artifact", remove("app_embedded.html"), "release:artifact"), remove("app_embedded.html")),
        ("missing manifest", expected_refusal("a missing manifest", remove("app_embedded.manifest.json"), "manifest"), remove("app_embedded.manifest.json")),
        (
            "manifest naming another file",
            expected_refusal(
                "a manifest that names a different artifact",
                name_a_different_artifact,
                "as the artifact",
            ),
            name_a_different_artifact,
        ),
        ("lying manifest version", expected_refusal("a manifest whose version lies", lie_about_version, "HCE_VERSION"), lie_about_version),
    ]

    print("verify-streamlit-runtime: %s" % base)
    failures = 0
    with tempfile.TemporaryDirectory(prefix="hce-runtime-") as tmp:
        root = pathlib.Path(tmp)
        for index, (name, case, doctor) in enumerate(cases):
            directory = base if doctor is None else stage(base, root / str(index))
            if doctor is not None:
                doctor(directory)
            ok, detail = case(directory)
            print("  %s — %s: %s" % ("PASS" if ok else "FAIL", name, detail))
            if not ok:
                failures += 1

    print("%d/%d cases behaved as the contract requires." % (len(cases) - failures, len(cases)))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
