# Known Issues

This document captures known issues in PruneMem.
Each entry includes diagnosis, current mitigation (if any), and resolution status.

## Issue #1: examples/registry/ contamination during direct execution

**Status:** Closed in 0.4.0. Resolved by Step 4 (paths.js abstraction with D6 dry-run guard on update-registries).

**Symptom:** Running `node src/core/run-sample-pipeline.js --workspace .` (or
its underlying `update-registries.js`) modifies files under `examples/registry/`,
causing `git status` to show uncommitted changes after every direct test run.

**Root cause:** `src/core/update-registries.js:66` hardcodes the registry write
path as `path.join(root, 'examples', 'registry')` with no `--dry-run` guard.
When invoked with `--workspace .` (i.e., repo root), it writes into the demo
workspace's `examples/registry/` directly. By contrast, `src/core/curator-apply.js`
has a `write=false` default that prevents the same problem in that script.

**Scope of impact:**
- CI (`bash scripts/run-checks.sh`): not affected. The regression test
  `tests/regression/check-sample-pipeline.js` uses an isolated `mkdtempSync`
  workspace, sidestepping the issue entirely.
- Direct local execution: affected. Manual `git checkout -- examples/registry/`
  required after each run.
- Unit tests (`node --test tests/unit/...`): affected for tests that exercise
  the full pipeline against the demo workspace.

**Resolution (Step 4 complete):**

- `src/lib/paths.js` introduces `getPaths(preset)` abstraction with three presets:
  `default` (byte-compatible with old hardcoded paths), `isolated` (write paths
  redirected to `.prunemem-isolated/`), `custom` (semantic alias for host adapters).
- `update-registries.js` no longer writes by default — must explicitly pass `--write`
  or `write: true`. This is a BREAKING CHANGE in 0.4.0.
- Tests use `preset: 'isolated'` to avoid touching `examples/`.
- See `docs/paths.md` for the host adapter integration guide.
- `scripts/check-examples-clean.sh` is preserved as an additional manual defense
  tool but is no longer required (paths.js abstraction prevents the contamination
  at the source).

**Diagnosed in:** Step 3 closeout, T5.

## Issue #2: run-extract / run-judge / run-sample-pipeline golden baselines

**Status:** Closed. Baselines regenerated in mock mode.

**Symptom:** Step 0 audit captured `PROVIDER_AUTH_MISSING` error output as the
golden baseline for `tests/golden/run-extract.json`, `tests/golden/run-judge.json`,
and `tests/golden/run-sample-pipeline.json`. These baselines had no regression
value because they reflected an environment without API key, not real pipeline
output.

**Resolution:** Baselines regenerated using `--mock` mode in commits 4ec9b82
(run-extract / run-judge) and a4b8b45 (run-sample-pipeline). The `--mock` mode
uses deterministic fixtures and does not require an API key.

**Lesson learned:** When baselining LLM-dependent scripts, always use `--mock`
mode. This is now codified as a "铁律" in `docs/refactor-pattern.md`.
