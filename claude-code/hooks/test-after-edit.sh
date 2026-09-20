#!/usr/bin/env bash
#
# PostToolUse(Write|Edit) — run the test suite and report the tail.
#
# The feedback loop is the point: Claude sees "3 failed" in the same turn it
# wrote the code, and fixes it, instead of you finding out at commit time.
#
# OFF BY DEFAULT in settings.json. On a suite slower than ~10s this fires on
# every single edit and makes the session unusable — enable it per project,
# where the suite is fast, not globally.
#
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0
[ -f package.json ] || exit 0
grep -q '"test"' package.json 2>/dev/null || exit 0

out=$(npm test --silent 2>&1) || true
printf '%s\n' "$out" | tail -8
exit 0
