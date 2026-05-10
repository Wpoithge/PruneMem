# Changelog

## [0.4.0] - 2026-05-10

> **Note**: 0.3.0 was developed but never released as a versioned milestone.
> It corresponds to Step 3 (lib+CLI dual-mode for all 13 core scripts).
> See git tag `step3-done` for the codebase state at that point.

### Added
- `src/lib/paths.js` `getPaths()` abstraction for host-agnostic path resolution.
  Three presets: `default` (byte-compatible), `isolated` (test isolation),
  `custom` (host adapter alias). See docs/paths.md for the integration guide.
- `src/lib/cli-args.js` `parsePresetArgs` helper for `--preset` / `--paths` CLI flags.
- 14 core scripts now accept `preset`, `override`, and `paths` parameters,
  enabling host adapters to redirect read/write paths without forking.
- `tests/regression/check-isolated-preset.js`: verifies isolated preset works correctly.
- `tests/regression/check-no-pollution.js`: verifies dry-run doesn't write.
- `docs/paths.md`: host adapter integration guide.
- `docs/paths-design.md`: Step 4 internal design spec with full revision history.

### Changed
- All 13 lib化 core scripts now resolve paths through `getPaths()` instead of
  hardcoded `examples/` paths. Default preset preserves byte-level compatibility.
- Working memory and MEMORY.md now have read/write path separation under
  `isolated` preset (D1 design revision).

### Breaking Changes
- **`update-registries.js` no longer writes by default.** You must explicitly pass
  `--write` (CLI) or `write: true` (function call) to enable writes. Without this,
  the script computes the would-be inserts and returns the result without touching
  disk. This prevents accidental contamination of demo workspace during local
  development.

  Migration:
  - Before: `node src/core/update-registries.js --workspace ~/my-workspace`
  - After:  `node src/core/update-registries.js --workspace ~/my-workspace --write`

  `run-sample-pipeline.js` and `maintain.js` propagate `--write` to downstream
  `updateRegistries` calls — no user action required for those entry points.

### Fixed
- Issue #1: examples/registry/ contamination during direct execution. Now resolved
  at the root cause via paths.js abstraction. See docs/known-issues.md.

### Notes
- The previously released `scripts/check-examples-clean.sh` is preserved as an
  additional manual defense tool but is no longer required.

## [0.2.0] - 2026-04-12

### Added
- public-safe V4 working-memory primitives (`working_state`, `working_event`, `runtime_context`, `context_bundle`)
- public-safe V4.1 execution/progress primitives (`execution_plan`, `milestone_state`)
- generic runtime-context assembly helpers and example CLI commands
- public-safe V4.1 session archive snapshot builder with working-state/runtime-context relationship fields
- sanitized V4/V4.1 example assets under `examples/working-memory/`
- regression checks for working-memory merge/runtime-context generation, execution context, and session archives
- detailed V4/V4.1 documentation explaining working memory, runtime context, hook integration, session/archive relationship, and execution/progress context

### Changed
- updated architecture, schema, layering, scope, and README docs from V3-only public baseline to V4.1-capable public abstraction
- expanded schema version registry to include working-memory, runtime-context, execution, and session-archive artifacts
- promoted repository package version from `0.1.0` to `0.2.0`

### Safety
- kept all new materials generalized and synthetic
- avoided private logs, machine-specific paths, secrets, and host-specific runtime payload copies

## [0.1.0] - 2026-03-14

### Added
- initial open-source repository skeleton
- docs/config/examples/tests directory layout
- core project scope and plugin architecture outline
- adapter-oriented direction for retrieval and model providers
- publicized validator / curator / source-repair core scripts
- public maintain entry and regression checks
- model provider config loader, factory, and initial adapter wiring
- sample extract/judge/update pipeline CLIs with mock execution path
