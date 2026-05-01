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

*Last updated: 2026-04-30, during Step 4 Phase A closeout.*
