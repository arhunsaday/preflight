#!/usr/bin/env bash
#
# PreToolUse(Read|Grep|Bash) — keep secret files out of the context window.
#
# protect-files.sh stops Claude WRITING them. This stops it READING them: once
# a key is in the context it is in the transcript, and the transcript goes to
# the API and sits on disk. Different failure, different hook.
#
set -uo pipefail

payload=$(cat)
target=$(printf '%s' "$payload" | jq -r '
  .tool_input.file_path // .tool_input.path // .tool_input.pattern // .tool_input.command // ""' 2>/dev/null) || exit 0
[ -z "$target" ] && exit 0

# Documented templates hold no real values. Strip them from the string BEFORE
# testing, rather than exiting early on a match: `cat .env && cat .env.example`
# would otherwise be waved through by the mention of the example file.
probe=$(printf '%s' "$target" | sed -E 's/\.env\.(example|sample|template)//g')

# Boundaries are any non-word character, not just a space or a slash, so that
# `python3 -c "open('.env')"` is caught — quotes and parens count too.
if printf '%s' "$probe" | grep -qE '(^|[^A-Za-z0-9_.-])\.env([^A-Za-z0-9_-]|$)|id_rsa|id_ed25519|\.pem([^A-Za-z0-9]|$)|\.p12([^A-Za-z0-9]|$)|\.key([^A-Za-z0-9]|$)|credentials\.json|service-account.*\.json'; then
	printf 'Blocked: %s looks like it holds secrets.\n' "$target" >&2
	printf 'Reading it would copy those values into the transcript. Ask the user for\n' >&2
	printf 'the specific value you need, or read .env.example for the shape.\n' >&2
	exit 2
fi
exit 0
