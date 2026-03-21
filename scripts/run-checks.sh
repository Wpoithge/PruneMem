#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/8] validate example registry"
node src/core/validate-maintenance.js --workspace "$ROOT" --strict

echo "[2/8] regression: context-note merge"
node tests/regression/check-context-note-merge.js

echo "[3/8] regression: L1-only policy"
node tests/regression/check-l1-only-policy.js

echo "[4/8] regression: provider config"
node tests/regression/check-provider-config.js

echo "[5/9] regression: provider error normalization"
node tests/regression/check-provider-error-normalization.js

echo "[6/9] regression: openai-compatible normalization"
node tests/regression/check-openai-compatible-normalization.js

echo "[7/9] regression: CLI validation"
node tests/regression/check-cli-validation.js

echo "[8/9] regression: sample pipeline (mock)"
node tests/regression/check-sample-pipeline.js

echo "[9/9] maintain entry"
node src/core/maintain.js --workspace "$ROOT" --strict
