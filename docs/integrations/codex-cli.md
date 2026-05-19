# Integrating PruneMem with Codex CLI

PruneMem is a memory governance system that can be integrated into Codex CLI as an MCP server, giving Codex CLI access to a structured, layered memory pipeline.

This document is for **engineers** who want to integrate PruneMem into Codex CLI. All steps and observations are based on real testing against **Codex CLI 0.130.0**.

> **Shared configuration bonus**: integrating PruneMem with Codex CLI also makes it available in the **Codex VSCode extension** — both tools share `~/.codex/config.toml`. One registration, two clients.

---

## 1. Prerequisites

- **Codex CLI 0.130.0+** installed and working (`codex --version`)
- **Node.js** installed (any current LTS version works; tested on Node.js 22)
- **npm** available
- **Git** available
- macOS or Linux (testing was done on macOS)

---

## 2. Installation

### Step 1 — Clone PruneMem

```bash
git clone https://github.com/Wpoithge/PruneMem.git ~/Tools/prunemem
cd ~/Tools/prunemem
```

> Recommended: clone to a standalone directory such as `~/Tools/prunemem/` rather than inside an active development workspace.

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Register with Codex CLI

```bash
codex mcp add prunemem -- node ~/Tools/prunemem/src/mcp/bin.js
```

**The `--` separator is required.** Codex CLI's `codex mcp add` command uses the format `<NAME> -- <COMMAND>...`. The `--` separates the subcommand's own flags from the server command. Without `--`, Codex CLI interprets what follows as a URL argument and reports an error.

Note: unlike Claude Code, no `--scope user` flag is needed — Codex CLI writes to the user-level `~/.codex/config.toml` by default.

Expected output:

```
Added global MCP server 'prunemem'.
```

("global" is Codex CLI's terminology; in practice this writes to `~/.codex/config.toml`.)

### Step 4 — Verify the connection

```bash
codex mcp list
```

Expected output (excerpt):

```
Name      Command  Args                                              Env  Cwd  Status   Auth
prunemem  node     /Users/<username>/Tools/prunemem/src/mcp/bin.js   -    -    enabled  Unsupported
```

`Status: enabled` confirms the server is registered. `Auth: Unsupported` is expected — PruneMem uses stdio transport, not OAuth.

---

## 3. Configuration File Reference

Codex CLI writes the MCP server entry to **`~/.codex/config.toml`** — a TOML-format user-level configuration file.

The `[mcp_servers.prunemem]` section will contain:

```toml
[mcp_servers.prunemem]
command = "node"
args = ["/Users/<username>/Tools/prunemem/src/mcp/bin.js"]
```

**Important: shared configuration.** The same `~/.codex/config.toml` is read by both Codex CLI and the **Codex VSCode extension**. Register PruneMem once and it is available in both clients — no separate registration step needed.

This differs from Hermes Agent and Claude Code, where MCP configuration is client-specific.

Comparison across hosts:

| Field | Codex CLI (`~/.codex/config.toml`) | Hermes Agent (`~/.hermes/config.yaml`) | Claude Code (`~/.claude.json`) |
|---|---|---|---|
| Format | TOML | YAML | JSON |
| Key style | `[mcp_servers.<name>]` | `mcp_servers:` nested | `mcpServers:` nested |
| Shared with | Codex VSCode extension | — | — |
| `enabled` field | Not present (always enabled) | Present | Not present (always enabled) |

---

## 4. Starting a New Session

After `codex mcp add` completes, you **must start a new Codex CLI session** — the running process does not hot-reload MCP configuration.

Exit the current session and start a new one:

```bash
codex
```

Once the new session is running, you can verify PruneMem is available by asking Codex CLI which MCP servers are connected. It should report PruneMem with 11 tools.

You can also run `/mcp` inside the Codex CLI TUI to list MCP servers active in the current session.

---

## 5. Calling PruneMem Tools from Codex CLI

Example — querying runtime context for a workspace:

```
User: Please call prunemem_runtime_context with workspace /Users/<username>/Tools/prunemem and preset isolated.

Codex CLI: [calls prunemem_runtime_context]
ok: true
schema_version: prunemem.runtime-context.v1
session_key: agent:demo:main
status: active
current_task: Upgrade PruneMem public repo to express V4.1
...
```

Key points:
- `workspace` must be an absolute path (not `~/...` style)
- Pass `preset: "isolated"` to avoid writing to your real workspace
- By default, read tools are dry-run and write nothing
- Codex CLI tends to actively **summarize** tool output into a structured digest (Task / Goal / Status / Next actions). If you need the raw JSON response, ask explicitly: "Please show the full JSON returned by prunemem_runtime_context without summarizing."

---

## 6. Tool Names in Codex CLI

Codex CLI does not add visible prefixes to MCP tool names in conversation. Tools from PruneMem are referenced by their original names:

- `prunemem_runtime_context`
- `prunemem_archive_session`
- `prunemem_curator_apply`
- (and the remaining tools)

Internally, at the API level, Codex CLI references tools as `prunemem.prunemem_runtime_context` (server name + tool name), but you use the short name in conversation.

You can ask Codex CLI "what tools does the prunemem MCP server provide?" and it will list them.

---

## 7. Safety Defaults

PruneMem is designed to be safe by default. For full details, see [README — Safety defaults](../../README.md#safety-defaults).

- **D5 dry-run**: all 6 write-capable tools default to `write: false` — no disk changes unless you explicitly pass `write: true`
- **isolated preset**: passing `preset: "isolated"` redirects all writes to a `.prunemem-isolated/` sandbox directory
- **F3 warning**: `prunemem_run_sample_pipeline` writes `.generated.json` intermediate files even when `write: false` — use `preset: "isolated"` if you want to avoid touching your real workspace

Codex CLI's own sandbox configuration (the `[sandbox]` section in `~/.codex/config.toml`) can further restrict the filesystem paths PruneMem can access. In testing, the default sandbox did not block PruneMem read operations.

---

## 8. Uninstalling

To remove PruneMem from Codex CLI:

```bash
codex mcp remove prunemem
```

To also remove the cloned directory:

```bash
codex mcp remove prunemem
rm -rf ~/Tools/prunemem
```

PruneMem data files (`.prunemem-isolated/`, state files under `examples/workspace/`) are left in place and are not deleted automatically — this makes it easy to re-register later.

For details on data ownership and portability, see [README — Data ownership](../../README.md#data-ownership).

---

## 9. Troubleshooting

### `codex mcp list` does not show prunemem

Most likely causes:
- The `--` separator was omitted in `codex mcp add` — without it, Codex CLI parses the server command as a URL argument and does not register the server
- `node` is not visible in the PATH that Codex CLI inherits

Fix: remove any partial registration and re-register with the correct syntax:

```bash
codex mcp remove prunemem
codex mcp add prunemem -- node /absolute/path/to/PruneMem/src/mcp/bin.js
```

### `codex mcp list` shows `enabled` but a new session doesn't see PruneMem tools

Most likely cause: you have not started a new Codex CLI session yet.

Fix: exit the current session (`/exit` or `Ctrl+D`) and run `codex` again.

### Registration fails with `node: command not found`

Possible causes:
- `node` is not in the PATH visible to Codex CLI
- You use a Node version manager (nvm, asdf, fnm) that sets `node` in your shell init but not in the environment Codex CLI inherits

Fix: find the absolute path to your Node binary and use it explicitly:

```bash
which node   # e.g. /Users/<username>/.nvm/versions/node/v22.0.0/bin/node
codex mcp add prunemem -- /absolute/path/to/node /absolute/path/to/PruneMem/src/mcp/bin.js
```

### Write-capable tool call is blocked by Codex CLI sandbox

If your `~/.codex/config.toml` has a strict sandbox policy (for example `read-only`), PruneMem write-capable tools may be blocked.

Options:
1. Call with `preset: "isolated"` — all writes go to `.prunemem-isolated/`, which may be within the allowed sandbox range
2. Adjust the Codex CLI sandbox policy for your session (see Codex CLI documentation)

### Tool call returns `ok: false`

This is a structured return, not a crash. Inspect the `notes` or `error` field in the response for the specific reason.

For full error handling documentation, see [docs/mcp-server.md](../mcp-server.md).

---

## 10. Known Issues

### PruneMem tools are not called automatically by Codex CLI

After integrating PruneMem, Codex CLI does not automatically use `prunemem_*` tools for memory management. You need to explicitly prompt Codex CLI to call a specific PruneMem tool in your conversation.

This is expected behavior in v0.3.0. A usage strategy guide (specifying when and how Codex CLI should call PruneMem tools) is in development in Phase 6.5. The guide will be delivered as a `SKILL.md` that integrates with Codex CLI's native skill system. Until then, you can include a session-opening prompt such as:

> "This session uses PruneMem for memory governance. At the end of our session, please call `prunemem_archive_session` to archive the conversation."

### PruneMem MCP server does not respond to SIGINT (Ctrl+C)

When running `node src/mcp/bin.js` manually in a terminal for testing, pressing `Ctrl+C` does not exit the process.

Workarounds:
- `Ctrl+\` (SIGQUIT)
- From another terminal: `pkill -f "src/mcp/bin.js"`

**This does not affect Codex CLI integration.** Codex CLI terminates MCP server subprocesses with SIGTERM, which works correctly.

### Codex CLI actively summarizes PruneMem tool output

Codex CLI 0.130.0 tends to reformat PruneMem tool responses into a structured digest (Task / Goal / Status / Next actions) rather than displaying the raw return verbatim.

This is Codex CLI behavior, not a PruneMem issue. If you need the raw JSON output for debugging, ask explicitly: "Please show the full JSON returned by `<tool_name>` without summarizing."

---

## 11. Further Reading

- [README](../../README.md) — PruneMem project overview
- [docs/mcp-server.md](../mcp-server.md) — MCP server protocol details
- [docs/mcp-tools.md](../mcp-tools.md) — full schema for every tool
- [docs/integrations/mcp-surface.zh.md](mcp-surface.zh.md) — MCP capability surface quick reference
- [docs/integrations/hermes.md](hermes.md) — parallel reference: Hermes Agent integration
- [docs/integrations/claude-code.md](claude-code.md) — parallel reference: Claude Code integration
