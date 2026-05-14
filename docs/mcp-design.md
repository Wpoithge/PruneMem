# MCP Server Design: PruneMem Step 5

**Status:** Phase A — design in progress  
**Anchor:** Step 4 tombstone at commit `2f77048` (tag `step4-done`)  
**Branch:** `step5/phase-a-design`  
**Target:** Define the Model Context Protocol (MCP) server surface for PruneMem, establishing how MCP clients interact with the lib-ized core functions produced in Steps 1–4.

---

## 1. 背景 & 定位

PruneMem Steps 0–4 completed the host-agnostic refactor: all 14 core scripts in `src/core/` are now importable as libraries, and `src/lib/paths.js` provides a unified path-resolution contract (`getPaths` with `default` / `isolated` / `custom` presets). Step 3 lib 化共覆盖 13 个消费 `paths.js` 的核心脚本；`checkProviderConfig` 是第 14 个已 lib 化但不消费 `paths` 的诊断 export，详见 `mcp-tool-inventory.md`. Step 5 introduces an MCP server so that any MCP-capable host (Claude Desktop, Cline, etc.) can invoke PruneMem capabilities without spawning CLI processes.

This document is the authoritative design spec for Step 5. Code implementation happens in Phases B–D; Phase A (this document) locks all architectural decisions before coding begins.

---

## 2. 范围（Scope）

**In-scope:**

- A single MCP server (`src/mcp/server.js`) exposing PruneMem core functions as MCP tools.
- `stdio` transport only.
- Tool naming under the `prunemem_` prefix.
- Parameter passthrough (`workspace` / `preset` / `override`) with zero path computation in the MCP layer.
- Default dry-run for write-capable tools, requiring explicit `write: true` to mutate disk.
- Two MVP tools (`prunemem_archive_session`, `prunemem_runtime_context`) implemented first.
- Documentation of the full intended tool inventory (see `mcp-tool-inventory.md`).

**Out-of-scope:**

- **HTTP transport.** No SSE or HTTP POST endpoints. Deferred until a real host requires it.
- **Hermes adapter.** Host-specific integration belongs in Step 6 (`src/hosts/hermes/`), not the MCP layer.
- **OpenClaw adapter.** Same as above.
- **Read-path retrieval capability.** PruneMem does not expose a "search / retrieve memories" interface to hosts. The read path is the host's responsibility (see `docs/faq.md` — "QMD is not a hard dep"). `retrieve-memory.js` remains dead code and is not exposed as an MCP tool.
- **New runtime dependencies other than `@modelcontextprotocol/sdk`.**
- **Modifications to core business logic or path resolution algorithms.**

---

## 3. 决策记录（D1–D6）

### D1 — Transport: stdio only

**Decision:** The MCP server uses `stdio` transport exclusively.

**Reason:**
- `stdio` is the lowest-friction integration for Claude Desktop and most MCP clients today.
- HTTP/SSE adds operational complexity (port management, CORS, keepalive) with no current consumer.
- If a host truly needs HTTP, the server can be wrapped externally (e.g., `mcp-proxy`) without changing PruneMem code.

### D2 — Packaging: same repo, same package

**Decision:** The MCP server lives in `src/mcp/` within the existing `prunemem` package. No separate npm package or repo.

**Reason:**
- The MCP server is a thin schema + serialization layer over existing `src/core/` and `src/lib/` code.
- Splitting into a separate package would create versioning friction and circular dependency risks.
- `package.json` gains one `bin` entry (`prunemem-mcp`) pointing at `src/mcp/server.js`.

### D3 — Tool naming: `prunemem_` prefix

**Decision:** All exposed tools use the `prunemem_` prefix (e.g., `prunemem_archive_session`).

**Reason:**
- MCP hosts flatten tool namespaces. A generic name like `archive_session` risks collision with other MCP servers.
- The prefix makes provenance unambiguous in multi-server environments.
- Internal core function names (camelCase) are converted to snake_case for MCP tool names.

### D4 — Path resolution: MCP layer does not resolve paths

**Decision:** The MCP layer performs no path computation. `workspace`, `preset`, `override`, and optionally `paths` are schema-validated and passed verbatim to the underlying core function, which delegates to `getPaths()`.

**Reason:**
- CLI / lib / MCP must have identical parameter semantics. If MCP computed paths differently, host adapters would need three mental models instead of one.
- `getPaths()` already handles `preset`, `override`, and D3 coupling. Duplicating this in the MCP layer invites drift.
- Security: keeping path resolution in one audited location (`src/lib/paths.js`) reduces attack surface.

### D5 — Dry-run: write-class tools default to no-op

**Decision:** Tools that mutate disk default to dry-run. An explicit `write: true` parameter is required to persist changes. This aligns with the D6 breaking change in `update-registries.js` (0.4.0).

**Reason:**
- Prevents accidental workspace contamination when an MCP client autonomously calls a tool.
- Matches the existing behavior of `updateRegistries`, `curatorApply`, `repairSourcePaths`, and `updateWorkingState`.
- Makes tool calls idempotent-by-default, which is safer for LLM-driven agents that may retry or hallucinate invocations.

### D6 — MVP tools: `prunemem_archive_session` + `prunemem_runtime_context`

**Decision:** Phase B implements only two tools:
- `prunemem_archive_session` (read-class, computes a structured session archive without disk writes)
- `prunemem_runtime_context` (read-class, retrieves the current runtime context bundle)

**Reason:**
- These two tools exercise both the read and write paths of the MCP layer without requiring the full inventory.
- `archive_session` covers the session-packet input contract (PruneMem's primary external API).
- `runtime_context` covers the read path that hosts are most likely to query during a conversation turn.
- Once the MVP pair validates the transport + schema + error handling patterns, remaining tools roll out in Phase C with minimal risk.

---

## 4. Phase 拆解

| Phase | Status | Scope | Deliverables |
|---|---|---|---|
| **A** | **进行中** | Design docs only | `docs/mcp-design.md` (this doc), `docs/mcp-tool-inventory.md` |
| **B** | 待规划 | MVP server + 2 tools | `src/mcp/server.js`, `src/mcp/tools.js`, `package.json` bin entry, `@modelcontextprotocol/sdk` dependency |
| **C** | 待规划 | Roll out remaining tools | Expand `src/mcp/tools.js` per inventory order; each tool is a thin wrapper around one core function |
| **D** | 待规划 | Regression + integration | `npx @modelcontextprotocol/inspector` passes; Claude Desktop end-to-end; `npm run check` passes |

**Phase B entry point (locked):**
1. Add `@modelcontextprotocol/sdk` to `dependencies`.
2. Add `"prunemem-mcp": "./src/mcp/server.js"` to `package.json` `bin`.
3. Create `src/mcp/server.js` — stdio server setup, tool registration.
4. Create `src/mcp/tools.js` — two MVP tool handlers.
5. Run `npx @modelcontextprotocol/inspector node src/mcp/server.js` and verify both tools list and execute.

**Phase C rolling mode (locked):**
- Read-class tools first (`prunemem_validate_maintenance`, `prunemem_get_working_state`, `prunemem_execution_plan`), because they are side-effect-free and safer to test in live MCP clients.
- Write-class tools second, ordered by blast radius: `prunemem_update_registries` (single registry) → `prunemem_curator_apply` (multi-registry) → `prunemem_repair_source_paths` → `prunemem_update_working_state` → composite tools (`prunemem_maintain`, `prunemem_run_sample_pipeline`).
- Each tool addition is an atomic commit: one tool + its inspector verification.

**Phase D regression形态 (locked):**
- Inspector-based smoke test: list tools, call each with minimal valid input, assert `ok: true`.
- No golden diff for MCP layer (MCP output is JSON-RPC wrapped; the core function output inside is what golden checks verify).
- `npm run check` must still pass (default preset, no MCP involvement).

---

## 5. MVP 详细设计

### 5.1 `prunemem_archive_session`

**Mapped core function:** `archiveSessionV41` (`src/core/archive-session-v41.js`)

**Tool name:** `prunemem_archive_session`

**Description:** Archive a session from a workspace into a structured V4.1 session packet. Returns the archive object without writing to disk (the underlying function is compute-only).

**Input schema:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | `string` | No | `process.cwd()` | Workspace root directory. |
| `packet` | `string` | No | — | Absolute or relative path to `session-packet.json`. If omitted, the underlying core function (`archiveSessionV41`) resolves a workspace-relative default. Refer to its implementation for the exact fallback. |
| `state` | `string` | No | — | Absolute or relative path to `working-state.json`. If omitted, the underlying core function (`archiveSessionV41`) resolves a workspace-relative default. Refer to its implementation for the exact fallback. |
| `memory_version` | `string` | No | `"v4.1"` | Memory schema version. |
| `preset` | `string` | No | `"default"` | Path preset: `"default"`, `"isolated"`, or `"custom"`. |
| `override` | `object` | No | `{}` | Partial path override object. Shallow-merged into preset base. |

**Output schema (tool result `content` array, text item):**

```json
{
  "ok": true,
  "archive": { /* V4.1 session archive object */ }
}
```

**Error forms:**
- File not found (`ENOENT`) → tool returns `isError: true` with `content.text` containing `{"ok": false, "error": "file not found: <path>"}`.
- JSON parse error → `{"ok": false, "error": "invalid JSON: <message>"}`.
- Any unexpected throw → caught by MCP server wrapper, serialized to JSON error object.

---

### 5.2 `prunemem_runtime_context`

**Mapped core function:** `buildRuntimeContext` (`src/core/build-runtime-context.js`)

**Tool name:** `prunemem_runtime_context`

**Description:** Build the runtime context, execution context, and context bundle from a workspace's working state and execution plan. Pure read; no disk writes.

**Input schema:**

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | `string` | No | `process.cwd()` | Workspace root directory. |
| `state` | `string` | No | — | Path to `working-state.json`. If omitted, the underlying core function (`buildRuntimeContext`) resolves a workspace-relative default. Refer to its implementation for the exact fallback. |
| `plan` | `string` | No | — | Path to `execution-plan.json`. If omitted, the underlying core function (`buildRuntimeContext`) resolves a workspace-relative default. Refer to its implementation for the exact fallback. |
| `preset` | `string` | No | `"default"` | Path preset. |
| `override` | `object` | No | `{}` | Partial path override. |

**Output schema:**

```json
{
  "ok": true,
  "runtimeContext": { /* runtime context object */ },
  "executionContext": { /* execution context object or null */ },
  "bundle": { /* context bundle object */ }
}
```

**Error forms:** Same pattern as 5.1 (`ENOENT`, JSON parse, unexpected throw).

---

## 6. 参数透传规范（D4 细则）

The MCP layer is a **thin proxy**. It does not:
- Call `path.resolve()`
- Call `getPaths()`
- Validate that `workspace` exists on disk
- Interpret `override` keys

It does:
1. **Schema validation** — ensure types match (string vs boolean vs object). Reject with a clear MCP error if a required field is missing or a type is wrong.
2. **Passthrough** — forward `workspace`, `preset`, and `override` exactly as received.
3. **Serialization** — await the core function, JSON-stringify the result, and place it in the MCP `content` array.

> **MCP tools 不接受预解析的 `paths` 参数。** 需要绕过 preset 机制的宿主应直接以 lib 形式调用 core 函数，不经过 MCP 层。

**Example handler skeleton:**

```js
// src/mcp/tools.js (illustrative)
import { archiveSessionV41 } from '../core/archive-session-v41.js';

export const archiveSessionTool = {
  name: 'prunemem_archive_session',
  inputSchema: { /* see §5.1 */ },
  async handler(args) {
    const params = {};
    if (args.workspace !== undefined) params.workspace = args.workspace;
    if (args.preset !== undefined) params.preset = args.preset;
    if (args.override !== undefined) params.override = args.override;
    if (args.packet !== undefined) params.packet = args.packet;
    if (args.state !== undefined) params.state = args.state;
    if (args.memory_version !== undefined) params.memoryVersion = args.memory_version;

    const result = await archiveSessionV41(params);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  },
};
```

---

## 7. dry-run 行为规范（D5 细则）

### Default

For all write-class tools, the default value of `write` is **`false`**. Without explicit `write: true`, the tool performs any computation but does **not** persist changes to disk.

### Explicit `write: true`

When `write: true` is provided, the tool delegates to the core function with `write: true`, allowing disk mutation.

### Dry-run return value structure

Write-class tools MUST include `write: boolean` in their return object so the caller knows whether mutation occurred:

```json
{
  "ok": true,
  "write": false,
  "inserted": 3,
  "files": { ... }
}
```

### Per-tool dry-run applicability

| Tool | dry-run applicable? | Notes |
|---|---|---|
| `prunemem_archive_session` | No (read-class — underlying function is compute-only) | — |
| `prunemem_runtime_context` | No | Read-only. |
| `prunemem_validate_maintenance` | No | Read-only. |
| `prunemem_get_working_state` | No | Read-only. |
| `prunemem_execution_plan` | No | Read-only. |
| `prunemem_check_provider_config` | No | Read-only. |
| `prunemem_update_registries` | Yes | Default `write: false`. |
| `prunemem_curator_apply` | Yes | Default `write: false`. |
| `prunemem_repair_source_paths` | Yes | Default `write: false`. |
| `prunemem_update_working_state` | Yes | Default `write: false`. |
| `prunemem_maintain` | Yes | Default `write: false`; propagates to downstream. |
| `prunemem_run_sample_pipeline` | Yes | Default `write: false`; propagates to `updateRegistries`. |
| `prunemem_run_extract` | N/A | Not exposed as standalone MCP tool. R1 resolution: Option A. |
| `prunemem_run_judge` | N/A | Not exposed as standalone MCP tool. R1 resolution: Option A. |

### Error on write failure

If `write: true` is passed and the core function throws during write (e.g., `ENOENT`, permission denied), the tool returns `isError: true` with the exception message serialized in the content text.

---

## 8. 错误处理规范

### MCP protocol errors vs tool return errors

**MCP protocol errors** (returned via `mcp.server` error channel):
- Invalid JSON-RPC message from client.
- Tool name not found.
- Schema validation failure (wrong type, missing required field).
- Internal server crash (unhandled rejection in the handler wrapper).

**Tool return errors** (returned as `content` text with `isError: true`):
- Business-logic failures (file not found, invalid input JSON, provider auth missing).
- Core function throws that are expected under normal operation (e.g., missing workspace files).

**Rationale:** MCP protocol errors indicate "the server or the call itself is broken." Tool return errors indicate "the tool ran correctly but the operation failed for business reasons." This distinction lets MCP clients decide whether to retry (protocol error) or report to the user (business error).

### Error code naming convention

Tool-level errors use a simple object shape; no numeric error codes:

```json
{
  "ok": false,
  "error": "human-readable description"
}
```

If the core function returns a richer error structure (e.g., `validateMaintenance` returns `notes` array), the tool forwards it verbatim inside the `content` text.

### Structured non-throw errors from core

Some core functions return `{ ok: false, notes: [...] }` or similar structured failure objects without throwing (e.g., `validateMaintenance`, `curatorApply`). These are forwarded as normal tool results (`isError: false`), with the full object placed in `content.text`. `isError: true` is reserved for cases where the MCP layer itself cannot proceed: schema validation failure, uncaught throw from the core function, or transport-level failure.

---

## 9. 与 lib 的契约边界

The MCP layer is strictly limited to three responsibilities:

1. **Schema validation** — Validate incoming args against the tool's JSON Schema before calling core.
2. **Call lib** — Import and await the corresponding core function with correctly mapped parameters.
3. **Serialize return** — JSON-stringify the core function result and place it in an MCP `text` content item.

The MCP layer does **not**:
- Resolve filesystem paths.
- Implement business logic (scoring, merging, deduplication).
- Retain state across calls.
- Cache results.
- Spawn child processes.
- Read environment variables except for stdio transport setup (if required by the SDK).

This boundary ensures that:
- Core functions remain testable in isolation (`node --test`).
- The MCP server can be replaced by an HTTP wrapper later without touching core.
- Bugs are localized: if a result is wrong, the bug is in core; if a client can't call a tool, the bug is in the MCP layer.

---

## 10. 与未来 Phase 的接口

### Phase B → Phase C handoff

Phase B ends when `prunemem_archive_session` and `prunemem_runtime_context` pass inspector smoke tests. The handoff artifact is:
- A working `src/mcp/server.js` + `src/mcp/tools.js` pattern that Phase C replicates for each additional tool.
- A validated parameter-mapping convention (§6) that remains unchanged.

### Phase C → Phase D handoff

Phase C ends when all tools in `mcp-tool-inventory.md` are implemented. The handoff artifact is:
- A complete `tools.js` with all tool handlers.
- An updated `run-checks.sh` or new `tests/regression/check-mcp-server.js` that launches the server in a subprocess and asserts tool listing + MVP invocation.

### Phase D → Step 6 handoff

Phase D validates end-to-end behavior in Claude Desktop. If Step 6 introduces host adapters (`src/hosts/openclaw/`, `src/hosts/hermes/`), they may consume the same core functions directly (as libraries) or via MCP. The MCP server design is intentionally agnostic to host adapter internals.

### Step 4 遗留项

Step 4 follow-up 中的 F1–F5 项（见 `docs/step4-followup.md`）被有意推迟。如果其中任何一项影响 MCP 层行为——特别是 F2（ensureDir 契约）可能在 Phase B 写 server 文件时浮现——它将在 Phase C 收尾前处理，而非在 Phase B MVP 期间解决。

---

## 11. 风险 & 决议记录

### R1 — `runExtract` / `runJudge` unconditional write vs D5 dry-run default

**Resolved:** Option A. `runExtract` / `runJudge` are **not exposed as standalone MCP tools**. Agents that need extract/judge capabilities should call `prunemem_run_sample_pipeline` (which internally orchestrates the full extract → judge → update-registries flow).

**Decision context (Options preserved for reference):**
- A. Do not expose them as standalone MCP tools; only expose `runSamplePipeline` (which has `write: false` default and propagates to `updateRegistries`, though not to `runExtract`/`runJudge`).
- B. Expose them but add an MCP-layer `write: false` mode that skips the call and returns a preview/dry-run stub.
- C. Accept the inconsistency: these two tools always write, document it prominently, and rely on `isolated` preset for safety.

**Rationale:** Option A keeps the MCP surface minimal and avoids D5 violations. The underlying unconditional write behavior of `runExtract`/`runJudge` is an internal implementation detail of the composite pipeline, not a first-class MCP operation.

### R2 — MCP schema drift from core function signatures

**Risk:** As core functions evolve (new parameters, renamed fields), the MCP tool schema may drift.

**Mitigation:** Keep the MCP layer thin (§9). When core changes, the MCP schema change should be a 1:1 reflection. Add a checklist item to future core PR templates: "If you changed a core function export signature, update the corresponding MCP tool schema in `src/mcp/tools.js`."

### R3 — No deterministic test for LLM-dependent tools

**Risk:** `runExtract`, `runJudge`, and by extension `runSamplePipeline` require LLM calls. MCP inspector tests would be non-deterministic and require API keys.

**Mitigation:** Core already supports `--mock` mode (see `known-issues.md` Issue #2). MCP tools for these functions must expose a `mock: boolean` parameter that is passed through to core. Inspector tests use `mock: true`.

### R4 — `@modelcontextprotocol/sdk` version pinning

**Risk:** The SDK is under active development. A future minor version may introduce breaking changes.

**Mitigation:** Pin to an exact version in `package.json` (e.g., `"@modelcontextprotocol/sdk": "1.0.4"`). Upgrade only in a dedicated dependency-bump commit with full inspector regression.

---

## 12. 引用

- `docs/refactor-plan.md` — Step 5 entry point and overall 0.3 refactor plan.
- `docs/paths-design.md` — D1–D6 path abstraction decisions; §3.3 D4 `paths` parameter priority.
- `docs/paths.md` — Host adapter integration guide; `getPaths()` API reference.
- `docs/step4-followup.md` — F1–F5 deferred items (some may affect MCP layer, e.g., F2 ensureDir contract).
- `docs/known-issues.md` — Issue #1 (closed), Issue #2 (mock mode baselines).
- `docs/contracts.md` — Session-packet schema (input contract for `archive_session`).

---

## 13. Step 6 相关决议（接入工程化）

本节记录 Step 6（让 PruneMem 接入 Hermes / Claude Code / Codex CLI）阶段的关键决议。Step 6 不修改 Step 5 已定型的协议接入面（11 个 tool、协议级 `prunemem_` 前缀、4 大不变量），只做接入文档、配置示例、单一事实源守护、可选的 skill 集成。

### S6.1 — Hermes server name 决策

Hermes 加载外部 MCP server 时会做前缀化注册：
- 规则：`mcp_<server_name>_<tool_name>`
- server 名中的连字符和点号会被改写为下划线

PruneMem 的协议级 tool 命名（Step 5 D3 决议）已经是 `prunemem_*` 前缀（物理化为 11 个 tool 测试守护，不可变）。Hermes 接入会形成**双前缀**：

- 在 Hermes 中，PruneMem 的 `prunemem_archive_session` 实际暴露为 `mcp_prunemem_prunemem_archive_session`

**决议**：server name 仍取为 `prunemem`，接受双前缀。理由：

1. 反对方案：把 server name 取短（如 `mem`/`pm`）会让 Hermes 配置中的 server name 与 PruneMem 项目名脱节，反而让用户疑惑
2. 反对方案：回头改 PruneMem tool 命名（删除 `prunemem_` 前缀）会破坏 D3 决议、破坏 11 条物理测试，代价过大
3. 双前缀只在 Hermes 这一个 host 出现——Claude Code / Codex CLI 的命名空间机制没有这个问题
4. 用户写 Hermes 的 `tools.include` 过滤时，使用的是**原始 MCP tool 名**（即 `prunemem_archive_session`），双前缀只影响模型运行时看到的名字，不影响配置层
5. Hermes 接入文档将显式说明这个冗余，告诉用户"这是 Hermes 前缀化 + PruneMem 协议级前缀的叠加，是设计取舍"

### S6.2 — tool 数量单一事实源

调研报告（`docs/research/prunemem-integration-research.md`，Step 6 引入）指出 agentmemory 在 README 标 43 tools 但实际 51 tools——文档与代码漂移。

PruneMem 当前 11 个 tool，Step 6 之后会有 README + mcp-surface.md + 3 份 host 文档 + 1 份 SKILL.md，至少 6 处提及 tool 数量。

**决议**：实现 `scripts/check-tool-count.js`，在 `run-checks.sh` 中作为新增 check（check 15）运行：

1. 数 `src/mcp/server.js` 的 `TOOLS` 数组中 tool 模块数量，作为权威数字
2. 强制校验：`README.md` / `docs/mcp-server.md` / `docs/mcp-tools.md` 中所有"PruneMem 提供 N 个 tool"类的数字声明必须等于 TOOLS 数组的实际数量
3. 弱校验：文档中出现的 `prunemem_X` 模式，每个 X 必须在 TOOLS 数组中存在（避免文档引用已删除的 tool）

实现细节见 `scripts/check-tool-count.js` 的内嵌注释。

### S6.3 — 接入文档语言：中英双版

Step 5 内部 design doc 用中文。Step 6 接入文档面向外部用户（包括英文社区），决议每份接入文档产出**中英两版**：

- 中文版：`docs/integrations/hermes.zh.md` / `docs/integrations/claude-code.zh.md` / `docs/integrations/codex-cli.zh.md`
- 英文版：`docs/integrations/hermes.md` / `docs/integrations/claude-code.md` / `docs/integrations/codex-cli.md`
- README 同样维护双版：`README.md`（英文为主） + `README.zh.md`（中文）

双版维护成本由 S6.2 的单一事实源脚本兜底——tool 数量、tool 名一致性通过脚本守护，避免中英版漂移。

### S6.4 — Hermes 示范 SKILL.md 位置

Phase 6.5 将产出一份 Hermes 可加载的 SKILL.md。**决议**放在 `skills/prunemem/SKILL.md`，作为真正可加载产物（用户可以直接复制到 `~/.hermes/skills/`）。

这条决议要求 PruneMem repo 增加新顶级目录 `skills/`，在本 phase 的 Step C 骨架创建中处理。

### S6.5 — 版本号：跳到 v0.3.0

GitHub 上已有 v0.1.0（2026-03-14）和 v0.2.0。Step 5 之前的本地与 GitHub 完全脱钩——本地 Step 1-5 的工作没有基于 GitHub 任何历史。

**决议**：Step 6 完成后（预计在 Phase 6.3 同步到 GitHub 时）发布 v0.3.0。跳过 v0.2.0 的渐进改进路径，直接到 v0.3.0 标志 MCP 接入是新方向。

GitHub 上 v0.1.0/v0.2.0 的 release 原样保留（D12 决议）。GitHub 当前 main 在同步前会备份到 `pre-mcp` 分支（D11 决议）。
