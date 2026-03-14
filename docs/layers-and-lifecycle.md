# Layers and Lifecycle

PruneMem combines two ideas into one public system:

- **layered memory structure** for guided retrieval
- **lifecycle-aware governance** for correction over time

## Layer roles

### L0
Highest-signal distilled summaries.

### L1
Canonical operational memory layer. This is the current default public write target.

### L2
Richer supporting memory context.

### L3
Raw or near-raw source detail, useful for audit and recovery.

## Main-session visible memory boundary

A public memory system should separate:
- concise stable memory visible to the main runtime
- richer supporting detail stored in lower layers or source artifacts

This avoids loading too much raw history into the main agent context.

## Lifecycle model

Memory is not append-only. A later fact may revise, replace, narrow, or invalidate an earlier one.

PruneMem therefore supports lifecycle handling such as:
- insert
- merge
- supersede
- downgrade
- expire
- repair
- validate

## Governance principles

- preserve history instead of silently erasing it
- keep registry state queryable and machine-readable
- prefer deterministic maintenance over opaque post-hoc repair
- restrict automatic merge behavior to low-risk cases

## Current public default

The public example policy keeps runtime writes conservative:
- apply target defaults to `L1`
- summary/reference layers can still exist structurally
- broader writes should be opt-in through policy

## Publicization constraints

Compared with a private production workspace, the open-source plugin must:
- avoid private path assumptions
- avoid private channel routing assumptions
- avoid provider lock-in
- expose config and adapter interfaces instead of machine-specific wiring
