#!/usr/bin/env python3
"""Exercise the deployed wrapper through Streamlit's real runtime — no browser.

`verify-streamlit-runtime.py` stubs the Streamlit API, which proves the
verification logic but not that the module imports, renders and refuses under
the real library. That gap hid a real problem: the wrapper called
`st.components.v1.html`, which Streamlit marks for removal after 2026-06-01 —
a date already past — so an upgrade could break the deployed app with no change
in this repository. Nothing in the stubbed harness could see that.

This runs the deployed `health_app.py` with `streamlit.testing.v1.AppTest`, in
the same interpreter Streamlit would use, and checks:

  * the published pair reaches Streamlit intact — the exact text of
    app_embedded.html, captured by wrapping the API the wrapper renders with;
  * the script raises no app exception for a good pair;
  * a tampered pair surfaces the refusal as an app exception naming the sha256;
  * the wrapper calls no API Streamlit has announced for removal.

Usage:
    python3 scripts/verify-streamlit-live.py <directory>

<directory> must hold health_app.py, app_embedded.html and
app_embedded.manifest.json — a staged deploy checkout or a clone of the
deployed repository.

Exit status: 0 when every case behaves as the contract requires, 1 otherwise,
2 when Streamlit is not installed (the check cannot answer that question, and
says so rather than passing).
"""
import ast
import importlib.util
import json
import os
import pathlib
import shutil
import sys
import tempfile

REQUIRED = ("health_app.py", "app_embedded.html", "app_embedded.manifest.json")
REMOVED_APIS = ("components.v1.html",)

# Placed above the app so the call that renders the document is recorded instead
# of executed. Both the current API and the deprecated one are wrapped, so the
# check also reports which of the two the wrapper used. The record travels
# through a file because AppTest runs the script in its own module namespace.
PROBE = '''
import json as _json, os as _os
import streamlit as _st
import streamlit.components.v1 as _components

def _record(_api):
    def call(document, *args, **kwargs):
        with open(_os.environ["HCE_PROBE_OUT"], "w", encoding="utf-8") as handle:
            _json.dump({"api": _api, "document": document}, handle)
    return call

if hasattr(_st, "iframe"):
    _st.iframe = _record("st.iframe")
_components.html = _record("components.v1.html")
'''


def streamlit_installed():
    return importlib.util.find_spec("streamlit") is not None


def removed_api_calls(wrapper):
    """Calls to APIs Streamlit has scheduled for removal, read from the AST.

    From the AST rather than the text: this file's own comments name the
    deprecated API, so a substring search would fail a wrapper that has already
    stopped calling it.
    """
    tree = ast.parse(wrapper.read_text(encoding="utf-8"))
    found = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Attribute):
            continue
        parts, cursor = [], node
        while isinstance(cursor, ast.Attribute):
            parts.append(cursor.attr)
            cursor = cursor.value
        if isinstance(cursor, ast.Name):
            parts.append(cursor.id)
        dotted = ".".join(reversed(parts))
        for api in REMOVED_APIS:
            if dotted.endswith(api):
                found.add(dotted)
    return sorted(found)


def run(directory, probe):
    """Run health_app.py the way Streamlit does; return (exceptions, recorded)."""
    from streamlit.testing.v1 import AppTest

    app = pathlib.Path(directory, "health_app.py")
    if probe:
        source = PROBE + "\n" + app.read_text(encoding="utf-8")
        app = pathlib.Path(directory, "_probed_health_app.py")
        app.write_text(source, encoding="utf-8")
    out = pathlib.Path(directory, "_probe.json")
    os.environ["HCE_PROBE_OUT"] = str(out)
    at = AppTest.from_file(str(app), default_timeout=60)
    at.run()
    exceptions = [getattr(element, "value", str(element)) for element in at.exception]
    recorded = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {"api": None, "document": None}
    return exceptions, recorded


def main():
    if len(sys.argv) != 2:
        print("usage: verify-streamlit-live.py <directory>", file=sys.stderr)
        return 1
    base = pathlib.Path(sys.argv[1]).resolve()
    absent = [name for name in REQUIRED if not (base / name).exists()]
    if absent:
        print("FAIL — %s is missing %s; nothing to verify." % (base, ", ".join(absent)))
        return 1
    if not streamlit_installed():
        print(
            "FAIL — Streamlit is not installed, so this check cannot run.\n"
            "  Install the deployed app's requirements first:\n"
            "    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
        )
        return 2

    import streamlit

    print("verify-streamlit-live: %s" % base)
    print("  streamlit %s, python %s" % (streamlit.__version__, sys.version.split()[0]))
    expected = (base / "app_embedded.html").read_text(encoding="utf-8")
    failures = 0

    with tempfile.TemporaryDirectory(prefix="hce-live-") as tmp:
        # A copy, so the probe file and any Streamlit artefacts never touch the
        # checkout being verified.
        good = pathlib.Path(tmp, "good")
        shutil.copytree(base, good)
        try:
            exceptions, recorded = run(good, probe=True)
            document = recorded["document"]
            intact = not exceptions and document == expected
            print(
                "  %s — valid pair: %s"
                % (
                    "PASS" if intact else "FAIL",
                    "the documented pair reaches Streamlit intact via %s" % recorded["api"]
                    if intact
                    else "expected no exception and %d characters of artifact text; "
                    "got %d exception(s) and %d characters via %s"
                    % (len(expected), len(exceptions), len(document or ""), recorded["api"]),
                )
            )
            failures += not intact

            deprecated = removed_api_calls(base / "health_app.py")
            print(
                "  %s — no API Streamlit has announced for removal: %s"
                % (
                    "PASS" if not deprecated else "FAIL",
                    "the wrapper renders through %s" % recorded["api"]
                    if not deprecated
                    else "health_app.py still calls %s, which Streamlit removes after 2026-06-01"
                    % ", ".join(deprecated),
                )
            )
            failures += bool(deprecated)
        finally:
            for name in ("_probed_health_app.py", "_probe.json"):
                (good / name).unlink(missing_ok=True)

        # A tampered pair must surface as an app exception, not a served document.
        broken = pathlib.Path(tmp, "broken")
        shutil.copytree(base, broken)
        artifact = broken / "app_embedded.html"
        data = bytearray(artifact.read_bytes())
        data[len(data) // 2] ^= 0x20
        artifact.write_bytes(bytes(data))
        exceptions, _ = run(broken, probe=False)
        messages = " ".join(exceptions)
        refused = bool(exceptions) and "sha256" in messages
        print(
            "  %s — tampered pair: %s"
            % (
                "PASS" if refused else "FAIL",
                "refused at import with the manifest's sha256 named"
                if refused
                else "the app must raise naming the sha256; got %d exception(s): %s"
                % (len(exceptions), messages[:160] or "(none)"),
            )
        )
        failures += not refused

    total = 3
    print("%d/%d cases behaved as the contract requires." % (total - failures, total))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
