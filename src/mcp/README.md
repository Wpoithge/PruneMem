# PruneMem MCP Server

`src/mcp/` implements the Model Context Protocol (MCP) server for PruneMem.

## Directory structure

```
src/mcp/
├── bin.js                 # CLI entry (package.json bin → prunemem-mcp)
├── server.js              # StdioServerTransport + Server setup, tool registration
├── tools/
│   └── archive-session.js     # prunemem_archive_session schema + handler
├── shared/
│   ├── error.js           # Structured result / thrown error wrappers
│   └── lib-bridge.js      # Intentionally omitted in Phase B-1
└── README.md              # This file
```

`lib-bridge.js` is not created yet. Phase B-1 only has one tool (`archive_session`); there is no cross-tool commonality to extract. Phase B-2 will introduce `runtime_context`; at that point we will re-evaluate whether a shared bridge is warranted.

## Running locally

```bash
# Start the MCP server on stdio
npm run mcp

# Or directly
node src/mcp/bin.js
```

## End-to-end test

```bash
npm run test:mcp
```

This spawns the server as a subprocess, performs an initialize handshake, lists tools, calls `prunemem_archive_session` with `preset: "isolated"`, and asserts both happy and error paths.

## Implemented tools

| Tool | Status | Core function |
|---|---|---|
| `prunemem_archive_session` | ✅ Phase B-1 | `src/core/archive-session-v41.js` |
| `prunemem_runtime_context` | 🕐 Phase B-2 | `src/core/build-runtime-context.js` |

## Design reference

- `docs/mcp-design.md` — authoritative spec (transport, naming, parameter passthrough, error handling)
- `docs/mcp-tool-inventory.md` — full planned tool catalog
