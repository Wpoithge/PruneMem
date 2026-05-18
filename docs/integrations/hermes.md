# Integrating PruneMem with Hermes Agent

PruneMem is a memory governance system that can be integrated into Hermes Agent as an MCP server, giving Hermes a structured, layered memory pipeline.

This document is for **engineers** who want to integrate PruneMem into Hermes Agent. All steps and observations are based on real testing against **Hermes Agent v0.13.0**.

---

## 1. Prerequisites

- **Hermes Agent v0.13.0+** installed and working (`hermes --version`)
- **Node.js** installed (any current LTS version works; tested on Node.js 22)
- **npm** available
- macOS or Linux (testing was done on macOS)

---

## 2. Installation

### Step 1 — Clone PruneMem

```bash
git clone --branch v0.3.0 https://github.com/Wpoithge/PruneMem.git
cd PruneMem
```

> Recommended: clone to a standalone directory such as `~/Tools/prunemem/` rather than inside an active development workspace.

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Register with Hermes

```bash
hermes mcp add prunemem --command node --args /absolute/path/to/PruneMem/src/mcp/bin.js
```

**Important:** `--args` must be an absolute path, not a relative one.

`hermes mcp add` runs a connection test and tool discovery automatically. Expected output:

```
Connecting to 'prunemem'...
✓ Connected! Found 11 tool(s) from 'prunemem':
  prunemem_archive_session      Archive a session...
  prunemem_curator_apply        Apply curated facts...
  prunemem_execution_plan       Manage execution plan...
  prunemem_get_working_state    Get current working state...
  prunemem_maintain             Run full maintenance cycle...
  prunemem_repair_source_paths  Repair source paths...
  prunemem_run_sample_pipeline  Run the sample pipeline...
  prunemem_runtime_context      Get runtime context...
  prunemem_update_registries    Update registries...
  prunemem_update_working_state Update working state...
  prunemem_validate_maintenance Validate maintenance...

Enable all 11 tools? [Y/n/select]: y
✓ Saved 'prunemem' to ~/.hermes/config.yaml (11/11 tools enabled)
Start a new session to use these tools.
```

Enter `y` to enable all 11 tools.

### Step 4 — Verify the connection

```bash
hermes mcp test prunemem
```

Expected output:

```
Testing 'prunemem'...
Transport: stdio → node
Auth: none
✓ Connected (268ms)
✓ Tools discovered: 11
  prunemem_archive_session   Archive a session...
  prunemem_curator_apply     Apply curated facts...
  ...
```

---

## 3. Configuration File Reference

To inspect the configuration Hermes wrote:

```bash
cat ~/.hermes/config.yaml
```

The `mcp_servers` section should contain:

```yaml
mcp_servers:
  prunemem:
    command: node
    args:
    - /absolute/path/to/PruneMem/src/mcp/bin.js
    enabled: true
```

Only three fields are written: `command`, `args`, `enabled`. Fields like `env`, `auth`, and `preset` are optional and not required for a standard PruneMem setup.

---

## 4. Starting a New Session

After `hermes mcp add` completes, you **must start a new Hermes session** — existing processes do not hot-reload.

```bash
hermes
```

Once the new session is running, verify PruneMem appears in the tool list:

```bash
hermes tools list
```

Expected output (excerpt):

```
MCP servers:
  prunemem  all tools enabled
```

MCP servers appear as a separate category after the built-in toolsets.

---

## 5. Calling PruneMem Tools from Hermes

Example — querying runtime context for a workspace:

```
User: Please call prunemem_runtime_context with workspace /Users/yang/Tools/prunemem/PruneMem and preset isolated.

Hermes: [calls prunemem_runtime_context]
✓ prunemem_runtime_context completed
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

## 6. Tool Naming in Hermes

Hermes attaches an internal namespace prefix to each MCP tool name. The details are transparent to users:

- Hermes activity display: `mcp_prune  0.0s` (abbreviated due to display width)
- **In conversation**: use the original PruneMem name — `prunemem_runtime_context`, `prunemem_archive_session`, etc.

You do not need to know or type the internal identifier. Hermes resolves it automatically.

---

## 7. Safety Defaults

PruneMem is designed to be safe by default. For full details, see [README — Safety defaults](../../README.md#safety-defaults).

- **D5 dry-run**: all 6 write-capable tools default to `write: false` — no disk changes unless you explicitly pass `write: true`
- **isolated preset**: passing `preset: "isolated"` redirects all writes to a `.prunemem-isolated/` sandbox directory
- **F3 warning**: `prunemem_run_sample_pipeline` writes `.generated.json` intermediate files even when `write: false` — use `preset: "isolated"` if you want to avoid touching your real workspace

---

## 8. Uninstalling

To remove PruneMem from Hermes:

```bash
hermes mcp remove prunemem
# or
hermes mcp rm prunemem
```

To also remove the cloned directory:

```bash
hermes mcp remove prunemem
rm -rf /path/to/PruneMem
```

PruneMem data files (`.prunemem-isolated/`, state files under `examples/workspace/`) are left in place and are not deleted automatically — this makes it easy to re-register later.

For details on data ownership and portability, see [README — Data ownership](../../README.md#data-ownership).

---

## 9. Troubleshooting

### `hermes mcp add` reports "Connection failed"

Possible causes:
- `node` is not in `PATH`
- The path to `bin.js` is wrong or relative — must be absolute
- `npm install` did not complete successfully

Diagnostic commands:

```bash
which node                        # confirm node is accessible
node /path/to/PruneMem/src/mcp/bin.js  # run the server directly to see startup errors
```

### Registered successfully but `hermes tools list` does not show `prunemem`

Most likely cause: you have not started a new Hermes session yet.

Fix: exit the current Hermes process and run `hermes` again.

### Tool call returns `ok: false`

This is a structured return, not a crash. Inspect the `notes` or `error` field in the response for the specific reason.

For full error handling documentation, see [docs/mcp-server.md](../mcp-server.md).

### Tool call fails with a workspace path error

Confirm:
- The workspace path is absolute (not `~/...`)
- The workspace directory exists
- The workspace contains the expected PruneMem state files, or use `preset: "isolated"` to start fresh

---

## 10. Known Issues

### PruneMem MCP server does not respond to SIGINT (Ctrl+C)

When running `node src/mcp/bin.js` manually in a terminal for testing, pressing `Ctrl+C` does not exit the process.

Workarounds:
- `Ctrl+\` (SIGQUIT)
- From another terminal: `pkill -f "src/mcp/bin.js"`

**This does not affect Hermes integration.** Hermes terminates MCP server subprocesses with SIGTERM, which works correctly.

### v0.3.0 assumes `node` is in PATH

The `hermes mcp add` command passes `--command node`, which requires `node` to be resolvable in the PATH of the Hermes process. If you use a Node version manager (nvm, asdf, fnm), you may need to replace `node` with the absolute path to the Node binary.

This scenario was not encountered during testing. If you hit this, file an issue at the PruneMem repository.

---

## 11. Further Reading

- [README](../../README.md) — PruneMem project overview
- [docs/mcp-server.md](../mcp-server.md) — MCP server protocol details
- [docs/mcp-tools.md](../mcp-tools.md) — full schema for every tool
- [docs/integrations/mcp-surface.zh.md](mcp-surface.zh.md) — MCP capability surface quick reference
