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
| `curatorApply` | `prunemem_curator_apply` | write | 否 | — | `workspace`, `write`, `limit`, `preset`, `override` | 是 | `write` 默认 `false`。治理多 active memory、合并 context note。Phase C 第 2 批。`limit` 参数(number 类型,默认 100)当前未暴露:validate.js 仅支持 string/object/boolean 校验,且 limit 是内部调优旋钮(防止单次处理过多),非用户-facing 业务参数。如未来需要暴露,需先扩展 validate.js 支持 number 类型并评估是否给 Agent 调优权限。**注意**:此处不暴露的理由是技术限制+业务判断,与 M2 paths 不暴露(永久设计决议)不是同一类。 |
| `executionPlan` | `prunemem_execution_plan` | read | 否 | — | `workspace`, `input` | 否 | 纯读。从 execution-plan input 生成 plan + milestoneState + executionContext。Phase C 第 1 批。唯一一个不接受 preset/override 的 core 函数；MCP schema 应仅声明 workspace 和 input 两个字段，不要照抄其他 tool 的 preset/override 模板。 |
| `getWorkingState` | `prunemem_get_working_state` | read | 否 | — | `workspace`, `input`, `preset`, `override` | 否 | 纯读。返回 parsed working state JSON。Phase C 第 1 批。 |
| `maintain` | `prunemem_maintain` | write | 否 | — | `workspace`, `write`, `strict`, `repair_source_paths`, `timeout_ms`, `preset`, `override` | 是 | 组合工具：validate → curator-apply → [repair] → validate。`timeout_ms` 已废弃但保留兼容。Phase C 第 3 批。`timeoutMs` 参数(number 类型,默认 120000)当前未暴露:该字段自 Step 2b refactor 起已废弃(deprecated,仅打印 warning,no-op),不应出现在新的 MCP schema 中——暴露会让 Agent 误以为是可用参数,造成协议级误导。**注意**:此处不暴露的理由是"字段已废弃",与 `curatorApply.limit` 不暴露(技术限制+业务判断,见 curatorApply 备注)和 M2 paths 不暴露(永久设计决议)**三者性质各不相同**。即使未来 validate.js 扩展支持 number 类型,`timeoutMs` 仍不暴露。 |
| `repairSourcePaths` | `prunemem_repair_source_paths` | write | 否 | — | `workspace`, `write`, `preset`, `override` | 是 | 从 registry 反推缺失的 pipeline artifact 并写 placeholder。`write` 默认 `false`。Phase C 第 2 批。 |
| `runExtract` | `prunemem_run_extract` | write | 否（不暴露） | — | `workspace`, `input`, `output`, `mock`, `preset`, `override` | N/A | 不直接暴露为 MCP tool；通过 `prunemem_run_sample_pipeline` 间接调用。R1 决议见 `mcp-design.md` §11。 |
| `runJudge` | `prunemem_run_judge` | write | 否（不暴露） | — | `workspace`, `input`, `output`, `mock`, `preset`, `override` | N/A | 不直接暴露为 MCP tool；通过 `prunemem_run_sample_pipeline` 间接调用。R1 决议见 `mcp-design.md` §11。 |
| `runSamplePipeline` | `prunemem_run_sample_pipeline` | write | 否 | — | `workspace`, `mock`, `write`, `preset`, `override` | 是 | Phase C 第 3 批，组合工具。写盘细节见下方说明。 |
| `updateRegistries` | `prunemem_update_registries` | write | 否 | — | `workspace`, `judged`, `source_paths`, `memory_id`, `channel`, `agent`, `write`, `preset`, `override` | 是 | `write` 默认 `false`（0.4.0 breaking change）。向 registry jsonl 插入 judged items。Phase C 第 2 批。 |
| `updateWorkingState` | `prunemem_update_working_state` | write | 否 | — | `workspace`, `input`, `state`, `write`, `preset`, `override` | 是 | `write` 默认 `false`。合并 delta 到 working state 并可选写盘。Phase C 第 2 批。 |
| `validateMaintenance` | `prunemem_validate_maintenance` | read | 否 | — | `workspace`, `strict`, `preset`, `override` | 否 | 纯读。检查 registry 一致性、source_paths 可达性、MEMORY.md 重复 bullet。Phase C 第 1 批。 |

---

## ⚠️ prunemem_run_sample_pipeline 写盘行为说明

`prunemem_run_sample_pipeline` 的 `write` 参数**仅控制最终 `updateRegistries` 步骤**是否向 registry jsonl 落盘。其内部调用的 `runExtract` 和 `runJudge` 步骤会**无条件写入 `.generated.json` 中间产物**（这是底层 core 函数的当前行为，不受 `write` 开关影响）。

因此，调用方传入 `write: false` **不等于完全不动盘**。如需在调用 pipeline 时确保零副作用，应使用 `preset: 'isolated'` 将写路径重定向到隔离目录。

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

4. **Batch 4 — 已取消。** `prunemem_run_extract` / `prunemem_run_judge` 不直接暴露为 MCP tool（R1 决议选 A）。LLM-dependent 的完整 pipeline 通过 `prunemem_run_sample_pipeline` 提供。

**Deferred beyond Phase C:**
- `prunemem_check_provider_config` — Not exposed unless Step 6 host adapter needs runtime provider validation.

---

## 显式不暴露

以下 export 有意不暴露为 MCP tool：

- `checkProviderConfig` — 不消费 `paths.js`，对 MCP host 直接价值有限，Step 6 之前不暴露。
- `runExtract` — R1 决议（选 A），通过 `runSamplePipeline` 间接使用。
- `runJudge` — 同上。
