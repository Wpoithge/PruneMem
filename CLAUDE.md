# PruneMem — Project Context for Claude Code

> 这个文件每次会话开始都会被加载。保持精简、聚焦、universally applicable。
> 详细内容在 `docs/` 下，按需读取（progressive disclosure）。

## 🚦 Start here

**当前阶段：Step 4（paths.js 抽象，Issue #1 根治）。** Step 0-3 已完成（commit `c4f54b8` 是 Step 3 墓碑）。

**第一次开会话时**：

1. 读 `@docs/refactor-plan.md` 确认 Status section 当前阶段
2. 当前阶段如果是 Step 4，读 `@docs/paths-design.md` 全文（这是 Step 4 的执行 spec，D1-D6 已锁定）
3. 复述对当前状态和下一步任务的理解给用户，**等用户确认后再动手**

**不要**直接跑 `@docs/audit-checklist.md`——那是 Step 0 的任务，已完成（`docs/audit-findings.md` 是产出存档）。

为什么要复述：CLAUDE.md 和各 spec 文档可能因状态变化滞后，启动时跟用户对账一次能避免基于过时假设动手。

## What this project is

PruneMem 是一个 **memory governance / 记忆治理系统**：从会话中抽取事实 → LLM judge 分类 → 落到 layered storage（L0–L3）+ working memory + execution context + session archive，以及对应的 registry。

**重要**：PruneMem 的 **read path 是宿主 agent 的事**（OpenClaw 用 QMD、Hermes 用自己的机制等等）。PruneMem 内部可能也有 `retrieve-memory`（用于 dedup / judge），但那不是给宿主用的检索接口——这点 audit 时要 verify。

核心数据流：

```
session packet (输入契约)
  → extract（抽事实）
  → judge（LLM 分类、打分）
  → curator-apply（写 registry + 分层落盘）
  → validate（一致性检查）
```

详细概念模型见 `@docs/governance.md`、`@docs/layers-and-lifecycle.md`、`@docs/execution-context.md`。

## Domain knowledge (read these before refactoring)

PruneMem 已经有完整的概念文档，**不要靠 grep 猜业务语义**。在改造任何 core 脚本之前，至少看这两份：

- `@docs/governance.md` — 治理链每一步的职责（update-registries / curator-apply / repair-source-paths / validate-maintenance / maintain）
- `@docs/layers-and-lifecycle.md` — L0–L3 长期记忆 + working memory + runtime context + execution context + session archive 的关系

具体对应模块时再查：

- `@docs/execution-context.md` — V4.1 milestone 系统（关联 `src/runtime/execution-context.js`、`src/core/execution-plan.js`）
- `@docs/migration-guide.md` — V3 → V4.1 用户升级指南（这是给 PruneMem **用户**看的，不是这次 0.3 改造）
- `@docs/faq.md` — 高频问题，包含 "QMD 不是 hard dep" 这种关键定调

## Current state vs target state

**Current**：所有 CLI 入口在 `src/core/*.js`（共 16 个，2 个 placeholder），靠 `spawn()` 互相调用。core 实际依赖 `src/lib/`、`src/runtime/`、`src/working/`、`src/extract/`、`src/judge/`，以及 `src/adapters/` 里的 model provider 和 storage backend。

**Target（0.3）**：
- `src/core/*.js` 改成 **library + CLI dual mode**：每个脚本既能 `import { fooBar }` 调用，也能命令行直接跑
- 新增 `src/hosts/<n>/`：处理宿主特定的 workspace layout 和生命周期 hook（**注意：不是 `src/adapters/`，那个目录已经被 model provider / storage backend 占用了**）
- 新增 `src/mcp/`：MCP server，让任何支持 MCP 的 agent 都能直接用
- 路径 layout 抽象化（具体起点取决于 audit 结论——`src/lib/paths.js` 可能已经做了一部分）

完整方案见 `@docs/refactor-plan.md` 和 `@docs/architecture-target.md`。

## Repository map

```
src/
  core/         16 个 CLI 入口脚本（含 2 个 placeholder：curate.js / normalize-legacy-runs.js）
                ↓ 这是这次改造的主战场（14 个真要改）

  lib/          算法 / schema / 工具：lifecycle, paths, registry, schema,
                similarity, text-normalize, validate-input
  runtime/      运行时支持：archive-session, execution-context, load-config,
                policy, prompt-templates, provider-errors, provider-factory,
                retrieve-memory
  working/      working memory: state.js
  extract/      事实抽取: extract-facts.js
  judge/        LLM 分类: judge-facts.js
  archive/      session packet 构建: build-session-packet.js
                ↑ 这些是 core 依赖的内部模块，本身已经是库形态，多半不动

  adapters/     ⚠️ 已存在：model provider + storage backend 适配
                bailian-provider, openai-compatible-provider, file-backend, qmd-backend
                ↑ 这是 PruneMem 内部基础设施 pluggability，不是 host 集成

examples/       demo workspace（不动）
docs/           文档（progressive disclosure）
tests/          使用 node:test，待逐步补全
```

## Commands

```bash
# 跑示例 pipeline
node src/core/run-sample-pipeline.js --workspace .

# 单独跑某一步
node src/core/curator-apply.js --workspace . --write
node src/core/validate-maintenance.js --workspace . --strict
node src/core/maintain.js --workspace .

# 跑测试（Node 内置 test runner，零依赖）
node --test tests/

# watch 模式
node --watch --test tests/

# Hard rule 自检（应当返回空）
grep -rni "openclaw\|hermes" src/core/ src/lib/ src/runtime/ \
  src/working/ src/extract/ src/judge/ src/archive/
```

## Hard rules / 铁律

违反这几条请停下问我，不要"顺手优化"：

1. **不污染中立层**。`src/core/` `src/lib/` `src/runtime/` `src/working/` `src/extract/` `src/judge/` `src/archive/` 里**不准出现** `openclaw` / `hermes` 这种宿主名字。host-specific 代码放进新建的 `src/hosts/<n>/`。
2. **`qmd` 是合法存在的**——它在 `src/adapters/qmd-backend.js` 里作为可选 storage backend。Hard rule 的 grep 范围**不包含 `src/adapters/`**。
3. **不改业务逻辑，只改交付形态**。这次改造 = 把 `main()` 抽成 export 函数 + 把 `spawn()` 改成 `import`。评分 / 治理 / 合并算法**一行不动**。
4. **CLI 行为必须 backward compatible**。改造前后 `node xxx.js --workspace .` 的 stdout 输出必须**逐字节一致**（用 `diff` 验证）。
5. **不碰外部契约**。`session-packet.json` 的 schema、registry jsonl 格式、MEMORY.md 渲染格式都是公开 API。详见 `@docs/contracts.md`。
6. **不引入新的运行时依赖**。core 现在 zero-deps（只用 Node 标准库 + 已有的几个 provider 库）。测试用 `node:test`，Step 5 才允许加 `@modelcontextprotocol/sdk`。
7. **不要跑 `/init`**。CLAUDE.md 是手写的，每行有理由。

## Workflow

按 `@docs/refactor-plan.md` 的步骤顺序执行。**Step 0（audit）必须先做完并经用户确认**，再进 Step 1。每步开始/结束时更新 plan 顶部的 status section。

每完成一个 atomic unit 就 commit。Atomic unit 的判断：

- **可独立 commit**：一个 core 脚本完成 lib+CLI 改造 + 通过测试 / 一个新模块成型 / 一组共同变化的依赖（如 `maintain.js` 改 import 时连带它依赖的几个 core 脚本一起）
- **不要塞进一个 commit**：多个独立脚本的改造、改造 + 加新功能、改造 + 重命名

Commit message 用 conventional commits：

- `refactor(core): make curator-apply importable as library`
- `feat(mcp): add server with archive_session and maintain tools`
- `feat(hosts): add openclaw integration adapter`
- `test(core): add smoke tests for curator-apply`
- `docs: update refactor-plan status to step 2`

## When to ask vs proceed

**直接干**：按 `refactor-pattern.md` 改造单个 core 脚本、补测试、commit、修文档错别字、按 plan 推进到下一步。

**停下来问我**：
- 完成 Step 0 audit（**audit 完必须停**）
- 偏离 refactor-plan 的步骤顺序
- 想改外部契约（session-packet schema、registry 格式、layout preset）
- 想引入新依赖
- 发现某个 core 脚本里有看起来"绑定 openclaw"的代码（先确认再改）
- 发现 plan 里没覆盖到的边界情况
- 发现 audit 结论与 plan 假设有重大分歧

## Detailed docs (read on demand)

**项目概念（已有，PruneMem 域知识）：**
- `@docs/governance.md`
- `@docs/layers-and-lifecycle.md`
- `@docs/execution-context.md`
- `@docs/migration-guide.md` — 注意这是 V3→V4.1 用户升级，不是 0.3 改造
- `@docs/faq.md`

**0.3 改造（这次工作）：**
- `@docs/audit-checklist.md` — Step 0 任务清单（已完成，历史档案）
- `@docs/audit-findings.md` — Step 0 产出（已完成，历史档案）
- `@docs/refactor-plan.md` — 改造步骤 + 当前进度
- `@docs/refactor-pattern.md` — lib+CLI 双模式标准模板（含 curator-apply 完整 before/after）
- `@docs/architecture-target.md` — 目标目录结构、各模块职责边界
- `@docs/contracts.md` — session-packet 输入契约 + 输出格式说明
- `@docs/test-strategy.md` — 用 node:test 给 core 加测试的约定
- `@docs/paths-design.md` — Step 4 spec (paths.js abstraction, D1-D6 locked)