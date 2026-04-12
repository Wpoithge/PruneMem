# Working Memory V4 / V4.1

This document explains what was added publicly beyond the earlier public Memory V3 baseline.

## Boundary first

The public repository does **not** copy a private runtime 1:1.

Instead, it exposes a public-safe abstraction of the parts that are broadly reusable:

- working memory
- runtime context
- hook integration contract
- session/archive relationship
- execution/progress context

## Before V4: what the public V3 baseline already had

The earlier public baseline already described and demonstrated:

- layered long-term memory (`L0/L1/L2/L3`)
- lifecycle-governed registries
- archive → extract → judge → update → maintain flow
- conservative `L1`-first public write policy

What it did **not** yet express clearly was how an active session keeps state between turns before that state becomes long-term memory.

## V4 additions

V4 adds a distinct **working-memory plane**.

### 1. `working_state`

Purpose:
- store session-hot state for the active task
- keep continuity across turns
- track actionable progress without treating it all as durable long-term memory

Public fields now documented and exemplified:
- `task_title`
- `goal`
- `status`
- `user_request_summary`
- `last_user_intent`
- `constraints`
- `decisions_confirmed`
- `open_questions`
- `next_actions`
- `in_progress_steps`
- `completed_steps`
- `blocked_items`
- `candidate_long_term_memories`
- `related_archives`

### 2. `working_event`

Purpose:
- record how working state changed
- keep an append-only operational trail
- support debugging/replay without converting every state change into long-term memory

### 3. `runtime_context`

Purpose:
- compile the most useful parts of working state into a compact turn-ready context block
- give the next turn a concise summary instead of loading raw history

Typical sections:
- task / goal
- constraints
- decisions
- in-progress steps
- next actions
- blockers
- open questions
- recent user/agent intent summaries

### 4. `context_bundle`

Purpose:
- keep context assembly portable
- combine working memory with optional retrieval results and archive references
- avoid coupling context assembly to one host runtime

### 5. Generic hook integration contract

The public repo now describes hooks at a reusable level.

#### `pre_turn`
- read working state
- build runtime context
- optionally include execution/progress context
- inject/prepend a compact context block

#### `post_turn`
- parse turn output into a working-state delta
- update progress state
- emit a working event
- optionally surface candidate long-term memories

#### `session_close`
- freeze the session into a session archive
- preserve working/runtime state for audit and resume
- keep extraction inputs available for later long-term-memory processing

This is intentionally different from copying private host event payloads.

## V4.1 additions

V4.1 strengthens the model for **execution continuity** and **closed-session archives**.

### 1. `execution_plan`

Purpose:
- make long-running work explicit
- track milestones separately from general working-state notes
- support progress reporting cadence

Public fields now documented and exemplified:
- `plan_title`
- `goal`
- `milestones[]`
- `reporting_policy`
- `last_reported_at`

### 2. `milestone_state`

Purpose:
- tell the runtime what milestone is currently active
- expose what has already been completed
- provide a small derived status artifact instead of scanning the whole plan every turn

### 3. Execution/progress context

Purpose:
- convert plan + milestone state into a compact progress-oriented context block
- help the runtime know whether it is mid-plan, blocked, or due for a progress update

This is the V4.1 layer beyond generic working memory.

### 4. Stronger session/archive relationship

V4.1 makes the relationship between active state and archived state explicit.

#### Active session
- owns the current `working_state`
- compiles `runtime_context`
- may hold `execution_plan` and `milestone_state`

#### Closed session archive
- freezes a `working_state_snapshot`
- freezes a `runtime_context_snapshot`
- keeps transcript excerpt / source material
- preserves `candidate_long_term_memories`
- records why the archive exists and how it relates to future retrieval/extraction

#### Long-term memory pipeline
- remains a separate V3 durability/governance path
- may later consume archive/session evidence
- should not be conflated with the transient working-memory plane

## Layered explanation by concern

### Working memory
Current session state. Mutable. Short-horizon. Resume-oriented.

### Runtime context
Compact text/context compiled from working memory for the next turn.

### Hook integration
The public contract for when working memory is read or updated.

### Session/archive relationship
How live session state becomes a frozen audit/resume snapshot when a session ends.

### Execution/progress context
A V4.1 extension for milestone-aware, plan-aware long tasks.

## Public-safe examples in this repo

See `examples/working-memory/` for:

- `session-demo.working-state.json`
- `session-demo.working-event.json`
- `session-demo.runtime-context.json`
- `session-demo.runtime-context.txt`
- `session-demo.context-bundle.json`
- `session-demo.execution-plan.json`
- `session-demo.milestone-state.json`
- `session-demo.execution-context.json`
- `session-demo.session-archive.json`

## Public-safe code in this repo

- `src/working/state.js`
- `src/runtime/execution-context.js`
- `src/runtime/archive-session.js`
- `src/core/update-working-state.js`
- `src/core/build-runtime-context.js`
- `src/core/execution-plan.js`
- `src/core/archive-session-v41.js`

## Non-goals of this public release

This release does not claim:

- full parity with a private production runtime
- full automatic hook wiring for every host runtime
- release of private prompts, logs, or host-specific event data
- a one-to-one copy of any internal workspace implementation

It does claim that the V4/V4.1 architectural layers are now publicly represented clearly enough for contributors and adopters to understand and build on safely.
