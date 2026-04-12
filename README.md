# PruneMem

PruneMem is a layered, lifecycle-aware memory plugin for OpenClaw-style agents.

It packages a public-safe memory system that combines:

- **Layered long-term memory** (`L0/L1/L2/L3`) for selective retrieval
- **Registry-governed lifecycle maintenance** for merge / supersede / expire / validate / repair
- **Working memory and runtime context** for active session continuity
- **Hook-oriented integration contracts** for archive, pre-turn context assembly, and post-turn progress capture
- **Pluggable retrieval/model adapters** instead of hard-coded vendor lock-in

## Release status

**Current package version: `0.2.0`**

`0.1.0` was the public foundation release built around the public Memory V3 baseline.

`0.2.0` upgrades the repository so it can publicly express the architecture through **Memory V4.1** while staying inside open-source safety boundaries.

That means this repository now documents and demonstrates:

- V3 long-term memory governance
- V4 per-session working memory
- V4 runtime-context assembly
- V4 generic hook integration contracts
- V4.1 execution/progress context
- V4.1 session/archive relationship and resume-oriented archive snapshots

It still **does not** include:

- private workspace data
- personal or production chat logs
- private prompts/logs copied from internal deployments
- secrets, keys, accounts, or machine-specific paths
- tightly coupled runtime wiring copied 1:1 from a private host

## Why PruneMem

As agent memory grows, several failure modes show up quickly:

1. **Retrieval gets noisy**
2. **Flat memory lacks operating structure**
3. **Memory changes over time**
4. **Session continuity needs more than long-term memory alone**
5. **Long-running tasks need explicit progress state, not only chat history**

PruneMem addresses those problems with layered memory, explicit registries, lifecycle governance, and now a public working-memory/runtime-context layer.

## Architecture evolution

- **V1**: retrieval-first memory
- **V2**: layered memory (`L0/L1/L2/L3`)
- **V3**: lifecycle-aware registry governance
- **V4**: working memory + runtime context + generic hook integration
- **V4.1**: execution/progress context + session/archive relationship refinement

## What changed in V4

V4 adds a **session-scoped working-memory layer** separate from long-term memory.

Publicly exposed V4 capabilities in this repo:

- `working_state` schema for active-session state
- `working_event` schema for append-only working-memory deltas
- `runtime_context` generation from working memory
- `context_bundle` assembly contract
- generic hook integration guidance for `pre_turn` and `post_turn`
- bridge field `candidate_long_term_memories` so working memory can feed the V3 pipeline without collapsing into it

Working memory tracks session-hot state such as:

- task title / goal
- latest user intent
- constraints
- confirmed decisions
- open questions
- next actions
- in-progress steps
- completed steps
- blocked items
- candidate long-term memories

## What changed in V4.1

V4.1 adds a clearer model for **execution continuity** and **archive relationship**.

Publicly exposed V4.1 capabilities in this repo:

- `execution_plan` schema
- `milestone_state` schema
- execution/progress context rendering
- session archive snapshots that include working-state and runtime-context snapshots
- explicit relationship between:
  - active session working memory
  - closed-session archives
  - long-term memory extraction inputs
  - resume-time runtime context

In other words:

- **working memory** is for the current active task/session
- **runtime context** is the compact text/context payload compiled from working memory (and optionally execution state)
- **session archive** is a closed-session snapshot for audit/resume/extraction
- **long-term memory** remains the governed V3 memory system stored in layers and registries

## Repository layout

Key paths:

- `src/working/state.js` — public working-memory primitives
- `src/runtime/execution-context.js` — V4.1 execution/progress abstractions
- `src/runtime/archive-session.js` — public-safe session archive snapshot builder
- `src/core/update-working-state.js` — update working state from a synthetic/public delta
- `src/core/build-runtime-context.js` — render runtime context and context bundle
- `src/core/execution-plan.js` — build execution plan / milestone state / execution context
- `src/core/archive-session-v41.js` — build a V4.1-style session archive
- `examples/working-memory/` — sanitized V4/V4.1 sample assets
- `docs/working-memory-v4-v41.md` — detailed V4 / V4.1 public explanation

## Quick start

### 1. Run repository checks

```bash
bash scripts/run-checks.sh
```

### 2. Run the existing V3-style sample pipeline

```bash
node src/core/run-sample-pipeline.js --workspace . --mock
```

### 3. Inspect V4/V4.1 working-memory examples

```bash
node src/core/get-working-state.js --workspace .
node src/core/build-runtime-context.js --workspace .
node src/core/execution-plan.js --workspace .
node src/core/archive-session-v41.js --workspace .
```

### 4. Regenerate the public working-memory example assets

```bash
node src/core/update-working-state.js --workspace . --write
```

## Current public default policy

The public default remains conservative:

- long-term apply-stage writes still default to **`L1` only**
- `MEMORY.example.md` is still not written by runtime logic
- working memory is exposed as **public-safe session state**, not as a dump of private runtime traffic
- hook integration is documented as a **generic contract**, not as private internal event coupling

## Safety boundary

This repository is intentionally generalized.

Safe to ship publicly:

- schemas
- generalized state machines
- synthetic examples
- portable CLI scripts
- adapter contracts
- docs that explain layering and lifecycle

Not safe to ship publicly:

- real transcripts
- private archive files
- personal workspace paths
- production operator notes
- provider credentials
- internal event payloads copied verbatim from a private runtime

## Checks

Current checks cover:

- registry consistency
- low-risk `context_note` merge behavior
- `L1-only` policy guard
- provider config resolution
- provider error normalization
- CLI input validation
- sample V3 pipeline execution in mock mode
- working-memory merge/runtime-context generation
- execution-plan / milestone derivation
- session archive relationship integrity
- maintain entrypoint

## Documentation

- `docs/overview.md`
- `docs/architecture.md`
- `docs/schema.md`
- `docs/layers-and-lifecycle.md`
- `docs/working-memory-v4-v41.md`
- `docs/open-source-scope.md`
- `docs/migration-from-v1-v2-v3.md`

## Next recommended follow-up

Good next public-safe follow-up items:

- stricter JSON Schema files and validators for V4/V4.1 artifacts
- more hook recipes for host runtimes
- richer archive search / resume examples
- more fixtures for blocked-task and multi-milestone flows
- optional persistence helpers for real workspace integration
