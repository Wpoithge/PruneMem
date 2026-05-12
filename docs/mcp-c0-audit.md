# Step 5 Phase C-0 — Tool Inventory Audit

## Scope discovery

Audit 范围由 `docs/mcp-tool-inventory.md` 中 **MVP? = 否** 的行确定。

- Inventory 中 MVP? = 否 的行共 **12** 个（含 3 个标注"不暴露"）。
- 按任务要求跳过显式不暴露项：`checkProviderConfig`、`runExtract`、`runJudge`。
- 实际 audit 工具数：**9** 个。
- Audit 范围与 Phase A 末预期一致：Batch 1（read）3 个 + Batch 2（single-write）4 个 + Batch 3（composite）2 个。

| 拟 tool 名 | lib 函数 | 实际路径 |
|---|---|---|
| `prunemem_curator_apply` | `curatorApply` | `src/core/curator-apply.js` |
| `prunemem_execution_plan` | `executionPlan` | `src/core/execution-plan.js` |
| `prunemem_get_working_state` | `getWorkingState` | `src/core/get-working-state.js` |
| `prunemem_maintain` | `maintain` | `src/core/maintain.js` |
| `prunemem_repair_source_paths` | `repairSourcePaths` | `src/core/repair-source-paths.js` |
| `prunemem_run_sample_pipeline` | `runSamplePipeline` | `src/core/run-sample-pipeline.js` |
| `prunemem_update_registries` | `updateRegistries` | `src/core/update-registries.js` |
| `prunemem_update_working_state` | `updateWorkingState` | `src/core/update-working-state.js` |
| `prunemem_validate_maintenance` | `validateMaintenance` | `src/core/validate-maintenance.js` |

## Audit results

### Per-tool findings

#### `prunemem_curator_apply` — STATUS: 匹配

- **Core function**: `src/core/curator-apply.js` → `curatorApply`
- **Actual signature**:
  ```js
  export async function curatorApply({
    workspace,
    write = false,
    limit = 100,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `write`, `limit`, `preset`, `override`
- **Findings**:
  - 全部 5 个可选参数与 inventory 一致。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据），inventory 未列，符合 M2 决议。
  - `write` 默认 `false`，与 inventory 备注一致。
- **Action**: No action.

#### `prunemem_execution_plan` — STATUS: 匹配

- **Core function**: `src/core/execution-plan.js` → `executionPlan`
- **Actual signature**:
  ```js
  export async function executionPlan({
    workspace,
    input: inputPath,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `input`
- **Findings**:
  - `input: inputPath` 为内部 rename，调用方参数名仍为 `input`。
  - Core 函数**无** `preset` / `override` / `paths` 参数；inventory 未列，一致。
  - 纯读操作，类型 `read` 正确。
- **Action**: No action.

#### `prunemem_get_working_state` — STATUS: 匹配

- **Core function**: `src/core/get-working-state.js` → `getWorkingState`
- **Actual signature**:
  ```js
  export async function getWorkingState({
    workspace,
    input: inputPath,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `input`, `preset`, `override`
- **Findings**:
  - `input: inputPath` 为内部 rename，调用方参数名仍为 `input`。
  - 全部 4 个可选参数与 inventory 一致。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据）。
- **Action**: No action.

#### `prunemem_maintain` — STATUS: 匹配

- **Core function**: `src/core/maintain.js` → `maintain`
- **Actual signature**:
  ```js
  export async function maintain({
    workspace,
    write = false,
    strict = false,
    repairSourcePaths = false,
    timeoutMs = 120000,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `write`, `strict`, `repair_source_paths`, `timeout_ms`, `preset`, `override`
- **Findings**:
  - 全部 7 个可选参数与 inventory 一致。
  - `repairSourcePaths`（camelCase）映射到 MCP `repair_source_paths`（snake_case），符合 D3 命名决议。
  - `timeoutMs`（camelCase）映射到 MCP `timeout_ms`（snake_case）。Core 函数内部对该参数发出 deprecation warning，与 inventory 备注一致。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据）。
- **Action**: No action.

#### `prunemem_repair_source_paths` — STATUS: 匹配

- **Core function**: `src/core/repair-source-paths.js` → `repairSourcePaths`
- **Actual signature**:
  ```js
  export async function repairSourcePaths({
    workspace,
    write = false,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `write`, `preset`, `override`
- **Findings**:
  - 全部 4 个可选参数与 inventory 一致。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据）。
- **Action**: No action.

#### `prunemem_run_sample_pipeline` — STATUS: 匹配

- **Core function**: `src/core/run-sample-pipeline.js` → `runSamplePipeline`
- **Actual signature**:
  ```js
  export async function runSamplePipeline({
    workspace,
    mock = false,
    write = false,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `mock`, `write`, `preset`, `override`
- **Findings**:
  - 全部 5 个可选参数与 inventory 一致。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据）。
  - 代码内部调用 `runExtract` 和 `runJudge` 时不传 `write`，因此中间产物无条件写入，与 inventory 下方"写盘行为说明"一致。
- **Action**: No action.

#### `prunemem_update_registries` — STATUS: 匹配

- **Core function**: `src/core/update-registries.js` → `updateRegistries`
- **Actual signature**:
  ```js
  export async function updateRegistries({
    workspace,
    judged: judgedArg,
    sourcePaths: sourcePathsArg,
    memoryId: memoryIdArg,
    channel = 'demo',
    agent = 'demo',
    write = false,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `judged`, `source_paths`, `memory_id`, `channel`, `agent`, `write`, `preset`, `override`
- **Findings**:
  - 全部 9 个可选参数与 inventory 一致。
  - `judged` / `sourcePaths` / `memoryId` 在 core 函数内部均有 fallback 默认值路径，因此确为可选。
  - `channel = 'demo'` / `agent = 'demo'` 为 core 函数默认值，inventory 列为可选正确。
  - `sourcePaths` → `source_paths`、`memoryId` → `memory_id` 为 snake_case 映射，符合 D3。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据）。
- **Action**: No action.

#### `prunemem_update_working_state` — STATUS: 匹配

- **Core function**: `src/core/update-working-state.js` → `updateWorkingState`
- **Actual signature**:
  ```js
  export async function updateWorkingState({
    workspace,
    input: inputPath,
    state: statePath,
    write = false,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `input`, `state`, `write`, `preset`, `override`
- **Findings**:
  - 全部 6 个可选参数与 inventory 一致。
  - `input: inputPath` / `state: statePath` 为内部 rename，调用方参数名仍为 `input` / `state`。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据）。
- **Action**: No action.

#### `prunemem_validate_maintenance` — STATUS: 匹配

- **Core function**: `src/core/validate-maintenance.js` → `validateMaintenance`
- **Actual signature**:
  ```js
  export async function validateMaintenance({
    workspace,
    strict = false,
    preset,
    override,
    paths: paths_in,
  } = {}) {
  ```
- **Inventory says**:
  - 必选: `—`
  - 可选: `workspace`, `strict`, `preset`, `override`
- **Findings**:
  - 全部 4 个可选参数与 inventory 一致。
  - `paths: paths_in` 为内部 escape hatch（M2 物理证据）。
  - 纯读操作，类型 `read` 正确。
- **Action**: No action.

## Summary

| 总数 | 匹配 | 需修订 | 需拍板 |
|---|---|---|---|
| 9 | 9 | 0 | 0 |

## Pending decisions (for cloud review)

无。

## Notes

- **Grep 命令模式**：`grep -n -B1 -A20 "export.*function.*<funcname>\|export const <funcname>" <path>`。对 maintain 和 updateRegistries 使用了 `-A30` 以完整捕获参数列表。
- **Inventory 之外的 core 函数**：未发现。所有 `src/core/*.js` 中 `export async function` 均已进入 inventory（含显式不暴露项）。
- **路径不一致**：`getWorkingState` 实际位于 `src/core/get-working-state.js`，而非 `src/working/state.js`。但 inventory 并未指定路径，仅记录函数名，因此不构成偏差。
- **`paths` 参数的普遍性**：所有 9 个被 audit 的 core 函数签名中均包含 `paths: paths_in` 的 escape hatch，与 MVP 工具（`archiveSessionV41`、`buildRuntimeContext`）一致。这进一步验证了 M2 决议的物理基础：MCP 层必须通过 `additionalProperties: false` 阻止 `paths` 传入。
