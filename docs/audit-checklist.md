# Audit Checklist — Step 0 (Archived)

**Status:** Step 0 audit completed. This document is a historical placeholder.

## What this used to be

This file contained the 8-task checklist that drove Step 0 of the 0.3
host-agnostic refactor. Claude Code executed it after first reading CLAUDE.md
and produced `docs/audit-findings.md` as output. The audit covered:

- Core script inventory (CLI-only / lib-only / lib+CLI / placeholder)
- archive-session pair comparison
- `src/lib/paths.js` status check
- `retrieve-memory.js` consumer analysis
- existing adapter mechanism review
- hard rule self-check (no openclaw/hermes/vector/embedding leaks in core)
- CLI baseline snapshot capture (`tests/golden/`)
- existing test infrastructure check

## Where the audit results live

- **Findings:** `docs/audit-findings.md`
- **Golden baselines:** `tests/golden/*.json` (committed)
- **Plan adjustments derived from findings:** locked into `docs/refactor-plan.md`
  Status section and decision records

## Why this file is not deleted

The full original checklist is preserved in git history. To recover it:

    git log --all --oneline -- docs/audit-checklist.md
    git show <commit>:docs/audit-checklist.md

If a similar audit is needed for a future major refactor (0.5+), this
historical version can serve as a template.

## Note for Claude Code

**Do not execute any tasks from this file.** It is a historical archive,
not an active checklist. Current step's spec lives in `docs/paths-design.md`
(Step 4) or whichever step-specific doc `docs/refactor-plan.md` Status
section points to.