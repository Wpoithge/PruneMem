# Audit Checklist — Step 0

> Note: curate.js / normalize-legacy-runs.js placeholders were deleted in T3 (Step 3 closeout). Original checklist below is preserved as historical archive.

启动 Claude Code 后的第一个任务。**不改任何代码**，只对账并产出 `docs/audit-findings.md`，最后**停下来等用户确认**。

## Why this exists

Refactor plan 是基于上下文推断写的，可能跟当前代码有差异。Audit 的目的是用真实代码验证假设，必要时让用户先修正 plan，再开始改造。

## Audit tasks

按顺序执行。每个任务的发现写到 `docs/audit-findings.md`。

### Task 1 — Inventory `src/core/`

对 `src/core/*.js` 每个文件做分类，输出表格：

| 文件 | 类型 | 备注 |
|---|---|---|
| `curator-apply.js` | CLI-only / lib-only / lib+CLI / placeholder | 例如 "已经有 export"、"main() 里耦合 process.exit" |
| ... | ... | ... |

**判定方法：**
- 文件包含 `export` keyword 且**不在条件块里** → 已有 lib 形态
- 文件包含 `if (process.argv[1] === ...)` 或 `main().catch(...)` → 有 CLI 形态
- 文件主体只有 `console.log({placeholder: true})` 之类 → placeholder
- 两者都有 → 已经是 lib+CLI 双模式（这次不用改）

预期：大多数是 CLI-only，`curate.js` / `normalize-legacy-runs.js` 是 placeholder。

### Task 2 — Compare archive-session pair

对比 `src/runtime/archive-session.js` 和 `src/core/archive-session-v41.js`：

- 两者是不是同一个东西的 lib 版 + CLI 版？
- 还是说一个是新版本、一个是 legacy？
- core 那个 import runtime 那个吗？

写出结论。如果它们已经事实上是 lib+CLI 双模式，**Step 1 的 pilot 选择可以从 archive-session 起手**（更稳，因为模式已经存在）。

### Task 3 — Inspect `src/lib/paths.js`

打开 `src/lib/paths.js`，回答：

- 它现在做什么？返回什么对象？
- 是不是已经支持 layout preset（不同的 path 集）？
- 还是只是把硬编码字符串集中到一处？
- core 脚本里现在用 `path.join(root, 'examples', ...)` 还是 `paths.foo`？grep 一下：

  ```bash
  grep -rn "path.join.*examples" src/core/
  grep -rn "from.*lib/paths" src/core/
  ```

写出结论：refactor-plan Step 4 的工作 **0% / 部分 / 大部分 / 完全完成**。

### Task 4 — Verify the QMD / retrieval claim

打开 `src/runtime/retrieve-memory.js`，回答：

- 它从哪里被调用？grep `retrieve-memory` / `retrieveMemory` 看消费方
- 是 internal use（被 dedup / judge / curator 调用）还是被 core 脚本暴露给宿主？
- 它依赖 `src/adapters/qmd-backend.js` 还是 `file-backend.js` 还是两者都行？

如果它**只被内部调用**，CLAUDE.md 里"PruneMem 不做 retrieval"的说法是对的。
如果它**被某个 CLI 脚本暴露给宿主**（比如有个 `get-context` 之类的命令），需要修正 contracts.md，把它列入 output 契约。

### Task 5 — Check existing adapter contract

打开 `src/adapters/index.js`，回答：

- 现有 adapter 注册/选择机制长什么样？是 factory function？constants 表？dynamic import？
- backend 和 provider 是不是用同一种机制？
- 这个机制能不能复用来挂 host adapter（即将放在 `src/hosts/`）？

如果现有机制好，host 集成可能不需要全新一套——复用即可。

### Task 6 — Hard rule self-check

跑这些 grep，把结果（应该全是空）记录下来：

```bash
grep -rni "openclaw\|hermes" src/core/ src/lib/ src/runtime/ \
  src/working/ src/extract/ src/judge/ src/archive/

grep -rni "vector\|embedding" src/core/ src/lib/ src/runtime/ \
  src/working/ src/extract/ src/judge/ src/archive/
```

如果非空，列出位置 + 上下文。**这是潜在的耦合点，需要在 plan 里专项处理**。

`qmd` 在 `src/adapters/qmd-backend.js` 里出现是合法的，**不要把它列为违规**。

### Task 7 — Snapshot CLI baselines

为 Step 1 做准备——把现有 CLI 输出抓成 golden snapshots：

```bash
mkdir -p tests/golden

# 对每个非 placeholder 的 core 脚本
for script in src/core/*.js; do
  name=$(basename "$script" .js)
  case "$name" in
    curate|normalize-legacy-runs) continue ;;  # placeholder 跳过
  esac
  # 注意：某些脚本可能需要参数才能跑，跑失败就先记下来在 audit-findings 里
  node "$script" --workspace . > "tests/golden/$name.json" 2>&1 || \
    echo "[FAIL] $name (exit non-zero, see file)"
done
```

记录哪些脚本能直接跑出 JSON，哪些需要额外参数（在 audit-findings 里列出来），哪些跑失败（说明它们可能依赖更复杂的输入）。

**这一步产出的 `tests/golden/*.json` 是后续每次改造的回归基准，不要 commit 之前手改它们。**

### Task 8 — Existing tests?

```bash
find . -name "*.test.js" -not -path "./node_modules/*"
find tests -type f 2>/dev/null
ls -la package.json
```

回答：
- 项目已经有测试了吗？用什么 runner？
- `package.json` 有 `scripts.test` 吗？
- 如果都没有，按 `@test-strategy.md` 加 `tests/` 目录、加 `package.json` script，但先**不要**写测试（那是 Step 1 的事）。

## Output format

把 audit 结果写到 `docs/audit-findings.md`，结构：

```markdown
# Audit Findings — <date>

## Task 1: Core inventory
<table>

## Task 2: archive-session pair
<conclusion>

## Task 3: lib/paths.js status
<conclusion + plan impact>

## Task 4: retrieve-memory consumer analysis
<who calls it, host-facing or internal>

## Task 5: existing adapter mechanism
<reusable for hosts/?>

## Task 6: hard rule self-check
<grep results, any violations>

## Task 7: CLI baseline snapshots
<which scripts produced golden, which need args, which failed>

## Task 8: testing infra
<exists? what setup needed?>

## Plan impact summary

哪些 Step / 文件需要在 refactor-plan.md 里调整？列出来。

例如：
- Step 1 pilot 应该改用 archive-session 而非 curator-apply（如果 Task 2 发现它已是双模式）
- Step 4 大部分可跳过（如果 Task 3 发现 lib/paths.js 已经做了）
- Hard rule 6 grep 发现某文件违规，需要在 Step 1 之前先单独处理

## Open questions

留给用户回答的问题。
```

## Stop condition

Audit 全部完成后：

1. 把 `docs/audit-findings.md` commit 到当前分支：`docs: add Step 0 audit findings`
2. **停下来**。把 findings 摘要发给用户，等用户确认或调整 plan 之后再进 Step 1。

不要在 audit 阶段动 `src/` 里任何代码。可以创建 `tests/golden/` 和 `tests/` 目录、可以加 `package.json` 的 `scripts.test`、可以创建 `docs/audit-findings.md`，但 `src/` 下的代码**完全不动**。
