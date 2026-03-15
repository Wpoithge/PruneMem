# PruneMem

PruneMem is a layered, lifecycle-aware memory plugin for OpenClaw-style agents.

It packages a structured memory system that combines:

- **Layered memory organization** (`L0/L1/L2/L3`)  
  Store memory by signal strength, persistence, and retrieval cost, so the system can read more selectively instead of treating everything as one flat memory pool.

- **Registry-driven governance** (`topic`, `dedupe`, `lifecycle`, `memory` registries)  
  Keep explicit records of what each memory means, which item is canonical, how related items are grouped, and what state each memory is in — instead of relying only on retrieval search.

- **Lifecycle-aware maintenance** (merge, supersede, expire, normalize, validate, repair)  
  Let memory evolve over time: duplicates can be merged, outdated items can be superseded or expired, and the whole memory state can be checked and repaired.

- **Pluggable adapters** for retrieval backends and model providers  
  Keep retrieval and model calls replaceable, so PruneMem is not locked to one backend, one embedding stack, or one model vendor.

## Why PruneMem

As agent memory grows, several failure modes show up quickly:

1. **Memory retrieval gets noisy**  
   As more items accumulate, search results become less precise, more repetitive, and more expensive to use well.

2. **Flat memory has no operating structure**  
   Not every memory should be stored, retrieved, or maintained the same way. Systems need layers, not one undifferentiated pool.

3. **Memory changes over time**  
   Some items should be merged, some superseded, some expired, and some kept stable. Append-only memory is not enough.

4. **Retrieval alone does not tell the system what is canonical**  
   Search can find candidate memories, but it does not by itself explain which memory is active, duplicated, outdated, or part of a larger topic state.

PruneMem is designed to address those problems together: structured layers for storage and retrieval, registries for memory state, and lifecycle-aware maintenance for memory that evolves over time.

## What PruneMem is

PruneMem is an open-source, structured memory layer for OpenClaw-style agents.

It is designed as a public and portable system for:
- layered memory organization
- registry-governed memory state
- lifecycle-aware maintenance
- pluggable retrieval and model integrations

It is not a dump of any private workspace, personal memory archive, or production agent state.

## What this repository includes

This repository includes:
- public architecture and schema docs
- portable governance scripts
- example configurations
- synthetic example data
- sample pipeline assets
- regression checks

It does not include:
- private memory files
- personal notes
- private chat logs
- production registry exports
- machine-specific secret configuration

## Current v0.1 capabilities

PruneMem v0.1 currently exposes five core capability groups:

1. **Layered memory model** (`L0/L1/L2/L3`)
2. **Archive → extract → judge → registry pipeline**
3. **Registry-driven lifecycle governance**
4. **Maintenance, validation, and repair flows**
5. **Pluggable retrieval/model adapter architecture**

These are the first-release guarantees, not the final limit of the project.

In PruneMem, registries are part of the memory state, not just helper indexes. They track topic grouping, deduplication/canonical status, lifecycle state, and memory records so the system can maintain memory deliberately rather than only retrieve it.

## Architecture at a glance

```mermaid
flowchart LR
    A[Session packet] --> B[Extract facts]
    B --> C[Judge facts]
    C --> D[Update registries]
    D --> E[Maintain / validate]
    E --> F[Layered retrieval]
```

## Public demo flow

PruneMem already includes a runnable public demo chain:

```text
session-packet
  -> run-extract
  -> run-judge
  -> update-registries
  -> maintain
```

A mock execution path is included so users can understand the full pipeline before wiring in real provider credentials.

## Quick start

### 1. Clone the repository

```bash
git clone <your-repo-url> PruneMem
cd PruneMem
```

### 2. Run repository checks

```bash
bash scripts/run-checks.sh
```

If this passes, the repository is internally consistent enough for first exploration.

Current checks cover:
- registry consistency
- low-risk `context_note` merge behavior
- `L1-only` public policy guard
- provider config resolution
- provider error normalization
- CLI input validation
- mock sample pipeline execution
- public maintain entry

### 3. Run the sample pipeline in mock mode

```bash
node src/core/run-sample-pipeline.js --workspace . --mock
```

This runs:
- extract
- judge
- update-registries

against the public example assets.

### 4. Run individual steps

```bash
node src/core/run-extract.js --workspace . --mock
node src/core/run-judge.js --workspace . --mock
```

### 5. Inspect the example assets

Useful paths:
- `examples/pipeline/sample-run-01/`
- `examples/registry/`
- `examples/layers/`
- `examples/MEMORY.example.md`

## Using a real provider

By default, the repository is safe to explore without real API keys.

When you want real model calls:

1. copy and edit the backend config
2. set the provider API key in your environment
3. run extract/judge without `--mock`

Example config direction:

```json
{
  "modelProvider": {
    "type": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyEnv": "PRUNEMEM_API_KEY",
    "model": "gpt-4.1-mini"
  }
}
```

Bailian is supported through a provider adapter as well:

```json
{
  "type": "bailian",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "apiKeyEnv": "DASHSCOPE_API_KEY",
  "model": "qwen-max"
}
```

### Live commands

```bash
export PRUNEMEM_API_KEY=your_key_here
node src/core/run-extract.js --workspace .
node src/core/run-judge.js --workspace .
```

If a provider call fails, the CLI now returns normalized error output with fields such as:
- `code`
- `message`
- `provider`
- `status`
- `retryable`

## Current public default policy

The public example policy is intentionally conservative:

- apply target defaults to `L1`
- `MEMORY` writes are disabled in runtime apply logic
- `daily-note` writes are disabled in runtime apply logic

This is deliberate: the open-source default should be safe and predictable.

## Repository layout

```text
PruneMem/
  docs/
  src/
    core/
    archive/
    extract/
    judge/
    runtime/
    adapters/
    lib/
  config/
  examples/
  tests/
  scripts/
```

## Key docs

- `docs/overview.md`
- `docs/architecture.md`
- `docs/schema.md`
- `docs/layers-and-lifecycle.md`
- `docs/governance.md`
- `docs/model-provider-adapters.md`
- `docs/qmd-adapter.md`
- `docs/open-source-scope.md`
- `docs/quick-start.md`
- `docs/configuration.md`
- `docs/faq.md`

## Planned next areas

Likely next follow-up work includes:
- richer live-provider execution support
- stronger schema validation
- better runtime integration helpers
- more retrieval backends beyond file + optional QMD
- more complete migration helpers
- broader CI and fixture coverage

## License

Licensed under the MIT License. See `LICENSE`.

## Contributing

See `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
