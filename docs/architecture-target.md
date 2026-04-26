# Target Architecture (PruneMem 0.3+)

> **重要前置**：本文档描述 0.3 改造**完成后**的目标结构。当前实际结构在某些方面已经接近目标（比如 `src/lib/`、`src/runtime/` 已经丰富存在）。具体起点以 Step 0 audit 结论为准。

## Directory tree

```
prunemem/
├── src/
│   ├── core/                      ← CLI 入口 + lib export 的双模式脚本
│   │   ├── archive-session-v41.js   (或重命名为 archive-session.js，待 audit)
│   │   ├── build-runtime-context.js
│   │   ├── check-provider-config.js
│   │   ├── curator-apply.js
│   │   ├── execution-plan.js
│   │   ├── get-working-state.js
│   │   ├── maintain.js              ← 编排：调上面几个
│   │   ├── repair-source-paths.js
│   │   ├── run-extract.js
│   │   ├── run-judge.js
│   │   ├── run-sample-pipeline.js
│   │   ├── update-registries.js
│   │   ├── update-working-state.js
│   │   ├── validate-maintenance.js
│   │   ├── (curate.js / normalize-legacy-runs.js — placeholder, 待处理)
│   │   └── index.js               ← 新增（Step 3 后），re-export 所有公开 API
│   │
│   ├── lib/                       算法 / 数据契约辅助（已有）
│   │   ├── lifecycle.js
│   │   ├── paths.js               ← 待 audit 确认是否已实现 layout preset
│   │   ├── registry.js
│   │   ├── schema.js
│   │   ├── similarity.js
│   │   ├── text-normalize.js
│   │   └── validate-input.js
│   │
│   ├── runtime/                   运行时支持（已有，丰富）
│   │   ├── archive-session.js     ← 与 core/archive-session-v41.js 关系待 audit
│   │   ├── execution-context.js
│   │   ├── load-config.js
│   │   ├── policy.js
│   │   ├── prompt-templates.js
│   │   ├── provider-errors.js
│   │   ├── provider-factory.js
│   │   └── retrieve-memory.js     ← internal 还是 host-facing？待 audit
│   │
│   ├── working/state.js           working memory（已有）
│   ├── extract/extract-facts.js   抽取（已有）
│   ├── judge/judge-facts.js       分类（已有）
│   ├── archive/build-session-packet.js  packet 构建（已有）
│   │
│   ├── adapters/                  ⚠️ 已存在，且语义是 backend/provider
│   │   ├── bailian-provider.js          (model provider)
│   │   ├── file-backend.js              (storage backend)
│   │   ├── index.js                     (注册机制)
│   │   ├── openai-compatible-provider.js (model provider)
│   │   └── qmd-backend.js               (storage backend)
│   │   ↑ 不要把 host 集成放进这里
│   │
│   ├── hosts/                     ← 新增（Step 6 按需），host integration
│   │   ├── openclaw/
│   │   │   ├── index.js
│   │   │   └── README.md
│   │   └── hermes/
│   │       ├── index.js
│   │       └── README.md
│   │
│   └── mcp/                       ← 新增（Step 5），MCP server
│       ├── server.js              entry: prunemem-mcp
│       ├── tools.js               tool definitions
│       └── README.md
│
├── tests/
│   ├── core/                      一个 core 脚本一个 .test.js
│   ├── runtime/
│   ├── lib/
│   ├── golden/                    Step 0 抓的 CLI baseline
│   ├── fixtures/                  共享测试数据
│   └── helpers/
│
├── docs/
│   ├── ── 项目概念（已有） ──
│   ├── governance.md
│   ├── layers-and-lifecycle.md
│   ├── execution-context.md
│   ├── migration-guide.md         V3→V4.1 用户升级
│   ├── faq.md
│   ├── ── 0.3 改造（这次工作） ──
│   ├── audit-checklist.md
│   ├── audit-findings.md          Step 0 产出
│   ├── refactor-plan.md
│   ├── refactor-pattern.md
│   ├── architecture-target.md     ← 这份文档
│   ├── contracts.md
│   ├── test-strategy.md
│   └── schemas/                   Step 4 新建
│       ├── session-packet.schema.json
│       └── registry-entry.schema.json
│
├── examples/                      demo workspace（不动）
├── CLAUDE.md
├── README.md
├── CHANGELOG.md
└── package.json
```

## Two kinds of "adapter" — don't confuse them

PruneMem 涉及两层 pluggability，命名需要明确分开：

| 层 | 目录 | 职责 | 例子 |
|---|---|---|---|
| **Infrastructure adapters** | `src/adapters/` | 模型提供商 + 存储后端 | bailian, openai-compatible, file-backend, qmd-backend |
| **Host integrations** | `src/hosts/`（新增） | 跟外部 agent 系统的对接 | openclaw, hermes |

为什么要分开：它们的使用方完全不同。Infrastructure adapters 是**PruneMem 内部**用的（"我用哪个 LLM 跑 judge"），host integrations 是**外部 agent 系统**用的（"我是 OpenClaw，怎么把会话喂给 PruneMem"）。

## Module responsibilities

### `src/core/` (target after refactor)

**Owns**：所有 CLI 入口 + 对应的 library export。

**Pattern**：每个文件 `export async function fooBar(options)` + CLI shell + `import.meta.url` 判断（详见 `@refactor-pattern.md`）。

**Depends on**：`src/lib/`、`src/runtime/`、`src/working/`、`src/extract/`、`src/judge/`、`src/archive/`、`src/adapters/`，以及 Node 标准库。

**Does NOT depend on**：`src/hosts/`、`src/mcp/`（这是反向依赖）。

### `src/lib/` (existing)

**Owns**：算法 helper、schema 验证、registry 操作、相似度计算、文本规范化、路径解析。

**所有模块都是 importable 库形态**，没有 CLI。这次改造不动这里。

### `src/runtime/` (existing)

**Owns**：运行时支持——配置加载、provider factory、prompt 模板、错误类型、execution context、archive session、retrieve memory（internal）。

**所有模块都是 importable 库形态**，没有 CLI。这次改造不动这里。

### `src/adapters/` (existing — DON'T touch this directory's purpose)

**Owns**：基础设施可替换性。两类：

- **Model providers**：`bailian-provider.js`、`openai-compatible-provider.js`。被 `runtime/provider-factory.js` 选择。
- **Storage backends**：`file-backend.js`、`qmd-backend.js`。负责数据落地的物理形式。

**`qmd-backend.js` 在这里是合法的**——它是可选 backend，不是 hard dep。

`src/adapters/index.js` 是注册/选择机制。Step 0 audit Task 5 会判断它能不能复用给 host integration。

### `src/hosts/<n>/` (new — Step 6 if needed)

**Owns**：跟某个具体 agent 系统的集成。比如：

- 怎么读 OpenClaw 的 daily notes 拼成 session packet
- 怎么把 PruneMem 的输出落到 Hermes 的三层记忆目录里
- 怎么挂 hook 到宿主的生命周期事件

**Depends on**：`src/core/`（**只通过 export 的函数调，不直接 reach into 内部模块**）+ 宿主特定的 SDK / 约定。

**Hard rule**：host 之间互不依赖。`hosts/openclaw/` 不准 `import` 任何 `hosts/hermes/` 的东西。

### `src/mcp/` (new — Step 5)

**Owns**：把 core 的能力暴露成 MCP tools。

**Depends on**：`src/core/` + `@modelcontextprotocol/sdk`。

**Why separate from hosts**：MCP 不是某个具体 agent，是一个**协议层**。通过 MCP 接入的可以是 Claude Desktop、Cursor、Cline、未来任何 MCP 客户端。

## Data flow (target state)

```
┌─────────────────┐
│   any host:     │
│   OpenClaw,     │
│   Hermes,       │ ──→  session packet (JSON, conforms to schema)
│   custom,       │
│   MCP client    │
└─────────────────┘
         │
         ▼
┌──────────────────┐
│ src/hosts/X/     │  (or src/mcp/, or direct import / CLI)
│   pre-process    │  把宿主格式翻译成 session packet
└──────────────────┘
         │
         ▼  import { ... } from 'src/core/'
┌──────────────────┐
│   src/core/      │ ── reads ──→ src/runtime/, src/lib/, src/working/
│   - extract      │              src/extract/, src/judge/, src/archive/
│   - judge        │
│   - curator      │ ── reads/writes via ──→ src/adapters/
│   - validate     │   (model providers, storage backends)
└──────────────────┘
         │
         ▼  writes via storage backend
┌──────────────────┐
│  workspace/      │
│   layers/        │
│   registry/      │
│   working-memory/│
│   archives/      │
└──────────────────┘
```

## Hard-rule grep

CI 应该跑这个验证（Step 0 audit Task 6 也跑）：

```bash
# core 层不准出现宿主名字
grep -rni "openclaw\|hermes" \
  src/core/ src/lib/ src/runtime/ src/working/ \
  src/extract/ src/judge/ src/archive/

# 不准出现向量检索相关 buzzword（如果有第三方语义检索做集成，那也是放 src/adapters/ 或 src/hosts/）
grep -rni "vector\|embedding" \
  src/core/ src/lib/ src/runtime/ src/working/ \
  src/extract/ src/judge/ src/archive/
```

**重要**：`src/adapters/` **不**在 grep 范围内，因为 `qmd-backend.js` 合法存在。如果以后加 supermemory / cognee / mem0 后端，也都放 `src/adapters/`，照样不在 grep 范围。

## Anti-patterns

- ❌ 把 host integration 代码放进 `src/adapters/`（那里是 backend/provider 的家）
- ❌ 在 `src/core/` 里 `import` `src/hosts/` 的任何东西（反向依赖）
- ❌ 在 `src/core/` 里读环境变量决定行为（`if (process.env.HOST === 'openclaw')`）。环境检测放 host integration 层。
- ❌ 在 `src/mcp/` 里复制 core 的逻辑。MCP 是薄层，全部走 `import { ... } from '../core/'`。
- ❌ 给 core export 的函数加宿主特定参数（`curatorApply({ workspace, openclawWorkspaceVersion })`）。宿主特定信息在 host 层处理后再调 core。

## Public API surface (after refactor)

`src/core/index.js` 导出（Step 3 完成后整理）：

```javascript
export { curatorApply } from './curator-apply.js';
export { validateMaintenance } from './validate-maintenance.js';
export { archiveSession } from './archive-session-v41.js';  // 名字以最终命名为准
export { buildRuntimeContext } from './build-runtime-context.js';
export { checkProviderConfig } from './check-provider-config.js';
export { createExecutionPlan } from './execution-plan.js';
export { getWorkingState } from './get-working-state.js';
export { updateWorkingState } from './update-working-state.js';
export { runExtract } from './run-extract.js';
export { runJudge } from './run-judge.js';
export { updateRegistries } from './update-registries.js';
export { repairSourcePaths } from './repair-source-paths.js';
export { maintain } from './maintain.js';
export { runSamplePipeline } from './run-sample-pipeline.js';
```

`package.json` 的 `exports` 字段（Step 4–5 完成后加）：

```json
{
  "exports": {
    ".": "./src/core/index.js",
    "./hosts/openclaw": "./src/hosts/openclaw/index.js",
    "./hosts/hermes": "./src/hosts/hermes/index.js",
    "./mcp": "./src/mcp/server.js"
  }
}
```

宿主集成方就可以：

```javascript
import { archiveSession, maintain } from 'prunemem';
import { createOpenclawIntegration } from 'prunemem/hosts/openclaw';
```
