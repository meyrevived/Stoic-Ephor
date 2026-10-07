#!/usr/bin/env bash
# stoic-ephor — installer shim
# Delegates to bin/install.js for cross-platform consistency.

set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "stoic-ephor: Node.js (>=18) required." >&2
  echo "  Install: https://nodejs.org" >&2
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "stoic-ephor: Node $NODE_MAJOR too old. Need Node >=18." >&2
  exit 1
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]:-}")" 2>/dev/null && pwd)" || here=""
if [ -n "$here" ] && [ -f "$here/bin/install.js" ]; then
  exec node "$here/bin/install.js" "$@"
fi

echo "stoic-ephor: bin/install.js not found. Clone the repo first." >&2
exit 1
