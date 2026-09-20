#!/usr/bin/env bash
#
# PostToolUse(Write|Edit) — lint the touched file and hand the errors back.
#
# Output is capped: Claude needs "3 errors, here they are", not 200 lines that
# evict the context it needs to fix them. Always exits 0 — this reports, the
# quality gate at commit time is what blocks.
#
set -uo pipefail

file=$(jq -r '.tool_input.file_path // ""' 2>/dev/null) || exit 0
[ -z "$file" ] || [ ! -f "$file" ] && exit 0

out=""
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
      command -v npx >/dev/null 2>&1 && out=$(npx --no-install eslint --fix "$file" 2>&1) ;;
  *.py)
      command -v ruff >/dev/null 2>&1 && out=$(ruff check --fix "$file" 2>&1) ;;
  *.sh)
      command -v shellcheck >/dev/null 2>&1 && out=$(shellcheck -f gcc "$file" 2>&1) ;;
esac

[ -n "$out" ] && printf '%s\n' "$out" | head -20
exit 0
