#!/usr/bin/env bash
# Prove, without publishing anything, that the credential this repository publishes with
# can push to the deployed repository.
#
# Two callers need this answer, and they need it for opposite reasons:
#
#   * `.github/workflows/deploy-streamlit.yml` asks it before it builds anything, so a
#     release that cannot publish says so in seconds instead of after the CSS audit, the
#     runtime harness and the staging copy (run 39154157467 did exactly that, and the app
#     went on serving the release before it).
#   * `.github/workflows/streamlit-credential.yml` asks it every day, whether or not a
#     release is imminent, because a key can be revoked, rotated, or replaced with a
#     read-only one between releases — and the last thing to find out should not be a
#     publish.
#
# One implementation, because the second caller would otherwise re-derive the answer with
# a copy that could drift. The refusals are the interesting part and they are GitHub's
# words: a read-only key, a revoked key, a key added to another repository, a value that
# is not a key at all, a rejected token. Each is reported with the cause and the fix, and
# the credential itself is never printed.
#
# `--dry-run` is the whole method: the server authorises the push and receives nothing, so
# a read-only key is refused here (reading the repository would not catch it — only a push
# would) while no ref is created. The destination is a scratch ref rather than main, so the
# answer is about the credential: whether main accepts a commit is the release push's
# question, and origin moving between staging and the push is the read-back's.
#
# Usage:
#   scripts/verify-push-credential.sh [<repo-dir>]     # default: streamlit-app
#
# Environment:
#   DEPLOYED_REPO            required, owner/name of the deployed repository
#   STREAMLIT_DEPLOY_KEY     a read/write deploy key's private half (preferred)
#   STREAMLIT_PUSH_TOKEN     a PAT with Contents read/write on that repository
#   RUNNER_TEMP              where the key is written (default /tmp)
#   CREDENTIAL_JSON          optional path; a machine-readable verdict is written there,
#                            so a caller that files an issue does not parse prose:
#                            {"ok":false,"code":"read-only","detail":"…","error":"…"}
#
# Exit status: 0 when the credential can push; 1 when it cannot (or is not configured);
# 2 on a usage error — a check that cannot run must not report a pass.
set -euo pipefail

usage() {
  sed -n '2,/^set -euo pipefail$/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
}

repo_dir="${1:-streamlit-app}"
if [ "$#" -gt 1 ]; then
  echo "ERROR: at most one argument (the repository to push from) is accepted" >&2
  exit 2
fi
if [ -z "${DEPLOYED_REPO:-}" ]; then
  echo "ERROR: DEPLOYED_REPO is not set, so there is no repository to prove the credential against" >&2
  exit 2
fi
if [ ! -d "$repo_dir" ]; then
  echo "ERROR: no repository at $repo_dir to push from" >&2
  exit 2
fi

esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# The machine-readable verdict, written when a caller asks for one. `code` is the stable
# part an issue can be filed on; `detail` is the sentence a person reads.
report() { # <ok> <code> <detail> <error>
  [ -n "${CREDENTIAL_JSON:-}" ] || return 0
  printf '{"ok":%s,"code":"%s","detail":"%s","error":"%s"}\n' \
    "$1" "$(esc "$2")" "$(esc "$3")" "$(esc "$4")" > "$CREDENTIAL_JSON"
}

fail() { # <code> <detail> <error>
  report false "$1" "$2" "$3"
  echo "::error::The push credential $2. This release would have built and verified the pair and then failed at the push, so it stopped here instead: nothing has been built or published. Fix the credential and re-run — a read/write deploy key on ${DEPLOYED_REPO} as the STREAMLIT_DEPLOY_KEY secret (gh repo deploy-key add <key>.pub -R ${DEPLOYED_REPO} --allow-write, then gh secret set STREAMLIT_DEPLOY_KEY), or a PAT with Contents read/write on it as STREAMLIT_PUSH_TOKEN."
  exit 1
}

if [ -z "${STREAMLIT_DEPLOY_KEY:-}" ] && [ -z "${STREAMLIT_PUSH_TOKEN:-}" ]; then
  fail "missing" "is not configured: neither STREAMLIT_DEPLOY_KEY nor STREAMLIT_PUSH_TOKEN is set" \
    "no credential is configured at all"
fi

# Chosen exactly as the release push chooses it, so the credential proved here is the one
# that will publish.
auth=()
if [ -n "${STREAMLIT_DEPLOY_KEY:-}" ]; then
  key="${RUNNER_TEMP:-/tmp}/streamlit_preflight_key"
  printf '%s\n' "$STREAMLIT_DEPLOY_KEY" > "$key"
  chmod 600 "$key"
  export GIT_SSH_COMMAND="ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o BatchMode=yes"
  remote="git@github.com:${DEPLOYED_REPO}.git"
  echo "Proving the deploy key can push to ${DEPLOYED_REPO}."
else
  auth=(-c "http.https://github.com/.extraheader=AUTHORIZATION: basic $(printf 'x-access-token:%s' "$STREAMLIT_PUSH_TOKEN" | base64 -w0)")
  remote="https://github.com/${DEPLOYED_REPO}.git"
  echo "Proving STREAMLIT_PUSH_TOKEN can push to ${DEPLOYED_REPO}."
fi

# Fails rather than waits: a credential prompt on a runner is a hang, and the thing being
# tested is absent.
export GIT_TERMINAL_PROMPT=0
set +e
output="$(cd "$repo_dir" && git ${auth[@]+"${auth[@]}"} push --dry-run "$remote" HEAD:refs/heads/preflight-credential-check 2>&1)"
status=$?
set -e

if [ "$status" -eq 0 ]; then
  report true "ok" "can push to ${DEPLOYED_REPO}" ""
  echo "The credential can push to ${DEPLOYED_REPO}: the server authorised a dry-run push and received nothing."
  exit 0
fi

echo "$output"
# One line of GitHub's, for an issue that should not quote a log: the last line before the
# git failure summary, which is where the server's refusal sits.
first_refusal="$(printf '%s\n' "$output" | grep -v '^fatal:' | grep -v '^Please make sure' | grep -v '^and the repository exists' | sed -n '1p')"

# Order matters: a key ssh cannot parse also fails the handshake, so the refusal that
# follows says "Permission denied (publickey)" and would be reported as a revoked key.
# The unreadable key is the cause and is asked for first.
code="refused"
detail="was refused by the server"
case "$output" in
  *"read only"*)
    code="read-only"
    detail="is marked read-only on that repository, so it can read the deployed copy and never update it" ;;
  *"invalid format"*|*"error in libcrypto"*|*"Load key"*)
    code="not-a-key"
    detail="is not a usable private key, so the secret's value looks pasted incompletely" ;;
  *"Permission denied (publickey)"*)
    code="revoked"
    detail="is not accepted for that repository: it was deleted or revoked, or it belongs to another repository" ;;
  *"Repository not found"*)
    code="not-authorized"
    detail="is accepted but is not authorised for that repository" ;;
  *"Invalid username or password"*|*"Authentication failed"*|*"403"*)
    code="token-rejected"
    detail="was rejected: the token is expired, revoked, or lacks Contents read/write on that repository" ;;
esac

fail "$code" "$detail" "$first_refusal"
