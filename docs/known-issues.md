# Known Issues

This document captures known issues in PruneMem 0.3 host-agnostic refactor.
Each entry includes diagnosis, current mitigation, and planned root-cause fix.

## Issue #1: examples/registry/ contamination during direct execution

**Status:** Mitigated. Root-cause fix planned for Step 4 (paths.js abstraction).

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

**Mitigation (until Step 4):**
- After running pipeline scripts directly, run `bash scripts/check-examples-clean.sh`
  to detect contamination, then `git checkout -- examples/registry/` to restore.
- Or: invoke pipeline scripts with `--workspace <tmpdir>` instead of `--workspace .`
  to avoid touching the demo registry entirely.

**Planned root-cause fix (Step 4):**
- Introduce `src/lib/paths.js` `getPaths(preset)` abstraction.
- `default` preset continues to use `examples/registry/` for backward compatibility.
- Tests can pass an `isolated` preset (or `--paths-preset isolated`) that points
  writes at a tmpdir, eliminating contamination.
- update-registries.js (and any other scripts hardcoding the path) will resolve
  the registry path through `getPaths()` instead of `path.join`.

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
