# Retrieval

PruneMem separates memory structure from retrieval backend choice.

Default retrieval should work from:
- layered files
- registry indexes
- deterministic filters

Optional semantic retrieval backends can be attached through adapters.

## Parallel adapter idea

PruneMem applies the same decoupling principle to model providers:
- retrieval backends are pluggable
- model providers are pluggable

This keeps the public system portable across different user environments.
