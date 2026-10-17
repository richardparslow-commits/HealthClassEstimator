#!/usr/bin/env python3
"""The deployed app's Python version, in one place.

Three things run the wrapper and each could pick a different interpreter: a
local checkout (whatever `python3` resolves to — on this project's own machines
3.9 and 3.13 both exist), CI (whatever a workflow hard-codes), and Streamlit
Community Cloud (whatever the app was deployed with). A wrapper that works on
one and not another is a difference nobody can see until it fails, and the
failure looks like a broken app rather than a version skew.

So the deployed repository declares one version, in `.python-version`:

  * `actions/setup-python` reads that same file (`python-version-file`), which is
    what the deploy and canary workflows now do instead of restating `3.12` in
    YAML — a copy in a workflow is a second declaration that drifts silently;
  * the dev container's image tag is checked against it, because the container is
    the "local run" most likely to be trusted and least likely to be read;
  * `verify-streamlit-live.py` compares it with the interpreter actually running
    the wrapper and fails when they differ, so a workflow that quietly installed
    something else is caught by the check that already runs on every release.

Cloud cannot be read from here, and this module says so rather than implying
otherwise: Community Cloud chooses the interpreter in the app's *Advanced
settings* at deployment time, does not read `runtime.txt` or `.python-version`,
and only uses a different version if the app is deleted and redeployed. The
declaration is therefore the human instruction for that setting, and the thing
local and CI hold themselves to; the deployment's own selection is the one part
of "the same interpreter everywhere" that no file can enforce.

The supported range is Cloud's published policy — every released Python still
receiving security fixes — as of 2026-10-16: 3.11 through 3.15. A pin outside it
is refused, because Cloud cannot honour it.
"""
import json
import pathlib
import re

PIN_FILE = ".python-version"
DEVCONTAINER = ".devcontainer/devcontainer.json"

# Cloud's policy is "released versions still receiving security updates". Pinned
# as a list rather than derived, because a check that guesses at someone else's
# support policy is worse than one that names it and is updated deliberately.
SUPPORTED = ("3.11", "3.12", "3.13", "3.14", "3.15")
DEFAULT = "3.12"

PIN_SHAPE = re.compile(r"^\d+\.\d+(?:\.\d+)?$")
# `python:1-3.12-bookworm` (devcontainers image) and a plain `python:3.12` tag.
IMAGE = re.compile(r"python:(?:1-)?(\d+\.\d+(?:\.\d+)*)")


def _parts(text):
    return tuple(int(piece) for piece in text.split("."))


def matches(pin, version):
    """Does `version` (a tuple like sys.version_info) satisfy `pin`?

    A pin of `3.12` means the 3.12 line, whatever patch Cloud installs; a pin of
    `3.12.7` means that patch too. Nothing here floats a minor.
    """
    want = _parts(pin)
    have = tuple(int(part) for part in tuple(version)[: len(want)])
    return want == have


def agrees(pin, declared):
    """Do two declarations describe the same interpreter, as far as both go?

    A dev container image names a line (`python:1-3.12-bookworm`), not a patch,
    so a patch-level pin cannot be confirmed by it — and refusing one would make
    the more precise declaration impossible to state. They agree when their
    shared prefix does: `3.12.7` and `3.12` agree, `3.12` and `3.11` do not.
    """
    left, right = _parts(pin), _parts(declared)
    shared = min(len(left), len(right))
    return left[:shared] == right[:shared]


def read_pin(directory):
    """The declared version, or (None, problem)."""
    path = pathlib.Path(directory) / PIN_FILE
    if not path.exists():
        return None, (
            "%s is missing — the deployed repository must declare the interpreter it runs, so a "
            "local checkout, CI and Streamlit Cloud can be held to the same one. Add a file named "
            "%s containing %s." % (PIN_FILE, PIN_FILE, DEFAULT)
        )
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return None, "%s is empty — it must name one version, for example %s." % (PIN_FILE, DEFAULT)
    first = text.splitlines()[0].strip()
    if not PIN_SHAPE.match(first):
        return None, "%s holds %r, which is not a Python version such as %s." % (PIN_FILE, first, DEFAULT)
    minor = ".".join(first.split(".")[:2])
    if minor not in SUPPORTED:
        return None, (
            "%s pins %s, which Streamlit Community Cloud does not offer (it supports %s). "
            "Cloud refuses the deployment rather than running it, so the pin must be one of those."
            % (PIN_FILE, first, ", ".join(SUPPORTED))
        )
    return first, None


def read_devcontainer(directory):
    """The interpreter the dev container would run, or (None, problem)."""
    path = pathlib.Path(directory) / DEVCONTAINER
    if not path.exists():
        return None, (
            "%s is missing, so the local container's interpreter is unknown — it is the run most "
            "likely to be trusted and least likely to be read." % DEVCONTAINER
        )
    text = path.read_text(encoding="utf-8")
    try:
        image = json.loads(re.sub(r"^\s*//.*$", "", text, flags=re.M)).get("image", "")
    except ValueError:
        return None, "%s is not valid JSON, so its image (and interpreter) cannot be read." % DEVCONTAINER
    match = IMAGE.search(image or "")
    if not match:
        return None, "%s names no Python image (%r), so its interpreter is unknown." % (DEVCONTAINER, image)
    return match.group(1), None


def check(directory, version_info):
    """The four-way question, answered in one place.

    Returns {"status", "pin", "devcontainer", "running", "problems", "message"}.
    """
    running = ".".join(str(part) for part in tuple(version_info)[:3])
    pin, pin_problem = read_pin(directory)
    container, container_problem = read_devcontainer(directory)
    problems = [problem for problem in (pin_problem, container_problem) if problem]

    if pin and container and not agrees(pin, container):
        problems.append(
            "%s runs Python %s but %s declares %s — the local container would exercise a different "
            "interpreter from the one that ships." % (DEVCONTAINER, container, PIN_FILE, pin)
        )
    if pin and not matches(pin, version_info):
        problems.append(
            "this run is Python %s but %s declares %s — CI installs the declared version, so a "
            "mismatch means something installed another one; locally, run the check with %s. "
            "Streamlit Cloud's interpreter is chosen in the app's Advanced settings and must be %s."
            % (running, PIN_FILE, pin, "python" + pin, pin)
        )

    if problems:
        return {
            "status": "FAIL",
            "pin": pin,
            "devcontainer": container,
            "running": running,
            "problems": problems,
            "message": "; ".join(problems),
        }
    return {
        "status": "PASS",
        "pin": pin,
        "devcontainer": container,
        "running": running,
        "problems": [],
        "message": "%s declares %s, the dev container agrees, and this run is %s" % (PIN_FILE, pin, running),
    }
