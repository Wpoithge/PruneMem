# External Contracts

PruneMem 跟外部世界交换两种东西：**输入契约**（session packet，必须满足 schema 才能被处理）和**输出契约**（写到 workspace 里的 markdown / jsonl 格式，宿主拿去消费）。

这些是 **API surface**——一旦稳定下来，破坏性改动需要 major version bump。

## Input: session-packet.json

宿主在会话结束（或某个 archive 触发点）后，产出一个符合 session-packet schema 的 JSON 对象，喂给 PruneMem。

**Where validated**：`src/runtime/validate-input.js` 里的 `validateSessionPacket`。

**Where the schema lives**：

- 当前（0.2）：只在 `validate-input.js` 的代码里
- Step 4 之后：同时存在于 `docs/schemas/session-packet.schema.json`（JSON Schema 形式，从代码逆推），便于外部集成方用 `ajv` 之类的工具自行 validate

**Conceptual shape**（具体字段以代码为准，这里只是导览）：

```jsonc
{
  "sessionId": "string, required",
  "startedAt": "ISO 8601 timestamp",
  "endedAt": "ISO 8601 timestamp",
  "memoryVersion": "string, e.g. 'v4.1'",
  "messages": [
    /* 用户/助手/系统消息序列 */
  ],
  "context": {
    /* 宿主特定 metadata，core 只透传不解析 */
  }
  // ... 其他字段以 validate-input.js 为准
}
```

**Backward compatibility 规则**：

| 改动 | 允许？ | 版本影响 |
|---|---|---|
| 加新的 optional 字段 | ✅ | patch |
| 加新的 required 字段 | ❌（除非 major bump） | major |
| 改字段类型 | ❌ | major |
| 删字段 | ❌（除非 major bump） | major |
| 收紧字段约束（更严格的 enum、format） | ❌ | major |
| 放宽字段约束 | ✅ | patch |

## Output: workspace layout

PruneMem 写到 workspace 的几类文件（默认 layout）：

| 路径 | 内容 | 谁消费 |
|---|---|---|
| `examples/MEMORY.example.md` | L0–L3 分层记忆的扁平 markdown 渲染 | 宿主的 retrieval 层（OpenClaw + QMD、Hermes、其他） |
| `examples/registry/memories.jsonl` | 主记忆条目 jsonl | 宿主或运维工具 |
| `examples/registry/topics.jsonl` | 主题分类 | 同上 |
| `examples/registry/dedupe-index.jsonl` | 去重索引 | core 内部用 + 调试 |
| `examples/registry/lifecycle.jsonl` | 生命周期事件 | core 内部用 + 调试 |
| `examples/working-memory/state.json` | 当前 working memory | 宿主下次会话开始时读 |
| `examples/pipeline/<run-id>/...` | 单次 pipeline 运行的中间产物 | 调试 / replay |

**Step 4 之后**：`examples/` 这层硬编码会被 `runtime/paths.js` 替换成 layout-aware 的解析。OpenClaw layout 改成 `.prunemem/...`，但**输出格式本身不变**——也就是说，文件去哪儿了可以变，文件里写什么不能变。

## 不属于契约的东西

下面这些是 PruneMem 的**实现细节**，可以随版本变化，宿主集成方不能依赖：

- `src/runtime/`、`src/working/`、`src/extract/`、`src/judge/` 的内部 API（除非显式 re-export）
- `src/core/` 里未通过 `index.js` 导出的辅助函数
- `examples/pipeline/<run-id>/` 下的中间文件命名（调试用）
- LLM judge 的 prompt 模板内容
- Registry jsonl 里 *未文档化* 的字段（比如内部用的 `_debug_score`）

如果宿主集成方依赖了这里任何东西，是他们的 bug，不是我们的 breaking change。

## How external integrators can produce a valid packet

最小可行接入：

1. 你的宿主 agent 在合适的生命周期点（会话结束 / 周期任务）收集本次会话信息
2. 序列化成符合 schema 的 JSON 对象（用 ajv 自验证）
3. 调用 PruneMem：

   ```javascript
   import { archiveSession } from 'prunemem';
   const result = await archiveSession({
     workspace: '/path/to/your/workspace',
     packet: yourPacket,
     layout: 'custom', // 或 'openclaw' / 'hermes' / 'default'
   });
   ```

   或（CLI 风格）：

   ```bash
   echo "$packet_json" | node src/core/archive-session.js \
     --workspace /path/to/your/workspace --layout custom
   ```

   或（MCP 风格，Step 5 之后）：

   ```jsonc
   { "tool": "prunemem.archive_session", "arguments": { "packet": ..., "workspace": "..." } }
   ```

4. 检查返回的 `result.ok`，按需读取 workspace 里的输出文件

## 改动这些契约的流程

如果在迁移过程中真的发现某个契约字段必须改，不要直接改，而是：

1. 在本文档加一节 `## Pending changes for 0.4`，写清楚要改什么、为什么必须改、谁会受影响
2. 在 GitHub 开一个 issue，标 `breaking-change` / `discussion`
3. 等讨论 + 决定
4. 0.4 版本统一释放（不要在 0.3.x 里偷偷改）

这条规则比看起来重要。**之前那个"开源半成品"的根因之一就是契约边界不清晰，每次改宿主时都顺手动了核心格式**——这次不要再犯。
