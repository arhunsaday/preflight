#!/usr/bin/env bash
#
# ai-dev-kit bootstrap — links this kit's Claude Code assets into ~/.claude
#
# Symlinks, not copies: edit a file here and the change is live immediately,
# and `git pull` updates every machine that ran this.
#
# Safe by construction:
#   - never overwrites an existing real file (use --force to back it up first)
#   - never touches settings.json or mcp.json if you already have one
#   - skips empty placeholder files, so scaffolding doesn't shadow real config
#   - idempotent; re-run it any time
#
# Usage:
#   ./bootstrap.sh                    install into ~/.claude
#   ./bootstrap.sh --dry-run          show what would happen, change nothing
#   ./bootstrap.sh --force            back up conflicting files, then link
#   ./bootstrap.sh --unlink           remove links this script created
#   ./bootstrap.sh --project [DIR]    copy the agent drop-in into a repo
#
# --project copies rather than links: AGENTS.md, .claudeignore and friends
# belong to that repo's history, and each one needs local edits anyway.
#
set -euo pipefail

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"
BACKUP_DIR="$CLAUDE_HOME/backups/ai-dev-kit-$(date +%Y%m%d-%H%M%S)"

DRY_RUN=0
FORCE=0
UNLINK=0
PROJECT=""

linked=0
skipped=0
conflicts=0

# --- output -----------------------------------------------------------------

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_DIM=""; C_OFF=""
fi

ok()   { printf '  %slink%s  %s\n' "$C_OK" "$C_OFF" "$1"; }
gone() { printf '  %sunlink%s  %s\n' "$C_OK" "$C_OFF" "$1"; }
cpd()  { printf '  %scopy%s  %s\n' "$C_OK" "$C_OFF" "$1"; }
skip() { printf '  %sskip%s  %s %s(%s)%s\n' "$C_DIM" "$C_OFF" "$1" "$C_DIM" "$2" "$C_OFF"; }
warn() { printf '  %sWARN%s  %s %s(%s)%s\n' "$C_WARN" "$C_OFF" "$1" "$C_WARN" "$2" "$C_OFF"; }
head_() { printf '\n%s\n' "$1"; }

usage() { sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n) DRY_RUN=1 ;;
    --force|-f)   FORCE=1 ;;
    --unlink)     UNLINK=1 ;;
    --project)
      PROJECT="${2:-$PWD}"
      [ $# -gt 1 ] && shift
      ;;
    --help|-h)    usage ;;
    *) printf 'unknown option: %s (try --help)\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

run() { [ "$DRY_RUN" -eq 1 ] || "$@"; }

# --- linking ----------------------------------------------------------------

# A placeholder is an empty file or a .gitkeep — scaffolding, not content.
# Linking an empty CLAUDE.md into ~/.claude is worse than leaving it absent.
is_placeholder() {
  case "$(basename "$1")" in .gitkeep) return 0 ;; esac
  [ -f "$1" ] && [ ! -s "$1" ]
}

# link SRC DEST [label]
link_item() {
  src="$1"; dest="$2"; label="${3:-$dest}"

  if [ ! -e "$src" ]; then
    skip "$label" "not in kit"; skipped=$((skipped + 1)); return 0
  fi
  if is_placeholder "$src"; then
    skip "$label" "empty placeholder"; skipped=$((skipped + 1)); return 0
  fi

  if [ -L "$dest" ]; then
    current="$(readlink "$dest")"
    if [ "$current" = "$src" ]; then
      skip "$label" "already linked"; skipped=$((skipped + 1)); return 0
    fi
    case "$current" in
      "$KIT_ROOT"/*)  # stale link into this kit — safe to repoint
        run rm -f "$dest" ;;
      *)
        warn "$label" "symlink to $current — leaving alone"
        conflicts=$((conflicts + 1)); return 0 ;;
    esac
  elif [ -e "$dest" ]; then
    if [ "$FORCE" -eq 1 ]; then
      run mkdir -p "$BACKUP_DIR"
      run mv "$dest" "$BACKUP_DIR/"
      warn "$label" "existing file backed up to $BACKUP_DIR"
    else
      warn "$label" "exists already — not overwriting; --force to back up and replace"
      conflicts=$((conflicts + 1)); return 0
    fi
  fi

  run mkdir -p "$(dirname "$dest")"
  run ln -s "$src" "$dest"
  ok "$label"
  linked=$((linked + 1))
}

# Remove only links that point back into this kit. Anything else is the
# user's own and stays untouched.
unlink_item() {
  dest="$1"; label="${2:-$dest}"
  [ -L "$dest" ] || return 0
  case "$(readlink "$dest")" in
    "$KIT_ROOT"/*) run rm -f "$dest"; gone "$label"; linked=$((linked + 1)) ;;
    *) skip "$label" "not ours"; skipped=$((skipped + 1)) ;;
  esac
}

# --- what gets installed ----------------------------------------------------

install_skills() {
  head_ "skills -> $CLAUDE_HOME/skills/"
  found=0
  # Skills live in the kit under <category>/<skill>/SKILL.md for browsing, but
  # Claude Code discovers them one level deep. Install flattens the category
  # away: ~/.claude/skills/<skill> regardless of which folder it sits in here.
  for f in "$KIT_ROOT"/claude-code/skills/*/*/SKILL.md; do
    [ -f "$f" ] || continue
    dir="$(dirname "$f")"
    name="$(basename "$dir")"
    cat_="$(basename "$(dirname "$dir")")"
    found=1
    if [ "$UNLINK" -eq 1 ]; then
      unlink_item "$CLAUDE_HOME/skills/$name" "$name"
    else
      link_item "$dir" "$CLAUDE_HOME/skills/$name" "$cat_/$name"
    fi
  done
  [ "$found" -eq 1 ] || printf '  %s(none yet)%s\n' "$C_DIM" "$C_OFF"
}

install_commands() {
  head_ "slash commands -> $CLAUDE_HOME/commands/"
  found=0
  for f in "$KIT_ROOT"/claude-code/commands/*.md; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"; found=1
    if [ "$UNLINK" -eq 1 ]; then
      unlink_item "$CLAUDE_HOME/commands/$name" "$name"
    else
      link_item "$f" "$CLAUDE_HOME/commands/$name" "$name"
    fi
  done
  [ "$found" -eq 1 ] || printf '  %s(none yet)%s\n' "$C_DIM" "$C_OFF"
}

install_agents() {
  head_ "subagents -> $CLAUDE_HOME/agents/"
  found=0
  for f in "$KIT_ROOT"/claude-code/agents/*.md; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"; found=1
    if [ "$UNLINK" -eq 1 ]; then
      unlink_item "$CLAUDE_HOME/agents/$name" "$name"
    else
      link_item "$f" "$CLAUDE_HOME/agents/$name" "$name"
    fi
  done
  [ "$found" -eq 1 ] || printf '  %s(none yet)%s\n' "$C_DIM" "$C_OFF"
}

install_statusline() {
  head_ "statusline -> $CLAUDE_HOME/statusline/"
  found=0
  for f in "$KIT_ROOT"/claude-code/statusline/*.sh; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"; found=1
    if [ "$UNLINK" -eq 1 ]; then
      unlink_item "$CLAUDE_HOME/statusline/$name" "$name"
    else
      link_item "$f" "$CLAUDE_HOME/statusline/$name" "$name"
    fi
  done
  [ "$found" -eq 1 ] || printf '  %s(none yet)%s\n' "$C_DIM" "$C_OFF"
}

install_hooks() {
  head_ "hooks -> $CLAUDE_HOME/hooks/"
  found=0
  for f in "$KIT_ROOT"/claude-code/hooks/*; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    case "$name" in .gitkeep|README.md) continue ;; esac
    [ "$UNLINK" -eq 1 ] || run chmod +x "$f"
    found=1
    if [ "$UNLINK" -eq 1 ]; then
      unlink_item "$CLAUDE_HOME/hooks/$name" "$name"
    else
      link_item "$f" "$CLAUDE_HOME/hooks/$name" "$name"
      # Hooks are not auto-discovered by filename — settings.json must
      # reference them, e.g. "command": "$CLAUDE_CONFIG_DIR/hooks/<name>".
    fi
  done
  [ "$found" -eq 1 ] || printf '  %s(none yet)%s\n' "$C_DIM" "$C_OFF"
}

install_memory() {
  head_ "global memory -> $CLAUDE_HOME/CLAUDE.md"
  if [ "$UNLINK" -eq 1 ]; then
    unlink_item "$CLAUDE_HOME/CLAUDE.md" "CLAUDE.md"
  else
    link_item "$KIT_ROOT/claude-code/CLAUDE.md" "$CLAUDE_HOME/CLAUDE.md" "CLAUDE.md"
  fi
}

# settings.json and mcp.json are merge-not-replace territory: yours already
# holds permissions, env, and hook wiring that this kit knows nothing about.
# Link only into a vacant slot; otherwise report and let a human merge.
check_json_config() {
  head_ "json config"
  for pair in "settings.json:$CLAUDE_HOME/settings.json" "mcp.json:$CLAUDE_HOME/.mcp.json"; do
    name="${pair%%:*}"; dest="${pair#*:}"
    src="$KIT_ROOT/claude-code/$name"

    if [ "$UNLINK" -eq 1 ]; then
      unlink_item "$dest" "$name"; continue
    fi
    if [ ! -s "$src" ]; then
      skip "$name" "empty placeholder"; skipped=$((skipped + 1)); continue
    fi
    if [ -e "$dest" ] && [ ! -L "$dest" ]; then
      warn "$name" "you already have $dest — merge by hand, not overwriting"
      printf '        %sdiff %s %s%s\n' "$C_DIM" "$dest" "$src" "$C_OFF"
      conflicts=$((conflicts + 1)); continue
    fi
    link_item "$src" "$dest" "$name"
  done
}

# --- project drop-in --------------------------------------------------------

# copy SRC DEST label — copies only into a free slot; an existing file in the
# target repo is always the more current one (it has local edits).
copy_item() {
  src="$1"; dest="$2"; label="$3"
  if [ ! -e "$src" ]; then
    skip "$label" "not in kit"; skipped=$((skipped + 1)); return 0
  fi
  if [ -e "$dest" ]; then
    skip "$label" "already present — left as is"; skipped=$((skipped + 1)); return 0
  fi
  run mkdir -p "$(dirname "$dest")"
  run cp "$src" "$dest"
  cpd "$label"
  linked=$((linked + 1))
}

install_project() {
  agent_dir="$KIT_ROOT/templates/shared/agent"

  if [ ! -d "$agent_dir" ]; then
    printf 'no agent drop-in at %s\n' "$agent_dir" >&2; exit 1
  fi
  if [ ! -d "$PROJECT" ]; then
    printf 'not a directory: %s\n' "$PROJECT" >&2; exit 1
  fi
  PROJECT="$(cd "$PROJECT" && pwd)"

  printf 'ai-dev-kit  %s%s%s\n' "$C_DIM" "$KIT_ROOT" "$C_OFF"
  printf 'project     %s%s%s\n' "$C_DIM" "$PROJECT" "$C_OFF"
  [ "$DRY_RUN" -eq 1 ] && printf '%sdry run — nothing will be written%s\n' "$C_WARN" "$C_OFF"

  head_ "root files"
  copy_item "$agent_dir/AGENTS.md"                   "$PROJECT/AGENTS.md"                   "AGENTS.md"
  copy_item "$agent_dir/CLAUDE.md"                   "$PROJECT/CLAUDE.md"                   "CLAUDE.md"
  copy_item "$agent_dir/CODEX.md"                    "$PROJECT/CODEX.md"                    "CODEX.md"
  copy_item "$agent_dir/agent-compass.commands.json" "$PROJECT/agent-compass.commands.json" "agent-compass.commands.json"
  copy_item "$agent_dir/.claudeignore"               "$PROJECT/.claudeignore"               ".claudeignore"
  copy_item "$agent_dir/copilot-instructions.md"     "$PROJECT/.github/copilot-instructions.md" ".github/copilot-instructions.md"

  head_ "instincts -> .claude/instincts/"
  for f in "$agent_dir"/instincts/*.md; do
    [ -f "$f" ] || continue
    name="$(basename "$f")"
    copy_item "$f" "$PROJECT/.claude/instincts/$name" "$name"
  done

  head_ "done: $linked copied, $skipped skipped"
  if [ "$DRY_RUN" -eq 0 ] && [ "$linked" -gt 0 ]; then
    printf '%sNext: fill every <PLACEHOLDER> — these templates are not usable unedited.%s\n' "$C_DIM" "$C_OFF"
    printf '%sStart with agent-compass.commands.json, then AGENTS.md.%s\n' "$C_DIM" "$C_OFF"
  fi
  exit 0
}

# --- main -------------------------------------------------------------------

[ -n "$PROJECT" ] && install_project

printf 'ai-dev-kit  %s%s%s\n' "$C_DIM" "$KIT_ROOT" "$C_OFF"
printf 'target      %s%s%s\n' "$C_DIM" "$CLAUDE_HOME" "$C_OFF"
[ "$DRY_RUN" -eq 1 ] && printf '%sdry run — nothing will be written%s\n' "$C_WARN" "$C_OFF"
[ "$UNLINK" -eq 1 ]  && printf '%sunlink mode%s\n' "$C_WARN" "$C_OFF"

run mkdir -p "$CLAUDE_HOME"

install_skills
install_commands
install_agents
install_hooks
install_statusline
install_memory
check_json_config

if [ "$UNLINK" -eq 1 ]; then
  head_ "done: $linked removed, $skipped skipped, $conflicts need attention"
else
  head_ "done: $linked linked, $skipped skipped, $conflicts need attention"
fi
if [ "$UNLINK" -eq 0 ] && [ "$DRY_RUN" -eq 0 ] && [ "$linked" -gt 0 ]; then
  printf '%sRestart Claude Code (or start a new session) to pick up new skills.%s\n' "$C_DIM" "$C_OFF"
fi
[ "$conflicts" -eq 0 ]
