#!/usr/bin/env bash
#
# Applies skills/registry.json: parks or activates third-party skills by
# adding/removing their symlinks in the agent directories.
#
#   ./apply-registry.sh              apply
#   ./apply-registry.sh --dry-run    show what would change
#   ./apply-registry.sh --status     list active / parked, change nothing
#
# Parking never deletes anything. The skill stays in ~/.agents/skills; only the
# symlinks that make agents see it are removed. Re-activating is instant and
# works offline.
#
# Skills I own are handled by bootstrap.sh, which reads the same file.
#
set -uo pipefail

KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="$KIT_ROOT/skills/registry.json"
STORE="$HOME/.agents/skills"

MODE="apply"
case "${1:-}" in
--dry-run) MODE="dry" ;;
--status) MODE="status" ;;
--help | -h)
	sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
	exit 0
	;;
esac

[ -f "$REGISTRY" ] || {
	echo "no registry at $REGISTRY" >&2
	exit 1
}
[ -d "$STORE" ] || {
	echo "no skill store at $STORE" >&2
	exit 1
}

if [ -t 1 ]; then
	G=$'\033[32m'
	Y=$'\033[33m'
	D=$'\033[2m'
	B=$'\033[1m'
	O=$'\033[0m'
else
	G=""
	Y=""
	D=""
	B=""
	O=""
fi

parked=$(python3 -c "
import json
d = json.load(open('$REGISTRY'))
print('\n'.join(d.get('thirdParty', {}).get('parked', {}).keys()))
") || exit 1

# Every agent on this machine keeps its own symlink farm pointing at the store.
agent_dirs=$(find "$HOME" -maxdepth 2 -type d -name skills -path "$HOME/.*/skills" 2>/dev/null)

is_parked() { printf '%s\n' "$parked" | grep -qx "$1"; }

if [ "$MODE" = "status" ]; then
	printf '%sactive%s\n' "$B" "$O"
	n_active=0
	n_parked=0
	for d in "$STORE"/*/; do
		s="$(basename "$d")"
		if is_parked "$s"; then n_parked=$((n_parked + 1)); else
			n_active=$((n_active + 1))
			printf '  %s\n' "$s"
		fi
	done
	printf '\n%sparked%s %s(installed, not loaded)%s\n' "$B" "$O" "$D" "$O"
	python3 -c "
import json
d = json.load(open('$REGISTRY'))
for k, v in sorted(d.get('thirdParty', {}).get('parked', {}).items()):
    print(f'  {k:34} {v}')"
	printf '\n%s active, %s parked\n' "$n_active" "$n_parked"
	exit 0
fi

removed=0
restored=0
for d in "$STORE"/*/; do
	[ -d "$d" ] || continue
	s="$(basename "$d")"
	want_parked=no
	is_parked "$s" && want_parked=yes

	for ad in $agent_dirs; do
		link="$ad/$s"
		case "$ad" in "$STORE") continue ;; esac

		if [ "$want_parked" = "yes" ] && [ -L "$link" ]; then
			[ "$MODE" = "dry" ] || rm -f "$link"
			removed=$((removed + 1))
		elif [ "$want_parked" = "no" ] && [ ! -e "$link" ] && [ ! -L "$link" ]; then
			[ "$MODE" = "dry" ] || ln -s "$d" "$link"
			restored=$((restored + 1))
		fi
	done
done

[ "$MODE" = "dry" ] && printf '%sdry run%s\n' "$Y" "$O"
printf '%s%s links removed%s (parked), %s%s links restored%s (activated)\n' \
	"$Y" "$removed" "$O" "$G" "$restored" "$O"
printf '%sacross %s agent directories%s\n' "$D" "$(printf '%s\n' "$agent_dirs" | wc -l | tr -d ' ')" "$O"

if [ "$MODE" != "dry" ]; then
	printf '\n%sRestart Claude Code to pick up the change.%s\n' "$D" "$O"
	printf '%sEdit skills/registry.json and re-run to adjust.%s\n' "$D" "$O"
fi
