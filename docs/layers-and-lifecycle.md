# Layers and Lifecycle

PruneMem now combines three ideas into one public system:

- **layered long-term memory** for guided retrieval
- **lifecycle-aware governance** for correction over time
- **working/execution context layers** for active task continuity

## Long-term layer roles

### L0
Highest-signal distilled summaries.

### L1
Canonical operational long-term memory layer. This is still the default public write target.

### L2
Richer supporting long-term context.

### L3
Raw or near-raw source detail, useful for audit and recovery.

## Runtime-only layers added in V4 / V4.1

### Working memory
Session-scoped state that should remain mutable and resumable.

### Runtime context
Compact text/context block compiled from working memory for the next turn.

### Execution/progress context
Optional V4.1 layer that explains plan state, current milestone, and reporting cadence.

### Session archive
Frozen snapshot captured when a session closes or is archived.

## Why these are separate

A public memory system should not collapse everything into one store.

- **long-term memory** is durable, governed, and retrieval-oriented
- **working memory** is mutable, task-hot, and short-horizon
- **runtime context** is compact and turn-oriented
- **execution context** is plan/progress-oriented
- **session archives** preserve closed-session evidence and resume state

## Lifecycle model

Long-term memory is not append-only. A later fact may revise, replace, narrow, or invalidate an earlier one.

PruneMem therefore supports lifecycle handling such as:
- insert
- merge
- supersede
- downgrade
- expire
- repair
- validate

Working memory also evolves, but by a different rule set:
- append/update active state
- move steps from `in_progress` to `completed`
- clear/replace blockers
- refresh next actions
- surface candidate long-term memories without committing them automatically

## Current public default

The public example policy keeps long-term runtime writes conservative:
- apply target defaults to `L1`
- summary/reference layers can still exist structurally
- broader writes remain opt-in through policy

At the same time, V4/V4.1 working-memory artifacts are now publicly documented and demonstrated through sanitized examples.
