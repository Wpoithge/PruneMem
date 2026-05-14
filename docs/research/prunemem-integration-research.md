# PruneMem 接入路径调研报告

调研日期：2026-05-14  
调研对象：Hermes / Claude Code / Codex CLI 接入机制 + agentmemory / memos 对比

---

## 1. 执行摘要

PruneMem 已经是一个完成态的 MCP server，并且已知走的是 **stdio transport**、暴露 **11 个工具**。从这次调研结果看，**它接入 Hermes、Claude Code、Codex CLI 三个目标 host，不需要协议层改造**；真正需要补的，不是“能不能接”，而是“用户怎么 3 分钟内接上、怎么验证、出错时怎么排查”。

如果只讨论“把 PruneMem 作为外部 MCP server 接进去”，**Hermes 的接入难度评估为低**。原因很直接：Hermes 官方文档、配置样例、CLI 子命令、源码路径都很清楚，`~/.hermes/config.yaml` 下的 `mcp_servers` 已经完整支持 stdio / HTTP / SSE，且 agentmemory 已经证明了这条路径可行。需要注意的是：**Hermes 的基础 MCP 接入很容易，但如果未来想做成像 agentmemory 那样的“更深层 memory provider 集成”，那是另一条更重的插件路径，复杂度会升到中等。**

三家 host 里，**Hermes 与 Claude Code 都属于“文档足够清晰、可直接写接入文档”的类型；Codex CLI 则明显更实验性一些**。Codex 的官方文档已经给出 `codex mcp add`、`config.toml` 结构、stdIo/Streamable HTTP 支持与超时字段，但对于一些对写接入文档很重要的细节——例如 tool 命名空间在运行时到底怎样呈现、资源/提示词体验如何、断线重连如何处理——文档没有 Claude Code 那么细，需要后续实测兜底。

agentmemory 给 PruneMem 的最大启发，不在“技术实现”，而在**对外包装**：它把“这是个什么、为什么要用、怎么装进不同 host、只走 MCP 的基础路径与更深插件路径怎么区分”写得非常明确，用户读完前几屏就能行动。memos 给 PruneMem 的最大启发，则是**MCP contract 文档写法**：端点、能力、认证、tool 列表、resource、prompt、过滤策略，全部集中在一个技术说明里，适合作为“服务接口说明书”。

因此，建议的文档优先级是：**先写 Hermes，再写 Claude Code，再写 Codex CLI**。Hermes 是重点目标，且证据最充分；Claude Code 文档最成熟，能很快复用；Codex CLI 应当紧跟，但文档里要明确写出“哪些点已由官方文档确认、哪些点仍需实测”。

- Hermes 基础接入难度：**低**
- Claude Code 基础接入难度：**低到中**
- Codex CLI 基础接入难度：**中**
- agentmemory 的关键启发：**按 host 分开的接入文档 + 独立 MCP 安装入口 + 基础/高级两条接入路径**
- memos 的关键启发：**把 MCP 能力面写成单独的“接口说明书”**

---

## 2. Hermes 接入机制详解

### 2.1 配置文件位置与格式

Hermes 的 MCP 配置主入口是：

- 默认路径：`~/.hermes/config.yaml`
- 若设置了 `HERMES_HOME`：实际路径是 `$HERMES_HOME/config.yaml`
- 若使用 Hermes profile：等价地会落到对应 profile 的 `config.yaml`

格式是 **YAML**，根键为：

- `mcp_servers:`

这一点同时能从以下几个地方互相印证：

- `cli-config.yaml.example`
- `website/docs/user-guide/features/mcp.md`
- `tools/mcp_tool.py`
- `hermes_constants.py`

结论：**PruneMem 面向 Hermes 的第一版文档应直接提供 YAML 片段，不需要 JSON/TOML 版本。**

### 2.2 MCP server 字段语义

Hermes 对 `mcp_servers.<name>` 的字段支持比较完整，关键字段如下：

| 字段 | 用途 | 适用 transport |
|---|---|---|
| `command` | 启动 stdio server 的可执行命令 | stdio |
| `args` | 启动参数 | stdio |
| `env` | 传给子进程的环境变量 | stdio |
| `url` | MCP endpoint | HTTP / Streamable HTTP / SSE |
| `headers` | 远程 HTTP 头 | HTTP / SSE |
| `transport` | 可显式写 `sse` | 远程 |
| `timeout` | tool 调用超时，默认 120 秒 | 全部 |
| `connect_timeout` | 初始连接超时，默认 60 秒 | 全部 |
| `enabled` | `false` 时跳过该 server | 全部 |
| `tools.include` | 仅放行指定 tool | 全部 |
| `tools.exclude` | 排除指定 tool | 全部 |
| `tools.resources` | 是否注册 resource wrapper | 全部 |
| `tools.prompts` | 是否注册 prompt wrapper | 全部 |
| `auth` | HTTP 侧可设 `oauth` | HTTP |
| `sampling` | 允许 server 发起 sampling/createMessage | 全部 |

一个很实用的细节：Hermes 对 stdio 子进程不会无脑透传整个 shell 环境，而是只传“安全基线环境变量 + 你在 `env` 里显式写的变量”。这对文档写作有两层含义：

1. PruneMem 如果需要环境变量，**必须在示例里明确写出来**；
2. 不能假设 Hermes 会自动继承用户 shell 里的所有 secret。

### 2.3 transport 支持情况

Hermes **明确支持 stdio**，而且这正是 PruneMem 当前最匹配的接入方式。

支持矩阵如下：

- **stdio**：支持
- **HTTP / Streamable HTTP**：支持
- **SSE**：支持（需 `transport: sse`）
- **OAuth 远程认证**：支持，但只对 HTTP 路径有意义

因此，对 PruneMem 来说：

- **第一版 Hermes 接入文档应优先写 stdio**；
- 不需要为了 Hermes 额外补 HTTP server 形态。

### 2.4 命名空间与 tool 调用约定

Hermes 不会直接把 MCP server 原始 tool 名暴露给模型；它会做一层 **前缀化注册**：

- 规则：`mcp_<server_name>_<tool_name>`

而且 server 名、tool 名里的连字符和点号会被改写为下划线。

例如：

- server 名 `prune-mem` + tool 名 `search.memory`  
  会被 Hermes 注册成 `mcp_prune_mem_search_memory`

另外，Hermes 还会额外注册按 capability 推导出来的 utility tools：

- `mcp_<server>_list_resources`
- `mcp_<server>_read_resource`
- `mcp_<server>_list_prompts`
- `mcp_<server>_get_prompt`

但这些 wrapper **只有当对端 server 真正声明对应 capability 时才会注册**。

对 PruneMem 文档的含义是：

- 如果 PruneMem 只有 tool、没有 resources/prompts，就不要在 Hermes 文档里暗示会出现这些 wrapper；
- 如果将来要写 `tools.include/exclude` 示例，**过滤时要写原始 MCP tool 名，不是 Hermes 前缀化后的名字**。

### 2.5 启动行为与容错

Hermes 的行为不是 lazy 的，而是**启动时 eager discovery**：

- Hermes 启动或 `/reload-mcp` 时，会读取 `mcp_servers`；
- 并行连接所有启用的 server；
- 初始化成功后立刻拉取 tool 列表并注册进工具注册表。

它的容错做得比文档表面上更强，源码里能看到几层保护：

1. **初始连接失败不拖死其他 server**  
   多个 server 并行连接；单个失败只记 warning，其他照常注册。

2. **初始连接会重试**  
   单个 server 初始连接会做指数退避重试，最多 3 次。

3. **会话中断后会重连**  
   连接建立后若掉线，还会最多重连 5 次。

4. **动态刷新**  
   若 server 发 `tools/list_changed`，Hermes 会自动刷新 tool 列表，不必手动 reload。

5. **熔断**  
   同一 server 连续失败过多后，Hermes 会短时间直接返回“先别再重试”的错误，避免模型死循环调用。

6. **OAuth / session-expired 专项恢复**  
   HTTP OAuth 与远端 session 过期分别有恢复路径。

所以结论是：**Hermes 对“外部 MCP server 有时起不来”这件事容忍度较高，适合作为 PruneMem 的首发 host。**

### 2.6 一份“假设性”的 PruneMem 接入配置示范

下面是**结构确定、启动命令待替换**的 Hermes 配置示意：

```yaml
mcp_servers:
  prunemem:
    command: "prunemem"
    args: ["stdio"]   # 这里换成 PruneMem 的真实启动方式
    timeout: 120
    connect_timeout: 30
```

这里面：

- **确定的部分**：
  - 放在 `mcp_servers` 下
  - 用 YAML
  - stdio 走 `command + args`
  - `timeout` / `connect_timeout` 可配

- **当前无法从本次调研确定的部分**：
  - PruneMem 的真实可执行命令名
  - 它是否需要额外 `env`
  - 它是否有建议 whitelist 的 tool 子集

如果 PruneMem 将来有“推荐最小权限 tool 集”，Hermes 版文档应追加一段 `tools.include` 示例。

---

## 3. Claude Code 接入机制详解

### 3.1 配置位置、作用域与存储位置

Claude Code 的 MCP 配置不是单一路径，而是 **三层 scope + 企业托管层**：

| scope | 生效范围 | 是否适合提交到仓库 | 存储位置 |
|---|---|---|---|
| `local` | 当前项目，仅当前用户 | 否 | `~/.claude.json`（按项目路径存） |
| `project` | 当前项目，团队共享 | 是 | 项目根的 `.mcp.json` |
| `user` | 当前用户所有项目 | 否 | `~/.claude.json` |
| managed | 企业集中下发 | 组织控制 | 系统目录下的 `managed-mcp.json` |

优先级是：

1. local
2. project
3. user
4. plugin-provided servers
5. claude.ai connectors

这意味着 PruneMem 文档至少要写两档：

- **个人接入版**：`--scope user`
- **团队项目版**：`.mcp.json`

### 3.2 配置语法与添加方式

Claude Code 提供了非常直接的 CLI：

- `claude mcp add`
- `claude mcp add-json`
- `claude mcp list`
- `claude mcp get`
- `claude mcp remove`
- `claude mcp reset-project-choices`

支持三种 transport：

- `--transport http`
- `--transport sse`
- `--transport stdio`

JSON 配置的核心结构是：

- `mcpServers`

对于 project scope，文件就是项目根的 `.mcp.json`；对于 local/user scope，则写入 `~/.claude.json`。

一个**结构示意**如下：

```json
{
  "mcpServers": {
    "prunemem": {
      "type": "stdio",
      "command": "prunemem",
      "args": ["stdio"]
    }
  }
}
```

同样，这里的 `command/args` 只是占位，真正要以 PruneMem 发布形态替换。

### 3.3 transport 支持情况

Claude Code 对 PruneMem 来说也非常友好：

- **stdio**：支持
- **HTTP**：支持
- **SSE**：支持
- JSON 配置里 `type: "streamable-http"` 也可作为 `http` 的别名

额外一个对 stdio server 很友好的细节是：Claude Code 在启动本地 stdio server 时会注入：

- `CLAUDE_PROJECT_DIR`

所以如果 PruneMem 将来需要基于当前项目路径做相对解析，可以直接利用这个变量。

### 3.4 命名空间与 tool 调用约定

Claude Code 的官方文档**没有像 Hermes 那样明确写出“tool 会被怎样前缀化”**，但有两件事情写得很清楚：

1. **MCP prompt 会变成 slash command**  
   形如：`/mcp__servername__promptname`

2. **MCP resource 可以用 `@server:uri` 引用**  
   例如文档示例里的 `@postgres:schema://users`

因此可以保守得出两个结论：

- Claude Code 至少在 **prompt / resource 层面** 存在明确的 namespacing 机制；
- **直接 tool 名在模型内部如何命名，官方文档没有明确写出**，这一点不宜在 PruneMem 文档里硬写死，应留待实测。

### 3.5 启动行为与容错

Claude Code 的 MCP 行为非常值得单独提醒，因为它默认不是“把所有 tool schema 一次性塞进上下文”。

默认行为是：

- **Tool Search 开启**
- 会话开始时只加载 tool 名
- tool 定义按需延迟加载

这实际上是**偏 lazy** 的设计。

只有在以下情况才更偏 eager：

- 设置 `ENABLE_TOOL_SEARCH=false`
- 或某个 server 配了 `alwaysLoad: true`

`alwaysLoad: true` 的副作用是：

- 会阻塞启动，直到该 server 连上
- 标准连接超时上限是 5 秒

容错方面：

- HTTP / SSE 断线后会自动重连，指数退避，最多 5 次
- 初始连接失败时，对瞬时错误最多重试 3 次
- 认证错误和 404 不自动重试
- **stdio server 不自动重连**

对 PruneMem 的含义是：

- 如果 PruneMem 只是普通 stdio server，Claude Code 版文档应告诉用户：**服务挂了通常要重启 server，而不是等 host 自己拉起**；
- 如果未来 PruneMem 暴露大量 tool，Claude Code 默认的 deferred loading 反而是好事。

### 3.6 一份“假设性”的 PruneMem 接入配置示范

如果写 CLI 版文档，建议采用这种结构：

```bash
claude mcp add --transport stdio --scope user prunemem -- prunemem stdio
```

说明：

- `prunemem stdio` 只是**占位启动命令**；
- `--scope user` 适合个人常驻安装；
- 若团队希望把配置提交进仓库，应改写成 project scope，并生成 `.mcp.json`。

---

## 4. Codex CLI 接入机制详解

### 4.1 配置文件位置与层级

Codex CLI 的 MCP 配置并不是单独一份 `mcp_servers.toml`，而是放进通用配置文件：

- 用户级：`~/.codex/config.toml`
- 项目级：`.codex/config.toml`
- 系统级（可选）：`/etc/codex/config.toml`

其中，项目级配置**只有在 trusted project 下才会加载**。

优先级是：

1. CLI flags / `--config`
2. profile
3. 项目级 `.codex/config.toml`（从 repo 根到当前目录，越近优先级越高）
4. 用户级 `~/.codex/config.toml`
5. 系统级 `/etc/codex/config.toml`
6. 内建默认值

这和 Claude Code 的 local/project/user 三分法不同。Codex 更像“**用户全局配置 + 可信项目局部覆盖**”。

### 4.2 配置语法与命令行入口

Codex 官方文档已经给出两条入口：

1. 用 CLI 管理：`codex mcp ...`
2. 直接编辑 `config.toml`

CLI 侧，文档确认有：

- `codex mcp add`
- `codex mcp get`
- `codex mcp list`
- `codex mcp login`
- `codex mcp logout`
- `codex mcp remove`

`codex mcp add` 有两种形态：

- stdio：`codex mcp add <name> -- <command...>`
- HTTP：`codex mcp add <name> --url <value>`

TOML 侧，server 配置写成：

- `[mcp_servers.<server-name>]`

### 4.3 transport 支持情况

官方文档明确列出的 transport 只有两种：

- **STDIO**
- **Streamable HTTP**

HTTP 侧支持：

- Bearer token
- OAuth（通过 `codex mcp login <server-name>`）

**没有在官方文档里看到 SSE 支持说明。** 因此，对于 PruneMem：

- stdio 是最稳妥的首发接入方式；
- 如果未来想写 HTTP 版文档，至少官方术语上应写成 **Streamable HTTP**，而不是泛泛写“HTTP”。

### 4.4 server 字段语义

Codex 对 stdio server 的字段支持如下：

| 字段 | 含义 |
|---|---|
| `command` | 启动命令 |
| `args` | 启动参数 |
| `env` | 直接设定给 server 的环境变量 |
| `env_vars` | 从本地/远端环境读取并透传的变量名 |
| `cwd` | server 启动工作目录 |
| `experimental_environment` | 可设 `remote`，走远端执行环境 |

HTTP / Streamable HTTP 侧支持：

| 字段 | 含义 |
|---|---|
| `url` | server 地址 |
| `bearer_token_env_var` | 从环境变量读取 Bearer token |
| `http_headers` | 静态 header |
| `env_http_headers` | 从环境变量读取 header 值 |

通用字段：

| 字段 | 含义 |
|---|---|
| `startup_timeout_sec` | 启动超时，默认 10 秒 |
| `tool_timeout_sec` | tool 调用超时，默认 60 秒 |
| `enabled` | 是否启用 |
| `required` | 为 `true` 时，初始化失败会让启动失败 |
| `enabled_tools` | allow list |
| `disabled_tools` | deny list |

### 4.5 命名空间、启动行为与文档空白

Codex 的官方文档已经足够让用户“配起来”，但对写一份高质量接入文档来说，还有几个明显空白：

1. **tool 命名空间没有明说**  
   文档只说明可以用 `enabled_tools` / `disabled_tools` 过滤 tool 名，但没有明确说运行时是否会自动加前缀。

2. **resource / prompt 体验没有展开写**  
   至少在这次读到的官方页里，没有 Claude Code 那样清楚的“prompt 怎么触发、resource 怎么引用”的说明。

3. **重连策略没写清**  
   文档写了 `startup_timeout_sec` 与 `required`，说明 Codex 会在启动阶段初始化 server；但断线后的重连/backoff 行为没有看到明确说明。

因此，对“Codex 是否 eager 启动 MCP server”这个问题，本次能给出的最稳妥表述是：

- **官方文档强烈暗示它会在启动阶段初始化 server**，因为有 `startup_timeout_sec` 与 `required`；
- 但**没有读到足够明确的生命周期说明**，所以这条最好在后续实测里确认。

整体判断：**Codex CLI 的 MCP 文档已经可用，但还不够“接入文档作者友好”。**

### 4.6 一份“假设性”的 PruneMem 接入配置示范

```toml
[mcp_servers.prunemem]
command = "prunemem"
args = ["stdio"] # 占位，换成真实启动方式
startup_timeout_sec = 10
tool_timeout_sec = 60
enabled = true
```

如果写命令行版，则可以在文档里给出这种“结构正确、命令待替换”的指引：

```bash
codex mcp add prunemem -- prunemem stdio
```

---

## 5. agentmemory 对比研究

### 5.1 项目定位与对外承诺

agentmemory 的项目定位非常明确：它不是泛化知识库，也不是完整 agent runtime，而是 **“给 coding agents 用的持久化记忆系统”**。这一点从 README 开头就写得很重：

- 先给出一句话价值主张：不必每次重新解释
- 紧接着强调跨 host：Claude Code / Cursor / Gemini CLI / Codex CLI / Hermes 等
- 然后马上落到“为什么需要它”：会话间重复解释、重复发现 bug、重复灌输偏好

从“用户读完前 200 字能不能知道这是什么”这个标准看，**agentmemory 是明显优秀的**。哪怕营销语气偏强，信息密度也足够高，用户很快就能建立心智模型。

### 5.2 tool 暴露面（数量、命名、描述）

在 `src/mcp/tools-registry.ts` 中，当前能数到 **51 个 MCP tool**。

命名风格非常统一：

- 全部是 `memory_*`
- snake_case
- 域前缀一致，没有混入别的命名族

这对用户和 host 都很友好：

- 一眼能看出哪些工具属于同一 server
- 也方便 host 侧做 allowlist/denylist

description 的写法是“两层结构”：

1. **核心工具**（例如 recall/save/search 一类）写得更长，往往 1–2 句，带“什么时候用”这样的 usage hint；
2. **长尾工具**（例如 slot / facet / sentinel 一类）大多回到一行式描述，但仍保留清晰动词和对象。

也就是说，agentmemory 的 tool 描述不是一味求长，而是**把长描述集中给最常用、最需要模型正确理解的工具**。这是个很值得借鉴的写法。

### 5.3 README 的自我介绍方式

agentmemory 的 README 有几个明显可借鉴点：

1. **先讲问题，再讲功能**  
   不是先堆协议、数据库、embedding，而是先说“为什么你会反复解释同一件事”。

2. **把支持的 host 摆到非常前面**  
   用户很快就能判断“这个东西和我当前用的 host 有没有关系”。

3. **接入路径分层**  
   - 纯 MCP path
   - plugin / hooks / skills 的更深集成 path

4. **大块可复制安装说明**  
   针对 Claude Code、Codex CLI、Hermes 都给了可以直接照做的说明。

不过它也暴露了一个文档维护风险：

- 根 README 与 `src/mcp/tools-registry.ts` 一致，显示当前是 **51 tools**；
- 但 `integrations/hermes/README.md` 里仍残留 **43 tools** 的表述。

这说明：**如果 PruneMem 以后要写多份 host 文档，tool 数量、命令名、能力面最好由单一事实源生成或集中引用，否则很容易漂移。**

### 5.4 安装路径

agentmemory 的安装/分发形态很清晰：

- 主包：`@agentmemory/agentmemory`
- 独立 MCP shim 包：`@agentmemory/mcp`
- 主要分发渠道：**npm**
- 没有看到 PyPI / pip 作为主安装入口

这对最终用户非常友好，因为它解决了一个常见问题：

- 用户不需要先理解整个系统，只要先知道：**“把这个 stdio server 跑起来”**

而且它进一步把 host 适配放在：

- `integrations/hermes/`
- `integrations/openclaw/`
- `plugin/`（Claude Code / Codex plugin 共享）

这比把所有接入说明都塞回主 README 更可维护。

### 5.5 对 PruneMem 的启发

对 PruneMem 最直接的启发有五条：

1. **要有一个“1 句解释 + 1 段痛点 + 1 个启动命令”的首页入口**  
   不要让用户先读协议背景。

2. **要有 host-specific 文档，而不是只写一个通用 MCP 段落**  
   Hermes、Claude Code、Codex CLI 的配置位置和术语并不一样。

3. **最好有一个“纯 MCP 基础接入”与“高级深集成”分层**  
   即使 PruneMem 暂时只有 MCP，也要把“基础接入”路径写得完整；未来若有 hooks / plugin，再另开章节。

4. **tool 列表与数量最好自动生成或集中维护**  
   避免出现 agentmemory 这种 43 / 51 混用的漂移。

5. **如果 PruneMem 未来发布形态不止一种（npm / pip / binary），文档必须先给一个主路径**  
   agentmemory 选择了 npm + `npx`，用户心智成本很低。

---

## 6. memos 对比研究

### 6.1 项目定位与对外承诺

memos 的主体定位与 PruneMem 差异很大。它首先是一个：

- **开源、自托管、快速记录型 note-taking 工具**

因此，它和 PruneMem 的相似点主要在于：

- 都把“可积累的信息”对外暴露给 AI client
- 都能通过 MCP 被 host 消费

但它和 PruneMem 的差异也很大：

- memos 面向的是“笔记系统 / 个人知识记录”
- PruneMem 面向的是“agent memory system”

所以这部分对比只能借它的**文档结构与协议暴露方式**，不能把产品定位硬类比。

### 6.2 tool 暴露面（数量、命名、描述）

memos 当前在 `server/router/mcp/` 下注册了 **19 个 MCP tool**，分成五组：

- memos：8
- tags：1
- attachments：4
- relations：3
- reactions：3

除此之外还有：

- **1 个 resource template**：`memo://memos/{uid}`
- **4 个 prompts**：`capture` / `review` / `daily_digest` / `organize`

命名风格是标准 CRUD/对象型 snake_case，例如：

- `list_memos`
- `get_memo`
- `create_memo`
- `delete_attachment`
- `list_reactions`

它的 description 写法很成熟，几个特点比较明显：

1. **每个 tool 的权限语义写得很清楚**  
   例如“需要认证”“需要 ownership”“未认证只能读 public”。

2. **参数说明偏接口文档风格**  
   比较适合给 host 用户做精确调用。

3. **不是强调“记忆”能力，而是强调对象和操作**  
   这符合 memos 的产品本体。

### 6.3 README 的自我介绍方式

memos 的顶层 README 用来介绍“笔记产品”这件事是成功的，但对 MCP 来说有一个明显问题：

- **顶层 README 几乎不帮助用户发现 MCP 能力**

根 README 主要强调：

- 自托管
- Markdown-native
- 轻量
- REST / gRPC API

但几乎没有把 MCP 当成主卖点放在前面。

换句话说：

- **产品 README 好**
- **MCP discoverability 弱**

真正高质量的 MCP 文档，是放在内部路径：

- `server/router/mcp/README.md`

这份 README 反而写得很完整：端点、transport、tool filtering、认证、origin 校验、tool 列表、resources、prompts、Claude Code 示例都有。

### 6.4 安装路径

memos 没有像 agentmemory 那样单独发一个“轻量 MCP shim 包”。它的 MCP 是：

- **嵌入在主 HTTP 进程里的**
- 通过 `/mcp` endpoint 暴露
- transport 是 **Streamable HTTP**

也就是说，用户不是“安装一个 MCP server 小程序”，而是：

1. 先部署并运行 memos 本体
2. 再让 host 指向 `http://<memos>/mcp`
3. 通过 Bearer token 做权限控制

这条路径对已有 memos 用户很自然，但对“只想接个 memory server 的 agent 用户”没有 agentmemory 那么轻。

### 6.5 对 PruneMem 的启发

memos 最值得借鉴的不是 host 集成，而是**MCP 服务说明书模板**。它把下列内容集中到了一个地方：

- endpoint
- transport
- tool filtering
- capability table
- auth
- origin 校验
- tool catalog
- resource catalog
- prompt catalog

如果 PruneMem 未来要写 `/docs/mcp-surface.md` 之类的文档，memos 这种写法非常值得借鉴。

但也要明确它的局限：

- 它**没有**给 Hermes / Codex / Claude 各写一份完整接入文档；
- 它更像“服务端说明书”，而不是“agent host 安装指南”；
- 顶层 README 与 MCP 文档之间存在 discoverability 断层。

因此，对 PruneMem 来说，memos 的启发更适合放在：

- “接口说明页怎么写”
- “认证和只读边界怎么写”

而不是放在：

- “不同 host 的安装路径怎么写”

---

## 7. 关键发现汇总

### 7.1 三个 host 接入难度排序

#### 排序结论

1. **Hermes — 低**
2. **Claude Code — 低到中**
3. **Codex CLI — 中**

#### 排序理由

**Hermes** 排第一，是因为它对“外部 stdio MCP server”这条路径支持最直接：

- YAML 配置简单
- `mcp_servers` 语义清楚
- `hermes mcp add/test/list` 辅助命令齐全
- 文档与源码都能互证
- 已有 agentmemory 成功案例

**Claude Code** 紧随其后，主要短板不是能力不足，而是接入文档要交代的概念比 Hermes 多：

- local / project / user scope
- Tool Search deferral
- `alwaysLoad`
- project-scope 的审批机制

它仍然是好接的，但要写得比 Hermes 更细。

**Codex CLI** 排第三，不是因为它不支持，而是因为：

- 文档明确标注 `codex mcp` 仍属 Experimental
- 命名空间、resources/prompts、重连行为等细节写得不如 Claude 完整
- 写接入文档时更容易碰到“文档没写，需要补实测”的空白点

### 7.2 PruneMem 当前对外面的缺口

这里说的“缺口”不是断言 PruneMem 内部实现缺失，而是**相对于一个用户可接入的公开文档体系**，它至少还需要补齐：

1. **明确的启动入口**  
   用户需要知道到底是 `npx`、`uvx`、`python -m`、独立 binary 还是别的。

2. **按 host 分开的最小接入步骤**  
   Hermes / Claude Code / Codex CLI 不能共用一份配置示例糊过去。

3. **一页式 MCP 能力面说明**  
   至少列出 11 个 tool 的名字、每个 tool 一句话说明、是否有 resource/prompt。

4. **验证步骤**  
   用户接完后应该怎么确认“真的可用了”。

5. **故障排查**  
   尤其是：command 找不到、stdio 启动失败、host 没发现工具、认证/环境变量问题。

6. **作用域/权限说明**  
   Claude Code 的 scope、Codex 的 trusted project、Hermes 的 `tools.include/exclude` 都该有单独提示。

7. **文档事实源统一机制**  
   agentmemory 的 43 / 51 漂移说明，tool 数量、tool 名、推荐安装命令不能散落维护。

### 7.3 推荐的接入文档结构

建议 PruneMem 的后续文档至少拆成下面几份：

1. `README.md` 顶部一屏
   - PruneMem 是什么
   - 为什么不是普通笔记/向量库
   - 最短启动命令
   - 指向各 host 文档

2. `docs/integrations/hermes.md`
   - 最小 YAML 配置
   - `hermes mcp add` 方式
   - `/reload-mcp` / `hermes mcp test` 验证
   - 常见错误

3. `docs/integrations/claude-code.md`
   - `claude mcp add` 命令
   - user/project 两版
   - `.mcp.json` 示例
   - Tool Search / `alwaysLoad` 说明

4. `docs/integrations/codex-cli.md`
   - `codex mcp add`
   - `config.toml` 示例
   - trusted project 说明
   - “哪些点已确认、哪些待实测”

5. `docs/mcp-surface.md`
   - 11 个 tool 列表
   - 参数风格
   - 返回值风格
   - 是否有 resources/prompts

6. `docs/troubleshooting.md`
   - host 没发现 tool
   - server 启动失败
   - 路径/环境变量问题
   - 远端 transport（若以后支持）

### 7.4 风险与未知点

本次没有回答彻底、需要后续实测确认的点有：

1. **PruneMem 的真实启动命令/参数**  
   本次任务没有提供 PruneMem 仓库路径，因此只能确认“它是 stdio MCP server”，不能确认具体 launch string。

2. **Claude Code 对 MCP tool 的内部命名细节**  
   prompt 与 resource 的 namespacing 文档很清楚，但普通 tool 的运行时前缀规则没有明确写出。

3. **Codex CLI 的 runtime 行为细节**  
   官方文档说明了配置和超时字段，但没有把重连、tool namespace、prompt/resource 体验讲透。

4. **Hermes 的“深层 memory provider”路径**  
   本次已确认基础 MCP 接入很容易，但如果未来想做成类似 agentmemory 的深集成插件，还需要单独研究 Hermes memory provider/plugin 约定。

5. **memos 官网层面的 MCP 文档 discoverability**  
   本次主要读了 repo 内文档，没有继续追网站文档树；如后续要把 memos 当对标样例，最好再补看官网信息架构。

---

## 8. 调研过程笔记

### 8.1 读了哪些文件、跳过了哪些

**Hermes：**

已读重点：

- `/Users/yang/Desktop/hermes-agent-main/README.md`
- `/Users/yang/Desktop/hermes-agent-main/cli-config.yaml.example`
- `/Users/yang/Desktop/hermes-agent-main/tools/mcp_tool.py`
- `/Users/yang/Desktop/hermes-agent-main/hermes_cli/mcp_config.py`
- `/Users/yang/Desktop/hermes-agent-main/hermes_constants.py`
- `/Users/yang/Desktop/hermes-agent-main/website/docs/user-guide/features/mcp.md`
- `/Users/yang/Desktop/hermes-agent-main/website/docs/guides/use-mcp-with-hermes.md`
- `/Users/yang/Desktop/hermes-agent-main/website/docs/reference/mcp-config-reference.md`
- `/Users/yang/Desktop/hermes-agent-main/website/docs/reference/cli-commands.md`
- `/Users/yang/Desktop/hermes-agent-main/mcp_serve.py`

按要求跳过或未深入：

- `environments/`
- `tinker-atropos/`
- `ui-tui/` / `web/` / `website/` 的无关部分
- messaging 平台适配代码
- `tests/`
- `RELEASE_*.md`

**agentmemory：**

已读重点：

- `/Users/yang/Desktop/agentmemory-main/README.md`
- `/Users/yang/Desktop/agentmemory-main/integrations/hermes/README.md`
- `/Users/yang/Desktop/agentmemory-main/packages/mcp/README.md`
- `/Users/yang/Desktop/agentmemory-main/package.json`
- `/Users/yang/Desktop/agentmemory-main/packages/mcp/package.json`
- `/Users/yang/Desktop/agentmemory-main/src/mcp/tools-registry.ts`
- 部分 `CHANGELOG.md`（只看与 Codex / MCP / 文档漂移有关的段落）

**memos：**

已读重点：

- `/Users/yang/Desktop/memos-main/README.md`
- `/Users/yang/Desktop/memos-main/AGENTS.md`
- `/Users/yang/Desktop/memos-main/server/router/mcp/README.md`
- `/Users/yang/Desktop/memos-main/server/router/mcp/mcp.go`
- `/Users/yang/Desktop/memos-main/server/router/mcp/tool_metadata.go`
- `/Users/yang/Desktop/memos-main/server/router/mcp/tools_*.go` 的注册段
- `/Users/yang/Desktop/memos-main/server/router/mcp/prompts.go`
- `/Users/yang/Desktop/memos-main/server/router/mcp/resources_memo.go`
- `/Users/yang/Desktop/memos-main/server/router/mcp/access.go`

### 8.2 哪些信息来自源码、哪些来自远程文档

**来自本地源码 / repo 文档：**

- Hermes 的配置路径、字段、transport、命名规则、容错逻辑
- agentmemory 的 tool 数量、命名风格、分发方式、Hermes 集成文档质量
- memos 的 MCP endpoint、tool/resource/prompt 能力面与认证方式

**来自远程官方文档：**

- Hermes 官方文档站：  
  - `https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp`
- Claude Code 官方文档：  
  - `https://docs.claude.com/en/docs/claude-code/mcp`  
  - `https://code.claude.com/docs/en/settings`
- Codex 官方文档：  
  - `https://developers.openai.com/codex/mcp`  
  - `https://developers.openai.com/codex/config-basic`  
  - `https://developers.openai.com/codex/cli/reference`

### 8.3 哪些问题没回答上、为什么

1. **PruneMem 的实际启动命令是什么**  
   原因：任务没有提供 PruneMem 仓库或发行包信息。

2. **Claude Code 对普通 MCP tool 的最终命名呈现方式是什么**  
   原因：官方文档对 prompt/resource 写得很清楚，但没有把普通 tool 的前缀规则直接写出来。

3. **Codex CLI 的重连/断线恢复、tool namespace、prompt/resource 体验细节**  
   原因：官方文档目前偏“配置说明”，运行时行为说明不够细，需要后续实测补齐。

4. **如果 PruneMem 将来要做 Hermes 深度 memory provider 集成，需要接哪组 plugin hook**  
   原因：本次任务聚焦“只读调研 + 基础 MCP 接入路径”，没有继续深挖 Hermes memory provider 全链路。

