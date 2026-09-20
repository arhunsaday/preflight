#!/usr/bin/env bash
#
# PreToolUse(Bash) — hard gate: no green tests, no pull request.
#
# Matches on the command text because `gh pr create` is a Bash call, not a
# distinct tool. If you drive PRs through the GitHub MCP server instead, match
# on mcp__github__create_pull_request and drop the grep.
#
set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
printf '%s' "$cmd" | grep -qE '(gh|glab)[[:space:]]+(pr|mr)[[:space:]]+create' || exit 0

cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0
[ -f package.json ] || exit 0
grep -q '"test"' package.json 2>/dev/null || exit 0

if npm test --silent >/dev/null 2>&1; then
  exit 0
fi
printf 'Blocked: the test suite is failing, so this PR would open red.\n' >&2
printf 'Fix the failures first, then create the PR.\n' >&2
exit 2
