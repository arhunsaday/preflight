#!/usr/bin/env bash
#
# PostToolUse(Write|Edit) — format the file Claude just touched.
#
# Always exits 0: a formatter that is absent, or that fails on a partial file,
# must never block the edit. Worst case it does nothing.
#
set -uo pipefail

file=$(jq -r '.tool_input.file_path // ""' 2>/dev/null) || exit 0
[ -z "$file" ] || [ ! -f "$file" ] && exit 0

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.scss|*.html|*.md|*.yaml|*.yml)
      command -v npx >/dev/null 2>&1 && npx --no-install prettier --write "$file" >/dev/null 2>&1 ;;
  *.py)   command -v ruff   >/dev/null 2>&1 && ruff format "$file" >/dev/null 2>&1 \
       || command -v black  >/dev/null 2>&1 && black -q "$file" >/dev/null 2>&1 ;;
  *.go)   command -v gofmt  >/dev/null 2>&1 && gofmt -w "$file"  >/dev/null 2>&1 ;;
  *.rs)   command -v rustfmt>/dev/null 2>&1 && rustfmt "$file"   >/dev/null 2>&1 ;;
  *.sh)   command -v shfmt  >/dev/null 2>&1 && shfmt -w "$file"  >/dev/null 2>&1 ;;
esac
exit 0
