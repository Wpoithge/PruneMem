# PruneMem Schema

PruneMem packages the structured memory system evolved from layered memory organization and lifecycle-aware governance.

## Goals

1. archive first, judge second
2. keep memory machine-readable and queryable
3. separate retrieval from governance
4. preserve history instead of silently overwriting it
5. support lifecycle correction, not just append-only memory

## Core object types

PruneMem currently uses four primary object families:

1. `session_packet`
2. `fact_record`
3. `judgement_record`
4. `registry_record`

## session_packet

A `session_packet` is the normalized archive unit for one completed session boundary event.

Typical triggers:
- `command:new`
- `command:reset`
- `command:compact`
- `manual-archive`

Key fields:
- `schema_version`
- `memory_id`
- `session_key`
- `channel`
- `agent`
- `trigger`
- `ended_at`
- `messages`

Runtime implementations may also record transcript resolution details so validation can distinguish strong evidence from fallback recovery.

## fact_record

Extractor output. A `fact_record` is a candidate memory statement, not yet the final decision.

Common fact types:
- `preference`
- `decision`
- `ops_event`
- `temporary_task`
- `context_note`

## judgement_record

Judge output. This is the authoritative record for apply/governance steps.

Common memory classes:
- `long_term_preference`
- `long_term_decision`
- `ops_event`
- `temporary_task`
- `context_note`
- `discard`

Common lifecycle states:
- `persistent`
- `reviewable`
- `ephemeral`
- `superseded`
- `expired`

## Registry files

PruneMem uses machine registries under the example/public layout:

- `examples/registry/topics.jsonl`
- `examples/registry/dedupe-index.jsonl`
- `examples/registry/lifecycle.jsonl`
- `examples/registry/memories.jsonl`

### topics.jsonl
Tracks active memory per conceptual topic.

### dedupe-index.jsonl
Tracks canonical equivalence and alias history.

### lifecycle.jsonl
Tracks lifecycle state and expiration policy.

### memories.jsonl
Tracks the aggregate set of known judged memories.

## Current public default runtime policy

The architecture supports multiple target layers, but the **current public default policy** is intentionally conservative:

- only `L1` is enabled for apply-stage writes in the default example policy
- `MEMORY.example.md` is not written by runtime apply logic
- richer/lower layers can still exist in the architecture, but are not all enabled by default for writes

## Write matrix (conceptual)

| memory_class | MEMORY | L0 | L1 | L2 | L3 |
|---|---:|---:|---:|---:|---:|
| long_term_preference | optional | yes | yes | optional | no |
| long_term_decision | optional | yes | yes | optional | no |
| ops_event | no | optional | yes | yes | yes |
| temporary_task | no | optional | optional | no | optional |
| context_note | no | optional | optional | no | no |
| discard | no | no | no | no | no |

## Governance rules

- do not silently overwrite prior memories
- prefer registry-driven lifecycle transitions
- normalize topic/dedupe pointers when a single active representative exists
- clear stale canonical pointers when no active representative remains
- keep low-risk auto-merge narrow and deterministic

## Public adaptation notes

The open-source version deliberately avoids:
- private workspace paths
- private memory data
- hard-coded retrieval backends
- hard-coded model providers

Backends and model providers should be plugged in through explicit adapter interfaces.
