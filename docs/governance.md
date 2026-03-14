# Governance

Governance in PruneMem is registry-driven and deterministic wherever possible.

## Current public governance chain

The public plugin is being assembled around these core steps:

1. `update-registries`
2. `curator-apply`
3. `repair-source-paths`
4. `validate-maintenance`
5. `maintain` as the public orchestration entry

## Responsibilities

### update-registries
- write/update topic registry rows
- write/update dedupe registry rows
- write/update lifecycle rows
- write/update aggregate memory rows

### curator-apply
- normalize topic pointers
- normalize dedupe canonical pointers
- clear stale canonical pointers
- conservatively merge low-risk context notes

### repair-source-paths
- reconstruct missing placeholder pipeline artifacts from registry evidence

### validate-maintenance
- verify registry consistency
- verify source path reachability
- verify pointer/canonical integrity

## Public default policy

The public example policy remains conservative:
- apply target defaults to `L1`
- broader writes are configuration decisions, not hard-coded behavior

## Publicization boundary

Open-source governance must stay:
- deterministic
- testable
- portable
- independent from private workspace state
