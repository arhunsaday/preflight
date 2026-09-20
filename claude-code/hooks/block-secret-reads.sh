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

# .env.example is a documented template with no real values.
printf '%s' "$target" | grep -qE '\.env\.example' && exit 0

if printf '%s' "$target" | grep -qE '(^|/|[[:space:]])\.env($|[./[:space:]])|id_rsa|id_ed25519|\.pem($|[[:space:]])|\.p12($|[[:space:]])|credentials\.json|service-account.*\.json'; then
  printf 'Blocked: %s looks like it holds secrets.\n' "$target" >&2
  printf 'Reading it would copy those values into the transcript. Ask the user for\n' >&2
  printf 'the specific value you need, or read .env.example for the shape.\n' >&2
  exit 2
fi
exit 0
