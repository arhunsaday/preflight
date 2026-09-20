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

# ONLY what is irreversible AND silent. Everything else is deliberately absent.
#
# The list used to be twice this long and it blocked real work three times in one
# session — writing a file that merely *mentioned* a destructive command. A hook
# that fires on safe input is a hook you disable, and a disabled hook protects
# nothing. So the bar for adding a pattern here is: no undo, and no warning.
#
# Deliberately NOT blocked, with the reason:
#   git reset --hard   the reflog gets it back
#   git clean -f       annoying, but you are in a repo you chose to clean
#   chmod -R 777       bad practice, not destruction
#   rm -rf ./relative  scoped to the working directory you are already in
dangerous=(
	# Catastrophic roots only: / , /* , ~ , ~/ , $HOME. Requires the RECURSIVE
	# flag and the target being the root itself — `rm -rf ./build` and
	# `rm -f ~/notes.md` are normal work and must not trip this.
	'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*[[:space:]]+)+(/|~/?|\$HOME/?)[[:space:]]*\*?[[:space:]]*$'
	'git[[:space:]]+push[[:space:]].*--force[^-]' # --force, not --force-with-lease
	'(DROP|TRUNCATE)[[:space:]]+(TABLE|DATABASE|SCHEMA)'
	'(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba)?sh' # curl … | sh
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
