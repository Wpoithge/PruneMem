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

*Last updated: 2026-04-30, during Step 4 Phase A closeout.*
