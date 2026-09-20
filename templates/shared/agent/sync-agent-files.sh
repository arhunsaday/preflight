#!/usr/bin/env bash
# Regenerate canonical pointers; generated projects receive a standalone Python script.
set -euo pipefail
kit_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
target="${2:-$PWD}"
if [ "${1:-}" = "--check" ]; then
  exec python3 "$kit_root/scripts/kit.py" sync "$target" --check
fi
exec python3 "$kit_root/scripts/kit.py" sync "$target"
