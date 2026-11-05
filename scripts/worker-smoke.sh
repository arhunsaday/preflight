#!/usr/bin/env bash
#
# Runs the Worker with the production wrangler.jsonc on a local Wrangler
# runtime, without Clerk secrets and without PREFLIGHT_DEV_AUTH, and checks
# that it fails closed: no account, no publishing, no dev identity, while
# public routes and security headers still work. Nothing leaves the machine.
#
#   npm run smoke:worker
set -uo pipefail

PORT="${PREFLIGHT_SMOKE_PORT:-8799}"
BASE="http://127.0.0.1:${PORT}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$(mktemp)"
CONFIG="$(mktemp "$ROOT/prod-worker-XXXXXX.json")"
(cd "$ROOT" && node --input-type=module -e '
import fs from "node:fs";
import { parseJsonc } from "./scripts/jsonc.mjs";
const c = parseJsonc(fs.readFileSync("wrangler.jsonc", "utf8"));
c.main = process.argv[2] + "/src/worker.ts";
c.d1_databases[0].migrations_dir = process.argv[2] + "/migrations";
fs.writeFileSync(process.argv[1], JSON.stringify(c));' "$CONFIG" "$ROOT")
failures=0

cd "$ROOT"
if curl -s -o /dev/null --max-time 2 "$BASE/api/health"; then
  echo "port $PORT already answers; stop that server or set PREFLIGHT_SMOKE_PORT" >&2
  exit 1
fi
if [ -e .dev.vars ]; then
  echo "refusing to run with a .dev.vars file present (it could hold secrets)" >&2
  exit 1
fi

cleanup() {
  [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null
  rm -f "$CONFIG"
}
trap cleanup EXIT

node node_modules/wrangler/bin/wrangler.js dev --config "$CONFIG" --local --port "$PORT" \
  --inspector-port "${PREFLIGHT_SMOKE_INSPECTOR:-9899}" > "$LOG" 2>&1 &
PID=$!

for _ in $(seq 1 60); do
  sleep 2
  status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health" 2>/dev/null)
  case "$status" in 2*|4*|5*) break ;; esac
done
if [ "${status:-000}" = "000" ]; then
  echo "the worker never answered; wrangler output follows" >&2
  cat "$LOG" >&2
  exit 1
fi

check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  ok    %-40s %s\n' "$1" "$3"
  else
    printf '  FAIL  %-40s expected %s, got %s\n' "$1" "$2" "$3"
    failures=$((failures + 1))
  fi
}
code_for() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
header() { curl -s -D - -o /dev/null "$2" | grep -i "^$1:" | head -1 | cut -d' ' -f2- | tr -d '\r'; }

check "health reports unconfigured auth" 1 \
  "$(curl -s "$BASE/api/health" | grep -c '"authentication":"unconfigured"')"
check "account fails closed" 503 "$(code_for "$BASE/api/account" -H 'authorization: Bearer pfk_x')"
check "sign-in page fails closed" 503 "$(code_for "$BASE/auth/sign-in")"
check "dev identity is unavailable" 404 \
  "$(code_for -X POST "$BASE/auth/dev/session" -H 'content-type: application/json' -d '{"name":"x","email":"x@example.com"}')"
check "publishing fails closed" 503 \
  "$(code_for -X POST "$BASE/api/shares" -H 'content-type: application/json' -d '{}')"
check "missing share is not found" 404 "$(code_for "$BASE/s/aaaaaa")"
check "nosniff header" nosniff "$(header x-content-type-options "$BASE/s/aaaaaa")"
check "referrer policy" no-referrer "$(header referrer-policy "$BASE/s/aaaaaa")"
check "CSP denies by default" 1 \
  "$(header content-security-policy "$BASE/s/aaaaaa" | grep -c "default-src 'none'")"
check "errors do not leak internals" 0 \
  "$(curl -s -X POST "$BASE/auth/token" -H 'content-type: application/json' -d 'not json' | grep -ci 'stack\|\.ts:')"

if [ "$failures" -eq 0 ]; then
  echo "worker smoke: the production configuration fails closed on a local Wrangler runtime"
else
  echo "worker smoke: $failures check(s) failed" >&2
  cat "$LOG" >&2
fi
exit "$failures"
