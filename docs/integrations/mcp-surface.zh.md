# PruneMem MCP 能力面说明

> **本文档面向**：想在 5 分钟内了解 PruneMem MCP 能力面的读者。
> **不面向**：具体调用某个 tool（请看 [docs/mcp-tools.md](../mcp-tools.md)）、接入 MCP host（请看 [docs/mcp-server.md](../mcp-server.md)）。

---

## PruneMem MCP 是什么

PruneMem 是一个 MCP server（stdio transport），暴露 11 个记忆治理 tool，可接入任何兼容 MCP 的 host——例如 Hermes Agent、Claude Code、Codex CLI。

---

## Transport / 协议 / 命名速查

| 维度 | 当前状态 |
|---|---|
| Transport | stdio only（JSON-RPC 2.0 over stdin/stdout，`\n` 分隔） |
| MCP SDK 版本 | 锁定 `@modelcontextprotocol/sdk@1.28.0`（见 R4 决议） |
| Tool 命名前缀 | 所有 tool 以 `prunemem_` 开头（D3 决议，4 大不变量之一） |
| Tool 数量 | 11 个 |

---

## 11 个 tool 一行清单

> 完整 schema 和最小调用示例见 [docs/mcp-tools.md](../mcp-tools.md)；安装与启动指南见 [docs/mcp-server.md](../mcp-server.md)。

| Tool 名 | 类型 | 一行描述 |
|---|---|---|
| `prunemem_archive_session` | read | 构建 V4.1 session archive packet |
| `prunemem_runtime_context` | read | 构建 runtime context bundle |
| `prunemem_execution_plan` | read | 生成 execution plan |
| `prunemem_get_working_state` | read | 读取 working-state JSON |
| `prunemem_validate_maintenance` | read | 校验 registry 一致性 |
| `prunemem_repair_source_paths` | write | 修复 registry source-path 缺失 |
| `prunemem_update_working_state` | write | 合并 delta 到 working state |
| `prunemem_curator_apply` | write | 执行策展合并/过期/归一化 |
| `prunemem_update_registries` | write | 插入判定事实到 registry |
| `prunemem_maintain` | write | 运行维护流水线 |
| `prunemem_run_sample_pipeline` | write | 运行抽取→判定→更新流水线 |

---

## PruneMem 不提供什么

为了让接入方避免猜测，以下能力 PruneMem **不**提供：

### 协议层面

- **MCP Resources**：不暴露 `resources/list` / `resources/read`——所有数据访问通过 tool 调用完成
- **MCP Prompts**：不暴露 `prompts/list` / `prompts/get`——不提供预制 prompt 模板
- **远程 transport（HTTP / SSE / Streamable HTTP）**：目前只支持 stdio。如果 host 只接受远程 HTTP 类型 transport，目前无法接入
- **零副作用承诺**：`prunemem_run_sample_pipeline` 即使传 `write: false` 也会写中间产物到 `.generated.json`（F3 警告）。需要完全无副作用应使用 `preset: 'isolated'`。详见 [docs/mcp-tools.md](../mcp-tools.md) F3 章节

### 参数层面

- **`paths` 参数**（M2 决议）：任何 tool 都不接受调用方预解析的 `paths` 参数。需要绕过 preset 机制的宿主应直接以 lib 形式调用 core，不经过 MCP
- **`curatorApply.limit`**：虽然 core 函数接受 `limit` 参数（默认 100），但 MCP 层不暴露（技术限制 + 业务判断）
- **`maintain.timeoutMs`**：该字段在 core 中已废弃（deprecated），MCP 层永不暴露

这三类"不暴露"的性质各不相同，详见 [docs/mcp-tool-inventory.md](../mcp-tool-inventory.md) 中 `curatorApply` 和 `maintain` 的备注。

---

## 错误返回三态速查

| 错误类型 | `isError` 值 | 典型触发场景 |
|---|---|---|
| 协议层错误 | （走 JSON-RPC `error` 字段） | schema 校验失败 / unknown tool / 未声明的字段 |
| Core 结构化失败 | `false`（正常 tool 返回） | core 函数返回 `{ok: false, notes: [...]}` 等结构化失败 |
| Core 运行时异常 | `true` | core 函数未捕获 throw / 文件 ENOENT / JSON parse 失败 |

详细的错误处理规范见 [docs/mcp-server.md](../mcp-server.md) "故障排查" 章节和 [docs/mcp-design.md](../mcp-design.md) §8。

---

## 安全默认速查

PruneMem 内置两层默认开启的写入保护：

- **默认 dry-run**（D5 决议）：所有 6 个写类 tool 默认 `write: false`，必须显式传 `write: true` 才落盘
- **隔离 preset**：传 `preset: "isolated"` 把所有写入重定向到 `.prunemem-isolated/` 沙箱

详见 [README.zh.md](../../README.zh.md#安全默认设置)。

> ⚠️ `prunemem_run_sample_pipeline` 是例外——`write: false` 不等于零写盘（F3 警告）。配合 `preset: 'isolated'` 使用。详见 [docs/mcp-tools.md](../mcp-tools.md)。

---

## 延伸阅读

- [docs/mcp-server.md](../mcp-server.md) — MCP server 接入指南（安装、启动、配置）
- [docs/mcp-tools.md](../mcp-tools.md) — 每个 tool 的完整 schema 与最小调用示例
- [docs/mcp-design.md](../mcp-design.md) — Step 5 MCP 接入面 design doc（决议记录）
- [docs/mcp-tool-inventory.md](../mcp-tool-inventory.md) — Tool 与 core 函数映射 + 不暴露字段说明
- [README.zh.md](../../README.zh.md) — 项目首页
