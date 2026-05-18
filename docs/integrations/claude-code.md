# Integrating PruneMem with Claude Code

PruneMem is a memory governance system that can be integrated into Claude Code as an MCP server, giving Claude Code access to a structured, layered memory pipeline.

This document is for **engineers** who want to integrate PruneMem into Claude Code. All steps and observations are based on real testing against **Claude Code 2.1.143**.

---

## 1. Prerequisites

- **Claude Code 2.1.143+** installed and working (`claude --version`)
- **Node.js** installed (any current LTS version works; tested on Node.js 22)
- **npm** available
- **Git** available
- macOS or Linux (testing was done on macOS)

---

## 2. Installation

### Step 1 — Clone PruneMem

```bash
git clone --branch v0.3.0 https://github.com/Wpoithge/PruneMem.git ~/Tools/prunemem
cd ~/Tools/prunemem
```

> Recommended: clone to a standalone directory such as `~/Tools/prunemem/` rather than inside an active development workspace.

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Register with Claude Code (user-level config)

```bash
claude mcp add --scope user prunemem node ~/Tools/prunemem/src/mcp/bin.js
```

**`--scope user` is required.** Without it, `claude mcp add` registers the server at the project level — creating a `.mcp.json` in the current working directory that only applies to that specific project. With `--scope user`, the server is written to `~/.claude.json` and is available in all Claude Code sessions regardless of working directory.

Expected output:

```
Added stdio MCP server prunemem with command: node /Users/<username>/Tools/prunemem/src/mcp/bin.js to user config
File modified: /Users/<username>/.claude.json
```

### Step 4 — Verify the connection

```bash
claude mcp list
```

Expected output (excerpt):

```
Checking MCP server health…

prunemem: node /Users/<username>/Tools/prunemem/src/mcp/bin.js - ✓ Connected
```

---

## 3. Configuration File Reference

Claude Code writes the MCP server entry to **`~/.claude.json`** — a hidden JSON file in your home directory (not to be confused with the `~/.claude/` directory; see [Section 7](#7-trap-claudemcpjson-looks-like-mcp-config-but-is-not-read-by-claude-code) for why this distinction matters).

The `mcpServers` section will contain:

```json
{
  "mcpServers": {
    "prunemem": {
      "command": "node",
      "args": [
        "/Users/<username>/Tools/prunemem/src/mcp/bin.js"
      ]
    }
  }
}
```

Note the differences from Hermes Agent's `~/.hermes/config.yaml`:

| Field | Claude Code (`~/.claude.json`) | Hermes Agent (`~/.hermes/config.yaml`) |
|---|---|---|
| Format | JSON | YAML |
| Key style | `mcpServers` (camelCase) | `mcp_servers` (snake_case) |
| `enabled` field | Not present (always enabled) | Present |

---

## 4. Starting a New Session

After `claude mcp add` completes, you **must start a new Claude Code session** — the running process does not hot-reload MCP configuration.

Exit the current Claude Code session and start a new one:

```bash
claude
```

Once the new session is running, you can verify PruneMem is available by asking Claude Code which MCP servers are connected. It should report PruneMem with 11 tools.

---

## 5. Calling PruneMem Tools from Claude Code

Example — querying runtime context for a workspace:

```
User: Please call prunemem_runtime_context with workspace /Users/<username>/Tools/prunemem and preset isolated.

Claude Code: [calls prunemem_runtime_context]
ok: true
session_key: agent:demo:main
status: active
current_task: Upgrade PruneMem public repo to express V4.1
...
```

Key points:
- `workspace` must be an absolute path (not `~/...` style)
- Pass `preset: "isolated"` to avoid writing to your real workspace
- By default, read tools are dry-run and write nothing

---

## 6. Tool Names in Claude Code

Claude Code does not add visible prefixes to MCP tool names in conversation. Tools from PruneMem are referenced by their original names:

- `prunemem_runtime_context`
- `prunemem_archive_session`
- `prunemem_curator_apply`
- (and the remaining tools)

You can ask Claude Code "what tools does the prunemem MCP server provide?" and it will list them.

---

## 7. Trap: `~/.claude/mcp.json` Looks Like MCP Config But Is Not Read by Claude Code

Claude Code's home directory contains two locations that look related:

| Path | Valid? | Purpose |
|---|---|---|
| `~/.claude.json` | ✅ Valid | Claude Code's actual user-level MCP configuration |
| `~/.claude/mcp.json` | ❌ Not read | Not a Claude Code MCP config file; unrelated to MCP registration |

If you manually edited `~/.claude/mcp.json` expecting it to register an MCP server, the registration will not take effect. Claude Code reads `~/.claude.json`, not files inside `~/.claude/`.

**Best practice: always use `claude mcp add --scope user` to register MCP servers.** The command writes to the correct file automatically — you don't need to know which file or format to edit.

If you already edited `~/.claude/mcp.json`:
1. You can safely ignore or delete that file.
2. Re-register using `claude mcp add --scope user prunemem node /absolute/path/to/PruneMem/src/mcp/bin.js`.

---

## 8. Safety Defaults

PruneMem is designed to be safe by default. For full details, see [README — Safety defaults](../../README.md#safety-defaults).

- **D5 dry-run**: all 6 write-capable tools default to `write: false` — no disk changes unless you explicitly pass `write: true`
- **isolated preset**: passing `preset: "isolated"` redirects all writes to a `.prunemem-isolated/` sandbox directory
- **F3 warning**: `prunemem_run_sample_pipeline` writes `.generated.json` intermediate files even when `write: false` — use `preset: "isolated"` if you want to avoid touching your real workspace

---

## 9. Uninstalling

To remove PruneMem from Claude Code:

```bash
claude mcp remove prunemem
```

To also remove the cloned directory:

```bash
claude mcp remove prunemem
rm -rf ~/Tools/prunemem
```

PruneMem data files (`.prunemem-isolated/`, state files under `examples/workspace/`) are left in place and are not deleted automatically — this makes it easy to re-register later.

For details on data ownership and portability, see [README — Data ownership](../../README.md#data-ownership).

---

## 10. Troubleshooting

### `claude mcp list` shows prunemem missing, but `~/.claude/mcp.json` appears to have the config

Most likely cause: the config was written to the wrong file (`~/.claude/mcp.json` instead of `~/.claude.json`).

Fix: re-register using the correct command:

```bash
claude mcp add --scope user prunemem node /absolute/path/to/PruneMem/src/mcp/bin.js
```

This writes to `~/.claude.json` (the correct location).

### `claude mcp list` shows `✓ Connected` but a new Claude Code session doesn't see PruneMem tools

Most likely cause: you have not started a new Claude Code session yet.

Fix: exit the current Claude Code process and run `claude` again.

### Registration fails with `node: command not found`

Possible causes:
- `node` is not in the PATH visible to Claude Code
- You use a Node version manager (nvm, asdf, fnm) that sets `node` in your shell init but not in the environment Claude Code inherits

Fix: find the absolute path to your Node binary and use it explicitly:

```bash
which node   # e.g. /Users/<username>/.nvm/versions/node/v22.0.0/bin/node
claude mcp add --scope user prunemem /absolute/path/to/node /absolute/path/to/PruneMem/src/mcp/bin.js
```

### Tool call returns `ok: false`

This is a structured return, not a crash. Inspect the `notes` or `error` field in the response for the specific reason.

For full error handling documentation, see [docs/mcp-server.md](../mcp-server.md).

### Tool call fails with a workspace path error

Confirm:
- The workspace path is absolute (not `~/...`)
- The workspace directory exists
- The workspace contains the expected PruneMem state files, or use `preset: "isolated"` to start fresh

---

## 11. Known Issues

### PruneMem tools are not called automatically by Claude Code

After integrating PruneMem, Claude Code does not automatically use `prunemem_*` tools for memory management. You need to explicitly prompt Claude Code to call a specific PruneMem tool in your conversation.

This is expected behavior in v0.3.0. A usage strategy guide (specifying when and how Claude Code should call PruneMem tools) is in development in Phase 6.5. Until then, you can include a session-opening prompt such as:

> "This session uses PruneMem for memory governance. At the end of our session, please call `prunemem_archive_session` to archive the conversation."

### PruneMem MCP server does not respond to SIGINT (Ctrl+C)

When running `node src/mcp/bin.js` manually in a terminal for testing, pressing `Ctrl+C` does not exit the process.

Workarounds:
- `Ctrl+\` (SIGQUIT)
- From another terminal: `pkill -f "src/mcp/bin.js"`

**This does not affect Claude Code integration.** Claude Code terminates MCP server subprocesses with SIGTERM, which works correctly.

---

## 12. Further Reading

- [README](../../README.md) — PruneMem project overview
- [docs/mcp-server.md](../mcp-server.md) — MCP server protocol details
- [docs/mcp-tools.md](../mcp-tools.md) — full schema for every tool
- [docs/integrations/mcp-surface.zh.md](mcp-surface.zh.md) — MCP capability surface quick reference
- [docs/integrations/hermes.md](hermes.md) — parallel reference: Hermes Agent integration
