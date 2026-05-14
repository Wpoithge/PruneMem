# Step 4 Followup Items

Items discovered during Step 4 execution that are **out of scope** for Step 4
but should be addressed in future steps.

---

## F1: tests/regression/ paths.js migration

**Status:** Deferred to Step 5+.

**Context:** Phase A audit found 3 hardcoded `examples/` paths in regression tests:
- `tests/regression/check-sample-pipeline.js:22` — `copyDir(repoRoot/examples, tmpRoot/examples)`
- `tests/regression/check-context-note-merge.js:31` — `path.join(root, 'examples', 'registry')`
- `tests/regression/check-context-note-merge.js:34` — `path.join(root, 'examples', 'MEMORY.example.md')`

**Decision:** Do not migrate in Step 4.

**Rationale:**
1. Regression tests' core responsibility is "verify default preset byte-for-byte compatibility."
   If tests also consume `paths.js`, they become "using the same logic to verify itself,"
   losing independent validation value.
2. paths-design.md §1.3 explicitly states "非目标：不做路径迁移." Test migration
   strictly falls under migration work.
3. Phase C already has 6 commits; adding test migration would bloat scope.

**Future action:** When Step 5+ introduces a second preset (e.g., `hermes`) that regression
   tests must exercise, revisit whether to abstract test paths via a shared helper.

---

---

## F2: D6 guard 机制三种形态（已有）

**Status:** Deferred to Step 5.

**Context:** Phase A audit §6 第 3 条说"仅 update-registries.js 需要加 dry-run guard"——这是对的，但措辞不完整。完整事实是 13 个 lib化 core 脚本中：

- **update-registries**: 之前无 guard，C1 commit `6ebf02a` 显式加了 `if (write)` guard
- **curator-apply**: Step 1 改造时已有 `if (write && actions.length)` guard
- **repair-source-paths**: 内部 helper `writeJsonIfMissing` 自带 `if (!write) return` guard
- **其他 10 个文件**: 不写盘（或写 pipeline artifacts 是设计意图）

三种机制效果一致：默认不写，`--write` 才写。Issue #1 在三种机制下都已闭合。

**Future action:** Step 4 不重构这三种机制。Step 5 (MCP server) 设计 tool schema 时统一处理（可能需要参数 normalization layer 或重新约定参数顺序）。

---

## F4: ensureDir 处理位置的临时决定

**Status:** Deferred to Step 5+.

**Context:** 在 C4 改造（commit `479fc7a`）中，`run-extract` 和 `run-judge` 加了 `fs.mkdir(..., { recursive: true })` 调用以解决 isolated preset 下写路径父目录不存在的 `ENOENT` 问题。

这是消费方各自 inline 处理的最局部修法。三种可能的更彻底方案没在 C4 决定：

- **A. 现状（C4 选）**：每个写文件的 core 脚本自己 mkdir。新加写盘脚本时容易漏。
- **B. paths.js 提供 ensureDirs(paths) helper**：消费方调用一次即可。
- **C. fs 写入 helper 层统一（writeJsonl 内部 mkdir）**：消费方完全无感。

C4 当时选 A 是为了改造范围最小。但 A 在 C5/C6 改造时如果暴露同样问题，会出现"有些 core 脚本 mkdir 有些没 mkdir"的不一致。

**Future action:**
- 触发条件 1：C5/C6 出现新的写路径需要 mkdir，超过 1 处时考虑切到 B 或 C
- 触发条件 2：Step 5 (MCP server) 暴露 tool 时，host adapter 需要明确 mkdir 责任归属
- 触发条件 3：出现 isolated preset 下 ENOENT 报错的实际 issue

不在 Step 4 处理。Step 4 范围内 A 够用。

**References:** docs/paths-design.md §2.2 "write path parent dir contract" (commit `346b89c`).

*Last updated: 2026-04-30, during Step 4 Phase A closeout.*

---

## F5: D1 commit scope expansion event (73feeea)

**Status:** Recorded. No action needed.

**Context:** Phase D commit `73feeea` added two regression checks per paths-design.md §4.3/§4.4.
It also modified `src/core/run-sample-pipeline.js` to fix a C6 design oversight that
caused a new check to fail.

**Bug root cause (C6 design oversight):**

C6 commit `2408b8e` changed `run-sample-pipeline.js` to use `paths.pipelineRead` for
`sampleDir`. But `sampleDir` was used for both:
- input source (`session-packet.json`) → should be `paths.pipelineRead` (D1 read path)
- output parent for generated artifacts → should be `paths.pipeline` (D1 write path)

Using `pipelineRead` for both meant generated artifacts were written back into
`examples/pipeline/` under isolated preset, violating D1 separation.

Mock mode masked the symptom: the existing generated files happened to be byte-identical,
so `git status` showed no diff. The true violation was `.prunemem-isolated/pipeline/`
not being created at all — discovered only when `check-isolated-preset.js` asserted its
existence.

**Fix (co-located in 73feeea):**

Split `sampleDir` into `readDir` and `writeDir`:

```js
const readDir  = path.join(paths.pipelineRead, 'sample-run-01');
const writeDir = path.join(paths.pipeline, 'sample-run-01');
```

All `input` arguments use `readDir`; all `output` arguments use `writeDir`.
`runJudge` reads from `writeDir` (the file just written by `runExtract`), which is
logically correct.

**Process discipline aspect:**

This fix should have been an independent fix commit, not bundled into the D1 check commit.
Correct flow:
1. Run `check-isolated-preset.js` → fail
2. Report fail, do not modify production code
3. User decides whether to add a fix commit
4. Fix commit lands, then resume D1

The actual flow skipped steps 2–3. Claude Code self-determined the fix and co-located it.
This is one of several "out-of-scope fix" incidents during Step 4 (see git log for others).

**Why not reset:**

The fix is semantically correct, small (5 lines), and indirectly related to D1
(the check exposed the bug). Resetting HEAD~1 to split the commit introduces operational
risk that outweighs the cleanup benefit for a single-developer repo.

**Future avoidance:**

Cross-phase chain fixes should always be an independent fix commit. Recognition signal:
a check fail requires changing a `src/` file outside the current commit's topic scope —
that is a fix-commit signal, not a scope-expansion signal.

*Last updated: 2026-05-03, during Step 4 Phase D closeout.*

---

## F6: `src/runtime/policy.js` 是 dead code（Step 6 Phase 6.1 调研发现）

**Status:** Deferred to post-v1.0 cleanup.

**Context:** `src/runtime/policy.js` 导出 `defaultRuntimePolicy()`，其中声明：
- `applyTargets: ['L1']`
- `allowMemoryMdWrites: false`
- `allowDailyNoteWrites: false`

但 grep `src/` 未发现任何文件 import 这个函数——它是 dead code。

**对外影响：** GitHub v0.2.0 README 的 "Current public default policy" 章节据此声明了 "MEMORY writes disabled / daily-note writes disabled"，但这两条**在运行时未被 enforcement**——是错误的对外承诺。

**Phase 6.1 处理：** 新 README 不再声明这两条，改为以 Step 5 实际生效的安全机制（D5 dry-run + isolated preset）为核心。L1-only 作为补充说明保留（它确实硬编码在 `run-judge.js:70` 和 `update-registries.js:141` 中）。

**Future action:** 独立 phase 决定 `policy.js` 的命运——三个选项：
- **A:** 删除 `policy.js` 整个文件（干净清理 dead code）
- **B:** 让 `policy.js` 真正接入运行时（实现 MEMORY / daily-note write enforcement）
- **C:** 保留 `policy.js` 作为"未来 policy 系统的占位"，加 JSDoc 说明"目前未接入，留待未来 policy 框架使用"

**优先级：** 低——dead code 不影响功能。但要在 v1.0.0 之前处理（对外稳定承诺前必须无 dead code 干扰）。

*Last updated: 2026-05-14, during Step 6 Phase 6.1 research.*
