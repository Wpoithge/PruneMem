# Changelog

All notable changes to PruneMem are documented in this file.

This project uses a simplified narrative format rather than the strict [Keep a Changelog](https://keepachangelog.com) standard. Each version section describes the conceptual direction of the release, not an exhaustive commit-by-commit log.

For the complete git history, see the [GitHub commit log](https://github.com/Wpoithge/PruneMem/commits/main).

---

## v0.3.0 — MCP integration

**Status:** Code complete and tested (15/15 regression + 44/44 MCP tests passing). Host-specific integration guides (Hermes, Claude Code, Codex CLI) are work-in-progress; see [Roadmap](README.md#roadmap) for what's still being filled in.

### Direction

PruneMem evolves from an OpenClaw-style plugin into an MCP-compatible memory governance system. The core layered-memory and registry infrastructure remains unchanged; the delivery surface now includes a standards-based MCP server so any compatible host can consume it without vendor-specific adapters.

### Added

- **11 MCP tools** (5 read + 4 single-write + 2 composite) exposed over stdio transport, locked to `@modelcontextprotocol/sdk@1.28.0`
- Bilingual README (English + Chinese)
- `docs/integrations/mcp-surface.zh.md` — MCP capability quick-reference (Chinese)
- `scripts/check-tool-count.js` — single source of truth for tool count validation, wired into regression checks
- Automated F3 write-warning test: `prunemem_run_sample_pipeline` writes `.generated.json` even under `write: false`
- Explicit classification of three "not exposed" fields in `docs/mcp-tool-inventory.md`: M2 `paths`, C-3 `curatorApply.limit`, C-4 `maintain.timeoutMs`

### Unchanged

The v0.2.0 core remains intact: layered long-term memory (L0–L3), registry-driven governance, lifecycle-aware curator, and CLI-based workflow.

### Work in progress

- Hermes / Claude Code / Codex CLI integration guides: skeletons created, substance in Phase 6.4–6.7
- Hermes field-test-derived `SKILL.md` (Phase 6.5)
- Cross-host troubleshooting guide (Phase 6.8)

### Migrating from v0.2.0

- The MCP server is a new capability surface; all v0.2.0 CLI entry points are preserved and backward compatible.
- The "Current public default policy" concept has been retired. The previous claims about MEMORY writes and daily-note writes being disabled were not enforced at runtime (the policy module was dead code). The actual safety model is now explicit: D5 dry-run defaults plus the `isolated` preset.
- Recommended usage shifts from "CLI + config file" toward "MCP server + host integration" for users running MCP-compatible agents.

---

## v0.2.0 — [release notes archived on GitHub]

See [GitHub release page](https://github.com/Wpoithge/PruneMem/releases/tag/v0.2.0) for the original release notes. Key direction: refinement of the v0.1.0 conceptual model with public-safe V4/V4.1 primitives (working memory, runtime context, execution plan, session archive), stricter schema validation, and richer examples.

---

## v0.1.0 — Initial conceptual release

First public release establishing the core concepts:

- Layered long-term memory (L0–L3)
- Registry-driven governance (topics, dedupe)
- Lifecycle-aware curator (merge, expire, validate)
- CLI-based workflow for memory ingestion and maintenance

Originally positioned as a "memory plugin for OpenClaw-style agents." This positioning has been revised in v0.3.0 to reflect the broader MCP-compatible deployment model.
