#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/14] validate example registry"
node src/core/validate-maintenance.js --workspace "$ROOT" --strict

echo "[2/14] regression: context-note merge"
node tests/regression/check-context-note-merge.js

echo "[3/14] regression: L1-only policy"
node tests/regression/check-l1-only-policy.js

echo "[4/14] regression: provider config"
node tests/regression/check-provider-config.js

echo "[5/14] regression: provider error normalization"
node tests/regression/check-provider-error-normalization.js

echo "[6/14] regression: openai-compatible normalization"
node tests/regression/check-openai-compatible-normalization.js

echo "[7/14] regression: CLI validation"
node tests/regression/check-cli-validation.js

echo "[8/14] regression: sample pipeline (mock)"
node tests/regression/check-sample-pipeline.js

echo "[9/14] regression: working memory"
node tests/regression/check-working-memory.js

echo "[10/14] regression: execution context"
node tests/regression/check-execution-context.js

echo "[11/14] regression: session archive"
node tests/regression/check-session-archive.js

echo "[12/14] maintain entry"
node src/core/maintain.js --workspace "$ROOT" --strict

echo "[13/14] regression: isolated preset"
node tests/regression/check-isolated-preset.js

echo "[14/14] regression: no-pollution (dry-run sample pipeline)"
node tests/regression/check-no-pollution.js
