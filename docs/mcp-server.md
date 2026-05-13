# PruneMem MCP Server 接入指南

**目标读者**：想把 PruneMem MCP server 接入自己 Agent 框架或客户端的开发者。

本文档只讲"怎么接入和启动"，不讲内部实现细节。设计决策、协议规范参见 [`docs/mcp-design.md`](mcp-design.md)；工具详细契约参见 [`docs/mcp-tools.md`](mcp-tools.md)。

---

## 安装

### 方式一：npm 安装（推荐）

```bash
npm install prunemem
```

要求：

- **Node.js** >= 20（参见 `package.json` 的 `engines` 字段）
- **`@modelcontextprotocol/sdk`** 严格锁定 `1.28.0`（更高版本需重新回归验证，参见 [R4](../docs/mcp-design.md#r4)）

### 方式二：clone 仓库

```bash
git clone <repo-url>
cd prunemem
npm install
```

---

## 启动 Server

```bash
# 方式 1：npm script
npm run mcp

# 方式 2：直接运行入口
node src/mcp/bin.js

# 方式 3：通过 package.json bin 入口（若全局安装）
prunemem-mcp
```

Server 使用 **stdio transport**。启动后，它从 `stdin` 读取 JSON-RPC 消息，向 `stdout` 写入响应。每个消息以 `\n`（换行符）分隔，不使用 `Content-Length` 头。

客户端实现细节参见 [`src/mcp/README.md`](../src/mcp/README.md) 的 "Implementation notes for client authors" 小节。

### Claude Desktop 配置示例

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "prunemem": {
      "command": "node",
      "args": ["/absolute/path/to/prunemem/src/mcp/bin.js"],
      "env": {}
    }
  }
}
```

> 若通过 `npm install -g prunemem` 全局安装，可将 `args` 改为 `["prunemem-mcp"]`。

---

## 协议信息

- **传输层**：JSON-RPC 2.0 over stdio
- **消息分隔**：`\n`（每个消息为 `JSON.stringify(payload) + '\n'`）
- **协议版本**：`2024-11-05`（由 `@modelcontextprotocol/sdk@1.28.0` 支持）
- **初始化顺序**：客户端必须先发送 `initialize` 请求，收到响应后再发送 `notifications/initialized` 通知，之后才能调用 `tools/*` 方法。

---

## 可用 Tool 列表

当前 Server 注册 **11 个 tool**（按 `src/mcp/server.js` 中 `TOOLS` 数组顺序）：

| Tool 名 | 类型 | 一句话描述 |
|---|---|---|
| `prunemem_archive_session` | read | 从 workspace 构建 V4.1 session archive packet（纯计算，不写盘） |
| `prunemem_runtime_context` | read | 构建 runtime context、execution context 和 bundle（纯读） |
| `prunemem_execution_plan` | read | 从 execution-plan input 生成 plan + milestoneState + executionContext |
| `prunemem_get_working_state` | read | 读取并返回解析后的 working-state JSON |
| `prunemem_validate_maintenance` | read | 校验 registry 一致性、source path 可达性、MEMORY.md 重复项 |
| `prunemem_repair_source_paths` | write | 修复 registry 中缺失的 source-path 引用 |
| `prunemem_update_working_state` | write | 合并 delta 到 working state 并可选写盘 |
| `prunemem_curator_apply` | write | 执行 curator 规则：合并、过期、归一化 topic/dedupe |
| `prunemem_update_registries` | write | 将 judged facts 插入 registry（memories / lifecycle / topics / dedupe） |
| `prunemem_maintain` | write | 组合工具：validate → curator-apply → [repair] → validate |
| `prunemem_run_sample_pipeline` | write | 组合工具：extract → judge → repair-source-paths → update-registries |

详细 schema、最小调用示例参见 [`docs/mcp-tools.md`](mcp-tools.md)。

---

## 环境变量 / 配置

**无额外环境变量需求。**

Server 本身不读取任何环境变量（stdio transport 由 SDK 自动管理）。底层 core 函数需要的配置（如 LLM API key、workspace 路径等）通过 tool 参数传入，不在环境变量中预设。

---

## 常见问题（FAQ）

### Q1：我能让 server 默认写盘吗？

**不能。** 所有 write-class tool 的 `write` 参数默认值为 `false`（dry-run）。必须显式传入 `write: true` 才会落盘。这是 [D5 决议](../docs/mcp-design.md#d5)，为了防止 Agent 自主调用时意外污染 workspace。

### Q2：我能让 Agent 自己拼路径吗？

**不能。** 任何 tool 都不接受预解析的 `paths` 参数。路径解析由 `src/lib/paths.js` 统一处理，MCP 层只透传 `workspace` / `preset` / `override`。试图传入 `paths` 会收到 protocol-level error（`additionalProperties: false` 拦截）。这是 [M2 永久设计决议](../docs/mcp-design.md#m2)。

关于"三类不暴露字段"的区别，参见 [`docs/mcp-tools.md`](mcp-tools.md) 的"三类不暴露字段"小节。

### Q3：为什么 `run_sample_pipeline` 传 `write: false` 还是写盘了？

因为 `write` **只控制最终 `updateRegistries` 步骤**。内部的 `extract` 和 `judge` 步骤会**无条件写入** `.generated.json` 中间产物（这是底层 core 函数的当前行为，不受 `write` 开关影响）。

如需零副作用调用，请使用 `preset: 'isolated'` 将所有写路径重定向到隔离目录。详见 [`docs/mcp-tool-inventory.md`](mcp-tool-inventory.md) 的 "⚠️ prunemem_run_sample_pipeline 写盘行为说明" 小节。

### Q4：我升级 `@modelcontextprotocol/sdk` 会怎样？

当前严格锁定 `1.28.0`。SDK 仍在快速迭代，小版本可能引入 breaking change（如消息 framing、error 语义）。如需升级，必须在独立 commit 中完成，并重新跑完整 inspector + E2E 回归。参见 [R4](../docs/mcp-design.md#r4)。

---

## 故障排查

### 协议层错误 vs Tool 层错误

| 层级 | 表现形式 | 含义 | 客户端应对 |
|---|---|---|---|
| **协议层错误** | JSON-RPC `error` 对象（`response.error`） | 请求本身不合法：tool 名不存在、参数类型错误、`paths` 被拒绝 | 修正请求后重试 |
| **Tool 层结构化失败** | `response.result.content` 中包含 `{ ok: false, ... }`，`isError: false` | Core 函数正常执行但业务失败（如文件不存在、JSON 解析错误） | 报告给用户，不要自动重试 |
| **Tool 层未捕获异常** | `response.result.isError: true` | Core 函数抛出了未预期异常 | 检查 server 日志，必要时报告 bug |

详细规范参见 [`docs/mcp-design.md` §8](../docs/mcp-design.md#8-错误处理规范)。

### 常见错误码

| 场景 | 错误形态 | 排查方向 |
|---|---|---|
| Unknown tool | JSON-RPC error，`code: -32602` | 检查 tool 名拼写（必须带 `prunemem_` 前缀） |
| Schema validation failure | JSON-RPC error，`message` 中会指出具体字段和期望类型 | 检查参数类型（如 `write` 必须是 `boolean`，不能传字符串） |
| `paths` 被拒绝 | JSON-RPC error，`message` 含 `paths` / `additional` / `unexpected` | 不要传 `paths`，改用 `preset` / `override` |
| `ENOENT` / file not found | Tool 返回 `isError: true` 或 `{ ok: false, error: "..." }` | 检查 `workspace` 是否正确，或文件是否缺失 |
| Initialize 握手失败 | Server 无响应或报错 | 确认先发了 `initialize` 请求，收到响应后再发 `notifications/initialized` |

---

## 引用

- [`docs/mcp-design.md`](mcp-design.md) — 协议设计规范（transport、命名、参数透传、错误处理）
- [`docs/mcp-tool-inventory.md`](mcp-tool-inventory.md) — 完整 tool 清单与批次数 rollout 计划
- [`docs/mcp-tools.md`](mcp-tools.md) — 每个 tool 的详细 schema 与最小调用示例
- [`src/mcp/README.md`](../src/mcp/README.md) — MCP 目录结构、client 实现注意事项
