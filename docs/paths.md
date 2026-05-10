# paths.md — Host Adapter 接入指南

本文档面向**集成 PruneMem 的宿主（host）开发者**：如果你要把 PruneMem 的记忆治理 pipeline（提取 → 判断 → 归档）接入自己的 agent 框架，你需要通过 `src/lib/paths.js` 的 `getPaths()` 函数告诉 PruneMem"记忆该写到哪、从哪读"。本文档是 paths.js 的使用者指南；设计决策、修订历史、以及 core 脚本实现者的消费方契约，见 `paths-design.md`。

## 1. 概览（What is paths.js）

PruneMem 的 core 脚本（如 `update-registries.js`、`curator-apply.js`）不再硬编码 `examples/registry/` 等 demo workspace 路径，而是通过 `getPaths()` 解析 workspace 布局。你作为 host adapter 开发者，只需要提供一次路径配置，所有 core 函数就会自动把记忆写到正确的位置。

`paths.js` 解决三个问题：

1. **防止 demo workspace 污染**。`default` preset 保持跟旧版本硬编码路径的字节级兼容，适合已有项目平滑升级；`isolated` preset 把所有写入重定向到独立的临时目录（如 `.prunemem-isolated/`），确保运行不会修改 `examples/` 下的任何文件，适合持续集成或并发测试场景。

2. **Host-agnostic**。不同宿主框架的目录约定各不相同——有的喜欢集中放在 `~/.my-agent/`，有的放在项目内 `.prunemem/` 子目录，有的甚至完全不需要 MEMORY.md。通过 `preset: 'custom'` 搭配 `override` 对象，你可以只覆盖自己关心的字段，其余字段自动回落到默认值，无需 fork 或修改 core 脚本。

3. **测试隔离**。在单元测试或回归测试中传入 `preset: 'isolated'`，所有生成物（如 `extracted.generated.json`、`judged.generated.json`）都会写到隔离目录，测试结束直接删除即可。这消除了"跑测试后 git status 变脏"的问题，也避免了多个测试并发写同一个 registry 导致的竞态。

## 2. API 表面

### 2.1 getPaths 函数签名

```js
import { getPaths } from './src/lib/paths.js';

/**
 * Resolve filesystem paths for a PruneMem workspace.
 *
 * @param {object} [options]
 * @param {string} [options.workspace]   - workspace root，默认为 `process.cwd()`；会解析为绝对路径
 * @param {string} [options.preset='default'] - 'default' | 'isolated' | 'custom'
 * @param {object} [options.override]    - 部分 Paths 字段，覆盖 preset 默认值；在所有 preset 下都生效
 * @returns {Paths}
 */
function getPaths({ workspace, preset = 'default', override } = {});
```

**参数说明**

- **`workspace`** — 宿主工程根目录。不传时默认用当前工作目录。返回值中的 `paths.workspace` 是该目录的绝对路径（`path.resolve` 解析后）。
- **`preset`** — 预设布局模板。`default` 兼容旧版本硬编码路径；`isolated` 把写路径隔离到临时目录；`custom` 是 `default` 的语义别名，专门用于表达"这是定制配置"的意图。
- **`override`** — 在所有 preset 下都生效。是一个对象，键为 Paths 字段名（如 `registry`、`memoryMd`），值为新的绝对或相对路径字符串，或显式 `null`。即使使用 `default` 或 `isolated`，你也可以传入 `override` 做局部调整。

**返回值**

返回一个 `Paths` 对象（详见 §2.2）。所有路径字段（除 `workspace` 外）若未被覆盖，均相对于 `workspace` 解析为绝对路径。

**最小调用示例**

```js
// TODO: 当前 PruneMem 尚未发布为 npm 包，以下路径为仓库内引用语法。
// 正式发布后预计改为：import { getPaths } from 'prunemem/lib/paths';
import { getPaths } from './src/lib/paths.js';

// 使用默认布局
const paths = getPaths({ workspace: '/home/agent/project' });

// 使用 isolated 布局（测试场景）
const paths = getPaths({ workspace: '/home/agent/project', preset: 'isolated' });
```

---

### 2.2 Paths 对象字段

`Paths` 对象包含 10 个字段（按推荐遍历顺序排列）。所有路径字段在返回值中均为绝对路径；`null` 表示该路径被显式 opt-out。

| 字段名 | 类型 | 写 / 读用途 | default 下的值 | isolated 下的值 | 何时为 `null` |
|---|---|---|---|---|---|
| `workspace` | `string` | — | `path.resolve(workspace \| cwd)` | 同 default | 永不 |
| `registry` | `string` | **写**：`*.jsonl` registry 文件 | `<workspace>/examples/registry` | `<workspace>/.prunemem-isolated/registry` | 通常永不为 null（spec 不规范化非 memoryMd 字段的 opt-out 语义） |
| `registryRead` | `string` | **读**：读取 registry 的源目录 | `<workspace>/examples/registry` | `<workspace>/examples/registry` | 通常永不为 null（spec 不规范化非 memoryMd 字段的 opt-out 语义） |
| `pipeline` | `string` | **写**：pipeline 生成的中间产物（如 `extracted.generated.json`） | `<workspace>/examples/pipeline` | `<workspace>/.prunemem-isolated/pipeline` | 通常永不为 null（spec 不规范化非 memoryMd 字段的 opt-out 语义） |
| `pipelineRead` | `string` | **读**：读取 pipeline 输入 fixture | `<workspace>/examples/pipeline` | `<workspace>/examples/pipeline` | 通常永不为 null（spec 不规范化非 memoryMd 字段的 opt-out 语义） |
| `workingMemory` | `string` | **写**：working memory 状态文件 | `<workspace>/examples/working-memory` | `<workspace>/.prunemem-isolated/working-memory` | 通常永不为 null（spec 不规范化非 memoryMd 字段的 opt-out 语义） |
| `workingMemoryRead` | `string` | **读**：读取 working memory 状态 | `<workspace>/examples/working-memory` | `<workspace>/examples/working-memory` | 通常永不为 null（spec 不规范化非 memoryMd 字段的 opt-out 语义） |
| `memoryMd` | `string \| null` | **写**：MEMORY.md 渲染输出 | `<workspace>/examples/MEMORY.example.md` | `<workspace>/.prunemem-isolated/MEMORY.md` | `override.memoryMd === null` 时（同时联动 `memoryMdRead` 也为 `null`） |
| `memoryMdRead` | `string \| null` | **读**：读取 MEMORY.md 模板或源文件 | `<workspace>/examples/MEMORY.example.md` | `<workspace>/examples/MEMORY.example.md` | `override.memoryMd === null` 时联动为 `null`；或 `override.memoryMdRead` 单独设为 `null` |
| `preset` | `string` | — | `'default'` | `'isolated'` | 永不 |

**关于读写分离字段（`*Read`）**

`registry` / `registryRead` 等成对字段的设计意图是：写路径和读路径可以分离。`isolated` preset 利用这一点把**写**重定向到 `.prunemem-isolated/`，但**读**仍保留在 `examples/`，从而在不修改 fixture 的前提下实现零污染测试。

**消费方该用哪个字段？**

- 生成或覆写文件时 → 用**不带 `Read` 后缀**的字段（`registry`、`pipeline`、`workingMemory`、`memoryMd`）。
- 读取已有 fixture 或模板时 → 用**带 `Read` 后缀**的字段（`registryRead`、`pipelineRead`、`workingMemoryRead`、`memoryMdRead`）。
- 例外：如果某个步骤的输入恰好是前一步在同一次运行中的输出（如 `runJudge` 读取 `runExtract` 刚写的 `extracted.generated.json`），则应读**写路径**（即前一步用的输出字段），因为它不在 `*Read` 位置。

---

### 2.3 preset 枚举值

`preset` 参数只接受以下三个字符串值。传入其他值会抛出 `Error: unknown preset: xxx`。

| 值 | 语义 |
|---|---|
| `'default'` | 与旧版本硬编码路径字节级兼容。所有读写路径均指向 `examples/` 子目录。 |
| `'isolated'` | 写路径隔离到 `.prunemem-isolated/`，读路径仍保留在 `examples/`。适合测试和 CI。 |
| `'custom'` | `default` 的语义别名，行为上等同于 `default + override`。用于表达"这是定制配置"的意图；不传 `override` 时与 `default` 完全一致。 |

**`override` 的 merge 规则（在所有 preset 下生效）**

`override` 按以下规则合并到所选 preset 的基底上：

1. **浅 merge** — 只处理 `override` 的顶层字段。不会递归合并嵌套对象（Paths 本身也没有嵌套字段，因此这条主要是防御性约束）。
2. **`undefined` = fallback** — 如果 `override` 中某个字段的值为 `undefined`，则跳过该字段，使用 `default` 基底的值。这允许你条件性地构造 override 对象而不必过滤键。
3. **显式 `null` 保留为 `null`** — 如果 `override` 中某个字段的值为 `null`，则最终 Paths 中该字段为 `null`。最常见的用途是 `override: { memoryMd: null }`，表示宿主选择不维护 MEMORY.md。
4. **D3 coupling** — 若 `override.memoryMd === null`，则 `memoryMdRead` 会被**强制联动**为 `null`，即使 `override` 里没有显式写 `memoryMdRead`。这是为了确保消费方不会尝试去读一个已 opt-out 的文件。
5. **未知字段 silent ignore** — 如果 `override` 包含 Paths 中不存在的键（如拼写错误 `registery`），该键会被静默忽略，不会报错也不会影响其他字段。这降低了 future-proofing 的摩擦，但这也意味着拼写错误不会被捕获——请对照 §2.2 表格核对键名。

## 3. 三种 preset 详解

### 3.1 default — 字节级兼容

`default` 是 `getPaths()` 的默认 preset，与 PruneMem 旧版本硬编码路径保持字节级兼容。使用此 preset 时，所有读写路径均指向 `examples/` 子目录：

```
<workspace>/examples/registry
<workspace>/examples/pipeline
<workspace>/examples/working-memory
<workspace>/examples/MEMORY.example.md
```

"字节级兼容"的具体含义是：同一 workspace 下，`getPaths({ preset: 'default' })` 解析出的每个绝对路径，与 paths.js 引入之前 core 脚本内部硬编码的路径完全一致。这意味着升级到 0.4.0 后，如果你不改任何调用代码，所有文件读写位置与之前分毫不差。

**适用场景**：已有 PruneMem 项目平滑升级；生产环境运行；任何需要"跟旧行为完全一致"的场合。

---

### 3.2 isolated — 测试隔离

`isolated` preset 的核心设计是**读写分离**：读路径保留在 `examples/`（fixture 和模板不动），写路径重定向到 `.prunemem-isolated/`：

| 用途 | 路径 |
|---|---|
| 读 registry | `<workspace>/examples/registry` |
| **写** registry | `<workspace>/.prunemem-isolated/registry` |
| 读 pipeline | `<workspace>/examples/pipeline` |
| **写** pipeline | `<workspace>/.prunemem-isolated/pipeline` |
| 读 working memory | `<workspace>/examples/working-memory` |
| **写** working memory | `<workspace>/.prunemem-isolated/working-memory` |
| 读 MEMORY.md | `<workspace>/examples/MEMORY.example.md` |
| **写** MEMORY.md | `<workspace>/.prunemem-isolated/MEMORY.md` |

这种分离保证测试可以从 `examples/` 读取稳定的 fixture，但所有生成物（如 `*.generated.json`、更新后的 jsonl registry）都写到隔离目录。测试结束后直接删除 `.prunemem-isolated/` 即可还原干净状态，不会污染 git 跟踪的文件。

**关键契约：父目录由消费方自行创建**

`.prunemem-isolated/` 目录在 `.gitignore` 中，clone 后不存在。使用 isolated preset 的 core 函数或测试代码，在写文件前必须自行确保父目录存在：

```js
import fs from 'node:fs/promises';
import path from 'node:path';

// paths.registry 是目录路径，isolated preset 下指向 .prunemem-isolated/registry/
// clone 后 .prunemem-isolated/ 不存在，需创建：
await fs.mkdir(paths.registry, { recursive: true });

// 之后写文件不需要再 mkdir：
// await fs.writeFile(path.join(paths.registry, 'memories.jsonl'), ...);
```

这与 default preset 形成对比：default 下 `examples/` 子目录被 git 跟踪，总是存在，不需要额外创建。

**适用场景**：单元测试（避免 `git status` 变脏）、CI 流水线（确保并发测试互不干扰）、需要反复跑 pipeline 但不希望修改 demo 数据的本地开发。

---

### 3.3 custom — host adapter 主用模式

`custom` 是 `default` 的语义别名，行为上等同于 `default + override`。它的唯一作用是向阅读代码的人传达"这不是默认配置，而是宿主定制的布局"。由于 `override` 在所有 preset 下都生效，以下两行代码的结果完全相同：

```js
getPaths({ preset: 'default', override: { registry: '/my/custom/registry' } });
getPaths({ preset: 'custom', override: { registry: '/my/custom/registry' } });
```

推荐 host adapter 开发者显式使用 `preset: 'custom'`，让代码意图更清晰。

**实战示例 1：只改 registry，其余保持默认**

你的 agent 框架想把长期记忆 registry 集中管理到 `~/.my-agent/memories/`，但 pipeline 和 working memory 仍放在项目内：

```js
import { getPaths } from './src/lib/paths.js';
import path from 'node:path';
import os from 'node:os';

const globalMemDir = path.join(os.homedir(), '.my-agent', 'memories');

const paths = getPaths({
  workspace: '/home/agent/project',
  preset: 'custom',
  override: {
    registry: globalMemDir,
    // pipeline、workingMemory、memoryMd 等字段自动回落到 default 值
  },
});

// paths.registry      => <homedir>/.my-agent/memories
// paths.pipeline      => /home/agent/project/examples/pipeline
// paths.memoryMd      => /home/agent/project/examples/MEMORY.example.md
```

**实战示例 2：不维护 MEMORY.md**

你的宿主已经有自己的文档系统，不需要 PruneMem 生成 MEMORY.md。通过 `memoryMd: null` opt-out，同时 D3 coupling 会自动把 `memoryMdRead` 也设为 `null`：

```js
const paths = getPaths({
  workspace: '/home/agent/project',
  preset: 'custom',
  override: {
    memoryMd: null,
  },
});

// paths.memoryMd     => null
// paths.memoryMdRead => null（D3 coupling 自动联动）
```

消费方在调用 core 函数前应检查 `paths.memoryMdRead === null`，跳过 MEMORY.md 相关的读取或检查步骤。例如 `validate-maintenance.js` 在 D3 联动后会自动跳过 MEMORY.md 的 required-files 检查和重复 bullet 检查，不会因 MEMORY.md 不存在而报错。

§4 会进一步展开三种典型 host 形态（独立目录型、子目录型、无 MEMORY.md 型）的完整接入模板。

## 4. host adapter 接入

### 4.1 标准接入模式

把 PruneMem 接入宿主框架的标准流程只有 5 步：

1. **确定 workspace** — 通常是宿主项目的根目录或一个子目录。
2. **选择 preset** — 生产环境用 `custom`（语义清晰）；测试用 `isolated`。
3. **构造 override**（可选）— 只覆盖你关心的字段，其余自动回落。
4. **调用 `getPaths()`** — 得到包含所有绝对路径的 `Paths` 对象。
5. **把 `paths` 传给 core 函数** — core 函数内部不再自行解析路径。

以下是一段可以直接复制到 host adapter 入口的完整模板：

```js
import path from 'node:path';
import os from 'node:os';
import { getPaths } from './src/lib/paths.js';
import { updateRegistries } from './src/core/update-registries.js';

// 1. 确定 workspace（宿主自行决定怎么找）
const workspace = process.env.AGENT_PROJECT_ROOT || process.cwd();

// 2-4. 构造 paths
const paths = getPaths({
  workspace,
  preset: 'custom',
  override: {
    // 示例：把 registry 重定向到宿主自己的目录
    registry: path.join(os.homedir(), '.my-agent', 'memories', 'registry'),
    // 其他字段保持 default
  },
});

// 5. 调用 core 函数，传 paths 而不是 workspace
await updateRegistries({
  paths,         // core 函数内部不再调用 getPaths()
  judged: path.join(paths.pipelineRead, 'sample-run-01', 'judged.generated.json'),
  sourcePaths: path.join(paths.pipelineRead, 'sample-run-01', 'apply.json'),
  memoryId: 'mem-example-generated',
  channel: 'webchat',
  agent: 'demo',
  // write 默认 false（dry-run），生产环境根据需要开启
});
```

**`paths` 参数优先（D4）**

所有已改造的 core 函数（如 `updateRegistries`、`curatorApply`、`runSamplePipeline`）都遵循同一约定：如果调用方显式传了 `paths`，函数直接使用该对象，跳过内部 `getPaths()` 调用。这带来两个好处：

- **效率**：避免同一个 workspace 被重复解析多次。
- **确定性**：宿主完全控制路径，不受 cwd 变化或环境变量干扰。

如果你传了 `workspace` 但没传 `paths`，core 函数会自行调用 `getPaths({ workspace, preset, override })`。因此建议 host adapter 在入口层构造一次 `paths`，之后只传 `paths`。

---

### 4.2 三种典型 host 形态（hypothetic）

> **注意**：以下三种形态是参考示例。仓库当前没有真实的 host adapter 实现（Step 5+ 会在 `src/hosts/<n>/` 目录下实施具体适配器），以下代码仅供理解 `override` 的用法。

**形态 A：独立目录型**

宿主把记忆完全放在自己的目录树，与项目 workspace 解耦。适合有多个项目共享同一套长期记忆的场景：

```js
import path from 'node:path';
import os from 'node:os';
import { getPaths } from './src/lib/paths.js';

const hostRoot = path.join(os.homedir(), '.my-agent', 'memories');

const paths = getPaths({
  workspace: '/home/agent/project',
  preset: 'custom',
  override: {
    registry:            path.join(hostRoot, 'registry'),
    registryRead:        path.join(hostRoot, 'registry'),
    pipeline:            path.join(hostRoot, 'pipeline'),
    pipelineRead:        path.join(hostRoot, 'pipeline'),
    workingMemory:       path.join(hostRoot, 'working-memory'),
    workingMemoryRead:   path.join(hostRoot, 'working-memory'),
    memoryMd:            path.join(hostRoot, 'MEMORY.md'),
    memoryMdRead:        path.join(hostRoot, 'MEMORY.md'),
  },
});
```

**形态 B：子目录型（最常见）**

宿主在 workspace 内创建一个子目录（如 `.prunemem/`），所有记忆相关文件都落在里面。这是大多数项目的首选模式，因为路径自包含、备份方便、权限清晰：

```js
import path from 'node:path';
import { getPaths } from './src/lib/paths.js';

const workspace = '/home/agent/project';
const memDir = path.join(workspace, '.prunemem');

const paths = getPaths({
  workspace,
  preset: 'custom',
  override: {
    // 写路径 → 子目录
    registry:         path.join(memDir, 'registry'),
    pipeline:         path.join(memDir, 'pipeline'),
    workingMemory:    path.join(memDir, 'working-memory'),
    memoryMd:         path.join(memDir, 'MEMORY.md'),

    // 读路径 → 保留 default（从 examples/ 读 fixture）
    // 如果 host 也把自己的 fixture 放进 .prunemem/，则 registryRead 等也应 override
  },
});
```

子目录型的优势在于：它与项目代码一起被 git 跟踪（如果你把 `.prunemem/` 加入 git），团队成员开箱即用；如果你把 `.prunemem/` 写进 `.gitignore`，则获得与 isolated preset 类似的隔离效果，但路径位置由宿主明确控制。

**形态 C：无 MEMORY.md 型**

宿主不需要 PruneMem 生成 MEMORY.md（已有自己的文档系统）。通过 D3 opt-out 一行代码解决：

```js
import { getPaths } from './src/lib/paths.js';

const paths = getPaths({
  workspace: '/home/agent/project',
  preset: 'custom',
  override: {
    memoryMd: null,   // D3 coupling 自动把 memoryMdRead 也设为 null
  },
});
```

这是 `override` 最精简的用法：只覆盖一个字段，其余全部自动回落到 default。消费方在调用 `validate-maintenance` 等函数时，应检查 `paths.memoryMdRead === null` 并跳过 MEMORY.md 相关步骤（详见 §3.3）。

---

### 4.3 写盘行为

**写盘是函数级契约，不是 preset 级属性。** 选择 `isolated` 或 `custom` 只决定"文件写到哪"，不决定"是否写"。同一个 preset 下，不同 core 函数的默认写行为可能不同：

| core 函数 | 默认行为 | 显式写盘开关 | 说明 |
|---|---|---|---|
| `updateRegistries` | dry-run | `write: true` / `--write` | 默认只计算变更，不修改 `*.jsonl` |
| `curatorApply` | dry-run | `write: true` / `--write` | 同上 |
| `repairSourcePaths` | dry-run | `write: true` / `--write` | 内部通过 `writeJsonIfMissing` 控制 |
| `runExtract` | **无条件写** | 无开关 | 写到 `output` 参数指定的位置（默认基于 `paths.pipeline`） |
| `runJudge` | **无条件写** | 无开关 | 写到 `output` 参数指定的位置（默认基于 `paths.pipeline`） |
| `archiveSessionV41` | 不写盘 | 无开关 | 纯计算，返回 session packet 对象 |

**组合使用**：`dry-run` 与 `isolated` 是两个独立维度。在 CI 中你可以同时启用两者——`isolated` preset 让路径解析指向隔离目录，`write: false` 进一步确保没有真正的写副作用。

---

### 4.4 错误处理

**`getPaths()` 自身的错误边界**

1. **Unknown preset** — 传入 `'default'`、`'isolated'`、`'custom'` 以外的值时，抛出 `Error: unknown preset: <value>`。这是 `getPaths()` 唯一会抛出的错误。
2. **Unknown override fields** — 如果 `override` 包含 Paths 中不存在的键（如拼写错误），该键被**静默忽略**，不会报错。这意味着拼写错误不会被自动捕获，调用方需自行核对 §2.2 的字段名。
3. **Workspace 不存在** — `getPaths()` **不检查** workspace 目录是否存在。它只做 `path.resolve`，然后拼接字符串。目录存在性由消费方在写文件前自行确保。

**消费方边界情况**

- **Ensure dir** — 写文件前，尤其是使用 `isolated` preset 或自定义路径时，务必先创建父目录（详见 §3.2 父目录契约）。
- **Null guard** — 调用 core 函数前检查 `paths.memoryMdRead === null`，跳过 MEMORY.md 相关步骤（详见 §3.3）。
- **显式参数优先** — 某些 core 函数支持显式传 `judged`、`sourcePaths` 等文件路径。如果用户传了，就用用户的；如果不传，函数内部从 `paths` 取默认值。

## 5. 边界 case（FAQ）

### Q1：custom preset 不传 override 会怎样？

行为完全等同 `default`。`custom` 是 `default` 的语义别名，目的是让代码读起来更清晰地表达"这是定制配置"。不传 `override` 时不会报错，也不会生成任何空值——所有字段回落到 `default` preset 的值。详见 §3.3。

### Q2：override 只覆盖一个字段，其他字段会怎样？

其他字段 fallback 到 preset base，不会被清空或覆盖。`override` 是"部分覆盖"语义：你传什么键就覆盖什么键，没传的键保持原样。这是最常见的用法——大多数 host adapter 只需要改 registry 或 memoryMd，其他全保留 default。详见 §2.3 merge 规则。

### Q3：isolated preset 下 examples/ 会被修改吗？

不会。`isolated` 的设计就是**写路径隔离到 `.prunemem-isolated/`，读路径仍走 `examples/`**。所有生成物都写到隔离目录，`examples/` 下的 fixture 和模板完全不动，因此 `git status` 不会变脏。详见 §3.2。

### Q4：为什么 memoryMd 和 memoryMdRead 是分开的？

这是读写分离设计的一部分：写位置（`memoryMd`）可以跟读位置（`memoryMdRead`）不同。例如 `isolated` preset 下，`memoryMd` 指向 `.prunemem-isolated/MEMORY.md`（写），而 `memoryMdRead` 仍指向 `examples/MEMORY.example.md`（读）。此外，host 理论上可以只覆盖 `memoryMdRead` 为 `null` 来关闭读功能而不影响写——虽然最常见的用法是直接覆盖 `memoryMd: null`，让 D3 coupling 自动联动关闭两者。详见 §2.2 表格和 §3.3 实战示例 2。

### Q5：我的 host 不需要 MEMORY.md，怎么跳过？

传 `override: { memoryMd: null }`。D3 coupling 会自动把 `memoryMdRead` 也设为 `null`，消费方代码用 `paths.memoryMdRead === null` 作为 opt-out 信号，跳过 MEMORY.md 相关的读取或检查步骤。例如 `validate-maintenance.js` 在 D3 联动后会自动跳过相关检查，不会因 MEMORY.md 不存在而报错。详见 §3.3 实战示例 2 和 §4.2 形态 C。
