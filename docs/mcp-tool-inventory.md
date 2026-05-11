# MCP Tool Inventory

This document catalogs every exported core function and its proposed MCP tool mapping. It is the authoritative reference for Phase C rolling implementation.

**Nomenclature:**
- **lib 函数** — The JavaScript export in `src/core/*.js`.
- **拟 tool 名** — The MCP tool name (snake_case, `prunemem_` prefix per D3).
- **类型** — `read` (no disk mutation) or `write` (mutates disk or produces artifacts).
- **MVP?** — Included in Phase B (`prunemem_archive_session`, `prunemem_runtime_context`).
- **dry-run 适用** — Whether the D5 dry-run default applies.

---

## Inventory Table

| lib 函数 | 拟 tool 名 | 类型 | MVP? | 必选参数 | 可选参数 | dry-run 适用 | 备注 |
|---|---|---|---|---|---|---|---|
| `archiveSessionV41` | `prunemem_archive_session` | read | **是** | — | `workspace`, `packet`, `state`, `memory_version`, `preset`, `override` | 否 | 当前为 compute-only。如未来 core 加入 write 能力，按 R3 流程同步 schema。 |
| `buildRuntimeContext` | `prunemem_runtime_context` | read | **是** | — | `workspace`, `state`, `plan`, `preset`, `override` | 否 | 纯读。返回 `runtimeContext` + `executionContext` + `bundle`。 |
| `checkProviderConfig` | `prunemem_check_provider_config` | read | 否 | — | `workspace` | 否 | 不涉及 `paths.js`，仅检查 `adapters/` provider 配置。对 MCP host 直接价值有限，暂不暴露；如 Step 6 有诊断需求再上线。 |
| `curatorApply` | `prunemem_curator_apply` | write | 否 | — | `workspace`, `write`, `limit`, `preset`, `override` | 是 | `write` 默认 `false`。治理多 active memory、合并 context note。Phase C 第 2 批。 |
| `executionPlan` | `prunemem_execution_plan` | read | 否 | — | `workspace`, `input` | 否 | 纯读。从 execution-plan input 生成 plan + milestoneState + executionContext。Phase C 第 1 批。 |
| `getWorkingState` | `prunemem_get_working_state` | read | 否 | — | `workspace`, `input`, `preset`, `override` | 否 | 纯读。返回 parsed working state JSON。Phase C 第 1 批。 |
| `maintain` | `prunemem_maintain` | write | 否 | — | `workspace`, `write`, `strict`, `repair_source_paths`, `timeout_ms`, `preset`, `override` | 是 | 组合工具：validate → curator-apply → [repair] → validate。`timeout_ms` 已废弃但保留兼容。Phase C 第 3 批。 |
| `repairSourcePaths` | `prunemem_repair_source_paths` | write | 否 | — | `workspace`, `write`, `preset`, `override` | 是 | 从 registry 反推缺失的 pipeline artifact 并写 placeholder。`write` 默认 `false`。Phase C 第 2 批。 |
| `runExtract` | `prunemem_run_extract` | write | 否 | — | `workspace`, `input`, `output`, `mock`, `preset`, `override` | **TBD** | 无条件写盘（无 `write` 开关）。需先解决 `mcp-design.md` R1 再暴露。Phase C 第 4 批。 |
| `runJudge` | `prunemem_run_judge` | write | 否 | — | `workspace`, `input`, `output`, `mock`, `preset`, `override` | **TBD** | 无条件写盘（无 `write` 开关）。需先解决 `mcp-design.md` R1 再暴露。Phase C 第 4 批。 |
| `runSamplePipeline` | `prunemem_run_sample_pipeline` | write | 否 | — | `workspace`, `mock`, `write`, `preset`, `override` | 是 | 组合工具：extract → judge → update-registries。`write` 默认 `false`，透传给 `updateRegistries`。`mock` 参数支持 deterministic test。Phase C 第 3 批。 |
| `updateRegistries` | `prunemem_update_registries` | write | 否 | — | `workspace`, `judged`, `source_paths`, `memory_id`, `channel`, `agent`, `write`, `preset`, `override` | 是 | `write` 默认 `false`（0.4.0 breaking change）。向 registry jsonl 插入 judged items。Phase C 第 2 批。 |
| `updateWorkingState` | `prunemem_update_working_state` | write | 否 | — | `workspace`, `input`, `state`, `write`, `preset`, `override` | 是 | `write` 默认 `false`。合并 delta 到 working state 并可选写盘。Phase C 第 2 批。 |
| `validateMaintenance` | `prunemem_validate_maintenance` | read | 否 | — | `workspace`, `strict`, `preset`, `override` | 否 | 纯读。检查 registry 一致性、source_paths 可达性、MEMORY.md 重复 bullet。Phase C 第 1 批。 |

---

## Phase C Rolling Order

Tools are rolled out in four batches, matching the risk surface:

1. **Batch 1 — Read-only tools** (side-effect-free, safe to test in live clients):
   - `prunemem_validate_maintenance`
   - `prunemem_get_working_state`
   - `prunemem_execution_plan`

2. **Batch 2 — Single-target write tools** (dry-run by default, limited blast radius):
   - `prunemem_update_registries`
   - `prunemem_curator_apply`
   - `prunemem_repair_source_paths`
   - `prunemem_update_working_state`

3. **Batch 3 — Composite tools** (orchestrate multiple core functions):
   - `prunemem_maintain`
   - `prunemem_run_sample_pipeline`

4. **Batch 4 — LLM-dependent tools** (require `mock: true` for deterministic testing, unconditional write):
   - `prunemem_run_extract`
   - `prunemem_run_judge`
   - Decision on R1 (unconditional write vs D5) must be made before this batch starts.

**Deferred beyond Phase C:**
- `prunemem_check_provider_config` — Not exposed unless Step 6 host adapter needs runtime provider validation.

---

## 显式不暴露

All 14 exported core functions are accounted for in the inventory table above. There are **no pure internal helpers** in `src/core/` that lack an export and would be candidates for MCP exposure. The `src/core/` directory contains exclusively CLI entry points that have been lib-ized; any true internal helpers (e.g., `readJson`, `writeJsonl`, `groupBy`) are file-local functions, not exports, and therefore correctly excluded from the inventory.

The only function that is intentionally **not exposed as an MCP tool** within Step 5 is `checkProviderConfig`. It is listed in the inventory table (rather than here) because it is a genuine export, but its exposure is deferred to Step 6+ with the following rationale:
- It does not consume `paths.js` and is therefore outside the host-agnostic path contract.
- Its purpose is internal provider diagnostics; an MCP host typically does not need to inspect PruneMem's model provider configuration.
- If a future host adapter requires provider health checks, it can be enabled with zero schema changes.
