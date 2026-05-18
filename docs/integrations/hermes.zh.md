# PruneMem 接入 Hermes Agent

PruneMem 是一个记忆治理系统,可以作为 MCP server 接入 Hermes Agent,为 Hermes 提供结构化的分层记忆管道。

本文档面向**想把 PruneMem 接入 Hermes Agent 的工程师**。所有步骤和观察均基于 **Hermes Agent v0.13.0** 的真实测试。

---

## 1. 前置条件

- **Hermes Agent v0.13.0+** 已安装并可正常运行(`hermes --version`)
- **Node.js** 已安装(任意当前 LTS 版本均可;实测在 Node.js 22 上完成)
- **npm** 可用
- macOS 或 Linux(实测在 macOS 上完成)

---

## 2. 安装步骤

### Step 1 — clone PruneMem

```bash
git clone --branch v0.3.0 https://github.com/Wpoithge/PruneMem.git
cd PruneMem
```

> 建议 clone 到独立目录,例如 `~/Tools/prunemem/`,而不是放在活跃的开发工作目录里。

### Step 2 — 安装依赖

```bash
npm install
```

### Step 3 — 注册到 Hermes

```bash
hermes mcp add prunemem --command node --args /absolute/path/to/PruneMem/src/mcp/bin.js
```

**重要:`--args` 必须是绝对路径,不能是相对路径。**

`hermes mcp add` 会自动执行连接测试和 tool 发现。预期输出:

```
Connecting to 'prunemem'...
✓ Connected! Found 11 tool(s) from 'prunemem':
  prunemem_archive_session      Archive a session...
  prunemem_curator_apply        Apply curated facts...
  prunemem_execution_plan       Manage execution plan...
  prunemem_get_working_state    Get current working state...
  prunemem_maintain             Run full maintenance cycle...
  prunemem_repair_source_paths  Repair source paths...
  prunemem_run_sample_pipeline  Run the sample pipeline...
  prunemem_runtime_context      Get runtime context...
  prunemem_update_registries    Update registries...
  prunemem_update_working_state Update working state...
  prunemem_validate_maintenance Validate maintenance...

Enable all 11 tools? [Y/n/select]: y
✓ Saved 'prunemem' to ~/.hermes/config.yaml (11/11 tools enabled)
Start a new session to use these tools.
```

输入 `y` 启用全部 11 个 tool。

### Step 4 — 验证连接

```bash
hermes mcp test prunemem
```

预期输出:

```
Testing 'prunemem'...
Transport: stdio → node
Auth: none
✓ Connected (268ms)
✓ Tools discovered: 11
  prunemem_archive_session   Archive a session...
  prunemem_curator_apply     Apply curated facts...
  ...
```

---

## 3. 配置文件检查

查看 Hermes 写入的配置:

```bash
cat ~/.hermes/config.yaml
```

`mcp_servers` 段应包含:

```yaml
mcp_servers:
  prunemem:
    command: node
    args:
    - /absolute/path/to/PruneMem/src/mcp/bin.js
    enabled: true
```

只有三个字段:`command`、`args`、`enabled`。`env`、`auth`、`preset` 等字段均为可选,标准 PruneMem 接入不需要它们。

---

## 4. 启用 PruneMem(开新会话)

`hermes mcp add` 完成后,**必须开新的 Hermes 会话**——已有的 Hermes 进程不会自动 reload。

```bash
hermes
```

新会话启动后,确认 PruneMem 出现在 tool 列表中:

```bash
hermes tools list
```

预期输出(节选):

```
MCP servers:
  prunemem  all tools enabled
```

MCP server 作为独立分类,列在 built-in toolsets 之后。

---

## 5. 在 Hermes 中调用 PruneMem Tool

以查询 workspace 的 runtime context 为例:

```
用户: 请用 prunemem_runtime_context 这个 tool 查询 workspace /Users/yang/Tools/prunemem/PruneMem 的 runtime context,preset 用 isolated。

Hermes: [调用 prunemem_runtime_context]
✓ prunemem_runtime_context 调用成功
ok: true
session_key: agent:demo:main
status: active
current_task: Upgrade PruneMem public repo to express V4.1
...
```

关键说明:
- `workspace` 必须是绝对路径(不能写 `~/...` 形式)
- 传 `preset: "isolated"` 可以避免写入真实工作空间
- 默认 dry-run,读类 tool 不写任何文件

---

## 6. Tool 在 Hermes 中的命名约定

Hermes 会在内部给每个 MCP tool 名附加命名空间前缀,这对用户是透明的:

- Hermes 活动面板显示: `mcp_prune  0.0s`(因显示宽度限制而缩写)
- **对话中直接使用 PruneMem 原始名**: `prunemem_runtime_context`、`prunemem_archive_session` 等

用户无需知道或输入内部标识符,Hermes 会自动解析。

---

## 7. 安全默认

PruneMem 的设计默认安全。完整说明见 [README — Safety defaults](../../README.zh.md#safety-defaults)。

- **D5 dry-run**: 全部 6 个写类 tool 默认 `write: false`——不传 `write: true` 时不修改任何文件
- **isolated preset**: 传 `preset: "isolated"` 将所有写入重定向到 `.prunemem-isolated/` 沙箱目录
- **F3 警告**: `prunemem_run_sample_pipeline` 即使 `write: false`,仍会写 `.generated.json` 中间产物——如需避免污染真实 workspace,应传 `preset: "isolated"`

---

## 8. 卸载

从 Hermes 移除 PruneMem:

```bash
hermes mcp remove prunemem
# 或别名
hermes mcp rm prunemem
```

同时删除 clone 目录的完整卸载:

```bash
hermes mcp remove prunemem
rm -rf /path/to/PruneMem
```

PruneMem 的数据文件(`.prunemem-isolated/`、`examples/workspace/` 下的状态文件)不会被自动删除——保留这些文件便于将来重新接入后恢复状态。

关于数据所有权和可携性,见 [README — Data ownership](../../README.zh.md#data-ownership)。

---

## 9. 故障排查

### `hermes mcp add` 报错 "Connection failed"

可能原因:
- `node` 不在 PATH 中
- `bin.js` 路径写错,或使用了相对路径——必须是绝对路径
- `npm install` 没有成功完成

排查命令:

```bash
which node                              # 确认 node 可访问
node /path/to/PruneMem/src/mcp/bin.js  # 单独运行 server,查看启动报错
```

### 注册成功,但 `hermes tools list` 看不到 `prunemem`

最常见原因:还没有开新的 Hermes 会话。

解决:退出当前 Hermes 进程,重新运行 `hermes`。

### 调用 tool 返回 `ok: false`

这是结构化返回,不是崩溃。检查响应中的 `notes` 或 `error` 字段了解具体原因。

完整的错误处理说明见 [docs/mcp-server.md](../mcp-server.md)。

### 调用 tool 时 workspace 路径报错

确认:
- workspace 是绝对路径(不能写 `~/...`)
- workspace 目录确实存在
- workspace 下有 PruneMem 所需的状态文件,或改用 `preset: "isolated"` 从空白状态开始

---

## 10. 已知问题与限制

### PruneMem MCP server 不响应 SIGINT (Ctrl+C)

在终端直接运行 `node src/mcp/bin.js` 进行手动测试时,按 `Ctrl+C` 不会退出进程。

退出方法:
- `Ctrl+\`(SIGQUIT)
- 另开一个终端执行: `pkill -f "src/mcp/bin.js"`

**这不影响 Hermes 接入场景。** Hermes 关闭 MCP server 子进程时使用 SIGTERM,行为正常。

### v0.3.0 假设 `node` 在 PATH 中

`hermes mcp add` 命令传递的是 `--command node`,要求 `node` 在 Hermes 进程的 PATH 中可访问。如果使用 nvm、asdf、fnm 等 Node 版本管理器,可能需要将 `node` 替换为 Node 二进制的绝对路径。

这种情况在实测中未遇到。如果遇到相关问题,请向 PruneMem 仓库提交 issue。

---

## 11. 延伸阅读

- [README](../../README.zh.md) — PruneMem 项目概述
- [docs/mcp-server.md](../mcp-server.md) — MCP server 协议层细节
- [docs/mcp-tools.md](../mcp-tools.md) — 每个 tool 的完整 schema
- [docs/integrations/mcp-surface.zh.md](mcp-surface.zh.md) — MCP 能力面快查表
