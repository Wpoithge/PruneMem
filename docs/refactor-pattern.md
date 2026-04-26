# Refactor Pattern: lib + CLI Dual Mode

PruneMem 0.3 的核心改造工作就是把 14 个 `src/core/*.js` 脚本（除 2 个 placeholder）改造成"既可以 import 当库用，也能命令行直接跑"。本文档是这个改造的标准模板。

## TL;DR

每个脚本做同一件事：把 `main()` 里干的事抽成一个 **named export 的 pure-ish function**，脚本尾部用 `import.meta.url` 判断"是不是被直接执行"，是的话才走 CLI 入口。

业务逻辑**一行不动**，只搬位置 + 改参数读取来源。

参考标杆：`src/core/archive-session-v41.js` + `src/runtime/archive-session.js` 这一对已经是这个模式（runtime 是库，core 是 CLI 包装），可以作为最简版本对照。

---

## 模式 A：脚本有 `main()` 函数（多数情况）

例：`validate-maintenance.js` / `run-extract.js` / `maintain.js` / 大多数。

### Before（现状）

```javascript
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
// ... other imports

function parseArgs(argv) {
  // 手写 argv 解析
  return { workspace: '.', write: false, limit: 100 };
}

async function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.workspace);

  // ↓ 200 行业务逻辑：读 registry、应用 curator 决策、可选写回 ↓
  const registry = await loadRegistry(...);
  const decisions = computeCuratorDecisions(...);
  if (args.write) { await applyDecisions(...); }
  const result = { ok: true, applied: decisions.length, ... };
  // ↑ 200 行业务逻辑 ↑

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch(err => {
  console.error('[curator-apply] failed:', err);
  process.exit(1);
});
```

### After（改造后）

```javascript
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// ... other imports

/**
 * Apply curator decisions to a workspace's registry.
 * Pure-ish: takes options, returns result. No process.exit, no stdout.
 *
 * @param {object} options
 * @param {string} [options.workspace] - workspace root, defaults to cwd
 * @param {boolean} [options.write=false] - actually write changes
 * @param {number} [options.limit=100] - max decisions to apply per call
 * @returns {Promise<{ok: boolean, applied: number, ...}>}
 */
export async function curatorApply({
  workspace,
  write = false,
  limit = 100,
} = {}) {
  const root = path.resolve(workspace || process.cwd());

  // ↓ 200 行业务逻辑：原样搬过来，只把 args.workspace → workspace ↓
  const registry = await loadRegistry(...);
  const decisions = computeCuratorDecisions(...);
  if (write) { await applyDecisions(...); }
  const result = { ok: true, applied: decisions.length, ... };
  // ↑ 200 行业务逻辑 ↑

  return result;  // ← return 而不是 stdout.write
}

// ─── CLI 薄壳，只在直接执行时跑 ─────────────────────────────────

function parseArgs(argv) {
  // 同 Before
  return { workspace: '.', write: false, limit: 100 };
}

async function cliMain() {
  const args = parseArgs(process.argv);
  const result = await curatorApply(args);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cliMain().catch(err => {
    console.error('[curator-apply] failed:', err);
    process.exit(1);
  });
}
```

---

## 模式 B：脚本**没有** `main()`，顶层直接执行（curator-apply / update-registries）

Audit 发现这两个脚本不走"main() + main().catch()"，而是顶层 await + 直接执行。改造时**直接抽 export，不要中间过 main()**。每多一步就多一个出错机会。

### Before（顶层执行式）

```javascript
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
// ...

const args = parseArgs(process.argv);
const root = path.resolve(args.workspace);

// ↓ 顶层 200 行业务逻辑 ↓
const registry = await loadRegistry(...);
const decisions = computeDecisions(...);
if (args.write) { await applyDecisions(...); }
const result = { ok: true, applied: decisions.length };
// ↑ 顶层 200 行业务逻辑 ↑

process.stdout.write(JSON.stringify(result, null, 2) + '\n');

function parseArgs(argv) { ... }  // 函数声明 hoisting，所以放最后没事
```

### After（直接抽 export）

```javascript
#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// ...

/**
 * Apply curator decisions to a workspace's registry.
 * Direct export from previously top-level logic.
 */
export async function curatorApply({
  workspace,
  write = false,
} = {}) {
  const root = path.resolve(workspace || process.cwd());

  // ↓ 200 行业务逻辑（一行不动，只把 args.xxx → 解构出来的同名参数）↓
  const registry = await loadRegistry(...);
  const decisions = computeDecisions(...);
  if (write) { await applyDecisions(...); }
  const result = { ok: true, applied: decisions.length };
  // ↑ 200 行业务逻辑 ↑

  return result;
}

// ─── CLI shell ─────────────────────────────────

function parseArgs(argv) { ... }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv);
  curatorApply(args)
    .then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    })
    .catch(err => {
      console.error('[curator-apply] failed:', err);
      process.exit(1);
    });
}
```

**关键差别**：模式 A 把 `main` 改名 `cliMain`；模式 B 没 main 可改，直接在 `if (process.argv[1] === ...)` 块里写 `.then().catch()`。功能等价，但少一层包装。

**特别提醒**：模式 B 的脚本里如果 `parseArgs` / 其他辅助函数原本是顶层声明，**保留原位即可**——它们仍然在 import 时定义出来，但没有任何"顶层副作用"被触发（因为唯一的副作用——业务逻辑——已经搬进 export 函数了）。

---

## 套到下游：maintain.js 怎么用 import 替代 spawn

### Before

```javascript
// maintain.js 现状（节选）
const steps = [
  {
    name: 'validate-maintenance(pre)',
    script: path.join(coreDir, 'validate-maintenance.js'),
    args: ['--workspace', workspace, '--strict'],
  },
  {
    name: 'curator-apply',
    script: path.join(coreDir, 'curator-apply.js'),
    args: ['--workspace', workspace, '--write'],
  },
];
for (const step of steps) {
  const result = await runStep(step);  // 内部 spawn 子进程，stdout pipe 回来 parse
  if (!result.ok) return { ok: false, failed: step.name, ... };
}
```

### After

```javascript
import { validateMaintenance } from './validate-maintenance.js';
import { curatorApply } from './curator-apply.js';

export async function maintain({
  workspace,
  write = false,
  strict = true,
} = {}) {
  const pre = await validateMaintenance({ workspace, strict });
  if (!pre.ok) return { ok: false, failed: 'validate-pre', pre };

  const curate = await curatorApply({ workspace, write });
  if (!curate.ok) return { ok: false, failed: 'curator-apply', pre, curate };

  const post = await validateMaintenance({ workspace, strict });
  return { ok: post.ok, pre, curate, post };
}

// CLI shell 同前面 curator-apply 的模式
```

**注意**：Step 2a 时（pilot 之后立刻做），如果 maintain 调用的脚本只有部分 lib 化（比如只有 `curator-apply` 完成了，`validate-maintenance` 还没），就**只换那部分**，没换的保留 spawn，并加 TODO 注释。等 Step 3 完成所有 lib 化后再回来扫尾（Step 2b）。

---

## 改造步骤（针对单个 core 脚本）

按这个顺序，每步可独立验证：

1. **抓样本输出（Step 0 已抓）**

   golden 在 `tests/golden/<n>.json`。如果是 run-extract / run-judge 这种 mock 才能跑的，先用 mock 模式抓临时 baseline。

2. **判断模式 A 还是模式 B**：看脚本是否有 `async function main() { ... }` + `main().catch(...)`。

3. **抽函数**：按对应模式套模板

4. **改 CLI 入口**：

   ```javascript
   if (process.argv[1] === fileURLToPath(import.meta.url)) {
     // 模式 A: cliMain().catch(...)
     // 模式 B: fooBar(parseArgs(...)).then(out).catch(err)
   }
   ```

5. **回归验证**：

   ```bash
   node src/core/foo.js --workspace . > /tmp/foo-after.json 2>/tmp/foo-after.err
   diff tests/golden/foo.json /tmp/foo-after.json   # 必须 0 差异
   ```

6. **`npm run check`**：跑现有的端到端回归测试（`tests/regression/`），必须全过

7. **加 unit test**：`tests/unit/core/foo.test.js`，至少覆盖 happy path（见 `@test-strategy.md`）

8. **commit**：`refactor(core): make foo importable as a library`

---

## Design rationale

为什么这样设计签名：

- **不用 commander/yargs**：保持 zero-deps。`parseArgs` 手写就够。
- **对象解构而不是位置参数**：未来加参数不破坏调用方。`foo({ workspace, write })` 永远向前兼容。
- **默认值放在解构里**：调用方 `foo({})` 也能跑（用 default workspace），方便测试。
- **`return` 而不是 `throw`**：`{ ok: false, error: ... }` 比 throw 更易于在 import 调用时聚合处理。**只有真正"程序无法继续"时才抛**（比如配置文件 JSON 解析失败）。
- **不在函数里调用 `process.exit`**：库代码绝不能让宿主进程退出。退出只发生在 CLI 入口。
- **不写顶层副作用**：把任何会在 import 时触发的东西（比如顶层 `console.log`、顶层 `await`）挪进函数体或 CLI 入口里。**模式 B 改造时这条尤其要注意**——顶层执行式脚本本来就是一坨顶层副作用，必须一次清干净。

---

## Pitfalls / 陷阱

- **`import.meta.url` 比较的 Windows 兼容性**：直接用字符串 `===` 在某些环境下会因为 `file:///` 前缀差异失败。`fileURLToPath` 已经处理好了，**用它**。
- **顶层副作用**：抽函数时检查文件顶部有没有 `console.log` / 顶层 `await` / 立即执行的逻辑。这些 import 时就会触发，必须挪进函数体。**模式 B 的脚本默认就是这种状态**——核查一遍。
- **默认 workspace 取值**：原文件可能用 `'.'` 也可能用 `process.cwd()`，**保持原值**，避免改变 resolve 后的绝对路径行为。
- **stderr 也要 backward compat**：有些脚本会往 stderr 写 warning 日志，改造后这部分通常应该**留在 cliMain**（库不该 console.error 业务消息），但要注意如果原 CLI 输出包含 stderr 信息，回归测试要单独 diff stderr。
- **错误信息前缀**：原来 `console.error('[foo] failed:', err)` 这样的前缀只在 CLI 里有意义，库调用方通过 return 拿到错误自己决定怎么显示。
- **辅助函数位置**：`parseArgs` 和其他纯 helper 留在文件里就行，不需要专门挪。它们不跟 export 冲突，因为 ES Module 导出是按名字白名单走的。
- **`run-extract` / `run-judge` 加 --mock 时**：看 `run-sample-pipeline.js` 现有的 mock 模式怎么做的，**照抄**，不要发明新机制。Mock 通常是把 provider factory 替换成返回固定数据的 stub。

---

## 何时偏离这个模式

少数 core 脚本可能有特殊情况，遇到时**先停下问用户**：

- 脚本里有 streaming 输出（边算边 stdout.write），不是一次性 JSON。这种情况 export 的函数可能要返回 async iterable，不是单个 promise。
- 脚本主要逻辑是"递归调用其他 core 脚本"——比如 `run-sample-pipeline.js`。这种是 orchestrator，改造方式跟 `maintain.js` 一样（spawn → import）。
- 脚本里有 `process.stdin` 读取（pipe 输入）。这种交互模式留在 CLI 层，库 API 改成接受字符串/对象。
