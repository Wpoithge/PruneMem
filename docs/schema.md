# PruneMem Schema

PruneMem now publicly exposes the memory architecture through **V4.1**, while keeping all examples synthetic and generalized.

## Goals

1. archive first, judge second
2. keep memory machine-readable and queryable
3. separate retrieval from governance
4. preserve history instead of silently overwriting it
5. separate long-term memory from active-session working memory
6. make runtime context and execution context explicit artifacts

## Core object families

### V3 long-term memory objects
1. `session_packet`
2. `fact_record`
3. `judgement_record`
4. `registry_record`

### V4 working-memory objects
5. `working_state`
6. `working_event`
7. `runtime_context`
8. `context_bundle`

### V4.1 execution/archive objects
9. `execution_plan`
10. `milestone_state`
11. `session_archive`

## `session_packet`

A normalized archive unit for one completed session boundary event.

Typical fields:
- `schema_version`
- `memory_id`
- `session_key`
- `channel`
- `agent`
- `trigger`
- `ended_at`
- `messages`

## `working_state`

Session-hot state for the currently active task.

Typical fields:
- `session_key`
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

Key rule:

`working_state` is **not** the same thing as long-term memory. It is resumable task state.

## `working_event`

Append-only record of a working-memory delta.

Typical fields:
- `session_key`
- `trigger`
- `summary`
- `state_delta`
- `recorded_at`

This allows a runtime to keep a small operational log without pretending every transient state change is long-term memory.

## `runtime_context`

Compact, turn-ready context compiled from `working_state`.

Typical sections:
- task / goal
- current constraints
- confirmed decisions
- in-progress work
- next actions
- blockers
- open questions
- last user intent / last agent action

This is the artifact most likely to be inserted into the next agent turn.

## `context_bundle`

A portable assembly artifact that combines:
- `working_state`
- `runtime_context`
- optional `execution_context`
- optional long-term memory retrieval results
- optional archive references

This separates context assembly from any one host runtime.

## `execution_plan`

V4.1 structure for long-running tasks.

Typical fields:
- `session_key`
- `plan_title`
- `goal`
- `status`
- `milestones[]`
- `reporting_policy`
- `last_reported_at`

## `milestone_state`

Derived V4.1 status view that tells the runtime what milestone is active.

Typical fields:
- `current_milestone_id`
- `current_milestone_title`
- `completed_milestone_ids`
- `status`
- `updated_at`

## `session_archive`

Closed-session snapshot used for audit, resume, and later extraction.

Typical fields:
- `archive_id`
- `session_key`
- `trigger`
- `summary`
- `transcript_excerpt`
- `working_state_snapshot`
- `runtime_context_snapshot`
- `candidate_long_term_memories`
- `session_relationship`

The important relationship is:

- `working_state` = live task state
- `runtime_context` = compact compiled view for the next turn
- `session_archive` = frozen closed-session snapshot
- V3 long-term memory = governed durable memory after extraction/judgement/apply

## Registry files

PruneMem continues to use machine registries under the public layout:

- `examples/registry/topics.jsonl`
- `examples/registry/dedupe-index.jsonl`
- `examples/registry/lifecycle.jsonl`
- `examples/registry/memories.jsonl`

These remain the canonical public V3 governance artifacts.

## Current public default runtime policy

The open-source default remains conservative:

- apply-stage long-term writes default to `L1`
- working-memory examples are synthetic and manually regenerated
- archive/session helpers are public-safe abstractions, not private host dumps
