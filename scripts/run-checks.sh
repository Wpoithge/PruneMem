#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/12] validate example registry"
node src/core/validate-maintenance.js --workspace "$ROOT" --strict

echo "[2/12] regression: context-note merge"
node tests/regression/check-context-note-merge.js

echo "[3/12] regression: L1-only policy"
node tests/regression/check-l1-only-policy.js

echo "[4/12] regression: provider config"
node tests/regression/check-provider-config.js

echo "[5/12] regression: provider error normalization"
node tests/regression/check-provider-error-normalization.js

echo "[6/12] regression: openai-compatible normalization"
node tests/regression/check-openai-compatible-normalization.js

echo "[7/12] regression: CLI validation"
node tests/regression/check-cli-validation.js

echo "[8/12] regression: sample pipeline (mock)"
node tests/regression/check-sample-pipeline.js

echo "[9/12] regression: working memory"
node tests/regression/check-working-memory.js

echo "[10/12] regression: execution context"
node tests/regression/check-execution-context.js

echo "[11/12] regression: session archive"
node tests/regression/check-session-archive.js

echo "[12/12] maintain entry"
node src/core/maintain.js --workspace "$ROOT" --strict
