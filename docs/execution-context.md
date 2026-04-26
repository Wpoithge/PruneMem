# Execution Context (V4.1)

Execution context is the V4.1 layer that makes long-running work explicit.

Where `working_state` captures the current session-hot task state, execution context focuses on **plan progress**:

- what the overall plan is
- which milestone is active
- which milestones are complete
- whether progress reporting is due

This keeps milestone-aware progress separate from general working-memory notes.

## Why it exists

V3 already gave PruneMem durable long-term memory governance.
V4 added `working_state` and `runtime_context` for active-session continuity.
V4.1 adds execution context so a runtime can reason about multi-step work without re-reading a whole transcript or scanning every note in `working_state`.

Typical use cases:

- long edits across multiple files
- tasks that need milestone-based progress updates
- autonomous runs that should stop at blockers or checkpoint boundaries
- session archives that should preserve not just state, but execution intent

## Core artifacts

V4.1 uses two closely related artifacts:

1. `execution_plan`
2. `milestone_state`

A runtime may then render those into a compact `execution_context` block for the next turn.

## `execution_plan` schema

An execution plan is the explicit representation of long-running work.

Typical fields:

- `schema_version`
- `memory_version`
- `session_key`
- `plan_title`
- `goal`
- `status`
- `reporting_policy`
- `milestones[]`
- `created_at`
- `updated_at`
- `last_reported_at`

Example:

```json
{
  "schema_version": "prunemem.execution-plan.v1",
  "memory_version": "v4.1",
  "session_key": "agent:demo:main",
  "plan_title": "Ship public V4.1 release",
  "goal": "Publish safe working-memory and execution-context abstractions.",
  "status": "active",
  "reporting_policy": {
    "report_on_milestone": true,
    "report_every_minutes_without_milestone": 15,
    "continue_after_interim_report": true
  },
  "milestones": [
    {
      "id": "m1",
      "title": "Audit current repository state",
      "status": "done",
      "notes": null,
      "updated_at": "2026-04-12T01:00:00.000Z"
    },
    {
      "id": "m2",
      "title": "Add missing V4.1 documentation",
      "status": "in_progress",
      "notes": "Waiting for final wording review.",
      "updated_at": "2026-04-12T01:10:00.000Z"
    },
    {
      "id": "m3",
      "title": "Run checks and prepare release summary",
      "status": "pending",
      "notes": null,
      "updated_at": "2026-04-12T01:20:00.000Z"
    }
  ],
  "created_at": "2026-04-12T01:00:00.000Z",
  "updated_at": "2026-04-12T01:20:00.000Z",
  "last_reported_at": null
}
```

### Milestone shape

Each milestone is intentionally small:

- `id`
- `title`
- `status` (`pending`, `in_progress`, `done`, or a runtime-defined equivalent)
- `notes`
- `updated_at`

This keeps milestone tracking machine-readable without forcing a full project-management system into the memory layer.

## `milestone_state` schema

`milestone_state` is the lightweight derived view that tells the runtime where execution currently stands.

Typical fields:

- `schema_version`
- `memory_version`
- `session_key`
- `current_milestone_id`
- `current_milestone_title`
- `completed_milestone_ids`
- `status`
- `updated_at`

Example:

```json
{
  "schema_version": "prunemem.milestone-state.v1",
  "memory_version": "v4.1",
  "session_key": "agent:demo:main",
  "current_milestone_id": "m2",
  "current_milestone_title": "Add missing V4.1 documentation",
  "completed_milestone_ids": ["m1"],
  "status": "in_progress",
  "updated_at": "2026-04-12T01:25:00.000Z"
}
```

The point of `milestone_state` is that a runtime does not need to rescan the full plan every turn just to answer:

- What am I doing right now?
- What is already done?
- Am I idle, active, blocked, or complete?

## Rendering execution/progress context

Execution context is usually rendered as a compact text block derived from `execution_plan` and `milestone_state`.

Typical rendered sections include:

- plan title
- goal
- current milestone
- completed milestones
- pending milestones
- reporting cadence

Example rendered block:

```text
[Execution Plan]
Ship public V4.1 release
Goal: Publish safe working-memory and execution-context abstractions.
Current milestone: Add missing V4.1 documentation
Completed milestones: Audit current repository state
Pending milestones: Run checks and prepare release summary
Interim report cadence: every 15 minutes
```

This block is designed to be prepended to the next turn alongside the ordinary `runtime_context` generated from `working_state`.

## Relationship to working memory

Execution context does not replace working memory.

Use `working_state` for:

- constraints
- decisions
- blockers
- user intent
- next actions
- candidate long-term memories

Use execution context for:

- milestone ordering
- checkpointing
- progress cadence
- plan-aware continuation logic

A good mental model is:

- `working_state` answers **"what is true right now?"**
- `execution_plan` answers **"what are we trying to complete?"**
- `milestone_state` answers **"where are we inside that plan?"**
- rendered execution context answers **"what progress summary should the next turn see?"**

## Example flow

A typical V4.1 loop looks like this:

1. Load `working_state`.
2. Load or build `execution_plan`.
3. Derive `milestone_state`.
4. Render execution context.
5. Inject both runtime context and execution context into the next turn.
6. After the turn, update the working state and milestone status.
7. On session close, freeze the latest plan-related state into a session archive snapshot.

## Code example

```js
import {
  createExecutionPlan,
  deriveMilestoneState,
  buildExecutionContext,
} from '../src/runtime/execution-context.js';

const plan = createExecutionPlan({
  session_key: 'agent:demo:main',
  plan_title: 'Ship public V4.1 release',
  goal: 'Publish safe working-memory and execution-context abstractions.',
  milestones: [
    { id: 'm1', title: 'Audit current repository state', status: 'done' },
    { id: 'm2', title: 'Add missing V4.1 documentation', status: 'in_progress' },
    { id: 'm3', title: 'Run checks and prepare release summary', status: 'pending' }
  ],
  reporting_policy: {
    report_on_milestone: true,
    report_every_minutes_without_milestone: 15,
    continue_after_interim_report: true
  }
});

const milestoneState = deriveMilestoneState(plan);
const executionContext = buildExecutionContext(plan, milestoneState);

console.log(executionContext.content);
```

## Archive relationship

Execution context matters at archive time as well.

A V4.1 `session_archive` can preserve:

- the frozen `working_state_snapshot`
- the frozen `runtime_context_snapshot`
- the execution plan snapshot or its derived milestone view
- transcript excerpts and candidate long-term memories

That means later extraction, audit, and resume flows can understand not only what happened, but what milestone boundary the session ended on.

## Design constraints

Public V4.1 execution context should stay:

- generic rather than host-runtime-specific
- small enough to prepend safely
- explicit about milestone state
- separate from long-term memory governance
- safe to publish without exposing internal logs or prompts
