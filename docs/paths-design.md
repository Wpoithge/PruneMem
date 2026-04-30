# Step 4 设计文档：`src/lib/paths.js` 抽象

**Status:** Approved — decisions D1–D6 locked by project owner.
**Author:** Claude (per user direction in vibe-coding mode).
**Reviewers:** Project owner (approved 2026-04-30).
**Target step:** Step 4 of 0.3 host-agnostic refactor.
**Closes:** Issue #1 (examples/registry/ contamination during direct execution).
**Predecessor:** Step 3 closeout (commit `c4f54b8`).

---

## Executive summary

Step 4 在 `src/lib/paths.js` 实现一个 `getPaths()` 函数，让所有 13 个 core 脚本通过它解析路径，而不是硬编码 `examples/registry/` 等 demo workspace 路径。

三个 preset：
- `default` — 现状字节级兼容，但加 dry-run guard（**breaking change**：见 D6）
- `isolated` — 写到 `<workspace>/.prunemem-isolated/`，读仍然从 `examples/`
- `custom` — 用户传 override 部分覆盖 default

工作量预计 8-12 commit，4 个 phase。完成后 Issue #1 状态从 "Mitigated" 升级为 "Closed"。

---

## 1. 背景与目标

### 1.1 现状

Step 3 完成后，13 个 core 脚本中至少 4 处硬编码了 demo workspace 的路径（`examples/registry/` 等）：

| 文件 | 行号 | 形态 |
|---|---|---|
| `src/lib/paths.js` | 3 | `registryDir: './examples/registry'`（默认值，未被消费） |
| `src/core/update-registries.js` | 66 | `path.join(root, 'examples', 'registry')`（无 dry-run，污染源） |
| `src/core/curator-apply.js` | 131 | `path.join(root, 'examples', 'registry')`（有 write=false 保护） |
| `src/core/validate-maintenance.js` | 待 audit | 多处 `examples/MEMORY.example.md` 引用 |
| `src/core/repair-source-paths.js` | 待 audit | 写 pipeline artifacts |

**完整 audit 在 Phase A 执行**——下面所有"硬编码处"列表都待 grep 确认。

### 1.2 目标

设计一个 `src/lib/paths.js` 模块，让所有 core 脚本通过它解析路径。目标三层并列：

1. **Issue #1 根治**：`update-registries.js` 不再无条件写入 `examples/registry/`
2. **Host-agnostic 基础**：Hermes / OpenClaw / 其他宿主可以通过 preset 或 override 把记忆写到自己的位置，不动 core 脚本
3. **测试隔离**：单测和回归测试可以传 `isolated` preset 写到隔离目录，避免污染

### 1.3 非目标

- **不做 layout 自动检测**：不会让 paths.js 看 `~/.openclaw/` 是否存在来推断宿主类型
- **不做路径迁移工具**：不提供"从 default 搬到 hermes layout"的迁移命令——那是 Step 6 的事
- **不做 schema migration**：本步骤不改任何 jsonl/json 的 schema，只改"写到哪里"

---

## 2. API 设计

### 2.1 核心函数签名

```js
// src/lib/paths.js

/**
 * Resolve filesystem paths for a PruneMem workspace.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to process.cwd()
 * @param {string} [options.preset]    - one of 'default' | 'isolated' | 'custom', defaults to 'default'
 * @param {object} [options.override]  - partial paths object to merge into preset
 * @returns {Paths}
 */
export function getPaths({ workspace, preset = 'default', override } = {}) { ... }

/**
 * @typedef {object} Paths
 * @property {string}  workspace        - resolved workspace root (absolute)
 * @property {string}  registry         - directory for *.jsonl registries (write path)
 * @property {string}  registryRead     - directory to READ registries (= registry, except for isolated)
 * @property {string}  pipeline         - directory for sample-run artifacts (write path)
 * @property {string}  pipelineRead     - directory to READ pipeline fixtures (= pipeline, except for isolated)
 * @property {string}  workingMemory    - directory for working state
 * @property {string|null} memoryMd     - path to MEMORY.md (or null if preset doesn't use it)
 * @property {string}  preset           - which preset was used (echo back)
 * @property {object}  _raw             - the raw config used (for debugging)
 */
```

### 2.2 三个 preset

#### `default`（向后兼容 + dry-run guard）

跟当前硬编码完全一致的路径。**字节级兼容**：现有所有 golden diff 在不传 `--write` 的情况下保持不变。

```js
{
  workspace:     <resolved>,
  registry:      path.join(workspace, 'examples', 'registry'),
  registryRead:  path.join(workspace, 'examples', 'registry'),  // = registry
  pipeline:      path.join(workspace, 'examples', 'pipeline'),
  pipelineRead:  path.join(workspace, 'examples', 'pipeline'),
  workingMemory: path.join(workspace, 'examples', 'working-memory'),  // 待 audit 确认
  memoryMd:      path.join(workspace, 'examples', 'MEMORY.example.md'),
  preset:        'default',
}
```

**关键约束（D6 决议）**：default preset 下，所有"会写盘"的 core 脚本必须默认 dry-run，必须显式 `--write` 才落盘。这跟 `curator-apply` 现有的 `write=false` 默认行为对齐。详见 §3.2。

#### `isolated`（测试用，只改写路径 — D1 决议 = A）

写路径全部指向 workspace 之下的私有目录 `.prunemem-isolated/`，**读路径仍然从 `examples/` 读**——这样测试可以用 demo fixtures 跑 pipeline，但写出来的东西不污染 demo。

```js
{
  workspace:     <resolved>,
  registry:      path.join(workspace, '.prunemem-isolated', 'registry'),       // 写
  registryRead:  path.join(workspace, 'examples', 'registry'),                  // 读
  pipeline:      path.join(workspace, '.prunemem-isolated', 'pipeline'),
  pipelineRead:  path.join(workspace, 'examples', 'pipeline'),
  workingMemory: path.join(workspace, '.prunemem-isolated', 'working-memory'),
  memoryMd:      path.join(workspace, '.prunemem-isolated', 'MEMORY.md'),
  preset:        'isolated',
}
```

`.prunemem-isolated/` 必须加进 `.gitignore`（Phase B1 commit 同步加）。

**消费方契约**：脚本里"读"动作用 `paths.registryRead`，"写"动作用 `paths.registry`。default preset 下两者相等，isolated 下不同。

#### `custom`（host adapter 用，merge 模式 — D2 决议 = B）

```js
getPaths({
  workspace: '/some/workspace',
  preset: 'custom',
  override: {
    registry: '/Users/yang/.hermes/memory/registries',
    memoryMd: null,  // Hermes 不用 MEMORY.md
  }
})
```

`override` 字段会跟 default preset 浅 merge——用户只需传想覆盖的字段，未传字段 fallback 到 default 的值。

**特殊语义**：`override` 里显式设 `null` 的字段（如上例的 `memoryMd: null`）保留为 null，**不**被 fallback。这是 host adapter 表达"我不需要这个概念"的方式。

#### memoryMd null 的语义（D3 决议 = A）

`memoryMd === null` 表示该 preset / 该 host **决定不维护 MEMORY.md**。消费方必须 guard：

```js
// validate-maintenance.js
if (paths.memoryMd) {
  // 走 MEMORY.md 校验逻辑
} else {
  // 跳过该 preset 不维护
  result.checks.memory_md = { skipped: true, reason: 'preset has no memoryMd' };
}
```

**不**视为配置错误。Host adapter（如 Hermes）可以合法地选择不写 MEMORY.md。

### 2.3 兜底/错误处理

- **workspace 不存在**：`getPaths` 不检查——纯路径计算，不碰 fs。消费方自己 ensure dir。
- **preset 未知**：`throw new Error('unknown preset: foo')`。
- **override 包含未知字段**：silent ignore，不 warn。理由：未来扩展字段时不希望破坏老代码。
- **override 跟 preset 配合**：`preset: 'default'` + `override: {...}` 也允许（部分覆盖 default）。`preset: 'custom'` + `override: undefined` 也允许（等同 default）。

---

## 3. 消费方改造

### 3.1 改造范围

Phase A 会做完整 audit。预估范围（待 confirm）：

| 文件 | 改造点 | 复杂度 |
|---|---|---|
| `src/core/update-registries.js` | 1 处硬编码 + 改写入 guard（D6 breaking） | 中 |
| `src/core/curator-apply.js` | 1 处硬编码（已有 write=false 保护） | 低 |
| `src/core/validate-maintenance.js` | 多处 examples/ 引用 + memoryMd null guard | 中 |
| `src/core/repair-source-paths.js` | pipeline 路径 | 低 |
| `src/core/run-extract.js` | input/output 默认值 | 低 |
| `src/core/run-judge.js` | 同上 | 低 |
| `src/core/build-runtime-context.js` | working memory 读取 | 中（待 audit） |
| `src/core/execution-plan.js` | working memory 读取 | 低（added in Phase A audit, commit 5be0295） |
| `src/core/get-working-state.js` | 同上 | 中（待 audit） |
| `src/core/update-working-state.js` | 同上 | 中（待 audit） |
| `src/core/archive-session-v41.js` | session packet 读取路径 | 中 |
| `src/core/run-sample-pipeline.js` | pipeline 目录 | 低 |
| `src/core/maintain.js` | 间接依赖（通过 fn 调用） | 低 |

### 3.2 改造模式

**改造模式 A：单纯路径替换**（适用于 curator-apply 等已有 write 保护的脚本）

改之前：
```js
const root = path.resolve(workspace || process.cwd());
const regDir = path.join(root, 'examples', 'registry');
```

改之后：
```js
import { getPaths } from '../lib/paths.js';

const paths = getPaths({ workspace, preset, override });
const memoriesPath = path.join(paths.registry, 'memories.jsonl');
```

**改造模式 B：路径替换 + dry-run guard**（适用于 update-registries 等无 write 保护的脚本，D6 breaking change）

改之前：
```js
export async function updateRegistries({ workspace, judged, ... } = {}) {
  const regDir = path.join(root, 'examples', 'registry');
  // ... 无条件 writeJsonl
  await Promise.all([writeJsonl(memoriesPath, ...), ...]);
  return { ok: true, inserted, files: { ... } };
}
```

改之后：
```js
export async function updateRegistries({ workspace, judged, write = false, preset, override, ... } = {}) {
  const paths = getPaths({ workspace, preset, override });
  // ... 内存计算
  if (write) {
    await Promise.all([writeJsonl(memoriesPath, ...), ...]);
  }
  return { ok: true, inserted, write, files: { ... } };
}
```

CLI shell 同步加 `--write` flag：
```js
const args = parseArgs(process.argv);  // parseArgs 加上 --write 解析
updateRegistries(args).then(...)
```

⚠️ **D6 breaking change 影响**：
- `node src/core/update-registries.js --workspace .` 之前会写盘，现在默认 dry-run
- 现有 `tests/regression/` 里如果有依赖"跑完 update-registries 后 examples/registry/ 内容"的 check，需要在 Phase C1 改造时一起调整为传 `--write`
- `run-sample-pipeline` 内部调用 `updateRegistries` 时必须显式传 `write: true`（否则 pipeline 等于空跑）
- `maintain` 调用 `updateRegistries` 链路同理

详见 §5.3 CHANGELOG。

### 3.3 export 函数签名扩展（D4 决议 = C）

所有 13 个 lib 化的 core 函数都接受**可选**的 paths 相关参数：

```js
export async function updateRegistries({
  workspace,
  judged, sourcePaths, memoryId, channel, agent,  // 业务参数
  write = false,                                    // 新增（D6 breaking）
  preset, override,                                 // 新增（D4 = C）
  paths: paths_in,                                  // 新增（D4 = C，可选预解析 paths）
} = {}) {
  const paths = paths_in ?? getPaths({ workspace, preset, override });
  // ...
}
```

**调用方式有两种**：

```js
// 方式 1：传 workspace + preset，函数内部 resolve
await updateRegistries({ workspace: '.', preset: 'isolated', write: true });

// 方式 2：外部已 resolve paths，传进来（用于 MCP server / 顶层 entry 复用）
const paths = getPaths({ workspace: '.', preset: 'isolated' });
await updateRegistries({ paths, judged: '...', write: true });
```

**优先级**：如果同时传了 `paths` 和 `workspace+preset+override`，**`paths` 优先**——不再调 `getPaths`。

### 3.4 CLI flag 暴露（D5 决议 = C）

13 个 CLI 全部加 `--preset` 和 `--paths` flag：

```bash
node src/core/update-registries.js --workspace . --preset isolated --write
node src/core/maintain.js --workspace ~/.hermes/mem --preset custom --paths /path/to/paths.json
```

**flag 语义**：
- `--preset <name>` — 'default' | 'isolated' | 'custom'，默认 'default'
- `--paths <file>` — 指向一个 JSON 文件，作为 override 对象。仅在 `--preset custom` 时使用；其他 preset 下 silent ignore（warn 一次到 stderr）

`--paths` 不接受 inline JSON——shell 转义问题太多。文件路径就够。

**parseArgs 改造**：每个 CLI 的 `parseArgs` 函数加这两个 case 解析。Phase C 改造时机械式加进每个文件。

---

## 4. 测试策略

### 4.1 unit test for paths.js 自身

`tests/unit/lib/paths.test.js`：

```js
test('getPaths default preset matches current hardcoded paths', () => {
  const p = getPaths({ workspace: '/foo' });
  assert.equal(p.registry, '/foo/examples/registry');
  assert.equal(p.registryRead, '/foo/examples/registry');  // 等于 registry
  assert.equal(p.preset, 'default');
});

test('getPaths isolated preset diverges read and write', () => {
  const p = getPaths({ workspace: '/foo', preset: 'isolated' });
  assert.equal(p.registry, '/foo/.prunemem-isolated/registry');     // 写
  assert.equal(p.registryRead, '/foo/examples/registry');           // 读保持 examples
});

test('getPaths custom preset merges override into default', () => {
  const p = getPaths({
    workspace: '/foo',
    preset: 'custom',
    override: { registry: '/bar/registry' }
  });
  assert.equal(p.registry, '/bar/registry');
  assert.equal(p.pipeline, '/foo/examples/pipeline');  // 未覆盖，fallback default
});

test('getPaths custom preset preserves explicit null override', () => {
  const p = getPaths({
    workspace: '/foo',
    preset: 'custom',
    override: { memoryMd: null }
  });
  assert.equal(p.memoryMd, null);  // 不被 fallback
});

test('getPaths default preset accepts override too', () => {
  const p = getPaths({
    workspace: '/foo',
    preset: 'default',
    override: { registry: '/elsewhere' }
  });
  assert.equal(p.registry, '/elsewhere');
  assert.equal(p.pipeline, '/foo/examples/pipeline');
});

test('getPaths throws on unknown preset', () => {
  assert.throws(() => getPaths({ workspace: '/foo', preset: 'nonsense' }));
});

test('getPaths workspace defaults to process.cwd()', () => {
  const p = getPaths({});
  assert.equal(p.workspace, process.cwd());
});
```

### 4.2 回归测试

**Critical**：现有 12/12 回归 + 11 个 unit test 必须**字节级**保持通过——这是 default preset 字节级兼容承诺的执行检查。

⚠️ **D6 breaking change 例外**：少数依赖"update-registries 默认写盘"的 test，Phase C1 改造时一并改成显式 `--write`。这种改动**必须在同一个 commit**里完成，commit message 显式标注 "test updated for --write breaking change"。

如果某个测试在 Phase C 期间 fail 且不是 D6 影响——**立即停下报告**，不允许回头改 golden。这是 Step 3 立的铁律延续。

### 4.3 isolated preset 集成测试

新增 `tests/regression/check-isolated-preset.sh`：

```bash
#!/bin/bash
# 跑 sample pipeline，preset=isolated
node src/core/run-sample-pipeline.js --workspace . --preset isolated --mock --write > /tmp/iso.json

# 验证 examples/registry/ 没被污染
DIRTY=$(git status --porcelain examples/registry/)
if [ -n "$DIRTY" ]; then
  echo "FAIL: isolated preset still polluted examples/registry/"
  exit 1
fi

# 验证 .prunemem-isolated/ 被写了
if [ ! -d .prunemem-isolated/registry ]; then
  echo "FAIL: isolated preset didn't write to .prunemem-isolated/"
  exit 1
fi

# 清理
rm -rf .prunemem-isolated/

echo "[check-isolated-preset] OK"
```

加进 `scripts/run-checks.sh` 后变成 13/13。

### 4.4 default preset 不污染回归

新增 `tests/regression/check-no-pollution.sh`：

```bash
#!/bin/bash
# 跑 default preset，不传 --write
git status --porcelain examples/registry/ > /tmp/before.txt
node src/core/run-sample-pipeline.js --workspace . --mock > /dev/null
git status --porcelain examples/registry/ > /tmp/after.txt

if ! diff -q /tmp/before.txt /tmp/after.txt > /dev/null; then
  echo "FAIL: default preset (no --write) polluted examples/registry/"
  diff /tmp/before.txt /tmp/after.txt
  exit 1
fi

echo "[check-no-pollution] OK"
```

加进 `scripts/run-checks.sh` 后变成 14/14。

⚠️ **跟现有 `scripts/check-examples-clean.sh` 的关系**：T5 加的那个 mitigation 脚本是"事后检查"，这个 D6 之后的 check 是"事前预防"。两个并存——前者是开发者本地 sanity check，后者是 CI 回归。Step 4 完成后 `check-examples-clean.sh` 不删，作为开发流的辅助工具保留。

---

## 5. 文档与发布

### 5.1 paths.js 自身文档

新增 `docs/paths.md`：解释三个 preset、API、如何写自己的 host adapter 通过 custom preset 接入。

### 5.2 known-issues.md 更新

Issue #1 状态从 "Mitigated" 改为 "Closed"，加 resolution 段落指向 Step 4 commit。

### 5.3 CHANGELOG（D6 breaking change）

0.3 → 0.4 release notes 必须显式写：

```markdown
## 0.4.0 — Breaking changes

### update-registries.js no longer writes by default

Previously: `node src/core/update-registries.js --workspace .` wrote to
`examples/registry/*.jsonl` unconditionally.

Now: write requires explicit `--write` flag. Without it, the script does
a dry run and returns the would-be inserts without touching disk.

Rationale: prevents accidental contamination of demo workspace during
local development. Aligns behavior with `curator-apply` which has had
`write=false` default since Step 1. See Issue #1 in docs/known-issues.md.

### Migration

If you have scripts or workflows that rely on the old write-by-default
behavior, add `--write` to the invocation:

    # Before
    node src/core/update-registries.js --workspace ~/my-workspace

    # After
    node src/core/update-registries.js --workspace ~/my-workspace --write

`run-sample-pipeline.js` and `maintain.js` internally now pass `write: true`
to their downstream calls — no user action required for these entry points.
```

---

## 6. 执行顺序（Step 4 commit 计划）

预计 8-12 个 commit，4 个 phase。

### Phase A：探查（1 commit）

A1. `docs(audit): catalog all hardcoded paths in src/core/ for Step 4`
- 输出 `docs/step4-audit.md`，确认 §3.1 表格里的范围
- grep 所有 `examples/` 引用，列出每处的形态（path.join / template literal / fs.readFileSync 直接路径）
- 确认 R1 风险（template literal 形态如果存在，需要特殊处理）

### Phase B：基础设施（3 commit）

B1. `feat(lib): implement getPaths with default + isolated + custom presets`
- 实现 `src/lib/paths.js`
- 加 `.prunemem-isolated/` 到 `.gitignore`

B2. `test(lib): add unit tests for getPaths` （7 个 test，见 §4.1）

B3. `feat(cli): add --preset and --paths flag parsers (shared helper)`
- 在 `src/lib/cli-args.js`（新增，或扩展现有）提供 `parsePresetArgs(argv)` helper
- 这一步**只加 helper，不改任何 core 脚本**——Phase C 才用

### Phase C：消费方改造（4-6 commit）

⚠️ **C 阶段每个 commit 必须 golden diff 通过**（default preset 字节级兼容）。

C1. `refactor(core): use getPaths in update-registries (BREAKING: --write required)`
- **breaking commit**，commit message 明确标注
- 改造模式 B（路径替换 + dry-run guard）
- 同步更新所有依赖"update-registries 默认写盘"的回归测试
- 这是 Issue #1 的根治 commit

C2. `refactor(core): use getPaths in curator-apply + repair-source-paths`
- 改造模式 A
- curator-apply 已有 write=false，无 breaking

C3. `refactor(core): use getPaths in working memory scripts`
- get-working-state / update-working-state / build-runtime-context

C4. `refactor(core): use getPaths in run-extract / run-judge / archive-session`
- 三个文件改造模式 A

C5. `refactor(core): use getPaths in validate-maintenance with memoryMd null guard`
- 多处引用 + null guard 逻辑

C6. `refactor(core): propagate preset/override through maintain + run-sample-pipeline`
- 顶层 entry 加 preset/override 解析
- 内部调用下游时显式传 `write: true`（适配 D6 breaking）

### Phase D：测试 + 文档（3 commit）

D1. `test(regression): add isolated preset + no-pollution checks`
- 加两个新 check 到 `scripts/run-checks.sh`
- 12/12 → 14/14

D2. `docs: write paths.md, close Issue #1, update CHANGELOG with breaking change`
- 新增 `docs/paths.md`
- 更新 `docs/known-issues.md` Issue #1 → Closed
- 更新 `CHANGELOG.md` 0.4.0 section

D3. `docs: mark Step 4 completed (Step 4 tombstone)`
- 更新 `docs/refactor-plan.md` Status section

**总计 11 commit**（A:1 + B:3 + C:6 + D:3）。比之前估的 8-12 偏上限——主要是因为 D6 breaking 让 C1 必须独立成 commit。

### 6.1 执行约束（重要）

- **每个 phase 完成都跑全量回归**（12/12 → 14/14 after Phase D1）
- **C 阶段每个 commit 必须 golden diff 通过**（default preset 字节级兼容，D6 breaking 测试改动除外）
- **C1 是 breaking commit**：commit message 必须包含 `BREAKING CHANGE:` 字样，并在 body 里写迁移路径
- **不允许 amend** —— Step 3 那次 amend 让 73533ee 失效。Step 4 全程禁止 amend；想修改 commit 加 fix commit
- **不允许扩大范围** —— 任何 audit 中发现的"顺手能做的别的事"，记录到 `docs/step4-followup.md`，不在本 step 做
- **decision points 不得 Claude Code 自行决定** —— D1-D6 已锁定，按本文档执行；过程中冒出新决策点（比如 audit 发现意外结构）必须停下来问用户

---

## 7. 风险与未决事项

### 7.1 已识别风险

**R1：default preset 字节级兼容可能失败**
原因：现有硬编码路径用了 `path.join(root, 'examples', 'registry')`，`getPaths` 用同样形式，理论上 100% 一致。但如果某个脚本用了非标准路径拼接（比如 \`\`${root}/examples/registry\`\`），细微差别会被 golden diff 抓到。
**缓解**：Phase A audit 时 grep 所有 examples 引用，确认都是标准 `path.join`。如果发现非标准形态，A1 commit 里报告，C 阶段对应改造时特别处理。

**R2：Phase C 改造引入 import cycle**
原因：core 脚本 → lib/paths.js → 如果 paths.js 不小心 import 了 core/something，循环依赖。
**缓解**：paths.js 必须**只依赖 node 标准库**（`node:path`），不 import 任何 src/ 内部模块。Phase B1 lint 阶段加 grep 检查：
```bash
grep -E "^import.*from.*['\"]\\.\\./" src/lib/paths.js  # 期望无输出
```

**R3：D6 breaking change 影响外部用户**
原因：如果有外部脚本依赖 `update-registries` 默认写盘行为，0.3 → 0.4 升级会静默失败（dry run 不写盘但脚本以为写了）。
**缓解**：CHANGELOG 明确写 BREAKING + 迁移路径。Phase D2 commit 完成后建议立刻打 `v0.4.0` tag，让 0.3 用户能 pin 老版本。如果 PruneMem 还没有外部用户，影响为零。

**R4：Hermes adapter 反推 paths.js API 不够**
原因：Step 6 写 Hermes adapter 时可能发现 `paths` 对象字段不够（比如 Hermes 需要 `tagsDir` 这种现在没有的概念）。
**缓解**：接受这一点。Step 4 不预测未知 host 的需求，custom preset 的 override 机制能让 Hermes 加自己的字段（虽然 core 脚本不消费它们，但至少能 pass through）。如果 core 脚本真的需要新字段，0.5 版本扩 paths schema。

**R5：isolated preset 的 `.prunemem-isolated/` 跨平台路径名**
原因：`.` 开头隐藏目录在 Windows 不是隐藏。但功能正确。
**缓解**：可接受。0.3 阶段不针对 Windows 优化。

### 7.2 决策记录（已锁定）

| ID | 议题 | 决议 | 决策时间 |
|---|---|---|---|
| D1 | isolated preset 改写还是改读写 | A — 只改写路径，读路径仍走 examples/ | 2026-04-30 |
| D2 | custom preset 完整传还是 merge default | B — merge default | 2026-04-30 |
| D3 | memoryMd null 的语义 | A — preset 决定不维护，消费方 guard | 2026-04-30 |
| D4 | preset/override 暴露在哪几个函数 | C — 全部函数都接受可选 paths | 2026-04-30 |
| D5 | CLI flag 暴露在哪几个 CLI | C — 13 个 CLI 全加 | 2026-04-30 |
| D6 | default preset 是否加 dry-run guard | B — 加，breaking change | 2026-04-30 |

---

## 8. 给 Claude Code 的明确约束（Step 4 全程）

启动 Step 4 时附加在 prompt 里：

1. **不允许 amend** —— 任何 commit 完成后想修改，新加 fix commit。Step 3 的 73533ee → c4f54b8 amend 让历史引用失效，Step 4 不重蹈。
2. **不允许扩大范围** —— audit 发现"顺手能优化的别的事"，记录到 `docs/step4-followup.md`，不在本 step 处理。
3. **每完成一个 commit 停下来报告** —— 按指令格式贴 `git log --oneline -3` + `git status` + `git show <hash> --stat` 真实输出，不允许总结性陈述。
4. **golden fail 立即停下** —— 绝对不允许 `cp /tmp/xxx golden`。Step 3 立的铁律延续。
5. **decision points 不得 Claude Code 自行决定** —— D1-D6 已在本文档锁定，按文档执行。改造过程中冒出新决策点（比如 audit 发现某个意外字段）必须停下来问。
6. **C1 是 breaking commit，单独提交** —— 不能跟其他 refactor 合并。commit message 必须包含 "BREAKING CHANGE" 字样。
7. **每个 phase 切换时报告全量回归状态** —— Phase A/B/C/D 每个收尾都跑 `bash scripts/run-checks.sh`，确认 12/12（D1 之前）或 14/14（D1 之后）。
