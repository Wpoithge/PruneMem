# Configuration

PruneMem currently uses example-oriented JSON config files under `config/`.

## Files

- `config/backend.example.json`
- `config/memory-policy.example.json`
- `config/runtime.example.json`

A future release may consolidate these or add schema validation.

## backend config

Controls:
- retrieval backend choice
- model provider choice
- provider endpoint/model/auth env names

## memory policy config

Controls:
- apply target layers
- whether `MEMORY` writes are allowed
- whether `daily-note` writes are allowed
- maintenance defaults

## runtime config

Controls:
- example workspace/layout paths
- hook toggles such as archive-on-new/reset

## Recommended local practice

For real usage, prefer copying example configs into local non-committed files, for example:
- `config/backend.json`

and keep secrets in environment variables rather than checked-in files.
