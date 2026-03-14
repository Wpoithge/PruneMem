# Quick Start

This guide helps you run PruneMem locally in the safest order:

1. run repository checks
2. run the public mock pipeline
3. inspect generated/example artifacts
4. optionally connect a real model provider

## 1. Run all built-in checks

From the repository root:

```bash
bash scripts/run-checks.sh
```

This checks:
- example registry consistency
- `context_note` low-risk merge regression
- `L1-only` policy guard
- provider config resolution
- provider error normalization
- CLI input validation
- mock sample pipeline
- maintain entry wiring

## 2. Run the sample pipeline in mock mode

```bash
node src/core/run-sample-pipeline.js --workspace . --mock
```

This executes:
- `run-extract`
- `run-judge`
- `update-registries`

without requiring any external provider credentials.

## 3. Run extract/judge directly

### Extract only

```bash
node src/core/run-extract.js --workspace . --mock
```

### Judge only

```bash
node src/core/run-judge.js --workspace . --mock
```

## 4. Validate and maintain

### Validate

```bash
node src/core/validate-maintenance.js --workspace . --strict
```

### Maintain

```bash
node src/core/maintain.js --workspace . --strict
```

### Maintain with source-path repair enabled

```bash
node src/core/maintain.js --workspace . --strict --repair-source-paths
```

## 5. Inspect example data

Start here:
- `examples/pipeline/sample-run-01/session-packet.json`
- `examples/pipeline/sample-run-01/extracted.json`
- `examples/pipeline/sample-run-01/judged.json`
- `examples/registry/`
- `examples/layers/`
- `examples/MEMORY.example.md`

## 6. Connect a real provider

Edit the provider config in:
- `config/backend.example.json`

You can either:
- copy it to `config/backend.json`, or
- keep using the example config during local exploration

### Example: OpenAI-compatible

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

Then export your key:

```bash
export PRUNEMEM_API_KEY=your_key_here
```

### Example: Bailian

```json
{
  "modelProvider": {
    "type": "bailian",
    "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "apiKeyEnv": "DASHSCOPE_API_KEY",
    "model": "qwen-max"
  }
}
```

Then export your key:

```bash
export DASHSCOPE_API_KEY=your_key_here
```

## 7. Run without `--mock`

Once config and env are ready:

```bash
node src/core/run-extract.js --workspace .
node src/core/run-judge.js --workspace .
```

or:

```bash
node src/core/run-sample-pipeline.js --workspace .
```

If a live provider call fails, the CLI returns normalized error output with fields like `code`, `message`, `provider`, `status`, and `retryable`.

## Notes

- The public default policy is intentionally conservative.
- Runtime apply defaults to `L1`.
- `MEMORY` and `daily-note` runtime writes are disabled by default in the public example policy.
- Public fixtures are synthetic/sanitized and are meant for understanding the system, not reproducing any private workspace.
