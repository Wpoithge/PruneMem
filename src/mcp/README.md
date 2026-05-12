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
| `prunemem_runtime_context` | ✅ Phase B-2 | `src/core/build-runtime-context.js` |

## Implementation notes for client authors

These are gotchas discovered while implementing the Phase B-1 test client. Future
clients (Phase B-2 tests, Phase D regression, external integrations) should
consult this section before writing transport code.

- **Message framing**: `StdioServerTransport` (SDK 1.28.0) delimits JSON-RPC
  messages with a single `\n` (newline). It does **not** use `Content-Length`
  headers. Each message is `JSON.stringify(payload) + '\n'`.
- **Initialization sequence**: client must send `initialize` request, wait for
  the response, then send the `notifications/initialized` notification before
  any `tools/*` call.
- **Error response shape**: schema validation failures and other protocol-level
  errors are returned as JSON-RPC `error` objects (`response.error`), not as
  tool results with `isError: true`. Tool-level `isError: true` is reserved for
  runtime failures inside the tool handler (e.g. core function throws).
- **SDK version**: pinned to `@modelcontextprotocol/sdk@1.28.0`. If upgrading,
  re-verify the framing and error semantics above.

## Schema invariants

The following invariants are enforced by the MCP layer and must NOT be relaxed
without revisiting the relevant design decisions.

- **`additionalProperties: false` on every tool `inputSchema`.** This is the
  physical enforcement of decision M2 in `docs/mcp-design.md`: MCP tools must
  not accept a pre-resolved `paths` parameter, because the underlying lib
  functions (`archiveSessionV41`, `buildRuntimeContext`, …) DO accept `paths`
  as an escape hatch. Allowing `additionalProperties: true` (or removing the
  guard) would silently re-expose `paths` to MCP clients and break M2. If a
  future tool genuinely needs to relax this, re-read M2 first and document the
  exception in `docs/mcp-design.md` before changing the schema.
- **`paths` field must never appear in any tool's `properties`.** Same reason
  as above — declaring it would defeat `additionalProperties: false`.

## Design reference

- `docs/mcp-design.md` — authoritative spec (transport, naming, parameter passthrough, error handling)
- `docs/mcp-tool-inventory.md` — full planned tool catalog
