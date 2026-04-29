# Refactor Plan: PruneMem 0.3 — Host-Agnostic Refactor

> 这是 0.3 改造的施工计划，**不是** V3→V4.1 用户升级（那个见 `migration-guide.md`）。

## Status

**Current step:** Step 3 in progress (10/10 files done) — 2026-04-27 — All 10 Step 3 lib化 files completed: check-provider-config, execution-plan, get-working-state, repair-source-paths, build-runtime-context, update-working-state, run-extract, run-judge, update-registries, validate-maintenance.

Note: validate-maintenance was originally listed in Step 3 plan but inadvertently skipped during execution. Earlier progress reports (8/10, 9/10, 10/10) were inconsistent — actual Step 3 file count is 10, completed in two phases: 9 files (commits 8f3fa28..091e69a) plus validate-maintenance (commit b0e2acc) added after T2b discovered the omission.

Step 3 collateral commits: 4ec9b82 (Issue #2 docs), 72f30a7 (cross-platform CLI guard fix), 806ea8c (cli-entry tests rewrite).

Pending Step 3 closeout tasks: T1 run-sample-pipeline unit test ✅, T2 (Step 2b) spawn → import in maintain & run-sample-pipeline ✅, T3 placeholder file decisions ✅ (deleted as unused placeholders — no logic, no callers, no history), T5 Issue #1 root cause investigation.

**⚠️ Step 1 commit 备注：** Commit e9d9178 实际包含项目 initial state (141 files) + archive-session refactor，因 git 历史空白导致打包过大。后续 commit 必须严格控制范围（每个 step 只改对应文件）。Commit 80b263c 和 27a5bc5 已恢复正常粒度。

### Known issues

- **Issue #1: `examples/registry/` contamination during execution.** `run-sample-pipeline` (and possibly other scripts) write into `examples/registry/` during execution. This contaminates the demo workspace and risks accidental commits. Need to investigate in Step 3 when refactoring `run-extract` / `run-judge` / `update-registries` which are likely the actual writers. **Mitigation until then:** always check `git status` after running these scripts and `git checkout -- examples/` if registry files changed.

- **Issue #2: run-extract (commit 635498a) 和 run-judge (commit 5da411f) 的 golden baseline 在改造时被直接覆盖**（用 mock 模式输出替换），跳过了"先 commit mock baseline 再做改造"的正确流程。原因：Step 0 抓 golden 时这两个脚本因缺 API key 失败，抓到的是 PROVIDER_AUTH_MISSING 错误信息，从 Step 0 起就无回归价值。

  现状：经验证（2026-04-27 阶段 C2/C3），当前 golden 与当前代码 mock 输出一致，从这两个 commit 之后任何对 run-extract / run-judge 的改动都会被 golden diff 抓到。这两个文件的回归保护从 commit 时点开始生效，不溯及更早状态。

  未来贡献者注意：如果 mock 模式实现本身被改动（比如 mock 数据生成逻辑、provider factory 的 mock branch），需要重新评估这两个 golden 是否需要重新生成。

每开始/结束一步时更新这里。格式 `Step N (in progress / completed) — YYYY-MM-DD — brief note`。

---

## Audit decisions (locked-in by 2026-04-26)

Audit 结论已被 plan 吸收，下面这些决定**不再讨论**（除非 Step 1+ 实施时发现反证）：

1. **Step 1 pilot = `archive-session-v41.js` + `curator-apply.js`** —— 前者作为模式标杆（已是 lib+CLI 双模式，难度低），后者作为复杂场景验证（279 行，无 main，是真正的难度上限）。两个都改完，模式才算稳。
2. **没有 main() 的脚本（curator-apply / update-registries）→ 直接抽 export，不绕过 main()。** 模式见 `@refactor-pattern.md` 末节。
3. **run-extract / run-judge 加 --mock**，对齐 run-sample-pipeline 现有的 mock 模式。这是**这次改造唯一允许的功能性新增**。Commit 单独做。
4. **Step 4 layout preset 只做 `default` 和 `custom` 两个。** `openclaw` / `hermes` preset 等真做 Step 6 host integration 时再加。原则：**preset 在它的消费方出现之前不要写**。
5. **`retrieve-memory.js` 是死代码**（0 调用方）。MCP server 的 `get_runtime_context` tool 不要碰它，直接基于 `working/state.js` + `core/build-runtime-context.js`。`retrieve-memory.js` 本身的命运放 Step 6 之后再决定（删 / 保留 / 实现），不影响这次改造。
6. **`tests/golden/` 要 commit。** 它是 backward-compat 证据。CI 不重新生成。
7. **测试体系并行**：保留 `tests/regression/`（端到端），新增 `tests/unit/`（用 node:test），`package.json` 加 `"test": "node --test tests/unit/**/*.test.js"`。两个体系互补。
8. **每次改造完，除 golden diff 外，必须跑 `npm run check` 验证回归测试通过。** 这是 audit 发现的免费保险。

---

## Goal

把 PruneMem 从"宿主 agent 专用 CLI 工具集"改造成"host-agnostic library + multi-host integration + MCP server"，**同时保持现有 CLI 行为完全兼容**。

End state：
- `src/core/*.js` 14 个真实脚本全部改成 lib+CLI 双模式（archive-session-v41 已是参考样本，但本身也要按统一签名复审）
- 2 个 placeholder（curate / normalize-legacy-runs）已删除（T3，无逻辑、无引用、无历史）
- `src/lib/paths.js` 扩展为 layout preset 机制，14 个脚本里 25 处硬编码替换为 `getPaths(preset)` 调用
- `src/mcp/server.js` 暴露 PruneMem 能力给 MCP 客户端
- `src/hosts/openclaw/` 和 `src/hosts/hermes/` 按需新增（**注意：不是 `src/adapters/`**——后者已被 backend/provider 占用）
- 算法相关代码**一行不动**

---

## Step 1 — Pilot: archive-session-v41 + curator-apply

**Files affected:**
- `src/core/archive-session-v41.js`（参考标杆，简单）
- `src/core/curator-apply.js`（复杂场景，无 main()）

**Workflow（archive-session-v41 先做）：**

1. 复审 `archive-session-v41.js`：它已经是 lib+CLI 双模式。但要确认它符合**本项目统一的 export 签名规范**（见 `@refactor-pattern.md`）：
   - export 函数签名是不是 `({ workspace, ... } = {})`？
   - 是不是没在 export 函数里调 `process.exit`？
   - CLI shell 是不是用 `import.meta.url` 判断？
   
   如果有偏差，**先把它统一**——它是后续 13 个文件抄的样本，必须先正。
2. golden diff `tests/golden/archive-session-v41.json` 必须空。
3. 写 `tests/unit/core/archive-session-v41.test.js`，至少 1 个 happy path。
4. `npm run check` 通过。
5. Commit：`refactor(core): align archive-session-v41 to standard lib+CLI signature`。

**Workflow（curator-apply 后做）：**

1. 这个脚本无 main()，按 `@refactor-pattern.md` 末节"针对无 main() 脚本"的模式直接抽 export。
2. 业务逻辑**一行不动**，只搬位置 + 改 `args.workspace` → `workspace`。
3. golden diff（与 Step 0 抓的 `tests/golden/curator-apply.json`）必须为空。
4. 写 `tests/unit/core/curator-apply.test.js`，覆盖：默认 workspace、`write=true`、空 registry 三种情况。
5. `npm run check` 通过。
6. Commit：`refactor(core): make curator-apply importable as a library`。

**Verification (both):**
- [ ] golden diff 空
- [ ] `import { archiveSession }` 和 `import { curatorApply }` 在 Node REPL 可用
- [ ] `npm run check` 通过
- [ ] 单元测试通过

**Done when**：上面 4 条全过 + 2 个 commit。

**Estimated time**：archive-session-v41 复审 1 小时；curator-apply 改造半天。

---

## Step 2 — Replace spawn() with import in maintain.js + run-sample-pipeline.js

**Files affected:**
- `src/core/maintain.js`
- `src/core/run-sample-pipeline.js`

**前提**：Step 1 完成后，`curatorApply` / `archiveSession` 已经可 import。但 maintain 和 run-sample-pipeline 调用的可能不止这两个，所以本步真正能完成的范围**取决于已完成 lib 化的脚本数量**。

**Strategy**：
- maintain 里调用的每个 spawn target，**只把已经 lib 化的换掉**，没 lib 化的暂时保留 spawn
- 在文件顶部加 TODO 注释列清楚还需要哪几个脚本 lib 化才能彻底去掉 spawn
- 这意味着 Step 2 可能要拆成 Step 2a / Step 2b（pre-Step 3 / post-Step 3）

**Verification:**
- [ ] golden diff 为空
- [ ] `import { maintain } from '...'` 可用
- [ ] `npm run check` 通过

**Estimated time**：半天（含 Step 2a；Step 2b 在 Step 3 之后顺手补即可，10 分钟）。

---

## Step 3 — Refactor remaining 12 core scripts + add --mock

**Files affected**：以下 12 个真实脚本（按"先简单、再复杂"的近似顺序）：

短小型（<100 行，简单）：
- `check-provider-config.js` (27)
- `execution-plan.js` (25)
- `get-working-state.js` (20)
- `repair-source-paths.js` (47)
- `build-runtime-context.js` (44)
- `update-working-state.js` (60)
- `run-extract.js` (57) ← **同时加 --mock**
- `run-judge.js` (66) ← **同时加 --mock**

中型：
- `update-registries.js` (169，无 main())
- `validate-maintenance.js` (214)

**特别处理：**

- **Placeholder（curate.js / normalize-legacy-runs.js）**：已删除（T3，无逻辑、无引用、无历史）。
- **`archive-session-v41.js` 重命名**：暂缓决定。Audit 显示 `runtime/archive-session.js` 已经存在并且是它依赖的库，core/v41 只是 CLI 入口。重命名会增加混淆（"哪个 archive-session 是哪个"）。**保留 v41 后缀，等 Step 6 host integration 上线后再综合考虑**。
- **`--mock` 对齐**：`run-extract.js` 和 `run-judge.js` 加 `--mock` 时，看 `run-sample-pipeline.js` 现有的 mock 模式怎么实现，照抄。**不要发明新机制**。Commit 单独做：`feat(core): add --mock to run-extract and run-judge for deterministic testing`。

**Per-file workflow**：
1. 按 `@refactor-pattern.md` 改造（无 main 的看末节）
2. golden diff 验证（与 Step 0 抓的 baseline）
3. 写至少一个 unit test（覆盖 happy path）
4. `npm run check` 通过
5. **单独 commit**：每个文件一个 commit
6. 改完之后回到 Step 2b，把 maintain / run-sample-pipeline 里剩余的 spawn 换成 import
7. **完成 run-extract / run-judge 的 --mock 改造后**，回头给 `run-sample-pipeline` 补一个 unit test（用 `--mock` 模式）。这是 Step 2a 时挂的债，Step 3 必须还掉。

**关于 run-extract / run-judge 的 golden**：Step 0 因为缺 API key 没抓到 baseline。改造**前**先用 mock 模式抓一份临时 baseline（commit 之前），改造**后**用同样的 mock 输入比对。这是这两个脚本的 backward-compat 验证方式。

**Estimated time**：1.5–2 天。

---

## Step 4 — Path layout abstraction + JSON Schema

**Files affected:**
- 扩展 `src/lib/paths.js`：从单一 `defaultPaths()` 扩展为 `getPaths(workspace, preset?, overrides?)`，支持 `default` 和 `custom` 两个 preset
- 修改 14 个 core 脚本里 **25 处** `path.join(root, 'examples', ...)` → `getPaths(workspace).xxx`
- 新建 `docs/schemas/session-packet.schema.json`（从 `src/lib/validate-input.js` 逆推）
- 新建 `docs/schemas/registry-entry.schema.json`

**关键约束**：默认 preset 必须仍然指向 `examples/` 路径，即不传 `--layout` 时 CLI 行为完全不变（zero migration cost）。

**`getPaths` 签名（提议）：**

```js
// src/lib/paths.js
export function getPaths(workspace, preset = 'default', overrides = {}) {
  const presets = {
    default: {
      registry: 'examples/registry',
      pipeline: 'examples/pipeline',
      layers: 'examples/layers',
      // ... 把 25 处硬编码用过的所有路径都列进来
    },
    custom: overrides,  // 用户传啥用啥
  };
  const p = presets[preset];
  if (!p) throw new Error(`Unknown layout preset: ${preset}`);
  return Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k, path.join(workspace, v)])
  );
}
```

注意：`openclaw` / `hermes` preset **不在本 Step 范围内**（locked-in decision #4）。

**Verification:**
- [ ] 默认 preset 下 14 个脚本 golden diff 全空
- [ ] `--layout custom` 配合 `--paths-overrides '{"registry": "my/path"}'` 能跑通（CLI 怎么传 custom 时具体讨论）
- [ ] schema 文件用 `ajv` 能 validate `examples/pipeline/sample-run-01/session-packet.json`
- [ ] README 加一段 "External integration"
- [ ] `npm run check` 通过

**Estimated time**：1 天。

---

## Step 5 — MCP server

**Files affected:**
- 新建 `src/mcp/server.js`
- 新建 `src/mcp/tools.js`
- 更新 `package.json`：加 bin entry `"prunemem-mcp": "./src/mcp/server.js"`
- 新增依赖：`@modelcontextprotocol/sdk`（这次改造唯一允许新增的运行时依赖）

**Tools to expose (initial set):**
- `prunemem.archive_session(packet, workspace?)` → 输入 session packet，跑完整 pipeline
- `prunemem.run_maintenance(workspace?, write?)` → 跑 maintain 治理
- `prunemem.get_runtime_context(workspace?)` → 给宿主取当前 working-memory + runtime context
  - **重要**：这个 tool **不调** `runtime/retrieve-memory.js`（那是死代码）。直接 `import { buildRuntimeContext } from '../core/build-runtime-context.js'` + 读 `working/state.js`。
- `prunemem.validate_workspace(workspace?)` → 检查 workspace 完整性

**Verification:**
- [ ] `npx @modelcontextprotocol/inspector node src/mcp/server.js` 能列出 tools
- [ ] 每个 tool 在 inspector 里能成功调用
- [ ] tools 内部全部 `import` 调 core，**没有 `spawn`**
- [ ] Claude Desktop 配置能跑通端到端

**Estimated time**：1-2 天。

---

## Step 6 — Host integrations (按需)

**目录命名**：`src/hosts/openclaw/`、`src/hosts/hermes/`（**不是 `src/adapters/<host>/`**）。

**复用模式**：Audit Task 5 确认 `src/adapters/index.js` 是基类继承模式。`src/hosts/` 可以复用同样思路——定义 `HostAdapter` 基类，各宿主继承。但**真做的时候再决定细节**。

**Default: skip.** MCP server 已经能让大多数 agent 通过 MCP 接入。除非有用户明确要求"原生 host plugin"，否则延后到 0.4。

如果真要做这一步，作为 Step 6 启动前的子任务，先决定：
- `runtime/retrieve-memory.js` 死代码的处理（删 / 实现 / 改名）
- `archive-session-v41.js` 是否最终重命名
- `openclaw` / `hermes` layout preset 加进 `lib/paths.js`

---

## What NOT to do during this migration

- ❌ 优化 core 业务逻辑（评分、判分、合并算法）—— 留给 0.4
- ❌ 引入新的运行时依赖（除了 Step 5 的 `@modelcontextprotocol/sdk`）
- ❌ 重命名公开 CLI flag、环境变量、文件路径约定（archive-session-v41 也不重命名，Step 6 时再综合决定）
- ❌ 改动 `examples/` 下任何 sample data
- ❌ 修改 session-packet schema 或 registry jsonl 格式
- ❌ 同时做多个 step（一个时间窗口只推进一步）
- ❌ 把 host-specific 代码放进 `src/adapters/`（那是 backend/provider 的家）
- ❌ 删 `runtime/retrieve-memory.js`（即使它是死代码——Step 6 之前不动它，避免无关变更）
- ❌ 写 `openclaw` / `hermes` 的 layout preset（在 Step 6 之前都没用）
