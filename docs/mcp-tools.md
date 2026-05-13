# PruneMem MCP Tool 调用手册

**目标读者**：想调用 PruneMem MCP tool 的 Agent / Client 开发者。

本文档只讲"每个 tool 怎么调"，不讲 server 怎么启动。接入指南参见 [`docs/mcp-server.md`](mcp-server.md)。

---

## MCP 入参命名约定

**MCP 入参字段名保留 core 函数的命名风格，以 schema 为准。**

- 大部分字段使用 **camelCase**，与 core 函数签名保持一致（如 `sourcePaths`、`memoryId`、`repairSourcePaths`）。
- 个别字段由于历史原因保留 **snake_case**，如 `memory_version`（对应 core 函数的 `memoryVersion`）。
- 不要凭"MCP 标准都是 snake_case"的假设来构造参数；每个 tool 的 schema 定义是唯一权威来源。

---

## 错误响应规范

调用 tool 时可能遇到三层错误，客户端需要区分处理：

| 层级 | 触发条件 | 响应形态 | 客户端动作 |
|---|---|---|---|
| **Schema 校验失败** | 参数类型不对、传了 `additionalProperties: false` 禁止的字段（如 `paths`） | JSON-RPC `error` 对象（`response.error`） | 修正参数后重试 |
| **Core 函数结构化失败** | Core 正常执行但业务失败（如文件不存在、JSON 解析错误），返回 `{ ok: false, ... }` | `response.result.content` 中包含结构化错误对象，`isError: false` | 报告给用户，不要自动重试 |
| **Core 函数未捕获异常** | Core 抛出未预期异常 | `response.result.isError: true`，`content` 中含异常信息 | 检查 server 日志 |

详细规范参见 [`docs/mcp-design.md` §8](mcp-design.md#8-错误处理规范)。

---

## 三类"不暴露"字段

以下字段**有意不暴露在 MCP schema 中**。传入任何一类都会触发 `additionalProperties: false` 的 protocol-level error。

| 类别 | 字段 | 不暴露理由 | 未来是否会暴露 |
|---|---|---|---|
| **M2 paths** | `paths` | 永久设计决议。MCP 层只做参数透传，不做路径解析。需要绕过 preset 机制的宿主应直接以 lib 形式调用 core 函数。 | **永不** |
| **C-3 limit** | `limit`（`curatorApply` 内部调优旋钮） | 当前 `validate.js` 仅支持 string/object/boolean 校验，且该参数是防止单次处理过多的内部旋钮，非用户-facing 业务参数。 | 未来 `validate.js` 扩展支持 number 类型后可考虑 |
| **C-4 timeoutMs** | `timeoutMs`（`maintain` 的过时参数） | 字段自 Step 2b refactor 起已废弃（deprecated，仅打印 warning，no-op）。暴露在 schema 中会造成协议级误导。 | **永不** |

**关键区别**：M2 是架构原则问题；C-3 是技术能力 + 业务判断问题；C-4 是字段生命周期问题。三者性质不同，不要混为一谈。

---

## F3 写盘警告（`prunemem_run_sample_pipeline` 专用）

`prunemem_run_sample_pipeline` 的 `write` 参数**仅控制最终 `updateRegistries` 步骤**是否向 registry jsonl 落盘。

其内部调用的 `extract` 和 `judge` 步骤会**无条件写入** `.generated.json` 中间产物（这是底层 core 函数的当前行为，不受 `write` 开关影响）。

因此，传入 `write: false`**不等于完全零写盘**。如需确保调用 pipeline 时没有任何磁盘副作用，必须使用 `preset: 'isolated'` 将所有写路径重定向到隔离目录。

详见 [`docs/mcp-tool-inventory.md`](mcp-tool-inventory.md) 的 "⚠️ prunemem_run_sample_pipeline 写盘行为说明" 小节。

---

## Tool 详细契约

按 `src/mcp/server.js` 中 `TOOLS` 数组顺序排列。

---

### `prunemem_archive_session`

**Description**：Archive a session from a workspace into a structured V4.1 session packet. Returns the archive object without writing to disk (compute-only).

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "packet": {
      "type": "string",
      "description": "Absolute or relative path to session-packet.json. If omitted, the core function resolves a workspace-relative default."
    },
    "state": {
      "type": "string",
      "description": "Absolute or relative path to working-state.json. If omitted, the core function resolves a workspace-relative default."
    },
    "memory_version": {
      "type": "string",
      "description": "Memory schema version. Defaults to \"v4.1\"."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_archive_session",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

---

### `prunemem_runtime_context`

**Description**：Build the runtime context, execution context, and context bundle from a workspace's working state and execution plan. Pure read; no disk writes.

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "state": {
      "type": "string",
      "description": "Absolute or relative path to working-state.json. If omitted, the core function resolves a workspace-relative default."
    },
    "plan": {
      "type": "string",
      "description": "Absolute or relative path to execution-plan.json. If omitted, the core function resolves a workspace-relative default."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_runtime_context",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

---

### `prunemem_execution_plan`

**Description**：Generate an execution plan, milestone state, and execution context from an execution-plan input file. Pure read; no disk writes.

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "input": {
      "type": "string",
      "description": "Absolute or relative path to execution-plan input JSON. If omitted, the core function resolves a workspace-relative default."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_execution_plan",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

> 注意：此 tool **不接受** `preset` 和 `override`，是唯一不按通用模板暴露路径参数的 tool。

---

### `prunemem_get_working_state`

**Description**：Read and return the parsed working-state JSON from a workspace. Pure read; no disk writes.

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "input": {
      "type": "string",
      "description": "Absolute or relative path to working-state JSON. If omitted, the core function resolves a workspace-relative default."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_get_working_state",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

---

### `prunemem_validate_maintenance`

**Description**：Validate registry consistency, source path reachability, and MEMORY.md duplicates. Pure read; no disk writes.

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "strict": {
      "type": "boolean",
      "description": "Run strict validation checks. Defaults to false."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_validate_maintenance",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

---

### `prunemem_repair_source_paths`

**Description**：Repair missing source-path references in the memory registry. If write is true, writes repaired source paths to disk. Defaults to false (dry-run).

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "write": {
      "type": "boolean",
      "description": "If true, writes repaired source paths to disk. Defaults to false (dry-run)."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_repair_source_paths",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

> 不传 `write` 时默认为 `false`（dry-run）。

---

### `prunemem_update_working_state`

**Description**：Read working-state update input, merge into current state, and produce next state + runtime context. If write is true, writes the updated state to disk. Defaults to false (dry-run).

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "input": {
      "type": "string",
      "description": "Absolute or relative path to working-state update input JSON. If omitted, the core function resolves a workspace-relative default."
    },
    "state": {
      "type": "string",
      "description": "Absolute or relative path to working-state JSON to read/write. If omitted, the core function resolves a workspace-relative default."
    },
    "write": {
      "type": "boolean",
      "description": "If true, writes the updated state to disk. Defaults to false (dry-run)."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_update_working_state",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

---

### `prunemem_curator_apply`

**Description**：Apply curator rules: merge, expire, normalize topic/dedupe pointers, and detect dry-run candidates. If write is true, persists actions to registry. Defaults to false (dry-run).

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "write": {
      "type": "boolean",
      "description": "If true, persists actions to registry. Defaults to false (dry-run)."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_curator_apply",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

---

### `prunemem_update_registries`

**Description**：Insert judged facts into the registry (memories, lifecycle, topics, dedupe). If write is true, writes registry files to disk. Defaults to false (dry-run).

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "judged": {
      "type": "string",
      "description": "Absolute or relative path to judged facts JSON. If omitted, the core function resolves a workspace-relative default."
    },
    "sourcePaths": {
      "type": "string",
      "description": "Absolute or relative path to source-paths JSON (apply output). If omitted, the core function resolves a workspace-relative default."
    },
    "memoryId": {
      "type": "string",
      "description": "Memory ID to assign. Defaults to the judged file's memory_id."
    },
    "channel": {
      "type": "string",
      "description": "Channel identifier. Defaults to \"demo\"."
    },
    "agent": {
      "type": "string",
      "description": "Agent identifier. Defaults to \"demo\"."
    },
    "write": {
      "type": "boolean",
      "description": "If true, writes registry files to disk. Defaults to false (dry-run)."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_update_registries",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

---

### `prunemem_maintain`

**Description**：Run maintenance pipeline: validate registry consistency, optionally repair source paths, optionally enforce strict mode. If write is true, persists any repair actions to disk. Defaults to false (dry-run).

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "write": {
      "type": "boolean",
      "description": "If true, persists any repair actions to disk. Defaults to false (dry-run)."
    },
    "strict": {
      "type": "boolean",
      "description": "Enforce strict validation. Defaults to false."
    },
    "repairSourcePaths": {
      "type": "boolean",
      "description": "Repair missing source-path references before final validation. Defaults to false."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_maintain",
    "arguments": {
      "workspace": "/path/to/workspace"
    }
  }
}
```

> `timeoutMs` 字段**有意不暴露**（已废弃，参见上方"三类不暴露字段"）。

---

### `prunemem_run_sample_pipeline`

**Description**：Run the sample pipeline (extract → judge → repair-source-paths → update-registries). If write is true, persists final registry update to disk. Defaults to false (dry-run).

> ⚠️ **写盘副作用**：`write` 仅控制最终 `updateRegistries` 步骤。内部 `extract` 和 `judge` 步骤会**无条件写入** `.generated.json` 中间产物。如需零副作用，使用 `preset: "isolated"`。

**Input schema**：

```json
{
  "type": "object",
  "properties": {
    "workspace": {
      "type": "string",
      "description": "Workspace root directory. Defaults to process.cwd()."
    },
    "mock": {
      "type": "boolean",
      "description": "If true, uses mocked LLM responses (no real API calls). Defaults to false."
    },
    "write": {
      "type": "boolean",
      "description": "If true, persists final registry update to disk. Defaults to false (dry-run)."
    },
    "preset": {
      "type": "string",
      "description": "Path preset: \"default\", \"isolated\", or \"custom\". Defaults to \"default\"."
    },
    "override": {
      "type": "object",
      "description": "Partial path override object. Shallow-merged into preset base."
    }
  },
  "additionalProperties": false
}
```

**Minimum example call**：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "prunemem_run_sample_pipeline",
    "arguments": {
      "workspace": "/path/to/workspace",
      "mock": true
    }
  }
}
```

> 不传 `mock` 时会发起真实 LLM API 调用，需确保 provider 配置和 API key 可用。

---

## 引用

- [`docs/mcp-server.md`](mcp-server.md) — Server 接入指南
- [`docs/mcp-design.md`](mcp-design.md) — 协议设计规范
- [`docs/mcp-tool-inventory.md`](mcp-tool-inventory.md) — 完整 tool 清单与 rollout 计划
