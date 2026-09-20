#!/usr/bin/env bash
#
# Notification + Stop — a sound so you can look away from the terminal.
#
# One sound per event type, so the sound alone tells you what happened:
#   Notification  = Claude needs you (permission, or a question)   -> Funk
#   Stop          = the turn finished                              -> Glass
#   SubagentStop  = a subagent finished                            -> Pop
#
# macOS only (afplay). On Linux swap in paplay/aplay with a .wav path.
#
# OFF BY DEFAULT in settings.json. To turn it back on, add it to the
# Notification / Stop / SubagentStop hooks:
#
#   "Stop": [{ "matcher": "", "hooks": [
#     { "type": "command", "command": "~/.claude/hooks/notify-sound.sh" }]}]
#
set -uo pipefail
command -v afplay >/dev/null 2>&1 || exit 0

event=$(jq -r '.hook_event_name // ""' 2>/dev/null) || exit 0
case "$event" in
Notification) sound="Funk" ;;
Stop) sound="Glass" ;;
SubagentStop) sound="Pop" ;;
*) sound="Tink" ;;
esac

f="/System/Library/Sounds/${sound}.aiff"
[ -f "$f" ] && afplay "$f" >/dev/null 2>&1 &
exit 0
