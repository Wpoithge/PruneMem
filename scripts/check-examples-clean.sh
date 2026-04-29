#!/bin/bash
# Verify examples/registry/ is not contaminated by recent test runs.
# Issue #1: src/core/update-registries.js writes examples/registry/ unconditionally
# when invoked with --workspace pointing at the repo root. Until Step 4 (paths.js
# abstraction) decouples writes from the demo workspace, this script provides
# a manual safety check.
#
# Exit codes:
#   0 - examples/registry/ is clean
#   1 - examples/registry/ has uncommitted changes (likely from a recent test run)

set -e

DIRTY=$(git status --porcelain examples/registry/ 2>/dev/null || echo "")
if [ -z "$DIRTY" ]; then
  echo "[check-examples-clean] OK"
  exit 0
fi

echo "[check-examples-clean] FAIL: examples/registry/ has uncommitted changes:"
echo "$DIRTY"
echo ""
echo "Likely cause: a recent test or script run wrote to examples/registry/"
echo "(Issue #1 — see docs/known-issues.md). To restore:"
echo "  git checkout -- examples/registry/"
exit 1
