#!/usr/bin/env bash
# Read a deployed repository's pair back from origin and prove it is this build.
#
# Why this exists: the deploy workflow used to verify the *staged* copy and then
# push it, and nothing ever read back what origin held. Two things went unchecked
# that way.
#
#   * The pair that ships is `app_embedded.html`, built by `release:artifact`; the
#     build the CSS, builder and manifest checks judge is `dist/app.html`, built by
#     `npm run build`. Both come from the same sources, so they agree today — but
#     nothing asserted it, so a divergence would have been published first and
#     noticed by the next scheduled parity run, a day later, against a live copy.
#   * A push can be rejected, land on a commit that is not the branch head, or be
#     superseded (the workflow runs with `concurrency: cancel-in-progress`). The
#     run summary said "published" either way.
#
# So this reads the branch head straight from origin, clones that commit, and
# compares the artifact byte for byte with the build this repository produced,
# then runs the repository's own manifest checker on the published pair — the same
# check the deployed wrapper performs before it serves anything. Both verdicts are
# about the bytes origin holds, which is the only copy Streamlit Cloud reads; the
# staging directory is not consulted, and a manifest copied from an older release
# fails even when its artifact happens to match.
#
# The published manifest is not compared byte for byte with a locally generated
# one: its `source_commit` and `built_utc` are provenance, so a by-hand run would
# fail on those alone. What matters is that it describes the published artifact.
#
# Usage:
#   scripts/verify-published-pair.sh --remote <url-or-path> --into <dir> \
#     [--branch main] [--artifact dist/app.html] [--expect <sha>] \
#     [--commit-out <file>]
#
#   --expect <sha>      the commit the caller believes it just pushed. A different
#                       branch head is a failure: the push did not land, or
#                       something moved the branch after it.
#   --commit-out <file> writes the full commit hash origin's branch pointed at, as
#                       soon as it is read, so a caller can name the build in a run
#                       summary without parsing text — including a build a later
#                       comparison refuses, which is the one a reader most needs named.
#   --into <dir>        where to keep the read-back checkout (replaced if present),
#                       so a caller can run the deployed app's own verifier on it.
#
# Exit status: 0 when origin's head carries this build and a manifest that
# describes it; 1 when it does not (including a branch head that is not the
# expected commit); 2 on a usage error, a mistake in the caller rather than a bad
# publish.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: verify-published-pair.sh --remote <url-or-path> --into <dir> [options]

  --remote <url-or-path>   repository to read back (required)
  --into <dir>             keep the checkout here (required)
  --branch <name>          branch whose head is judged (default: main)
  --artifact <path>        local build to compare against (default: dist/app.html)
  --expect <sha>           require origin's branch head to be this commit
  --commit-out <file>      write origin's branch head to this file as soon as it is read
  -h, --help               show this message

The file compared inside the checkout is always app_embedded.html — the name the
deployed wrapper verifies — because that is what the deployment reads, whatever
the local build is called. Its manifest is checked by the repository's own
manifest writer, not compared with a local copy.
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

remote=""
into=""
branch="main"
artifact="dist/app.html"
expect=""
commit_out=""

while [ $# -gt 0 ]; do
  case "$1" in
    --remote) [ $# -ge 2 ] || die "--remote needs a value"; remote="$2"; shift 2 ;;
    --into) [ $# -ge 2 ] || die "--into needs a value"; into="$2"; shift 2 ;;
    --branch) [ $# -ge 2 ] || die "--branch needs a value"; branch="$2"; shift 2 ;;
    --artifact) [ $# -ge 2 ] || die "--artifact needs a value"; artifact="$2"; shift 2 ;;
    --expect) [ $# -ge 2 ] || die "--expect needs a value"; expect="$2"; shift 2 ;;
    --commit-out) [ $# -ge 2 ] || die "--commit-out needs a value"; commit_out="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$remote" ] || { echo "ERROR: --remote is required: the repository to read back." >&2; usage >&2; exit 2; }
[ -n "$into" ] || { echo "ERROR: --into is required: where to keep the checkout." >&2; usage >&2; exit 2; }
[ -f "$artifact" ] || die "the local build $artifact does not exist, so there is nothing to compare a published copy with. Run npm run build first (or pass --artifact)."

# Resolved from this script's location, so the checker runs from the repository the
# caller is in rather than from whatever directory they happened to be in.
root="$(cd "$(dirname "$0")/.." && pwd)"

# Read the head without cloning: a wrong head must fail before anything is fetched,
# and the message has to say which commit was expected instead of leaving the
# reader to compare clone output.
head="$(git ls-remote --heads "$remote" "refs/heads/$branch" 2>/dev/null | awk 'NR == 1 { print $1 }')" || true
if [ -z "$head" ]; then
  die "could not read refs/heads/$branch from $remote. The repository must be readable from here (the deployed one is public, and a token that can push can also read); check the name and that the branch exists."
fi

# Written before anything is compared, not after: "the deployment is stale" without
# the commit it is stale at leaves the reader to open the log to find out which build
# was judged, and the refusal cases are exactly the ones that need naming. A caller
# that wants "verified" needs its own marker for the checks that follow this file.
if [ -n "$commit_out" ]; then
  printf '%s\n' "$head" > "$commit_out"
fi

if [ -n "$expect" ] && [ "${expect}" != "$head" ]; then
  die "origin's $branch is ${head}, not ${expect}. The push did not land, or the branch moved after it (a newer run supersedes this one with concurrency: cancel-in-progress). Nothing was compared: the copy origin holds was never verified by this run."
fi

# A short label for the verdict, in the same `owner/repo@sha` shape the parity
# verdict uses, so a run summary and a drift issue can be read against each other.
label_repo="${remote%.git}"
case "$label_repo" in
  *://*) label_repo="${label_repo#*://}" ;;
esac
label_repo="$(printf '%s' "$label_repo" | awk -F/ '{ if (NF >= 2) print $(NF-1) "/" $NF; else print $NF }')"
label="${label_repo}@${head:0:7}"

rm -rf "$into"
if ! clone_err="$(git clone --quiet --depth 1 --single-branch --branch "$branch" "$remote" "$into" 2>&1)"; then
  printf '%s\n' "$clone_err" >&2
  die "could not clone $remote ($branch) to $into."
fi

cloned="$(git -C "$into" rev-parse HEAD)"
if [ "$cloned" != "$head" ]; then
  die "$branch moved while this read-back was cloning: origin reported $head and the checkout is $cloned. Re-run so the verdict is about one commit."
fi

for file in app_embedded.html app_embedded.manifest.json; do
  if [ ! -f "$into/$file" ]; then
    die "$label has no $file. The deployed repository must carry both the artifact and its manifest — the wrapper refuses to serve a pair it cannot verify — so this is not a deploy this run can certify."
  fi
done

artifact_sha="$(sha256 "$artifact")"
published_sha="$(sha256 "$into/app_embedded.html")"
artifact_bytes="$(wc -c < "$artifact" | tr -d ' ')"
published_bytes="$(wc -c < "$into/app_embedded.html" | tr -d ' ')"

if [ "$artifact_sha" != "$published_sha" ]; then
  die "the published artifact is not the build this repository produced.
       local     $artifact  sha256 $artifact_sha  $artifact_bytes bytes
       published app_embedded.html  sha256 $published_sha  $published_bytes bytes
       Nothing compares equal, so the copy live in $label (commit $head) was never verified by this run."
fi

# The artifact matching is not enough: the deployed wrapper verifies the manifest
# against it before serving, so a stale or edited manifest is a pair that does not
# load. Running the writer's own checker means the verdict is the deployed app's
# contract rather than a second opinion about it.
if ! manifest_verdict="$(node "$root/scripts/write-artifact-manifest.js" --check "$into/app_embedded.html" 2>&1)"; then
  die "the published manifest does not describe the published artifact at $head, so the deployed app would refuse to serve this pair.
$manifest_verdict"
fi

echo "PASS — the pair origin holds is the build this repository produced."
echo "       Layout: $label"
echo "       artifact  app_embedded.html  sha256 ${artifact_sha:0:16}…  $artifact_bytes bytes"
echo "       manifest  $manifest_verdict"
echo "       Both files were read back from origin at $head, not from the local"
echo "       staging copy, so the verdict is about the copy Streamlit Cloud reads."
echo "Commit: $head"
