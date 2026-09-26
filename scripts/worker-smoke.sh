#!/usr/bin/env bash
#
# Exercises the sharing Worker against a real Wrangler runtime with local KV
# and R2. No Cloudflare account, no deployment, nothing leaves the machine.
#
#   npm run smoke:worker
#
# Wrangler is not a dependency of this package — it is large and only needed
# here — so the first run downloads it through npx.
set -uo pipefail

PORT="${ADK_SMOKE_PORT:-8799}"
BASE="http://127.0.0.1:${PORT}"
TOKEN="smoke-$RANDOM"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$(mktemp)"
failures=0

cd "$ROOT"
if curl -s -o /dev/null --max-time 2 "$BASE/s/aaaaaa"; then
  echo "port $PORT already answers; stop that server or set ADK_SMOKE_PORT" >&2
  exit 1
fi
if [ -e .dev.vars ]; then
  echo "refusing to overwrite an existing .dev.vars" >&2
  exit 1
fi
printf 'WRITE_TOKEN=%s\n' "$TOKEN" > .dev.vars

cleanup() {
  [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null
  rm -f .dev.vars
}
trap cleanup EXIT

npx --yes wrangler@4 dev --local --port "$PORT" \
  --inspector-port "${ADK_SMOKE_INSPECTOR:-9899}" > "$LOG" 2>&1 &
PID=$!

for _ in $(seq 1 60); do
  sleep 2
  status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/s/aaaaaa" 2>/dev/null)
  case "$status" in 2*|4*) break ;; esac
done
if [ "${status:-000}" = "000" ]; then
  echo "the worker never answered; wrangler output follows" >&2
  cat "$LOG" >&2
  exit 1
fi

check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  ok    %-34s %s\n' "$1" "$3"
  else
    printf '  FAIL  %-34s expected %s, got %s\n' "$1" "$2" "$3"
    failures=$((failures + 1))
  fi
}

code_for() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

payload=$(node -e '
const now = new Date().toISOString();
process.stdout.write(JSON.stringify({
  version: 1, ownerId: "local", visibility: "unlisted", createdAt: now,
  resources: [{
    id: "mcp:smoke", type: "mcp", name: "smoke", description: "",
    source: "https://example.com/mcp", scope: "project",
    harnesses: ["claude-code"], enabled: true, tags: [],
    config: { url: "https://example.com/mcp",
              headers: { Authorization: "Bearer ${SMOKE_TOKEN}" } },
  }],
}));')

check "missing share is not found" 404 "$(code_for "$BASE/s/aaaaaa")"
check "publish without a token" 401 \
  "$(code_for -X POST "$BASE/api/shares" -H 'content-type: application/json' -d "$payload")"

code=$(curl -s -X POST "$BASE/api/shares" \
  -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
  -d "$payload" | node -e 'let s="";process.stdin.on("data",d=>s+=d)
    .on("end",()=>process.stdout.write(String(JSON.parse(s).code ?? "")))')
if [ ${#code} -eq 6 ]; then
  printf '  ok    %-34s %s\n' "publish returns a short code" "$code"
else
  printf '  FAIL  %-34s got %s\n' "publish returns a short code" "${code:-nothing}"
  failures=$((failures + 1))
  exit 1
fi

page=$(curl -s "$BASE/s/$code")
check "landing page names the variable" 1 \
  "$(printf '%s' "$page" | grep -c 'Required environment variables: SMOKE_TOKEN')"
check "landing page carries no secret value" 0 \
  "$(printf '%s' "$page" | grep -c "$TOKEN")"
check "share reads back" 1 \
  "$(curl -s "$BASE/api/shares/$code" | node -e 'let s="";process.stdin.on("data",d=>s+=d)
     .on("end",()=>process.stdout.write(String(JSON.parse(s).resources.length)))')"
check "revoke without a token" 401 "$(code_for -X DELETE "$BASE/api/shares/$code")"
check "revoke with the token" 204 \
  "$(code_for -X DELETE "$BASE/api/shares/$code" -H "authorization: Bearer $TOKEN")"
check "revoked share is gone" 404 "$(code_for "$BASE/api/shares/$code")"

if [ "$failures" -eq 0 ]; then
  echo "worker smoke: every check passed on a local Wrangler runtime"
else
  echo "worker smoke: $failures check(s) failed" >&2
fi
exit "$failures"
