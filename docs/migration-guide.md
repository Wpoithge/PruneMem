# Migrating from V3 to V4 / V4.1

This guide explains how to move from the public Memory V3 model to the public V4 / V4.1 model in PruneMem.

## Short version

- V3 is centered on **durable long-term memory governance**.
- V4 adds **working memory** for active-session continuity.
- V4.1 adds **execution context** and a stronger **session/archive relationship** for long-running tasks.

If your current setup only stores finalized memory artifacts, V4/V4.1 lets you also preserve the state that exists *before* something deserves long-term memory treatment.

## Core differences

### V3: archive, extract, judge, apply

V3 focuses on governed long-term memory:

- layered memory (`L0/L1/L2/L3`)
- archive-first processing
- lifecycle and dedupe registries
- conservative write policy (commonly `L1`-first in public examples)

V3 is good at deciding what should become durable memory.
It does **not** fully express how an active task keeps continuity between turns.

### V4: working memory and runtime context

V4 adds a new working-memory plane:

- `working_state`
- `working_event`
- `runtime_context`
- `context_bundle`

This gives the runtime a place to store hot task state such as:

- active constraints
- decisions already made
- in-progress steps
- next actions
- blockers
- candidate long-term memories

### V4.1: execution continuity and closed-session archives

V4.1 extends V4 with:

- `execution_plan`
- `milestone_state`
- execution/progress context rendering
- explicit live-session → closed-session archive relationships

This is most useful when tasks span multiple milestones, require progress reporting, or need better resume behavior.

## Migration strategy

The safest migration is additive:

1. keep your V3 long-term memory pipeline
2. add V4 working-memory artifacts alongside it
3. add V4.1 execution artifacts only where long-running work benefits from them
4. update archive generation to preserve working/runtime snapshots

Do **not** treat V4/V4.1 as a replacement for long-term memory governance.
They solve a different problem.

## Step-by-step migration

### Step 1: Keep the V3 durability path intact

Retain your existing V3 concepts:

- session packets or equivalent archive units
- extraction and judgement stages
- dedupe and lifecycle registries
- conservative apply policy

These remain the durable-memory layer even after adopting V4/V4.1.

### Step 2: Introduce `working_state`

Add a session-hot state file or store that tracks the active task.

At minimum, begin recording:

- `task_title`
- `goal`
- `status`
- `constraints`
- `decisions_confirmed`
- `open_questions`
- `next_actions`
- `in_progress_steps`
- `completed_steps`
- `blocked_items`

This gives the runtime an explicit place to resume work without polluting durable memory.

### Step 3: Generate `runtime_context`

Instead of reconstructing context from the whole transcript every turn, compile a compact runtime block from `working_state`.

Typical sections:

- task / goal
- constraints
- confirmed decisions
- current progress
- blockers
- open questions

This is the main V4 productivity improvement.

### Step 4: Add `working_event` logging

Record append-only deltas when working state changes.

This is useful for:

- audit
- replay/debugging
- state diff inspection
- safe resume flows

You do not need to convert every event into long-term memory.

### Step 5: Add execution planning where needed

If your tasks are multi-stage, add:

- `execution_plan`
- `milestone_state`
- execution context rendering

If your tasks are short and simple, V4 working memory alone may be enough.

### Step 6: Upgrade session archive generation

When a session closes, preserve not only transcript excerpts but also:

- `working_state_snapshot`
- `runtime_context_snapshot`
- candidate long-term memories
- plan/milestone status when relevant

This is the main V4.1 archive improvement.

### Step 7: Keep long-term extraction downstream

After archiving, your V3 pipeline can still decide:

- what evidence matters
- what should become durable memory
- which layer should receive it
- how lifecycle rules apply

That separation is intentional.

## Configuration changes

### Before: V3-oriented runtime policy

Earlier public examples focused on conservative apply behavior and maintenance controls, for example:

```json
{
  "runtimePolicy": {
    "applyTargets": ["L1"],
    "allowMemoryMdWrites": false,
    "allowDailyNoteWrites": false
  },
  "maintenance": {
    "enableCuratorApply": true,
    "enableSourceRepair": true,
    "strictValidation": true
  }
}
```

### After: V4.1 memory policy

V4.1 adds config sections for:

- `workingMemory`
- `hotPath`
- `contextAssembly`
- `sessionArchive`
- `executionPlan`
- `autopilot`
- `temporalLifecycle`

Example:

```json
{
  "schema_version": "memory-v4.policy.v1",
  "workingMemory": {
    "enabled": true,
    "sessionDir": "memory/working/sessions",
    "snapshotDir": "memory/working/snapshots"
  },
  "contextAssembly": {
    "enabled": true,
    "preferWorkingState": true,
    "maxRetrievedMemories": 6
  },
  "sessionArchive": {
    "enabled": true,
    "archiveDir": "memory/archives/sessions"
  },
  "executionPlan": {
    "enabled": true,
    "plansDir": "memory/working/plans",
    "milestonesDir": "memory/working/milestones"
  }
}
```

The exact values may differ by deployment, but the main migration idea is consistent: V4.1 needs explicit configuration for active-session state, context assembly, and milestone-aware progress.

## Code migration examples

### Example 1: from transcript-only context to `working_state`

Before:

```js
const messages = await loadRecentMessages(sessionKey);
const promptContext = summarizeMessages(messages);
```

After:

```js
import { buildRuntimeContext } from '../src/core/build-runtime-context.js';
import { loadWorkingState } from '../src/working/state.js';

const workingState = await loadWorkingState({ workspace, sessionKey });
const runtimeContext = buildRuntimeContext(workingState);
const promptContext = runtimeContext.content;
```

### Example 2: from implicit progress to explicit milestones

Before:

```js
const statusNote = {
  summary: 'Still working through the release tasks.'
};
```

After:

```js
import {
  createExecutionPlan,
  deriveMilestoneState,
  buildExecutionContext,
} from '../src/runtime/execution-context.js';

const plan = createExecutionPlan({
  session_key: sessionKey,
  plan_title: 'Ship release',
  milestones: [
    { id: 'm1', title: 'Audit repository', status: 'done' },
    { id: 'm2', title: 'Write docs', status: 'in_progress' },
    { id: 'm3', title: 'Run checks', status: 'pending' }
  ]
});

const milestoneState = deriveMilestoneState(plan);
const executionContext = buildExecutionContext(plan, milestoneState);
```

### Example 3: archive generation with working/runtime snapshots

Before:

```js
const archive = {
  transcript_excerpt,
  extracted_memories
};
```

After:

```js
import { archiveSessionV41 } from '../src/core/archive-session-v41.js';

const archive = await archiveSessionV41({
  workspace,
  sessionKey,
  workingState,
  runtimeContext,
  executionContext,
  transcriptExcerpt,
  trigger: 'session_close'
});
```

## Common pitfalls

### Pitfall 1: treating working memory as durable memory

Do not write every transient task update into long-term memory layers.
Working memory is for continuity, not permanence.

### Pitfall 2: deleting the V3 pipeline too early

V4/V4.1 does not replace extraction, judgement, dedupe, or lifecycle governance.
Keep those stages until your new archive flow is proven.

### Pitfall 3: overloading `working_state`

`working_state` should stay compact and useful.
If it becomes a raw transcript dump, runtime context quality will degrade.

### Pitfall 4: skipping session archive upgrades

If you add working memory but keep old archive behavior, you lose much of the V4.1 value.
Closed-session snapshots should preserve the state needed for resume and later extraction.

### Pitfall 5: making execution planning mandatory for everything

Not every task needs milestones.
Use V4.1 execution context where plan-aware progress actually helps.

## FAQ

### Do I need to migrate all V3 data?

No. Existing V3 durable records can remain as they are.
Migration usually starts by changing runtime behavior for new sessions.

### Is V4 required before V4.1?

Conceptually, yes.
V4.1 builds on V4 working memory and runtime context.
In practice, you can implement both together if your codebase is still early.

### Should V4.1 archives replace session packets?

Not necessarily.
A public implementation may keep both concepts, or map them into one archive format, as long as the archive preserves the new working/runtime relationship clearly.

### Do I need automatic hooks to adopt V4/V4.1?

No.
You can start with manual or CLI-driven updates, then add hook automation later.

### What is the minimum useful migration?

A practical minimum is:

1. add `working_state`
2. render `runtime_context`
3. preserve state snapshots in session archives

Execution plans can come next.
