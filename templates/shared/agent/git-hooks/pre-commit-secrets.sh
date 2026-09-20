#!/usr/bin/env bash
#
# Blocks commits that contain secrets.
#
# Install (per clone — .git/hooks is not committed):
#   cp templates/shared/agent/git-hooks/pre-commit-secrets.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# This is the last line of defence, not the only one. The real fix for a team is
# pre-commit + gitleaks, because a local hook protects exactly one machine.
#
set -uo pipefail

fail=0

# --- Token shapes ------------------------------------------------------------
# Only shapes specific enough not to fire on ordinary code. 'eyJ' (a JWT header)
# is the loosest one here and it still fires on base64 that starts with {"; if
# it annoys you, drop it rather than disabling the whole hook.
PATTERNS=(
  'sk-ant-[A-Za-z0-9_-]{20,}'          # Anthropic
  'sk-[A-Za-z0-9]{32,}'                # OpenAI-style
  'sk_live_[A-Za-z0-9]{16,}'           # Stripe live
  'rk_live_[A-Za-z0-9]{16,}'           # Stripe restricted live
  'gh[pousr]_[A-Za-z0-9]{36}'          # GitHub tokens
  'github_pat_[A-Za-z0-9_]{50,}'
  'AKIA[0-9A-Z]{16}'                   # AWS access key id
  'xox[baprs]-[0-9A-Za-z-]{10,}'       # Slack
  'SG\.[A-Za-z0-9_-]{20,}'             # SendGrid
  'AIza[0-9A-Za-z_-]{35}'              # Google API key
  'glpat-[A-Za-z0-9_-]{20,}'           # GitLab PAT
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.'  # JWT (3 parts)
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

added=$(git diff --cached --diff-filter=ACM -U0 | grep '^+' | grep -v '^+++' || true)

if [ -n "$added" ]; then
  for p in "${PATTERNS[@]}"; do
    if printf '%s' "$added" | grep -qE -- "$p"; then
      printf '\033[31mBLOCKED\033[0m: added lines match a secret pattern: /%s/\n' "$p" >&2
      printf '%s\n' "$added" | grep -nE -- "$p" | head -3 | sed 's/^/    /' >&2
      fail=1
    fi
  done
fi

# --- Files that must never be committed --------------------------------------
BLOCKED_FILES='(^|/)(\.env(\..*)?|credentials\.json|service-account.*\.json|id_rsa|id_ed25519|.*\.pem|.*\.key|.*\.p12|.*\.keystore)$'
staged=$(git diff --cached --name-only --diff-filter=ACM || true)

while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in *.env.example|*.env.sample|*.env.template) continue ;; esac
  if printf '%s' "$f" | grep -qE "$BLOCKED_FILES"; then
    printf '\033[31mBLOCKED\033[0m: sensitive file staged: %s\n' "$f" >&2
    fail=1
  fi
done <<< "$staged"

if [ "$fail" -ne 0 ]; then
  cat >&2 <<'MSG'

Remove the secret, then commit again.
If the value is already pushed, ROTATE IT — removing it from the diff does not
remove it from history or from anyone's clone.

To override for a false positive (and only then):
    git commit --no-verify
MSG
  exit 1
fi

exit 0
