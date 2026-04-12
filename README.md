# PruneMem

PruneMem is a layered, lifecycle-aware memory system for AI agents.

It provides a structured approach to agent memory that combines:

- **Layered long-term memory** (`L0/L1/L2/L3`) for selective retrieval
- **Registry-governed lifecycle maintenance** for merge / supersede / expire / validate / repair
- **Working memory and runtime context** for active session continuity
- **Hook-oriented integration contracts** for archive, pre-turn context assembly, and post-turn progress capture
- **Pluggable retrieval/model adapters** instead of hard-coded vendor lock-in

## Release status

**Current version: `0.2.0`**

`0.1.0` was the foundation release focused on layered long-term memory with lifecycle governance.

`0.2.0` adds working memory, runtime context, execution context, and session/archive relationship management.

This repository documents and demonstrates:

- Long-term memory governance with layered storage
- Per-session working memory for active tasks
- Runtime context assembly from working memory
- Execution and progress context for long-running tasks
- Session archive snapshots for audit and resume
- Generic hook integration contracts

It intentionally **does not** include:

- Private workspace data
- Personal or production chat logs
- Private prompts/logs from internal deployments
- Secrets, keys, accounts, or machine-specific paths
- Tightly coupled runtime wiring

## Why PruneMem

As agent memory grows, several failure modes show up quickly:

1. **Retrieval gets noisy** — too many memories compete for limited context window
2. **Flat memory lacks operating structure** — no distinction between hot session state and cold archival
3. **Memory changes over time** — facts become stale, preferences evolve, tasks complete
4. **Session continuity needs more than long-term memory alone** — active tasks need working state
5. **Long-running tasks need explicit progress state** — not only chat history but execution milestones

PruneMem addresses these problems with layered memory, explicit registries, lifecycle governance, working memory, and execution context.

## Core concepts

### Layered long-term memory

Memories are stored in layers based on signal quality and retrieval cost:

- **L0 (Ephemeral)**: Raw extracts, high volume, short TTL
- **L1 (Reviewable)**: Confirmed facts, medium TTL, primary apply target
- **L2 (Persistent)**: Important facts, longer TTL, governance required
- **L3 (Canonical)**: Core identity/preferences, longest TTL, highest confidence

### Lifecycle governance

A registry-based system manages memory state transitions:

- **Merge**: Combine similar memories
- **Supersede**: Replace outdated facts with updates
- **Expire**: Remove stale memories based on TTL
- **Validate**: Check registry consistency
- **Repair**: Fix detected issues

### Working memory

Session-scoped state separate from long-term memory:

- Task title / goal
- Latest user intent
- Constraints and confirmed decisions
- Open questions and next actions
- In-progress / completed / blocked steps
- Candidate long-term memories

### Runtime context

Compact context payload compiled from working memory for each agent turn:

- Working state summary
- Execution/progress context (for long tasks)
- Retrieved long-term memories
- Assembled into a context bundle

### Execution context

For long-running tasks:

- Execution plan with milestones
- Progress tracking
- Interim reports
- Resume capability from session archives

### Session archives

Closed-session snapshots for:

- Audit trails
- Task resume
- Long-term memory extraction
- Working state preservation

## Repository layout

```
src/
├── core/
│   ├── run-sample-pipeline.js      # Sample pipeline execution
│   ├── update-registries.js        # Lifecycle maintenance
│   ├── update-working-state.js     # Working state management
│   ├── build-runtime-context.js    # Runtime context assembly
│   ├── execution-plan.js           # Execution/progress context
│   └── archive-session.js          # Session archive builder
├── working/
│   └── state.js                    # Working memory primitives
├── runtime/
│   ├── execution-context.js        # Execution abstractions
│   └── archive-session.js          # Archive builder
├── layers/
│   └── ...                         # L0/L1/L2/L3 implementations
└── registry/
    └── ...                         # Registry governance

config/
├── memory-policy.example.json      # Example policy configuration
└── memory-v4-policy.json           # Full policy with working memory

docs/
├── overview.md                     # System overview
├── architecture.md                 # Architecture documentation
├── schema.md                       # Data schemas
├── layers-and-lifecycle.md         # Layer and lifecycle details
├── working-memory.md               # Working memory documentation
├── execution-context.md            # Execution context documentation
├── migration-guide.md              # Migration between versions
└── open-source-scope.md            # Safety boundaries

examples/
├── working-memory/                 # Working memory examples
├── registry/                       # Registry examples
└── pipeline/                       # Pipeline examples

scripts/
└── run-checks.sh                   # Repository validation
```

## Quick start

### 1. Run repository checks

```bash
bash scripts/run-checks.sh
```

### 2. Run the sample pipeline

```bash
node src/core/run-sample-pipeline.js --workspace . --mock
```

### 3. Inspect working memory examples

```bash
node src/core/get-working-state.js --workspace .
node src/core/build-runtime-context.js --workspace .
node src/core/execution-plan.js --workspace .
node src/core/archive-session.js --workspace .
```

### 4. Regenerate example assets

```bash
node src/core/update-working-state.js --workspace . --write
```

## Configuration

Copy and customize the example policy:

```bash
cp config/memory-policy.example.json config/memory-policy.json
```

Key policy options:

- `workingMemory.enabled`: Enable working memory
- `hotPath.enabled`: Enable hot-path retrieval rules
- `contextAssembly.enabled`: Enable runtime context assembly
- `sessionArchive.enabled`: Enable session archiving
- `temporalLifecycle.enabled`: Enable TTL-based expiration

## Default policy

The public default remains conservative:

- Long-term writes default to **L1 only**
- Working memory is **public-safe session state**, not private traffic dumps
- Hook integration is documented as **generic contracts**, not internal couplings

## Safety boundaries

Safe to ship publicly:

- Schemas and state machines
- Synthetic examples
- Portable CLI scripts
- Adapter contracts
- Documentation

Not safe to ship publicly:

- Real transcripts or chat logs
- Private archive files
- Personal workspace paths
- Production operator notes
- Provider credentials
- Internal event payloads

## Checks

Current validation covers:

- Registry consistency
- Context note merge behavior
- L1-only policy enforcement
- Provider config resolution
- CLI input validation
- Working memory operations
- Runtime context generation
- Execution plan derivation
- Session archive integrity

## Documentation

- `docs/overview.md` — System overview
- `docs/architecture.md` — Architecture details
- `docs/schema.md` — Data schemas
- `docs/layers-and-lifecycle.md` — Layered memory and lifecycle
- `docs/working-memory.md` — Working memory guide
- `docs/execution-context.md` — Execution context for long tasks
- `docs/migration-guide.md` — Migration between versions
- `docs/open-source-scope.md` — Safety boundaries
- `docs/configuration.md` — Configuration options
- `docs/governance.md` — Registry governance
- `docs/retrieval.md` — Retrieval adapters
- `docs/model-provider-adapters.md` — Model provider adapters
- `docs/faq.md` — Frequently asked questions

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

See [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Next steps

