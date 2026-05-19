# PruneMem 接入 Codex CLI

PruneMem 是一个记忆治理系统，可以作为 MCP server 接入 Codex CLI，为 Codex CLI 提供结构化的分层记忆管道。

本文档面向**想把 PruneMem 接入 Codex CLI 的工程师**。所有步骤和观察均基于 **Codex CLI 0.130.0** 的真实测试。

> **共享配置加成**：接入 Codex CLI 后，**Codex VSCode 扩展也能立即使用 PruneMem**——两者共享 `~/.codex/config.toml`。注册一次，两个客户端都能用。

---

## 1. 前置条件

- **Codex CLI 0.130.0+** 已安装并可正常运行（`codex --version`）
- **Node.js** 已安装（任意当前 LTS 版本均可；实测在 Node.js 22 上完成）
- **npm** 可用
- **Git** 可用
- macOS 或 Linux（实测在 macOS 上完成）

---

## 2. 安装步骤

### Step 1 — clone PruneMem

```bash
git clone https://github.com/Wpoithge/PruneMem.git ~/Tools/prunemem
cd ~/Tools/prunemem
```

> 建议 clone 到独立目录，例如 `~/Tools/prunemem/`，而不是放在活跃的开发工作目录里。

### Step 2 — 安装依赖

```bash
npm install
```

### Step 3 — 注册到 Codex CLI

```bash
codex mcp add prunemem -- node ~/Tools/prunemem/src/mcp/bin.js
```

**`--` 分隔符是必须的。** Codex CLI 的 `codex mcp add` 命令格式为 `<NAME> -- <COMMAND>...`。`--` 用于区分子命令自身的参数和 server 命令。不带 `--` 时，Codex CLI 会把后续内容解析为 URL 参数并报错。

注意：与 Claude Code 不同，**不需要 `--scope user` 参数**——Codex CLI 默认就写到用户级 `~/.codex/config.toml`。

预期输出：

```
Added global MCP server 'prunemem'.
```

（"global" 是 Codex CLI 的措辞；实际写入 `~/.codex/config.toml`。）

### Step 4 — 验证连接

```bash
codex mcp list
```

预期输出（节选）：

```
Name      Command  Args                                              Env  Cwd  Status   Auth
prunemem  node     /Users/<username>/Tools/prunemem/src/mcp/bin.js   -    -    enabled  Unsupported
```

`Status: enabled` 表示 server 已注册。`Auth: Unsupported` 是预期的——PruneMem 使用 stdio transport，不涉及 OAuth。

---

## 3. 配置文件说明

Codex CLI 把 MCP server 配置写入 **`~/.codex/config.toml`**——TOML 格式的用户级配置文件。

`[mcp_servers.prunemem]` 段会显示类似：

```toml
[mcp_servers.prunemem]
command = "node"
args = ["/Users/<username>/Tools/prunemem/src/mcp/bin.js"]
```

**重要：共享配置。** `~/.codex/config.toml` 同时被 Codex CLI 和 **Codex VSCode 扩展**读取。接入一次，两个客户端都能使用 PruneMem——无需分别注册。

这与 Hermes Agent 和 Claude Code 不同，后者的 MCP 配置只服务于各自的 client。

各 host 配置文件对比：

| 字段 | Codex CLI（`~/.codex/config.toml`） | Hermes Agent（`~/.hermes/config.yaml`） | Claude Code（`~/.claude.json`） |
|---|---|---|---|
| 格式 | TOML | YAML | JSON |
| 段名风格 | `[mcp_servers.<name>]` | `mcp_servers:` 下的 nested | `mcpServers:` 下的 nested |
| 共享对象 | ✅ Codex CLI + VSCode 扩展 | — | — |
| `enabled` 字段 | 无（默认启用） | 有 | 无（默认启用） |

---

## 4. 启用 PruneMem（开新会话）

`codex mcp add` 完成后，**必须开新的 Codex CLI 会话**——已有的 Codex CLI 进程不会自动重新加载 MCP 配置。

退出当前会话后，重新启动：

```bash
codex
```

新会话启动后，可以问 Codex CLI"哪些 MCP server 已连接"，它应该显示 prunemem 提供 11 个 tool。

也可以在 Codex CLI TUI 内输入 `/mcp` 命令查看当前 session 的 MCP server 列表（Codex CLI 特有的 slash command）。

---

## 5. 在 Codex CLI 中调用 PruneMem Tool

以查询 workspace 的 runtime context 为例：

```
用户：请用 prunemem_runtime_context 这个 tool 查询 /Users/<username>/Tools/prunemem 这个 workspace 的 runtime context，preset 用 isolated。

Codex CLI：[调用 prunemem_runtime_context]
ok: true
schema_version: prunemem.runtime-context.v1
session_key: agent:demo:main
status: active
current_task: Upgrade PruneMem public repo to express V4.1
...
```

关键说明：
- `workspace` 必须是绝对路径（不能写 `~/...` 形式）
- 传 `preset: "isolated"` 可以避免写入真实工作空间
- 默认 dry-run，读类 tool 不写任何文件
- Codex CLI 倾向于主动**结构化总结**返回内容（Task / Goal / Status / Next actions 等）。如需原始 JSON，可以明确要求："请直接显示 prunemem_runtime_context 返回的完整 JSON，不要总结。"

---

## 6. Tool 在 Codex CLI 中的命名

Codex CLI 在对话中不给 MCP tool 名加可见前缀。PruneMem 的 tool 直接用原始名称引用：

- `prunemem_runtime_context`
- `prunemem_archive_session`
- `prunemem_curator_apply`
- （以及其余 tool）

Codex CLI 在 API 层面内部以 `prunemem.prunemem_runtime_context`（server 名 + tool 名）引用 tool，但对话中直接使用短名称即可。

可以问 Codex CLI"prunemem MCP server 提供哪些 tool？"，它会列出完整列表。

---

## 7. 安全默认设置

PruneMem 的设计默认安全。完整说明见 [README — Safety defaults](../../README.zh.md#safety-defaults)。

- **D5 dry-run**：全部 6 个写类 tool 默认 `write: false`——不传 `write: true` 时不修改任何文件
- **isolated preset**：传 `preset: "isolated"` 将所有写入重定向到 `.prunemem-isolated/` 沙箱目录
- **F3 警告**：`prunemem_run_sample_pipeline` 即使 `write: false`，仍会写 `.generated.json` 中间产物——如需避免污染真实 workspace，应传 `preset: "isolated"`

Codex CLI 自身的 sandbox 配置（`~/.codex/config.toml` 中的 `[sandbox]` 段）会进一步限制 PruneMem 可访问的文件系统范围。实测中默认 sandbox 不会拦截 PruneMem 的读操作。

---

## 8. 卸载

从 Codex CLI 移除 PruneMem：

```bash
codex mcp remove prunemem
```

同时删除 clone 目录的完整卸载：

```bash
codex mcp remove prunemem
rm -rf ~/Tools/prunemem
```

PruneMem 的数据文件（`.prunemem-isolated/`、`examples/workspace/` 下的状态文件）不会被自动删除——保留这些文件便于将来重新接入后恢复状态。

关于数据所有权和可携性，见 [README — 数据所有权](../../README.zh.md#数据所有权)。

---

## 9. 故障排查

### `codex mcp list` 看不到 prunemem

最可能原因：
- `codex mcp add` 命令缺少 `--` 分隔符——Codex CLI 会把 server 命令误解为 URL 参数，注册不会生效
- `node` 不在 Codex CLI 可访问的 PATH 中

修复：清理可能的部分配置后重新注册：

```bash
codex mcp remove prunemem
codex mcp add prunemem -- node /absolute/path/to/PruneMem/src/mcp/bin.js
```

### `codex mcp list` 显示 `enabled`，但新 Codex CLI 会话看不到 PruneMem tool

最常见原因：还没有开新 Codex CLI 会话。

解决：退出当前会话（`/exit` 或 `Ctrl+D`），重新运行 `codex`。

### 注册时报错 `node: command not found`

可能原因：
- `node` 不在 Codex CLI 可访问的 PATH 中
- 使用了 nvm / asdf / fnm 等版本管理器，`node` 只在 shell 初始化时加载，但 Codex CLI 继承不到这个 PATH

修复：先找到 node 的绝对路径，再用绝对路径注册：

```bash
which node   # 例如 /Users/<username>/.nvm/versions/node/v22.0.0/bin/node
codex mcp add prunemem -- /absolute/path/to/node /absolute/path/to/PruneMem/src/mcp/bin.js
```

### 写类 tool 调用被 Codex CLI sandbox 拦截

如果你的 `~/.codex/config.toml` 配置了严格的 sandbox 策略（例如 `read-only`），PruneMem 的写类 tool 可能被拦截。

处理方式：
1. 使用 `preset: "isolated"` 调用——所有写入到 `.prunemem-isolated/`，可能仍在 sandbox 允许范围内
2. 调整 Codex CLI 的 sandbox 策略（参考 Codex CLI 文档）

### 调用 tool 后返回 `ok: false`

不是错误，是 core 函数结构化返回。检查响应中的 `notes` 或 `error` 字段了解具体原因。

完整的错误处理说明见 [docs/mcp-server.md](../mcp-server.md)。

---

## 10. 已知问题与限制

### PruneMem tool 不会被 Codex CLI 主动调用

接入 PruneMem 后，Codex CLI 不会自动使用 `prunemem_*` tool 进行记忆管理。需要用户在对话中**显式提示** Codex CLI 使用某个 PruneMem tool。

这是 v0.3.0 的预期行为。Phase 6.5 正在开发调用策略指南（明确 Codex CLI 应在何时、如何调用 PruneMem tool），将通过 PruneMem 自带的 SKILL.md 接入 Codex CLI 的原生 skill 系统。在此之前，可以在每个会话开头加一句提示，例如：

> "本次会话使用 PruneMem 管理记忆。会话结束时，请调用 `prunemem_archive_session` 归档对话。"

### PruneMem MCP server 不响应 SIGINT（Ctrl+C）

在终端直接运行 `node src/mcp/bin.js` 进行手动测试时，按 `Ctrl+C` 不会退出进程。

退出方法：
- `Ctrl+\`（SIGQUIT）
- 另开一个终端执行：`pkill -f "src/mcp/bin.js"`

**这不影响 Codex CLI 接入场景。** Codex CLI 关闭 MCP server 子进程时使用 SIGTERM，行为正常。

### Codex CLI 主动结构化总结 PruneMem tool 返回内容

Codex CLI 0.130.0 在调用 PruneMem tool 后倾向于将返回数据加工为结构化摘要（Task / Goal / Status / Next actions），而不是逐字呈现原始返回。

这是 Codex CLI 的特性，**不是 PruneMem 的问题**。如果需要原始返回（比如调试），可以明确要求："请直接显示 `<tool 名>` 返回的完整 JSON，不要总结。"

---

## 11. 延伸阅读

- [README](../../README.zh.md) — PruneMem 项目概述
- [docs/mcp-server.md](../mcp-server.md) — MCP server 协议层细节
- [docs/mcp-tools.md](../mcp-tools.md) — 每个 tool 的完整 schema
- [docs/integrations/mcp-surface.zh.md](mcp-surface.zh.md) — MCP 能力面快查表
- [docs/integrations/hermes.zh.md](hermes.zh.md) — 同类对照：Hermes Agent 接入
- [docs/integrations/claude-code.zh.md](claude-code.zh.md) — 同类对照：Claude Code 接入
