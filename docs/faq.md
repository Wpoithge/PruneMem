# FAQ

## Does PruneMem require QMD?

No. QMD is treated as an optional retrieval backend, not a hard requirement.

## Does PruneMem require a live model provider?

No for initial exploration. The repository includes a mock sample pipeline so users can understand the flow without real credentials.

## Why is the public default policy L1-only?

Because the public default should be conservative, predictable, and easy to validate.

## Is this repository a copy of a private memory workspace?

No. It is a publicized/pluginized implementation with synthetic examples and decoupled adapters.

## What is the relationship between V1, V2, and V3?

PruneMem does not expose them as competing runtime modes. It packages one coherent system shaped by:
- V1 retrieval lessons
- V2 layered memory structure
- V3 lifecycle governance
