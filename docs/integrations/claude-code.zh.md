# PruneMem 接入 Claude Code

PruneMem 是一个记忆治理系统，可以作为 MCP server 接入 Claude Code，为 Claude Code 提供结构化的分层记忆管道。

本文档面向**想把 PruneMem 接入 Claude Code 的工程师**。所有步骤和观察均基于 **Claude Code 2.1.143** 的真实测试。

---

## 1. 前置条件

- **Claude Code 2.1.143+** 已安装并可正常运行（`claude --version`）
- **Node.js** 已安装（任意当前 LTS 版本均可；实测在 Node.js 22 上完成）
- **npm** 可用
- **Git** 可用
- macOS 或 Linux（实测在 macOS 上完成）

---

## 2. 安装步骤

### Step 1 — clone PruneMem

```bash
git clone --branch v0.3.0 https://github.com/Wpoithge/PruneMem.git ~/Tools/prunemem
cd ~/Tools/prunemem
```

> 建议 clone 到独立目录，例如 `~/Tools/prunemem/`，而不是放在活跃的开发工作目录里。

### Step 2 — 安装依赖

```bash
npm install
```

### Step 3 — 注册到 Claude Code（用户级配置）

```bash
claude mcp add --scope user prunemem node ~/Tools/prunemem/src/mcp/bin.js
```

**`--scope user` 是必须的。** 不带此参数时，`claude mcp add` 会注册到**项目级**——在当前工作目录创建 `.mcp.json`，配置只对该目录有效。带 `--scope user` 时，server 写入 `~/.claude.json`，对所有 Claude Code 会话都可用。

预期输出：

```
Added stdio MCP server prunemem with command: node /Users/<username>/Tools/prunemem/src/mcp/bin.js to user config
File modified: /Users/<username>/.claude.json
```

### Step 4 — 验证连接

```bash
claude mcp list
```

预期输出（节选）：

```
Checking MCP server health…

prunemem: node /Users/<username>/Tools/prunemem/src/mcp/bin.js - ✓ Connected
```

---

## 3. 配置文件说明

Claude Code 把 MCP server 配置写入 **`~/.claude.json`**——用户主目录下的隐藏 JSON 文件（不要跟 `~/.claude/` 目录混淆；原因见[第 7 节](#7-陷阱-claudemcpjson-看起来像-mcp-配置但-claude-code-并不读取它)）。

`mcpServers` 段会显示类似：

```json
{
  "mcpServers": {
    "prunemem": {
      "command": "node",
      "args": [
        "/Users/<username>/Tools/prunemem/src/mcp/bin.js"
      ]
    }
  }
}
```

与 Hermes Agent 的 `~/.hermes/config.yaml` 对比：

| 字段 | Claude Code（`~/.claude.json`） | Hermes Agent（`~/.hermes/config.yaml`） |
|---|---|---|
| 格式 | JSON | YAML |
| 键名风格 | `mcpServers`（驼峰） | `mcp_servers`（下划线） |
| `enabled` 字段 | 无（默认启用） | 有 |

---

## 4. 启用 PruneMem（开新会话）

`claude mcp add` 完成后，**必须开新的 Claude Code 会话**——已有的 Claude Code 进程不会自动重新加载 MCP 配置。

退出当前会话后，重新启动：

```bash
claude
```

新会话启动后，可以问 Claude Code"哪些 MCP server 已连接"，它应该显示 prunemem 提供 11 个 tool。

---

## 5. 在 Claude Code 中调用 PruneMem Tool

以查询 workspace 的 runtime context 为例：

```
用户：请用 prunemem_runtime_context 这个 tool 查询 /Users/<username>/Tools/prunemem 这个 workspace 的 runtime context，preset 用 isolated。

Claude Code：[调用 prunemem_runtime_context]
ok: true
session_key: agent:demo:main
status: active
current_task: Upgrade PruneMem public repo to express V4.1
...
```

关键说明：
- `workspace` 必须是绝对路径（不能写 `~/...` 形式）
- 传 `preset: "isolated"` 可以避免写入真实工作空间
- 默认 dry-run，读类 tool 不写任何文件

---

## 6. Tool 在 Claude Code 中的命名

Claude Code 在对话中不给 MCP tool 名加可见前缀。PruneMem 的 tool 直接用原始名称引用：

- `prunemem_runtime_context`
- `prunemem_archive_session`
- `prunemem_curator_apply`
- （以及其余 tool）

可以问 Claude Code "prunemem MCP server 提供哪些 tool？"，它会列出完整列表。

---

## 7. 陷阱：`~/.claude/mcp.json` 看起来像 MCP 配置，但 Claude Code 并不读取它

Claude Code 的主目录下有**两个看似相关的位置**：

| 路径 | 是否有效 | 用途 |
|---|---|---|
| `~/.claude.json` | ✅ 有效 | Claude Code 实际读取的用户级 MCP 配置 |
| `~/.claude/mcp.json` | ❌ 无效 | 不是 Claude Code 的 MCP 配置文件；与 MCP 注册无关 |

如果你手动编辑了 `~/.claude/mcp.json` 期望注册 MCP server，注册**不会生效**。Claude Code 读取的是 `~/.claude.json`，而不是 `~/.claude/` 目录下的文件。

**最佳实践：永远用 `claude mcp add --scope user` 命令注册 MCP server。** 命令会自动写到正确位置，你不需要知道哪个文件或格式。

如果你已经编辑过 `~/.claude/mcp.json`：
1. 可以直接忽略或删除该文件。
2. 用 `claude mcp add --scope user prunemem node /absolute/path/to/PruneMem/src/mcp/bin.js` 重新注册。

---

## 8. 安全默认设置

PruneMem 的设计默认安全。完整说明见 [README — Safety defaults](../../README.zh.md#safety-defaults)。

- **D5 dry-run**：全部 6 个写类 tool 默认 `write: false`——不传 `write: true` 时不修改任何文件
- **isolated preset**：传 `preset: "isolated"` 将所有写入重定向到 `.prunemem-isolated/` 沙箱目录
- **F3 警告**：`prunemem_run_sample_pipeline` 即使 `write: false`，仍会写 `.generated.json` 中间产物——如需避免污染真实 workspace，应传 `preset: "isolated"`

---

## 9. 卸载

从 Claude Code 移除 PruneMem：

```bash
claude mcp remove prunemem
```

同时删除 clone 目录的完整卸载：

```bash
claude mcp remove prunemem
rm -rf ~/Tools/prunemem
```

PruneMem 的数据文件（`.prunemem-isolated/`、`examples/workspace/` 下的状态文件）不会被自动删除——保留这些文件便于将来重新接入后恢复状态。

关于数据所有权和可携性，见 [README — 数据所有权](../../README.zh.md#数据所有权)。

---

## 10. 故障排查

### `claude mcp list` 看不到 prunemem，但 `~/.claude/mcp.json` 看起来已配置

最可能原因：配置写到了错误的文件（`~/.claude/mcp.json` 而非 `~/.claude.json`）。

修复：用正确命令重新注册：

```bash
claude mcp add --scope user prunemem node /absolute/path/to/PruneMem/src/mcp/bin.js
```

这会写到 `~/.claude.json`（正确位置）。

### `claude mcp list` 显示 `✓ Connected`，但新 Claude Code 会话看不到 PruneMem tool

最常见原因：还没有开新 Claude Code 会话。

解决：退出当前 Claude Code 进程，重新运行 `claude`。

### 注册时报错 `node: command not found`

可能原因：
- `node` 不在 Claude Code 可访问的 PATH 中
- 使用了 nvm / asdf / fnm 等版本管理器，`node` 只在 shell 初始化时加载，但 Claude Code 继承不到这个 PATH

修复：先找到 node 的绝对路径，再用绝对路径注册：

```bash
which node   # 例如 /Users/<username>/.nvm/versions/node/v22.0.0/bin/node
claude mcp add --scope user prunemem /absolute/path/to/node /absolute/path/to/PruneMem/src/mcp/bin.js
```

### 调用 tool 后返回 `ok: false`

不是错误，是 core 函数结构化返回。检查响应中的 `notes` 或 `error` 字段了解具体原因。

完整的错误处理说明见 [docs/mcp-server.md](../mcp-server.md)。

### 调用 tool 时 workspace 路径报错

确认：
- workspace 是绝对路径（不能写 `~/...`）
- workspace 目录确实存在
- workspace 下有 PruneMem 所需的状态文件，或改用 `preset: "isolated"` 从空白状态开始

---

## 11. 已知问题与限制

### PruneMem tool 不会被 Claude Code 主动调用

接入 PruneMem 后，Claude Code 不会自动使用 `prunemem_*` tool 进行记忆管理。需要用户在对话中**显式提示** Claude Code 使用某个 PruneMem tool。

这是 v0.3.0 的预期行为。Phase 6.5 正在开发调用策略指南（明确 Claude Code 应在何时、如何调用 PruneMem tool）。在此之前，可以在每个会话开头加一句提示，例如：

> "本次会话使用 PruneMem 管理记忆。会话结束时，请调用 `prunemem_archive_session` 归档对话。"

### PruneMem MCP server 不响应 SIGINT（Ctrl+C）

在终端直接运行 `node src/mcp/bin.js` 进行手动测试时，按 `Ctrl+C` 不会退出进程。

退出方法：
- `Ctrl+\`（SIGQUIT）
- 另开一个终端执行：`pkill -f "src/mcp/bin.js"`

**这不影响 Claude Code 接入场景。** Claude Code 关闭 MCP server 子进程时使用 SIGTERM，行为正常。

---

## 12. 延伸阅读

- [README](../../README.zh.md) — PruneMem 项目概述
- [docs/mcp-server.md](../mcp-server.md) — MCP server 协议层细节
- [docs/mcp-tools.md](../mcp-tools.md) — 每个 tool 的完整 schema
- [docs/integrations/mcp-surface.zh.md](mcp-surface.zh.md) — MCP 能力面快查表
- [docs/integrations/hermes.zh.md](hermes.zh.md) — 同类对照：Hermes Agent 接入
