# Open Source Scope

## Included

- plugin architecture
- portable scripts and adapters
- example configs
- fixtures and tests
- sanitized long-term-memory artifacts
- sanitized V4/V4.1 working-memory examples
- generalized runtime-context and execution-context contracts
- public-safe session archive examples

## Excluded

- private workspace memory
- real personal or production registries
- machine-specific paths
- provider credentials
- proprietary internal docs unless rewritten for public release
- private transcripts or archive snapshots
- host-specific event payloads copied verbatim from internal systems

## Publicization rule

If a private implementation is tightly coupled to one host runtime, the public repo should expose the **abstraction boundary**, not the raw internal payload.

That is why the V4/V4.1 materials in this repository are:

- rewritten into generic schemas and contracts
- backed by synthetic examples
- portable across OpenClaw-style runtimes
- free of personal path/account/workspace leakage
