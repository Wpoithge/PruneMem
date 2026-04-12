# Changelog

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
