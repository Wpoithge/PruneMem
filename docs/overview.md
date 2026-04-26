# Overview

PruneMem is a structured memory plugin that now publicly exposes the architecture through **Memory V4.1** without exposing private runtime data.

It combines:

- layered long-term memory organization
- registry-driven governance
- lifecycle correction and maintenance
- session-scoped working memory
- runtime-context assembly
- execution/progress context for long-running tasks
- pluggable retrieval/model interfaces

## Version positioning

### Public Memory V3 baseline (`0.1.0`)
The original public release exposed:

1. layered long-term memory (`L0/L1/L2/L3`)
2. registry-governed lifecycle state
3. archive → extract → judge → update → maintain demo flow

### Public V4 / V4.1 expression (`0.2.0`)
The current release additionally exposes:

1. active-session `working_state`
2. append-only `working_event`
3. compiled `runtime_context`
4. `context_bundle` assembly
5. generic hook integration contracts
6. `execution_plan` and `milestone_state`
7. `session_archive` snapshots that preserve session/working/runtime relationships

## Public demo flows

### Long-term memory flow
1. `session-packet.json`
2. `run-extract`
3. `run-judge`
4. `update-registries`
5. `maintain`

### Working-memory flow
1. `update-working-state`
2. `build-runtime-context`
3. `execution-plan`
4. `archive-session-v41`

These flows are deliberately portable and synthetic. They describe the public contract, not a dump of any private deployment.
