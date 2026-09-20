#!/usr/bin/env bash
#
# PreToolUse(Edit|Write|NotebookEdit) — refuse writes to files that must not be
# edited by an agent: secrets, lockfiles, git internals.
#
# Reading is not blocked here. Claude sometimes needs to read a lockfile to
# answer a question; what it must not do is rewrite one.
#
set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // .tool_input.path // ""' 2>/dev/null) || exit 0
[ -z "$file" ] && exit 0
base=$(basename "$file")

# Documented templates carry no real values — checked BEFORE the globs below,
# because `.env.*` matches `.env.example` and would otherwise block it.
case "$base" in .env.example|.env.sample|.env.template) exit 0 ;; esac

protected_glob=(
  '.env' '.env.*' '*.pem' '*.key' '*.p12' '*.keystore'
  'id_rsa' 'id_ed25519' 'credentials.json' 'service-account*.json'
  'package-lock.json' 'pnpm-lock.yaml' 'yarn.lock' 'bun.lockb' 'Cargo.lock'
)
for g in "${protected_glob[@]}"; do
  # shellcheck disable=SC2053
  if [[ $base == $g ]]; then
    printf 'Blocked: %s is protected by the protect-files hook.\n' "$file" >&2
    printf 'Secrets and lockfiles are not agent-editable. If this edit is genuinely\n' >&2
    printf 'required, explain why and ask the user to make it.\n' >&2
    exit 2
  fi
done

case "$file" in
  */.git/*|.git/*)
    printf 'Blocked: %s is inside .git/. Use git commands, never direct edits.\n' "$file" >&2
    exit 2 ;;
esac

exit 0
