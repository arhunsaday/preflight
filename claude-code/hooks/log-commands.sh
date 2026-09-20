#!/usr/bin/env bash
#
# PreToolUse(Bash) — timestamped audit trail of every shell command.
#
# Answers "what did it actually run three sessions ago?" without keeping the
# transcript. Add .claude/command-log.txt to .gitignore.
#
set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

log="${CLAUDE_PROJECT_DIR:-$PWD}/.claude/command-log.txt"
mkdir -p "$(dirname "$log")" 2>/dev/null || exit 0
printf '%s\t%s\t%s\n' "$(date -Iseconds)" "${PWD}" "$cmd" >> "$log" 2>/dev/null
exit 0
