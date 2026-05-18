# PruneMem

A memory governance system for AI agents — with structure, state, and lifecycle.

---

## The problem

Most agents get worse the longer you use them.

- They search for the same things over and over
- Important decisions get tangled with trivial notes
- Old memories pile up and are never cleaned
- Active tasks and cold archives blur together
- Long-running tasks lose track of where they left off

The usual fixes — bigger context windows, smarter retrieval, or manual prompt engineering — don't fix the root cause: **memory without governance**. Information needs organization, expiration, and maintenance just like any other system.

## What PruneMem does

PruneMem treats agent memory as an infrastructure layer with three core ideas:

- **Structure** — Layered long-term memory (L0–L3) so retrieval knows what to prioritize
- **State** — Working memory and runtime context for active session continuity
- **Lifecycle** — Automated governance (merge, expire, validate, repair) so the memory layer stays clean over time

PruneMem does not replace your vector store or retrieval mechanism. It sits upstream: you feed it session transcripts or facts, it judges what to keep and where to put it, and it maintains the registries that your retrieval layer can query.

## What's in this repo

This repository contains:

- Core memory governance operations (extract, judge, curate, validate, maintain)
- Layered registry implementations (L0 ephemeral → L3 canonical)
- Working memory and execution context primitives
- Session archive builder
- MCP server exposing 11 tools for integration with any MCP-compatible host

It intentionally **does not** include:

- Private workspace data or chat logs
- Hard-coded vendor integrations (use adapters instead)
- Retrieval mechanism (the read path is the host's responsibility)
- Production secrets or credentials

## Current release status

**Current version: `0.3.0`**

MCP server support makes PruneMem usable as a standard MCP tool server from any compatible host.

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Architecture overview

```mermaid
flowchart LR
    A[Session packet] --> B[Extract facts]
    B --> C[Judge & classify]
    C --> D[Update registries]
    D --> E[Layered storage<br/>L0 / L1 / L2 / L3]
    E --> F[Working memory]
    F --> G[Runtime context]
    G --> H[Agent turn<br/>(host responsibility)]
    E --> I[Curator apply<br/>merge / expire / validate]
    I --> E
```

**Data flow:** A session packet goes through extract → judge → registry update. Registries feed layered storage, working memory, and runtime context. A background curator process maintains registry health over time.

## Quick start

> **This section will be filled after Phase 6.4 (Hermes integration test).**
>
> The author is currently the first real user testing PruneMem against Hermes Agent. Writing a "30-second setup" guide before that test would be guesswork. This section will be written based on actual deployment experience, not assumptions.
>
> In the meantime, see [docs/mcp-server.md](docs/mcp-server.md) for protocol-level setup. Host-specific integration guides (docs/integrations/) are being written throughout Step 6.

## Integration guides

Host-specific setup guides (being written throughout Step 6):

- [MCP capability surface](docs/integrations/mcp-surface.zh.md) (Chinese-only quick reference)
- [Hermes Agent](docs/integrations/hermes.md)
- [Claude Code](docs/integrations/claude-code.md)
- [Codex CLI](docs/integrations/codex-cli.md)
- [Troubleshooting](docs/integrations/troubleshooting.md)

## For AI agents

If you are an AI agent helping a user integrate PruneMem with their host, this section is for you.

PruneMem is an **MCP server** with **stdio transport**. It is not a Python package, npm package, or CLI tool.

### Prerequisites

- Node.js (any recent LTS version)
- `npm` available in PATH
- Git available

### Installation steps

```bash
git clone https://github.com/Wpoithge/PruneMem.git
cd PruneMem
npm install
```

### Host-specific registration commands

| Host | Registration command |
|---|---|
| Hermes Agent | `hermes mcp add prunemem --command node --args /absolute/path/to/PruneMem/src/mcp/bin.js` |
| Claude Code | _Integration guide coming in Phase 6.6 — see [docs/integrations/claude-code.md](docs/integrations/claude-code.md)_ |
| Codex CLI | _Integration guide coming in Phase 6.7 — see [docs/integrations/codex-cli.md](docs/integrations/codex-cli.md)_ |

For Hermes, after registration, verify with:

```bash
hermes mcp test prunemem
```

Expected output: `✓ Connected` and `Tools discovered: 11`.

### After integration

PruneMem provides 11 MCP tools (5 read-class + 4 single-write + 2 composite). All write-class tools default to `write: false` (dry-run). See [docs/mcp-tools.md](docs/mcp-tools.md) for the complete tool catalog.

**Note**: PruneMem currently exposes its 11 tools but does not yet have an explicit usage strategy for "how the agent should call them" — this is in development (Phase 6.5). Until then, agents may call PruneMem tools at their own discretion based on tool descriptions.

## MCP capabilities

PruneMem exposes its memory governance operations as an [MCP](https://modelcontextprotocol.io) server with **11 tools** (stdio transport).

This means PruneMem can be plugged into any MCP-compatible host:

- [Hermes Agent](https://hermes-agent.nousresearch.com)
- [Claude Code](https://docs.claude.com/en/docs/claude-code)
- [Codex CLI](https://developers.openai.com/codex)
- Any other MCP host

See [docs/mcp-tools.md](docs/mcp-tools.md) for the complete tool reference, and [docs/mcp-server.md](docs/mcp-server.md) for protocol details.

## Safety defaults

PruneMem ships with two layers of write protection enabled by default:

1. **Dry-run by default** — All write-capable MCP tools default to `write: false`. To actually persist changes, the caller must explicitly pass `write: true`.
2. **Isolated preset** — Pass `preset: "isolated"` to redirect all writes to a sandboxed `.prunemem-isolated/` directory, leaving the real workspace untouched.

Additionally, the judgment pipeline targets the `L1` layer by default — the shallowest, most ephemeral memory layer — until the caller explicitly upgrades to deeper layers.

## Data ownership

PruneMem stores memory using its own schema (working-state, execution-plan, registries, lifecycle, topics, dedupe). This schema is documented in [docs/](docs/) but is **not** a standard adopted by other memory systems.

This means:

- **You can leave anytime**. Uninstall PruneMem via `hermes mcp remove prunemem` (or equivalent) and your host works as before. Your memory data files stay on disk (under your workspace) for you to inspect, archive, or delete.
- **However, data does not transfer to other memory tools automatically**. If you accumulate memory in PruneMem and later want to switch to agentmemory, memos, letta, mem0, etc., manual data migration is required. PruneMem currently does not provide automated export/import tools.

We acknowledge this is a real limitation. Import/export tooling for cross-system migration is on the [Roadmap](#roadmap) (planned, no specific version).

Until then: if you anticipate needing migration, keep your own backups of the workspace directory.

## Repository layout

```
src/
├── core/          # Main operations: extract, judge, update, curate, validate, maintain
├── lib/           # Utilities: paths, schema, registry, similarity, validate-input
├── runtime/       # Execution context, archive builder, provider factory
├── working/       # Working memory primitives
├── extract/       # Fact extraction
├── judge/         # LLM classification and scoring
├── archive/       # Session packet builder
├── mcp/           # MCP server and tool handlers
└── adapters/      # Model provider and storage backend adapters

docs/
├── integrations/  # Host-specific setup guides (placeholders)
├── mcp-server.md  # MCP server integration guide
├── mcp-tools.md   # Complete tool reference
├── governance.md  # Registry governance chain
├── layers-and-lifecycle.md  # Layered storage details
└── ...            # Additional concept and design docs

examples/          # Demo workspace with sample data
scripts/           # Validation and demo scripts
tests/             # Regression and MCP tests
skills/            # Host-loadable skill definitions
```

## Key docs

- [docs/governance.md](docs/governance.md) — How the governance chain works (update-registries → curator-apply → validate → repair)
- [docs/layers-and-lifecycle.md](docs/layers-and-lifecycle.md) — L0–L3 storage, working memory, runtime context, session archives
- [docs/execution-context.md](docs/execution-context.md) — Milestone system for long-running tasks
- [docs/mcp-server.md](docs/mcp-server.md) — How to start and connect the MCP server
- [docs/mcp-tools.md](docs/mcp-tools.md) — Complete schema and examples for all 11 tools
- [docs/faq.md](docs/faq.md) — Frequently asked questions

## Roadmap

After v0.3.0 ships:

- npm publish for one-line installation
- Deeper host integration examples (beyond MCP protocol)
- More example workflows (multi-host scenarios)
- Memory data import/export tooling for cross-system migration (planned, no specific version)
- v1.0.0 stable release after real-world validation

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
