#!/usr/bin/env bash
#
# Generates every tool-specific pointer file from the one canonical AGENTS.md.
#
#   ./sync-agent-files.sh          write them
#   ./sync-agent-files.sh --check  exit 1 if any is missing or stale (for CI)
#
# The pointers deliberately carry no conventions of their own. A convention that
# appears in two files drifts; this script exists so it only ever appears in one.
#
set -euo pipefail

ROOT="${2:-$PWD}"
CHECK=0
[ "${1:-}" = "--check" ] && CHECK=1

[ -f "$ROOT/AGENTS.md" ] || { echo "no AGENTS.md at $ROOT — nothing to point at" >&2; exit 1; }

PROJECT=$(basename "$ROOT")
BODY="Read \`AGENTS.md\` first. It is the canonical project contract and wins
wherever this file disagrees.

Order of work for anything non-trivial:

1. Read \`agent-compass.commands.json\` for the real commands — invent none.
2. Read the matching \`.claude/instincts/*.md\` for the area being touched.
3. Make the smallest safe change and update the tests alongside it.
4. Run scoped lint, typecheck and the relevant tests.
5. Report with the Completion Gate + Handoff Format from \`AGENTS.md\`.

Do not commit, push, deploy, publish, or open PRs unless explicitly asked.
Never add AI attribution to a commit message or PR body."

stale=0

write() {  # write PATH TITLE [frontmatter]
  local path="$ROOT/$1" title="$2" fm="${3:-}"
  local content
  content="${fm}# ${title} — ${PROJECT}

${BODY}
"
  if [ "$CHECK" -eq 1 ]; then
    if [ ! -f "$path" ] || ! printf '%s' "$content" | diff -q - "$path" >/dev/null 2>&1; then
      echo "stale or missing: $1" >&2; stale=1
    fi
    return 0
  fi
  mkdir -p "$(dirname "$path")"
  printf '%s' "$content" > "$path"
  echo "  wrote $1"
}

write "CLAUDE.md" "Claude"
write "CODEX.md"  "Codex"
write "GEMINI.md" "Gemini"
write ".github/copilot-instructions.md" "Copilot"
write ".cursor/rules/project.mdc" "Cursor" "---
description: Project conventions — canonical contract is AGENTS.md
alwaysApply: true
---

"

# Formats without a heading convention
if [ "$CHECK" -eq 0 ]; then
  printf '%s\n' "$BODY" > "$ROOT/.windsurfrules"; echo "  wrote .windsurfrules"
  printf '%s\n' "$BODY" > "$ROOT/.rules";         echo "  wrote .rules (Zed)"
  printf '%s\n' "$BODY" > "$ROOT/.clinerules";    echo "  wrote .clinerules"
fi

if [ "$CHECK" -eq 1 ]; then
  [ "$stale" -eq 0 ] && echo "all pointer files in sync" || exit 1
fi
