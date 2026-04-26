# Test Strategy

## TL;DR

用 `node:test`（Node 内置 test runner，零依赖），不引入 vitest/jest。

## Why node:test, not vitest

PruneMem core 现在的优势之一就是 zero runtime deps（只用 Node 标准库）。引入 vitest 会拉进 50+ transitive deps、增加 CI 安装时间、让"想试用 PruneMem 的人 `npm install` 时心一颤"。

`node:test` 的能力对我们够用：

- ✅ 异步测试、`describe` / `it` / `test`、`before` / `after`
- ✅ assert（用 `node:assert/strict`）
- ✅ 子测试、过滤、超时
- ✅ TAP 输出、可选 spec reporter
- ⚠️ Watch mode 用 `node --watch --test` 凑合
- ⚠️ Mock 用 `node:test/mock`，简陋但够用

如果将来真碰到必须用 vitest 的场景（比如 React 组件测试、snapshot 测试），那时候再加。**现在不要预防式引入**。

## Layout

```
tests/
├── core/                    一个 core 脚本一个 test 文件
│   ├── curator-apply.test.js
│   ├── validate-maintenance.test.js
│   └── ...
├── runtime/
│   ├── paths.test.js
│   └── validate-input.test.js
├── adapters/
│   └── openclaw.test.js     真做 adapter 时
├── fixtures/                共享的测试数据
│   ├── workspaces/
│   │   ├── empty/           空 workspace
│   │   ├── small/           几条记忆
│   │   └── ...
│   └── packets/
│       └── sample-1.json
├── golden/                  CLI 输出的 golden snapshots
│   ├── curator-apply.json
│   └── ...
└── helpers/
    ├── make-tmp-workspace.js  复制 fixture 到 tmpdir
    └── run-cli.js             spawn 一个 CLI 子进程拿 stdout
```

## Test template

```javascript
// tests/core/curator-apply.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { curatorApply } from '../../src/core/curator-apply.js';

describe('curatorApply', () => {
  let workspace;

  before(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), 'prunemem-test-'));
    await cp('tests/fixtures/workspaces/small', workspace, { recursive: true });
  });

  after(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test('returns ok=true on a valid workspace', async () => {
    const result = await curatorApply({ workspace, write: false });
    assert.equal(result.ok, true);
    assert.equal(typeof result.applied, 'number');
  });

  test('does not write to disk when write=false', async () => {
    const before = await readMemoryFile(workspace);
    await curatorApply({ workspace, write: false });
    const after = await readMemoryFile(workspace);
    assert.equal(before, after);
  });

  test('writes to disk when write=true', async () => {
    // ... 验证 disk side effect
  });

  test('handles empty workspace gracefully', async () => {
    const empty = await mkdtemp(path.join(tmpdir(), 'prunemem-empty-'));
    try {
      const result = await curatorApply({ workspace: empty });
      assert.equal(result.ok, true);
      assert.equal(result.applied, 0);
    } finally {
      await rm(empty, { recursive: true });
    }
  });
});
```

## Running tests

```bash
# 全部
node --test tests/

# 单个文件
node --test tests/core/curator-apply.test.js

# watch（开发用）
node --watch --test tests/

# 加 coverage（Node 20+）
node --test --experimental-test-coverage tests/

# 只跑某个 describe（用 --test-name-pattern）
node --test --test-name-pattern="curator" tests/
```

`package.json` 里加：

```json
{
  "scripts": {
    "test": "node --test tests/",
    "test:watch": "node --watch --test tests/",
    "test:coverage": "node --test --experimental-test-coverage tests/"
  }
}
```

## Priority of what to test

按这个优先级补测试，**不必追求 100% 覆盖率**：

### P0 — Golden output tests (必须有)

每个改造完的 core 脚本，**写一个 CLI golden test**：

```javascript
// tests/core/curator-apply.golden.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

test('CLI output matches golden snapshot', async () => {
  const { stdout, status } = spawnSync('node', [
    'src/core/curator-apply.js',
    '--workspace', 'tests/fixtures/workspaces/small',
  ], { encoding: 'utf-8' });
  
  assert.equal(status, 0);
  
  const golden = await readFile('tests/golden/curator-apply.json', 'utf-8');
  assert.equal(stdout, golden);
});
```

这是 **backward compat 的硬保障**——改造前后 golden 文件不应该变。golden 文件第一次生成时手动校对一次，之后 commit 进 repo。

### P1 — Library happy path

`import` 调用 + 默认参数 + 已知 fixture workspace 不崩。

### P2 — Library error path

必要参数缺失、workspace 不存在、损坏的 input 文件。验证返回 `{ ok: false, error: ... }` 而不是 throw。

### P3 — Pure function 单测

如果某个 core 脚本里有可分离的纯函数（评分、合并算法），单独测它，不需要 fixture workspace。

## What NOT to test

- 不测 LLM 输出本身（不稳定，且不是这次改造的目标）
- 不测 `examples/` 里的 sample data 内容（那是 fixture，不是 spec）
- 不测 OpenClaw / Hermes 真实集成（那是 e2e，本仓库 scope 之外）
- 不测 stdout 颜色 / 格式细节（除非 golden 已经 cover）

## Fixtures 维护规则

- `tests/fixtures/workspaces/<n>/` 是 **只读** 的——测试代码必须先复制到 tmpdir 再操作
- 修改 fixture 内容是 breaking change（会让所有 golden test 失败），需要：
  1. 先弄清楚为什么必须改
  2. 重新生成所有相关 golden 文件
  3. 在 commit message 里写清楚 `test: regenerate golden snapshots after fixture update for X`

- 添加新 fixture 时取一个语义化的名字（`with-stale-entries`、`with-conflicts`、`mixed-layers`），不要 `fixture-1`、`fixture-2`

## When tests fail during refactor

按优先级处理：

1. **Golden test 失败** → 改造破坏了 backward compat，**回滚或修正**，不要直接改 golden
2. **Library happy path 失败** → 抽函数时漏了某个状态、某个 await，重新审视
3. **Pure function 单测失败** → 业务逻辑被无意中改动了，回到 refactor-pattern 检查"业务逻辑一行不动"是否被违反

## Coverage target

不设硬性 coverage 数字。但每个 Step 完成时，**P0（golden tests）必须 100% 覆盖该 Step 涉及的脚本**。其他级别按精力补。
