# Model Provider Adapters

LLM providers are intentionally decoupled from the PruneMem core.

## Why this matters

A public memory plugin should not hard-code one vendor or one private deployment.

Examples of supported directions include:
- Alibaba Cloud Bailian
- OpenAI-compatible endpoints
- Anthropic-compatible endpoints
- local model gateways

## Current public adapter model

PruneMem currently defines a `ModelProvider` abstraction and a provider factory.

Current public implementations:
- `openai-compatible`
- `bailian`

## Responsibilities of a provider adapter

A provider adapter is responsible for:
- fact extraction calls
- judgement calls
- request/response normalization
- auth/config handling
- provider-specific defaults

## Config direction

Provider selection should come from config/env, for example:
- provider type
- base URL
- API key env var
- model name
- timeout policy

Example public config:

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

Bailian can be represented as a compatible provider preset with different defaults:

```json
{
  "type": "bailian",
  "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "apiKeyEnv": "DASHSCOPE_API_KEY",
  "model": "qwen-max"
}
```

## Current boundary

The public repository currently validates:
- config loading
- provider factory resolution
- adapter class wiring

Later work will add:
- full online provider call tests
- retry/error normalization
- richer structured prompt helpers
