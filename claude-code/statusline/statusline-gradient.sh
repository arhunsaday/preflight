#!/usr/bin/env bash
# Claude Code statusline: 📁 repo · 🌿 branch · <model> · 💲 cost · ±diff · context gauge
# Palette inspired by the user's Starship One Dark / Tokyo-Night theme.
set -uo pipefail

input=$(cat)

# ── Parse every field in a single jq pass ──
# Separator is US (0x1f), not tab: tab is an IFS *whitespace* character, so bash
# collapses runs of them and an empty field (e.g. no effort level) silently
# shifts every value after it — the gauge then reads token counts as a model name.
IFS=$'\x1f' read -r cwd model_name effort fast_mode usage_current context_size total_in total_out < <(
  jq -r '
    [ .workspace.current_dir // ".",
      .model.display_name // "?",
      .effort.level // "",
      .fast_mode // false,
      ((.context_window.current_usage // {}) as $u
        | ($u.input_tokens + $u.cache_creation_input_tokens + $u.cache_read_input_tokens) // 0),
      .context_window.context_window_size // 0,
      .context_window.total_input_tokens // 0,
      .context_window.total_output_tokens // 0
    ] | join("\u001f")' <<<"$input"
)

# ── Palette: one truecolor helper. Theme accents = One Dark; status/gauge
#    colors = vivid/saturated (brighter gradient, matches the old config). ──
c() { printf -v "$1" '\033[38;2;%d;%d;%dm' "$2" "$3" "$4"; }
# Gauge anchors (vivid) — defined once, reused by the tier colors AND the bar lerp.
GAUGE_LO=(0 200 80)     # green
GAUGE_MID=(220 200 0)   # yellow
GAUGE_HI=(220 40 20)    # red
c BLUE    97 175 239   # #61afef  folder (theme accent)
c INDIGO  129 140 248  # #818cf8  branch (theme accent)
c PINK    255 121 198  # #ff79c6  model name (theme accent)
c GREEN   "${GAUGE_LO[@]}"   # low tier / +diff
c YELLOW  "${GAUGE_MID[@]}"  # mid tier / cost
c ORANGE  255 140 0          # high tier
c RED     "${GAUGE_HI[@]}"   # top tier / -diff
c GRAY    92 99 112    # #5c6370  separators
c EMPTY   59 64 72     # #3b4048  empty gauge blocks
RESET=$'\033[0m'
BOLD=$'\033[1m'

# ── Model → emoji + accent color ──
model_name=${model_name%% (*}   # strip trailing "(…)" qualifier, e.g. "Opus 4.8 (1M context)"
shopt -s nocasematch
case $model_name in
  *opus*)   model_emoji='🤖' ;;
  *sonnet*) model_emoji='🪶' ;;
  *fable*)  model_emoji='👑' ;;
  *haiku*)  model_emoji='🍃' ;;
  *)        model_emoji='🤖' ;;
esac
shopt -u nocasematch
model_color=$PINK
[ -n "$effort" ] && model_name="$model_name ($effort)"
[ "$fast_mode" = "true" ] && model_name="$model_name ⏩"

# ── Context usage → percentage + gauge color ──
pct=0
(( context_size > 0 )) && pct=$(( usage_current * 100 / context_size ))
(( pct > 100 )) && pct=100

if   (( pct < 20 )); then usage_color=$GREEN
elif (( pct < 70 )); then usage_color=$YELLOW
elif (( pct < 90 )); then usage_color=$ORANGE
else                      usage_color=$RED
fi

# ── 20-block gradient bar, lerped across the same tier anchors (green→yellow→red) ──
lerp() {  # $1=t(0..100) $2-$4=from rgb  $5-$7=to rgb → sets R G B
  local t=$1
  R=$(( $2 + ($5 - $2) * t / 100 ))
  G=$(( $3 + ($6 - $3) * t / 100 ))
  B=$(( $4 + ($7 - $4) * t / 100 ))
}
BAR_WIDTH=20
HALF=$(( BAR_WIDTH / 2 ))
filled=$(( pct * BAR_WIDTH / 100 ))
bar=""
for (( i = 0; i < BAR_WIDTH; i++ )); do
  if (( i >= filled )); then
    bar+="${EMPTY}█"
    continue
  fi
  if (( i < HALF )); then
    lerp $(( i * 100 / HALF )) "${GAUGE_LO[@]}" "${GAUGE_MID[@]}"          # green → yellow
  else
    lerp $(( (i - HALF) * 100 / HALF )) "${GAUGE_MID[@]}" "${GAUGE_HI[@]}" # yellow → red
  fi
  printf -v seg '\033[38;2;%d;%d;%dm█' "$R" "$G" "$B"
  bar+=$seg
done

# ── Git: one repository check for branch + working-tree diff ──
branch=""; added=0; removed=0
if git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1; then
  git_opts=(-c core.filesRefLockTimeout=0 -c core.packedRefsTimeout=0)
  branch=$(git -C "$cwd" "${git_opts[@]}" rev-parse --abbrev-ref HEAD 2>/dev/null || true)
  read -r added removed < <(
    git -C "$cwd" "${git_opts[@]}" diff --numstat 2>/dev/null |
      awk '{ a += $1; r += $2 } END { print a + 0, r + 0 }'
  )
fi

# ── Session cost estimate ($3/1M input, $15/1M output) ──
cost=$(awk -v i="$total_in" -v o="$total_out" 'BEGIN { printf "%.3f", i / 1e6 * 3 + o / 1e6 * 15 }')

# ── Render ──
sep=" ${GRAY}|${RESET} "
printf '📁 %s%s%s%s' "$BOLD" "$BLUE" "$(basename "$cwd")" "$RESET"
[ -n "$branch" ] && printf ' 🌿 %s%s%s%s' "$BOLD" "$INDIGO" "$branch" "$RESET"
printf '%s%s %s%s%s' "$sep" "$model_emoji" "$model_color" "$model_name" "$RESET"
# printf '%s%s$%s%s' "$sep" "$YELLOW" "$cost" "$RESET"
printf '%s%s %s%s %s %s%s' "$sep" "$GREEN" "$added" "$RESET" "$RED" "$removed" "$RESET" # '%s%s+%s%s %s-%s%s'
printf '%s%s%s' "$sep" "$bar" "$RESET"
printf ' %s%d%%%s\n' "$usage_color" "$pct" "$RESET"

