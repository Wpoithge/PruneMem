# Step 4 Audit — Hardcoded Path Catalog

**Audit date:** 2026-04-30
**Auditor:** Claude Code (Phase A, Step 4)
**Scope:** `src/core/*.js`, `src/lib/`, `src/runtime/`, `src/working/`, `src/extract/`, `src/judge/`, `src/archive/`, `tests/`

---

## 1. 执行摘要

- **总硬编码处数：** 25 处（`src/core/` 内）+ 3 处（`src/lib/paths.js` 默认值）+ 1 处（`src/runtime/load-config.js`）
- **涉及文件数：** 12 个 core 脚本 + 1 个 lib 模块 + 1 个 runtime 模块
- **R1 风险（非标准 path.join 形态）：** 无。所有 examples/ 路径均使用标准 `path.join()`。
- **意外发现：**
  1. `src/lib/paths.js` 已有默认值 `registryDir: './examples/registry'` 等，但未被任何 core 脚本消费（core 脚本全部直接 `path.join`）。
  2. `src/runtime/load-config.js` 硬编码 `config/backend.json` 和 `config/backend.example.json`，不在 Step 4 范围内（runtime 模块不是 core 脚本）。
  3. `tests/regression/` 中的硬编码需要同步改造（Phase C 时处理）。

---

## 2. 按文件详细列表

### 2.1 Registry 路径（优先级：高 — Issue #1 根治）

| 文件 | 行号 | 当前代码 | 形态 | 读/写 | 改造模式 | 风险/备注 |
|------|------|----------|------|-------|----------|-----------|
| `update-registries.js` | 66 | `path.join(root, 'examples', 'registry')` | path.join | 读写 | **B** (路径替换 + dry-run guard) | **D6 breaking**。无 write guard，无条件写盘 |
| `curator-apply.js` | 131 | `path.join(root, 'examples', 'registry')` | path.join | 读写 | **A** (路径替换) | 已有 `write=false` 保护，无 breaking |
| `validate-maintenance.js` | 53 | `path.join(root, 'examples', 'registry')` | path.join | 读 | **A** | 需加 memoryMd null guard (D3) |
| `repair-source-paths.js` | 36 | `path.join(root, 'examples', 'registry', 'memories.jsonl')` | path.join | 读 | **A** | 读 registry 做 source path 修复 |

### 2.2 Pipeline 路径（sample-run-01 硬编码）

| 文件 | 行号 | 当前代码 | 形态 | 读/写 | 改造模式 | 风险/备注 |
|------|------|----------|------|-------|----------|-----------|
| `run-extract.js` | 40 | `path.join(root, 'examples', 'pipeline', 'sample-run-01', 'session-packet.json')` | path.join | 读 | **A** | input 默认值 |
| `run-extract.js` | 41 | `path.join(root, 'examples', 'pipeline', 'sample-run-01', 'extracted.generated.json')` | path.join | 写 | **A** | output 默认值。无条件写是设计意图（pipeline artifact） |
| `run-judge.js` | 40 | `path.join(root, 'examples', 'pipeline', 'sample-run-01', 'extracted.generated.json')` | path.join | 读 | **A** | input 默认值 |
| `run-judge.js` | 41 | `path.join(root, 'examples', 'pipeline', 'sample-run-01', 'judged.generated.json')` | path.join | 写 | **A** | output 默认值。无条件写是设计意图 |
| `update-registries.js` | 69 | `path.join(root, 'examples', 'pipeline', 'sample-run-01', 'judged.json')` | path.join | 读 | **A** | judged 输入默认值 |
| `update-registries.js` | 70 | `path.join(root, 'examples', 'pipeline', 'sample-run-01', 'apply.json')` | path.join | 读 | **A** | sourcePaths 默认值 |
| `archive-session-v41.js` | 29 | `path.join(root, 'examples', 'pipeline', 'sample-run-01', 'session-packet.json')` | path.join | 读 | **A** | packetPath 默认值 |
| `run-sample-pipeline.js` | 30 | `path.join(root, 'examples', 'pipeline', 'sample-run-01')` | path.join | 计算 | **A** | 传给下游的 sampleDir |
| `repair-source-paths.js` | 43 | `path.join('examples', 'pipeline', ym, row.memory_id)` | path.join | 计算 | **A** | 动态构建 pipeline 子目录路径 |
| `validate-maintenance.js` | 54 | `path.join(root, 'examples', 'pipeline')` | path.join | 读 | **A** | 检查 pipeline 目录存在性 |

### 2.3 Working Memory 路径

| 文件 | 行号 | 当前代码 | 形态 | 读/写 | 改造模式 | 风险/备注 |
|------|------|----------|------|-------|----------|-----------|
| `get-working-state.js` | 20 | `path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json')` | path.join | 读 | **A** | input 默认值 |
| `update-working-state.js` | 45 | `path.join(root, 'examples', 'working-memory', 'update-input.json')` | path.join | 读 | **A** | input 默认值 |
| `update-working-state.js` | 46 | `path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json')` | path.join | 写 | **A** | state 输出。有 `write=false` CLI guard |
| `update-working-state.js` | 64 | `path.join(root, 'examples', 'working-memory', 'session-demo.working-event.json')` | path.join | 写 | **A** | event 输出。有 `write=false` CLI guard |
| `update-working-state.js` | 65 | `path.join(root, 'examples', 'working-memory', 'session-demo.runtime-context.json')` | path.join | 写 | **A** | runtime JSON。有 `write=false` CLI guard |
| `update-working-state.js` | 66 | `path.join(root, 'examples', 'working-memory', 'session-demo.runtime-context.txt')` | path.join | 写 | **A** | runtime txt。有 `write=false` CLI guard |
| `build-runtime-context.js` | 32 | `path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json')` | path.join | 读 | **A** | state 输入默认值 |
| `build-runtime-context.js` | 33 | `path.join(root, 'examples', 'working-memory', 'session-demo.execution-plan.json')` | path.join | 读 | **A** | plan 输入默认值 |
| `archive-session-v41.js` | 30 | `path.join(root, 'examples', 'working-memory', 'session-demo.working-state.json')` | path.join | 读 | **A** | state 输入默认值 |
| `execution-plan.js` | 21 | `path.join(root, 'examples', 'working-memory', 'execution-plan.input.json')` | path.join | 读 | **A** | input 默认值 |

### 2.4 MEMORY.md 路径

| 文件 | 行号 | 当前代码 | 形态 | 读/写 | 改造模式 | 风险/备注 |
|------|------|----------|------|-------|----------|-----------|
| `validate-maintenance.js` | 55 | `path.join(root, 'examples', 'MEMORY.example.md')` | path.join | 读 | **A** | 需加 memoryMd null guard (D3) |

### 2.5 Lib / Runtime 中的硬编码（不在 core 脚本范围，但需记录）

| 文件 | 行号 | 当前代码 | 形态 | 读/写 | 备注 |
|------|------|----------|------|-------|------|
| `src/lib/paths.js` | 3 | `registryDir: './examples/registry'` | 字符串 | — | 现有默认值，未被消费。Step 4 会重写整个模块 |
| `src/lib/paths.js` | 4 | `pipelineDir: './examples/pipeline'` | 字符串 | — | 同上 |
| `src/lib/paths.js` | 5 | `layersDir: './examples/layers'` | 字符串 | — | 同上 |
| `src/runtime/load-config.js` | 6 | `path.join(workspace, 'config', 'backend.json')` | path.join | 读 | **不在 Step 4 范围**。runtime 模块，非 core 脚本 |
| `src/runtime/load-config.js` | 7 | `path.join(workspace, 'config', 'backend.example.json')` | path.join | 读 | 同上 |

---

## 3. 与 §3.1 预估表格对照

paths-design.md §3.1 预估的 12 个文件全部命中，无意外扩展：

| 预估文件 | audit 确认 | 复杂度 |
|----------|-----------|--------|
| `update-registries.js` | ✓ 1 处硬编码 + D6 breaking | 中 |
| `curator-apply.js` | ✓ 1 处硬编码（write=false 保护） | 低 |
| `validate-maintenance.js` | ✓ 多处 examples/ + memoryMd null guard | 中 |
| `repair-source-paths.js` | ✓ pipeline 路径 | 低 |
| `run-extract.js` | ✓ input/output 默认值 | 低 |
| `run-judge.js` | ✓ input/output 默认值 | 低 |
| `build-runtime-context.js` | ✓ working memory 读取 | 中 |
| `get-working-state.js` | ✓ working memory 读取 | 中 |
| `update-working-state.js` | ✓ working memory 读写 | 中 |
| `archive-session-v41.js` | ✓ session packet + working memory | 中 |
| `run-sample-pipeline.js` | ✓ pipeline 目录 | 低 |
| `maintain.js` | ✓ 间接依赖（通过 fn 调用） | 低 |

**新增发现（在预估范围内，但表格没列出的文件）：**
- `execution-plan.js` — working memory 读取，低复杂度。应加入 C3 或 C4 batch。

---

## 4. 特殊发现

### 4.1 R1 风险：非标准 path.join 形态

**结论：无 R1 风险。**

所有 25 处硬编码均使用标准 `path.join(root, 'examples', ...)` 或 `path.join('examples', ...)` 形态。无 template literal（如 `` `${root}/examples/registry` ``）、无字符串拼接（如 `root + '/examples/registry'`）、无直接绝对路径。

### 4.2 src/lib/paths.js 现状

当前 `src/lib/paths.js` 只导出简单的字符串默认值：
```js
export function defaultPaths() {
  return {
    registryDir: './examples/registry',
    pipelineDir: './examples/pipeline',
    layersDir: './examples/layers',
  };
}
```

**grep 确认：零消费方。** 没有任何 core 脚本 `import { defaultPaths }` 或使用 `registryDir` / `pipelineDir` / `layersDir` 字段。Step 4 可以安全地重写整个模块（无需保留 backward compat 的旧 API）。

### 4.3 测试中的硬编码

| 文件 | 行号 | 用途 | 改造时机 |
|------|------|------|----------|
| `tests/regression/check-sample-pipeline.js:22` | `copyDir(repoRoot/examples, tmpRoot/examples)` | 复制 demo fixtures 到 tmp | Phase C 同步改 |
| `tests/regression/check-context-note-merge.js:31` | `path.join(root, 'examples', 'registry')` | 构造测试 registry | Phase C 同步改 |
| `tests/regression/check-context-note-merge.js:34` | `path.join(root, 'examples', 'MEMORY.example.md')` | 构造测试 MEMORY.md | Phase C 同步改 |

这些测试硬编码在 Phase C 改造时同步处理，不单独发 commit。

---

## 5. D6 影响评估（"默认写盘"脚本排查）

**结论：D6 breaking 仅影响 `update-registries.js` 一个文件。**

| 文件 | 写盘调用 | 是否有 write guard | 是否 D6 范围 |
|------|----------|-------------------|-------------|
| `update-registries.js` | `writeJsonl` (无条件) | ❌ 无 | **是** — 必须加 `write=false` |
| `curator-apply.js` | `writeJsonl` (line 285) | ✅ `write=false` 默认 | 否 — 已有保护 |
| `update-working-state.js` | `fs.writeFile` (lines 63-66) | ✅ `write=false` 默认 | 否 — 已有保护 |
| `repair-source-paths.js` | `writeJsonIfMissing` | ✅ `write=false` 默认 | 否 — 已有保护 |
| `run-extract.js` | `fs.writeFile` (line 59) | ❌ 无 | 否 — pipeline artifact 生成是设计意图 |
| `run-judge.js` | `fs.writeFile` (line 68) | ❌ 无 | 否 — pipeline artifact 生成是设计意图 |

**理由：** run-extract / run-judge 的写是"产生 pipeline 中间产物"（extracted.generated.json → judged.generated.json），这是它们的核心职责。如果默认 dry-run，pipeline 会断裂（run-judge 读不到 run-extract 的输出）。D6 针对的是"副作用写盘"（registry 污染），不是"功能性输出"。

---

## 6. 改造顺序建议

按复杂度排序，对应 Phase C1-C6：

1. **C1 — `update-registries.js`**（中，D6 breaking）
   - 加 `write = false` 默认参数
   - CLI `parseArgs` 加 `--write`
   - 路径替换为 `getPaths`
   - 同步更新回归测试（显式 `--write`）

2. **C2 — `curator-apply.js` + `repair-source-paths.js`**（低）
   - 路径替换，无 breaking

3. **C3 — `get-working-state.js` + `update-working-state.js` + `build-runtime-context.js` + `execution-plan.js`**（中）
   - working memory 路径统一替换
   - update-working-state 的 write guard 保留

4. **C4 — `run-extract.js` + `run-judge.js` + `archive-session-v41.js`**（低）
   - pipeline / working memory 路径替换

5. **C5 — `validate-maintenance.js`**（中）
   - 多处 registry/pipeline/MEMORY.md 引用
   - 加 memoryMd null guard (D3)

6. **C6 — `maintain.js` + `run-sample-pipeline.js`**（低）
   - 顶层 entry 加 preset/override 解析
   - 内部调用下游时显式传 `write: true`（适配 D6）

---

## 7. 决策点（需用户确认）

**当前状态：0 个决策点需要确认。**

Audit 未触发三类决策条件：

1. ✅ **R1 风险：** 无。所有路径均为标准 `path.join` 形态。
2. ✅ **范围扩大：** 无。所有硬编码均在预估的 12 个 core 脚本 + execution-plan.js 内。`src/runtime/load-config.js` 不在 Step 4 范围（runtime 模块）。
3. ✅ **D6 影响放大：** 无。仅 `update-registries.js` 一个文件需要加 dry-run guard。run-extract / run-judge 的无条件写是设计意图（pipeline artifact 生成）。

**建议：** 可直接进入 Phase B，无需暂停确认。
