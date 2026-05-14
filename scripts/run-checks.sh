#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/15] validate example registry"
node src/core/validate-maintenance.js --workspace "$ROOT" --strict

echo "[2/15] regression: context-note merge"
node tests/regression/check-context-note-merge.js

echo "[3/15] regression: L1-only policy"
node tests/regression/check-l1-only-policy.js

echo "[4/15] regression: provider config"
node tests/regression/check-provider-config.js

echo "[5/15] regression: provider error normalization"
node tests/regression/check-provider-error-normalization.js

echo "[6/15] regression: openai-compatible normalization"
node tests/regression/check-openai-compatible-normalization.js

echo "[7/15] regression: CLI validation"
node tests/regression/check-cli-validation.js

echo "[8/15] regression: sample pipeline (mock)"
node tests/regression/check-sample-pipeline.js

echo "[9/15] regression: working memory"
node tests/regression/check-working-memory.js

echo "[10/15] regression: execution context"
node tests/regression/check-execution-context.js

echo "[11/15] regression: session archive"
node tests/regression/check-session-archive.js

echo "[12/15] maintain entry"
node src/core/maintain.js --workspace "$ROOT" --strict

echo "[13/15] regression: isolated preset"
node tests/regression/check-isolated-preset.js

echo "[14/15] regression: no-pollution (dry-run sample pipeline)"
node tests/regression/check-no-pollution.js

echo "[15/15] regression: tool count consistency"
node scripts/check-tool-count.js
