#!/usr/bin/env bash
#
# ai-dev-kit doctor — what is installed, what is wired, what is missing.
#
#   ./doctor.sh              full report
#   ./doctor.sh --quiet      only problems (exit 1 if any)
#   ./doctor.sh --skills     skill inventory only
#
# It reports; it never changes anything.
#
set -uo pipefail

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
STORE="$HOME/.agents/skills"

QUIET=0; ONLY=""
case "${1:-}" in
  --quiet) QUIET=1 ;;
  --skills) ONLY=skills ;;
  --help|-h) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
esac

if [ -t 1 ]; then
  G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; B=$'\033[1m'; O=$'\033[0m'
else G=""; Y=""; R=""; D=""; B=""; O=""; fi

problems=0
sec()  { [ "$QUIET" -eq 1 ] || printf '\n%s%s%s\n' "$B" "$1" "$O"; }
ok()   { [ "$QUIET" -eq 1 ] || printf '  %s✓%s %s\n' "$G" "$O" "$1"; }
info() { [ "$QUIET" -eq 1 ] || printf '  %s·%s %s\n' "$D" "$O" "$1"; }
warn() { printf '  %s!%s %s\n' "$Y" "$O" "$1"; problems=$((problems+1)); }
bad()  { printf '  %s✗%s %s\n' "$R" "$O" "$1"; problems=$((problems+1)); }

# ── Skills ───────────────────────────────────────────────────────────────────
check_skills() {
  sec "Skills — mine"
  local total=0
  for d in "$KIT_ROOT"/claude-code/skills/*/; do
    [ -d "$d" ] || continue
    local cat n
    cat="$(basename "$d")"
    n=$(find "$d" -name SKILL.md | wc -l | tr -d ' ')
    [ "$n" -eq 0 ] && continue
    total=$((total+n))
    info "$(printf '%-16s %2s' "$cat" "$n")"
  done
  ok "$total skills in $KIT_ROOT/claude-code/skills"

  # every skill must declare name, description, source
  local missing=0
  for f in "$KIT_ROOT"/claude-code/skills/*/*/SKILL.md; do
    [ -f "$f" ] || continue
    for key in name description source; do
      head -40 "$f" | grep -q "^$key:" || { bad "missing $key: ${f#$KIT_ROOT/}"; missing=1; }
    done
  done
  [ "$missing" -eq 0 ] && ok "all declare name, description, source"

  # install flattens categories, so names must be unique
  local dupes
  dupes=$(basename -a $(dirname "$KIT_ROOT"/claude-code/skills/*/*/SKILL.md) 2>/dev/null | sort | uniq -d)
  [ -z "$dupes" ] && ok "no duplicate names" || bad "duplicate names (install flattens categories): $dupes"

  sec "Skills — third-party"
  if [ -d "$STORE" ]; then
    ok "$(ls "$STORE" | wc -l | tr -d ' ') skills in the shared store ($STORE)"
    info "read by $(find "$HOME" -maxdepth 3 -type d -name skills -path '*/.*' 2>/dev/null | wc -l | tr -d ' ') agent directories"
  else
    warn "no shared store — run skills/install-third-party.sh"
  fi

  sec "Skills — as Claude Code sees them"
  local links=0 broken=0 mine=0 theirs=0
  for l in "$CLAUDE_HOME"/skills/*; do
    [ -e "$l" ] || [ -L "$l" ] || continue
    links=$((links+1))
    [ -e "$l" ] || { bad "broken link: $(basename "$l")"; broken=$((broken+1)); continue; }
    case "$(readlink "$l" 2>/dev/null)" in
      *ai-dev-kit*) mine=$((mine+1)) ;;
      *agents/skills*) theirs=$((theirs+1)) ;;
    esac
  done
  ok "$links entries — $mine mine, $theirs third-party"
  [ "$broken" -eq 0 ] || bad "$broken broken symlink(s) — re-run ./bootstrap.sh"
}

# ── Hooks ────────────────────────────────────────────────────────────────────
check_hooks() {
  sec "Hooks"
  local settings="$CLAUDE_HOME/settings.json"
  local wired="" 
  if [ -f "$settings" ]; then
    wired=$(python3 -c "
import json,sys
try: d=json.load(open('$settings'))
except Exception: sys.exit(0)
print('\n'.join(h.get('command','').split('/')[-1]
      for v in d.get('hooks',{}).values() for m in v for h in m.get('hooks',[])))" 2>/dev/null)
  fi

  for f in "$KIT_ROOT"/claude-code/hooks/*.sh; do
    [ -f "$f" ] || continue
    local n; n="$(basename "$f")"
    local linked="no" exec_="no" on="no"
    [ -L "$CLAUDE_HOME/hooks/$n" ] && linked="yes"
    [ -x "$f" ] && exec_="yes"
    printf '%s\n' "$wired" | grep -qx "$n" && on="yes"

    # A hook whose header says OFF BY DEFAULT is unwired on purpose (a slow test
    # suite makes test-after-edit fire on every edit). Not a finding.
    local optional="no"
    head -20 "$f" | grep -qi 'OFF BY DEFAULT' && optional="yes"

    if   [ "$linked" = "no" ];                        then bad  "$(printf '%-26s' "$n") not linked — run ./bootstrap.sh"
    elif [ "$exec_"  = "no" ];                        then bad  "$(printf '%-26s' "$n") not executable"
    elif [ "$on" = "no" ] && [ "$optional" = "yes" ]; then info "$(printf '%-26s' "$n") off by default (enable per project)"
    elif [ "$on" = "no" ];                            then warn "$(printf '%-26s' "$n") linked but NOT wired in settings.json"
    else                                                   ok   "$(printf '%-26s' "$n") wired"
    fi
  done

  # hooks referenced by settings but absent on disk
  printf '%s\n' "$wired" | sort -u | while read -r c; do
    [ -z "$c" ] && continue
    [ -e "$CLAUDE_HOME/hooks/$c" ] || [ -e "$HOME/.codeisland/$c" ] \
      || printf '  %s!%s %s referenced in settings.json but not found on disk\n' "$Y" "$O" "$c"
  done
}

# ── Commands, agents, statusline ─────────────────────────────────────────────
check_assets() {
  sec "Commands, subagents, statusline"
  local n
  n=$(ls "$KIT_ROOT"/claude-code/commands/*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -gt 0 ] && ok "$n slash commands" || warn "no slash commands"
  for f in "$KIT_ROOT"/claude-code/commands/*.md; do
    [ -f "$f" ] && { [ -L "$CLAUDE_HOME/commands/$(basename "$f")" ] || bad "not linked: commands/$(basename "$f")"; }
  done

  n=$(ls "$KIT_ROOT"/claude-code/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -gt 0 ] && ok "$n subagents" || warn "no subagents"
  for f in "$KIT_ROOT"/claude-code/agents/*.md; do
    [ -f "$f" ] || continue
    [ -L "$CLAUDE_HOME/agents/$(basename "$f")" ] || bad "not linked: agents/$(basename "$f")"
    grep -qi '^model:.*fable' "$f" && bad "$(basename "$f") uses Fable — CLAUDE.md forbids it"
  done

  if [ -f "$CLAUDE_HOME/settings.json" ] \
     && python3 -c "import json;exit(0 if json.load(open('$CLAUDE_HOME/settings.json')).get('statusLine') else 1)" 2>/dev/null; then
    ok "statusLine configured"
  else
    warn "statusLine not in settings.json"
  fi
}

# ── settings.json ────────────────────────────────────────────────────────────
check_settings() {
  sec "settings.json"
  local s="$CLAUDE_HOME/settings.json"
  [ -f "$s" ] || { bad "no $s"; return; }
  python3 -c "import json;json.load(open('$s'))" 2>/dev/null || { bad "invalid JSON"; return; }

  local deny; deny=$(python3 -c "import json;print(len(json.load(open('$s')).get('permissions',{}).get('deny',[])))")
  if [ "$deny" -eq 0 ]; then
    bad "permissions.deny is empty — secrets are not blocked"
  else
    ok "permissions.deny — $deny rules"
    for pat in '.env' 'pem' 'key'; do
      python3 -c "
import json;d=json.load(open('$s'))
exit(0 if any('$pat' in r for r in d.get('permissions',{}).get('deny',[])) else 1)" 2>/dev/null \
        || warn "no deny rule covering '$pat'"
    done
  fi
  local allow; allow=$(python3 -c "import json;print(len(json.load(open('$s')).get('permissions',{}).get('allow',[])))")
  info "permissions.allow — $allow rules"
}

# ── MCP ──────────────────────────────────────────────────────────────────────
check_mcp() {
  sec "MCP"
  local found=0
  for f in "$HOME/.claude.json" "$CLAUDE_HOME/settings.json"; do
    [ -f "$f" ] || continue
    local n
    n=$(python3 -c "
import json
try: d=json.load(open('$f'))
except Exception: print(0); raise SystemExit
print(len(d.get('mcpServers',{})))" 2>/dev/null)
    [ "${n:-0}" -gt 0 ] && { ok "$n servers in $(basename "$f")"; found=1; }
  done
  [ "$found" -eq 0 ] && info "no MCP servers found (template: claude-code/mcp.json)"
}

# ── Gaps ─────────────────────────────────────────────────────────────────────
check_gaps() {
  sec "Gaps"
  local n
  n=$(ls -d "$KIT_ROOT"/claude-code/skills/ops/*/ 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -lt 3 ] && info "ops/: only $n skill(s) — see BagelHole/DevOps-Security-Agent-Skills"
  n=$(ls "$KIT_ROOT"/claude-code/agents/*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -lt 6 ] && info "subagents: only $n — see wshobson/agents"
  n=$(ls "$KIT_ROOT"/templates/shared/agent/instincts/*.md 2>/dev/null | wc -l | tr -d ' ')
  [ "$n" -lt 10 ] && info "instincts: only $n"
  find "$KIT_ROOT" -type d -empty -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null \
    | sed "s|$KIT_ROOT/||" | while read -r d; do info "empty directory: $d"; done
}

# ── Run ──────────────────────────────────────────────────────────────────────
[ "$QUIET" -eq 1 ] || printf '%sai-dev-kit doctor%s  %s%s%s\n' "$B" "$O" "$D" "$KIT_ROOT" "$O"

if [ "$ONLY" = "skills" ]; then
  check_skills
else
  check_skills; check_hooks; check_assets; check_settings; check_mcp; check_gaps
fi

printf '\n'
if [ "$problems" -eq 0 ]; then
  printf '%s✓ no problems%s\n' "$G" "$O"
else
  printf '%s%s item(s) need attention%s\n' "$Y" "$problems" "$O"
fi
[ "$problems" -eq 0 ]
