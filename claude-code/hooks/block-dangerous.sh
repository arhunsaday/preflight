#!/usr/bin/env bash
#
# PreToolUse(Bash) — refuse destructive shell commands.
#
# Exit 2 is the contract: it blocks the call AND feeds stderr back to Claude so
# it can propose a safer route. Exit 0 allows. Any other code logs a warning
# without blocking, which is why every failure path below must exit 0 or 2.
#
set -uo pipefail

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$cmd" ] && exit 0

# Strip heredoc bodies before matching. Writing a file that *documents* a
# destructive command is not running one, and blocking that makes the hook
# unusable in any repo that discusses its own operations — including this one.
# The delimiter may be followed by a redirection (`<<'EOF' > file`), so this
# does not anchor to end-of-line — it takes the first heredoc marker on the line.
cmd=$(printf '%s\n' "$cmd" | awk '
  !inhere && match($0, /<<-?[[:space:]]*['"'"'"]?[A-Za-z_][A-Za-z0-9_]*/) {
    tok = substr($0, RSTART, RLENGTH)
    sub(/^<<-?[[:space:]]*/, "", tok)
    gsub(/['"'"'"]/, "", tok)
    delim = tok; inhere = 1; print; next
  }
  inhere {
    t = $0; sub(/^[[:space:]]+/, "", t)
    if (t == delim) inhere = 0
    next
  }
  { print }
')

# Deliberately narrow. A pattern that fires on safe commands gets the whole
# hook disabled within a week, which protects nothing.
dangerous=(
	'rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+/' # rm -rf on an absolute path
	'rm[[:space:]]+-[a-zA-Z]*r[a-zA-Z]*f|rm[[:space:]]+-[a-zA-Z]*f[a-zA-Z]*r'
	'git[[:space:]]+reset[[:space:]]+--hard'
	'git[[:space:]]+push[[:space:]].*--force'
	'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'
	'DROP[[:space:]]+(TABLE|DATABASE|SCHEMA)'
	'TRUNCATE[[:space:]]+TABLE'
	'(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba)?sh' # curl … | sh
	'chmod[[:space:]]+-R[[:space:]]+777'
	'mkfs\.|dd[[:space:]]+if=.*of=/dev/'
	':\(\)\{.*\|.*&.*\};:' # fork bomb
)

for p in "${dangerous[@]}"; do
	if printf '%s' "$cmd" | grep -qiE "$p"; then
		printf 'Blocked: this command matches the dangerous pattern /%s/.\n' "$p" >&2
		printf 'Command: %s\n' "$cmd" >&2
		printf 'Propose a safer alternative, or ask the user to run it themselves.\n' >&2
		exit 2
	fi
done
exit 0
