# PruneMem Agent Playbook

## 1. Overview

这份文档定义 Agent（Claude Code / Codex CLI / Hermes 等）在持有 PruneMem MCP tool
权限时的调用策略。它回答一个问题："看到什么信号时，该调哪个 tool，怎么调"。

PruneMem v0.3.0 提供 11 个 tool：5 个纯读、6 个可写。写类 tool 默认 `write: false`
（dry-run），需显式传 `write: true` 才落盘。Agent **不得**在未经用户确认的情况下
自主调用 write-class tool 的写盘模式。

本文档 host 无关。Claude Code、Codex CLI、Hermes 的接入步骤已在
`docs/integrations/` 中说明，此处不再重复。

---

## 2. Critical Boundaries (READ FIRST)

以下 7 条边界来自 Step 5 Phase C-0 审计和 Phase D 回归测试。违反任何一条都会导致
意外行为或数据污染。

### B1: archive_session 不写盘、不清 working memory

`prunemem_archive_session` 是纯计算 tool：它在内存里根据已有的
`session-packet.json` + `working-state.json` 算出 archive 对象并返回，
**不会写盘，也不会清空 working state**。当前没有 MCP tool 能从 live conversation
直接生成 `session-packet.json`。v0.3.0 **不推荐** Agent 主动调用此 tool。

### B2: run_sample_pipeline 的 write:false 不是真 dry-run

`prunemem_run_sample_pipeline` 的 `write` 只控制最终 `updateRegistries` 步骤。
内部 `extract` 和 `judge` 步骤会**无条件写入** `.generated.json` 中间产物。
mock:false 时还会发起真实 LLM API 调用。不要把它当成"安全探索"工具。

### B3: isolated preset 是读写分离，不是完整副本

`preset: "isolated"` 下，读路径仍指向 `examples/`，写路径切到
`.prunemem-isolated/`。连续两次调用 `update_working_state`（isolated）时，
第二次读不到第一次写的东西。在 isolated 下做"先写后读"的连续操作时，
需显式传 `state` 路径指向 isolated 目录中的文件。

### B4: maintain 在 isolated 下不会验证自己刚写的东西

`prunemem_maintain` 的 pre/post validate 读的是 `examples/` 下的 registry，
但中间 curator-apply / repair-source-paths 写的是 `.prunemem-isolated/` 下的 registry。
想在 isolated 下"先写后验证"时，这层不一致必须清楚。

### B5: 从 live conversation 直接归档不可用

`src/archive/build-session-packet.js` 没有暴露成 MCP tool。Agent 不能把当前对话
直接写成 archive。用户说"归档当前会话"时，不要调 `archive_session`——它做不到。

### B6: working state 没有"瘦身/删除"语义

`prunemem_update_working_state` 是合并式增量更新：传入的字段会覆盖或追加，
已存在的字段不会自动删除，历史也不会自动压缩。Agent 能做的有限，
必要时告知用户当前限制。

### B7: docs 与代码的命名冲突

- `docs/mcp-server.md` 说 `run_sample_pipeline` 含 repair 步骤，实际代码没有。
- `docs/mcp-tool-inventory.md` 用 snake_case 字段名（如 `source_paths`），
  真实 MCP schema 是 camelCase（如 `sourcePaths`）。

以代码 schema 为准。不确定时参考 `docs/mcp-surface.zh.md`（最新同步）或直接用
`prunemem list-tools` 拉 schema。

---

## 3. Core Principles

### P1: 读优先，写需确认

读类 tool（runtime_context / get_working_state / execution_plan /
validate_maintenance / archive_session）可由 Agent 在判断合适时自主调用。

写类 tool（update_working_state / curator_apply / update_registries /
repair_source_paths / maintain / run_sample_pipeline）在用户未显式确认前，
只能用 `write: false`（dry-run）调用并展示效果。用户确认后，方可带 `write: true`
调用。

### P2: 决策准则，不是决策树

不追求"看到 X 就调 Y"的机械映射。每个信号给出判断准则：
优先考虑什么、什么情况下该做什么、什么情况下不该做。
Agent 根据具体上下文组合调用，不必按固定顺序执行。

### P3: 边界透明告知用户

遇到 PruneMem 做不到的事（如从 live conversation 直接归档、自动压缩 working state），
直接告诉用户限制，不要假装能做。用户说"归档"时，解释 B1/B5，再询问真实意图。

### P4: 不假装有"会话结束"信号

Hermes 连飞书、Claude Code 按项目跑、Codex CLI 按任务跑——这些宿主都没有可靠的
"会话结束"信号。真结束了反而用不上记忆。Agent 的触发依据是语义信号
（开场 / 切换 / 里程碑 / 容量 / 显式），不是生命周期事件。

---

## 4. Five Semantic Signals

---

### Signal 1: Session 开场

**你会遇到什么**

User 开始一轮新的对话，或在一个长期项目里重新打开一个会话。
Agent 此时对当前任务状态一无所知，需要快速拉取上下文。

**这个信号意味着什么 / 不意味着什么**

意味着需要了解：当前任务是什么、已做到哪一步、有哪些约束和待办。
不意味着这是一个"全新项目"——它可能是同一项目的第 N 次会话。
不意味着需要归档上一会话（没有可靠的"上一会话结束"信号，且 archive_session
不能从 live conversation 生成 packet）。

**你能做什么（读侧，可自主）**

按以下优先级自主调用读类 tool：

1. `prunemem_get_working_state`（`workspace` 必填绝对路径，`preset` 可选）
   - 拿到 parsed working state JSON，了解当前 task_title、goal、
     completed_steps、in_progress_steps、open_questions。
   - 这是最快了解用户当前上下文的方式。

2. `prunemem_runtime_context`（`workspace` 必填，`preset` 可选）
   - 返回 runtimeContext + executionContext + bundle。
   - 如果 working state 存在且用户没有明显切换任务的迹象，
     调这个 tool 拿到更完整的上下文（含 milestones、decisions）。
   - 如果 working state 为空或明显过时（如 task_title 与当前对话无关），
     跳过此步，直接进入 Signal 2（Task 切换）的处理。

3. `prunemem_execution_plan`（`workspace` 必填，此 tool 不支持 `preset`）
   - 如果用户明确提到"按某个计划执行"或工作区里已有 execution-plan input，
     可调此 tool 获取 plan + milestone_state。
   - 一般开场阶段不需要调，除非用户提到 plan。

推荐参数：
- `workspace`: 用户项目目录的绝对路径（`~/` 展开为绝对路径）
- `preset`: 如不确定环境是否干净，传 `"isolated"` 避免污染真实 workspace

**写类操作（需用户确认或来自 hook）**

Session 开场阶段**不要**调用任何写类 tool。如果 working state 明显缺失或过时，
等了解用户当前意图后再决定是否更新（进入 Signal 2 流程）。

**你不应该做什么**

- 不要调 `archive_session`。开场不是归档时机，且此 tool 不能从 live conversation
  生成 packet（B1/B5）。
- 不要假设 working state 一定存在。如果 `get_working_state` 返回空或旧数据，
  把它当成"没有上下文"处理，不要强行解释。
- 不要开场就调 `run_sample_pipeline`。用户还没给任务，pipeline 没有输入。

**何时停下来问用户**

- working state 里的 task_title 与当前对话明显不符：
  "当前 working state 记录的任务是 'XXX'，你这次想继续这个任务，还是开始新任务？"
- working state 为空且用户没有给出明确目标：
  "没有读到历史上下文。你这次想做什么？"

---

### Signal 2: Task 切换

**你会遇到什么**

User 明确表示"换个任务"、"先不搞这个了"、"我们来处理 Y"，
或者当前对话方向与 working state 记录的任务明显偏离。

**这个信号意味着什么 / 不意味着什么**

意味着 working state 里的 task_title / goal / next_actions 可能需要更新。
不意味着旧任务"已经完成"——可能只是暂停或放弃。
不意味着需要归档（B1/B5）。

**你能做什么（读侧，可自主）**

1. `prunemem_get_working_state` — 确认当前 working state 内容。
2. `prunemem_runtime_context` — 如需完整上下文（含历史 decisions）辅助判断。

**写类操作（需用户确认或来自 hook）**

如需更新 working state 以反映新任务，用 `prunemem_update_working_state`：

- 先以 `write: false` 调用，传入新的 `task_title`、`goal`、`next_actions` 等字段，
  展示合并后的结果给用户看。
- 用户确认后，再以 `write: true` 调用。

关键参数：
- `workspace`: 绝对路径
- `input`: 可选。如果传了，它是一个 JSON 文件路径，内容是 delta 对象，
  会被合并进当前 working state。
- `state`: 可选。显式指定 working-state.json 的读写路径（在 isolated 下尤其重要）。
- `write`: 默认 `false`，确认后才改 `true`。
- `preset`: `"isolated"` 用于测试， `"default"` 用于真实 workspace。

旧任务的处理：
- 如果旧任务是"已完成"：把旧 task 加入 `completed_steps`，新任务写入
  `task_title` / `goal` / `in_progress_steps`。
- 如果旧任务是"暂停/放弃"：旧 task 可以留在 `completed_steps` 或单独注明状态，
  由用户决定。Agent 不要自作主张标记为"完成"。

**你不应该做什么**

- 不要直接覆盖 working state。`update_working_state` 是合并语义，但传入的顶层字段
  会覆盖同名字段。展示 dry-run 结果让用户确认。
- 不要调 `archive_session`。Task 切换不等于会话结束，且 archive_session 不能归档
  live conversation（B5）。
- 不要调 `curator_apply` 或 `maintain`。任务切换时不需要治理 registry。

**何时停下来问用户**

- 不确定旧任务的状态时："旧任务 'XXX' 是已完成、暂停，还是放弃？"
- 用户切换任务很频繁时："需要我把当前进度保存到 working state 吗？"

---

### Signal 3: 里程碑达成

**你会遇到什么**

User 说"这部分做完了"、"M2 完成了"、"终于搞定了"，或者 Agent 自己观察到
一个明显的阶段性成果（如大型 PR 合并、核心模块测试通过）。

**这个信号意味着什么 / 不意味着什么**

意味着 execution plan 里的某个 milestone 可能已经达成，
working state 里的 `completed_steps` / `in_progress_steps` 需要更新。
不意味着整个项目结束——可能还有后续 milestone。
不意味着需要调 run_sample_pipeline（pipeline 是批量抽事实和判分，不是里程碑记录工具）。

**你能做什么（读侧，可自主）**

1. `prunemem_get_working_state` — 查看当前 steps 和 milestones。
2. `prunemem_execution_plan` — 如用户提到 plan 或 milestone ID，调此 tool 获取
   当前 plan 状态，确认哪些 milestone 是 done / in_progress / pending。
   注意：milestone_state 不会被持久化到磁盘。每次需要时通过
   `prunemem_execution_plan` 或 `prunemem_runtime_context` 当场派生即可，
   不要假设它已被某次调用保存下来。

**写类操作（需用户确认或来自 hook）**

如需更新进度，用 `prunemem_update_working_state`：

- 更新 `completed_steps`（追加刚完成的项）。
- 更新 `in_progress_steps`（移除已完成的，加入下一阶段的）。
- 如有明确的 milestone 状态变化，更新 `next_actions`。
- 先 `write: false` 展示，用户确认后 `write: true`。

如果用户提到"这个决策要记下来"，考虑同时：
- 把决策摘要加入 `decisions_confirmed`。
- 等会话结束或显式触发时，由 host hook 或用户手动触发 curator-apply / update-registries
  落长期记忆（L1-L3）。Agent 本身不直接操作 registry。

**你不应该做什么**

- 不要调 `run_sample_pipeline`。pipeline 的用途是"从 session packet 抽取事实并判分"，
  不是"记录里程碑"。
- 不要调 `curator_apply` 自主把里程碑写进 registry。Registry 更新需要 judged facts
  （由 extract+judge 生成），不是 Agent 直接决定。
- 不要假设"最后一个 milestone 完成 = 项目结束"。问用户是否还有后续任务。

**何时停下来问用户**

- 不确定当前完成的是哪个 milestone 时："你刚完成的是 plan 里的 M2 吗？"
- 用户说"做完了"但 working state 里还有未完成的 blocked_items 时：
  "working state 里还有 X 被标记为阻塞，需要更新状态吗？"

---

### Signal 4: 容量阈值

**你会遇到什么**

User 说"上下文太长了"、"记不住之前的了"、"能不能精简一下"，
或者 Agent 自己观察到 working state 内容膨胀（如 `completed_steps` 超过 20 项、
`candidate_long_term_memories` 累积过多）。

**这个信号意味着什么 / 不意味着什么**

意味着当前上下文可能已经超出有效工作窗口，需要判断哪些信息应该保留、
哪些可以迁移到长期记忆或不保留。
不意味着"会话要结束了"——容量问题可能发生在会话的任何阶段。
不意味着 Agent 能自动压缩或删除 working state（B6）。

**你能做什么（读侧，可自主）**

1. `prunemem_get_working_state` — 评估容量。重点关注：
   - `completed_steps` 长度
   - `candidate_long_term_memories` 长度
   - `artifacts` 列表
   - 整体 JSON 大小

2. `prunemem_validate_maintenance` — 检查 registry 健康度。
   - 传 `strict: false` 做常规检查。
   - 如用户报告"记忆混乱"或"重复"，传 `strict: true`。
   - 此 tool 纯读，可自主调用。

3. `prunemem_runtime_context` — 获取 bundle，帮助判断哪些内容已在长期记忆层、
   哪些仅在 working state 中。

**写类操作（需用户确认或来自 hook）**

Agent **不能直接解决容量问题**，因为：
- `update_working_state` 是合并增量，不能删除字段（B6）。
- 没有"压缩"或"清理"语义。
- 真正能把内容从 working state 迁移到 L1-L3 长期记忆的是 curator-apply /
  update-registries，但它们操作的是 registry，不是 working state 本身。

正确做法：
1. 向用户说明当前限制："v0.3.0 的 update_working_state 只能追加/覆盖，不能删除或
   压缩。我有以下建议..."
2. 给出两个选项：
   - (a) 由 host 的 lifecycle hook 自动处理（如果 host 已集成，不需要用户每次确认）。
   - (b) 用户手动编辑 working-state.json 精简内容。

注：v0.3.0 没有"把 candidate memories 自动迁移到长期 registry"的 tool 路径。
`curator_apply` 只治理 registry 层（memories.jsonl / lifecycle.jsonl 等），
不读 working state，也不处理 `candidate_long_term_memories`。

**你不应该做什么**

- **不要调 `archive_session`**。用户说"上下文太长"不等于"要归档"，
  且 archive_session 不能从 live conversation 生成 packet（B1/B5）。
- **不要调 `run_sample_pipeline`**。它不是清理工具，且 write:false 也会写
  .generated.json（B2）。
- 不要尝试用 `update_working_state` 传空值来"删除"字段——空值会覆盖为 empty string
  或 empty array，不是删除语义。
- 不要建议用户"删掉 working-state.json 重来"——会丢失所有上下文。

**何时停下来问用户**

- 任何容量问题出现时，第一时间告知限制并给出选项，不要自行决定。
- 话术示例："working state 已积累 X 条 completed_steps 和 Y 条 candidate memories。
v0.3.0 没有自动压缩能力。建议：① 由 host hook 自动处理；② 手动编辑；③ 用 curator_apply
把 memories 落盘到长期记忆层。你倾向哪种？"

---

### Signal 5: 显式触发

**你会遇到什么**

User 明确说："记住这个"、"把这个记下来"、"总结一下当前进度"、"归档这次对话"、
"运行一次治理"。

**这个信号意味着什么 / 不意味着什么**

意味着用户希望主动操作记忆系统。具体意图需要澄清，因为"记住"可能指：
- 更新 working state（短期工作上下文）
- 写入长期记忆 registry（L1-L3）
- 生成 session archive（但 v0.3.0 不支持从 live conversation 直接归档）

不意味着 Agent 可以跳过确认直接写盘。即使 user 说"记住"，写类 tool 的 write:true
仍需确认，除非操作来自已授权的 host lifecycle hook。

**你能做什么（读侧，可自主）**

1. `prunemem_get_working_state` — 了解当前状态，作为更新或总结的基础。
2. `prunemem_runtime_context` — 获取完整 bundle，用于"总结当前进度"。
3. `prunemem_validate_maintenance` — 如用户说"运行一次治理"或"检查一下记忆"，
   先 dry-run 检查 registry 健康度。

**写类操作（需用户确认或来自 hook）**

根据用户的具体意图分类处理：

**A. "记住这个 / 把这个记下来"**
- 如果指"更新当前工作进度"：用 `prunemem_update_working_state`，
  把关键决策或新任务写入 working state。
- 如果指"写入长期记忆"：解释这需要 extract+judge+update-registries 流程，
  v0.3.0 没有直接从 conversation 抽取事实并落盘的 tool（那是 `run_sample_pipeline`
  做的事，但它需要 session packet 作为输入，不是 live conversation）。
  建议由 host hook 在 SessionEnd / PreCompact 时自动触发。

**B. "总结一下当前进度"**
- 纯读操作。调 `prunemem_runtime_context` 拿到 bundle，
  用其中的 working_state + execution_context 生成摘要，展示给用户。
- 不需要调用写类 tool。如果用户满意摘要并说"把总结存下来"，
  再进入 `update_working_state` 流程。

**C. "归档这次对话"**
- **不要调 `archive_session`**（B1/B5）。
- 解释限制："v0.3.0 没有从 live conversation 直接归档的 tool。archive_session
  需要预先存在的 session-packet.json，且它只返回 archive 对象、不写盘。
  如果你想归档，目前有两种方式：① 由 host lifecycle hook 在会话边界自动处理；
  ② 手动把 conversation 导出为 session-packet.json 后再调 archive_session。"
- 询问用户真实意图：是想（a）由 host 自动处理，还是（b）暂时手动管理？

**D. "运行一次治理 / 检查一下记忆"**
- 先用 `prunemem_validate_maintenance`（`strict: false`）检查现状。
- 如有问题，用 `prunemem_repair_source_paths`（`write: false`）展示修复建议。
- 如需 curator 治理，用 `prunemem_curator_apply`（`write: false`）展示效果。
- 全部 dry-run 展示后，用户确认再 `write: true`。

**E. "跑一遍完整 pipeline"**
- 只有用户明确提到"从 session packet 抽事实并判分"时才考虑
  `prunemem_run_sample_pipeline`。
- 提醒副作用：write:false 也会写 .generated.json（B2），mock:false 会调 LLM API。
- 强烈建议传 `mock: true` 或 `preset: "isolated"`。

**你不应该做什么**

- 不要听到"记住"就直接 `write: true`——即使显式触发，首次写盘也需确认。
- 不要听到"归档"就调 `archive_session`——此 tool 不能归档 live conversation。
- 不要把 `run_sample_pipeline` 当成"万能治理工具"。它只做 extract → judge →
  repair → update-registries，不是清理 working state 的工具。

**何时停下来问用户**

- 用户的指令模糊时："你说的'记住'是指更新 working state，还是写入长期记忆 registry？"
- 用户要求"归档"时：先解释 B1/B5 限制，再询问真实意图。
- 任何写类操作前：展示 dry-run 结果，问"确认写入吗？"

---

## 5. Lifecycle Hook Integration

SessionStart / PreCompact / SessionEnd / PostToolUse 等事件**不是 Agent 判断的范围**。
它们由 host 的 lifecycle hook 集成自动触发（Step 6.5.2 实现）。

Agent 只需要识别 5 个语义信号（第 4 节）。Hook 触发的写类操作不需要用户每次确认——
已在 hook 配置时一次性授权。

当前阶段（v0.3.0），如果 host 没有 hook 集成，Agent 按第 4 节的信号判断即可，
不需要模拟 hook 行为。

Hook 触发的写类调用已在 hook 配置阶段获得用户一次性授权，
不需要 agent 再次请求确认。Agent 如果观察到 working state 等文件被外部更新，
应该把它当作 lifecycle 行为，不要尝试"撤销"或反过来询问用户。

---

## 6. Tool Quick Reference

| Tool 名 | 类型 | 关键参数 | 默认行为 | 是否推荐自主调用 |
|---|---|---|---|---|
| `prunemem_archive_session` | read | `workspace`, `packet`, `state`, `memory_version`, `preset`, `override` | 纯计算，返回 archive 对象，不写盘 | **不推荐** |
| `prunemem_runtime_context` | read | `workspace`, `state`, `plan`, `preset`, `override` | 返回 runtimeContext + executionContext + bundle | 是 |
| `prunemem_execution_plan` | read | `workspace`, `input` | 返回 plan + milestoneState + executionContext。不支持 `preset`/`override` | 是 |
| `prunemem_get_working_state` | read | `workspace`, `input`, `preset`, `override` | 返回 parsed working-state JSON | 是 |
| `prunemem_validate_maintenance` | read | `workspace`, `strict`, `preset`, `override` | `strict` 默认 `false` | 是 |
| `prunemem_repair_source_paths` | write | `workspace`, `write`, `preset`, `override` | `write` 默认 `false`（dry-run） | dry-run 可自主，write:true 需确认 |
| `prunemem_update_working_state` | write | `workspace`, `input`, `state`, `write`, `preset`, `override` | `write` 默认 `false`。合并 delta 到 working state | dry-run 可自主，write:true 需确认 |
| `prunemem_curator_apply` | write | `workspace`, `write`, `preset`, `override` | `write` 默认 `false`。治理 registry：合并、过期、归一化 | dry-run 可自主，write:true 需确认 |
| `prunemem_update_registries` | write | `workspace`, `judged`, `sourcePaths`, `memoryId`, `channel`, `agent`, `write`, `preset`, `override` | `write` 默认 `false`。向 registry jsonl 插入 judged facts | dry-run 可自主，write:true 需确认 |
| `prunemem_maintain` | write | `workspace`, `write`, `strict`, `repairSourcePaths`, `preset`, `override` | `write` 默认 `false`。组合：validate → curator-apply → [repair] → validate | dry-run 可自主，write:true 需确认 |
| `prunemem_run_sample_pipeline` | write | `workspace`, `mock`, `write`, `preset`, `override` | `write` 默认 `false`。extract → judge → update-registries（三步，无 repair） | **否**。mock:false 触发外部 LLM 调用 + 无条件写 .generated.json |

**参数说明：**
- `workspace`: 必填，必须是绝对路径。默认值是当前工作目录（`process.cwd()`）。
- `preset`: `"default"` | `"isolated"` | `"custom"`。默认 `"default"`。
  `"isolated"` 把写路径重定向到 `.prunemem-isolated/`，读路径仍指向 `examples/`。
- `override`: 部分路径覆盖对象，shallow-merge 到 preset base。
- `write`: boolean。所有 write-class tool 默认 `false`（D5 dry-run 决议）。
- `mock`: 仅 `run_sample_pipeline` 有。`true` 用 mock LLM 响应，不发真实 API 调用。
- `strict`: 仅 `validate_maintenance` 有。`true` 启用严格校验。
- `repairSourcePaths`: 仅 `maintain` 有。`true` 在中间步骤自动修复 source path。

---

## 7. Known Docs/Code Conflicts

以下两处 docs 与代码不一致，以代码为准：

### C1: run_sample_pipeline 的描述步骤不符

`docs/mcp-server.md` 和 `docs/mcp-tool-inventory.md` 描述
`prunemem_run_sample_pipeline` 的步骤为 "extract → judge → repair-source-paths →
update-registries"。实际代码中 pipeline 调用的是 `runExtract` → `runJudge` →
`updateRegistries`，**没有 repair-source-paths 步骤**。如果用户引用 docs 说
"pipeline 包含 repair"，纠正为以代码行为准。

### C2: tool inventory 使用 snake_case，真实 schema 是 camelCase

`docs/mcp-tool-inventory.md` 的 inventory 表用 snake_case 记录字段名
（如 `source_paths`, `memory_id`, `repair_source_paths`），
但实际 MCP schema 和 core 函数签名使用 camelCase（如 `sourcePaths`, `memoryId`,
`repairSourcePaths`）。构造 tool 参数时，**以 `prunemem list-tools` 返回的
schema 为准**。

### C3: timeout_ms 在 inventory 中列出，但 MCP schema 不暴露

`docs/mcp-tool-inventory.md` 说 `prunemem_maintain` 有 `timeout_ms` 参数，
但 `docs/mcp-tools.md` 已说明 `timeoutMs` 不暴露（已废弃）。调用 `maintain` 时
不要传 `timeoutMs` 或 `timeout_ms`。

---

## 8. Further Reading

- [`docs/mcp-server.md`](mcp-server.md) — MCP Server 启动与接入协议
- [`docs/mcp-tools.md`](mcp-tools.md) — 每个 tool 的详细 schema 与最小调用示例
- [`docs/mcp-tool-inventory.md`](mcp-tool-inventory.md) — 完整 tool 清单与批次 rollout 计划
- [`docs/integrations/claude-code.md`](integrations/claude-code.md) — Claude Code 接入指南
- [`docs/integrations/codex-cli.md`](integrations/codex-cli.md) — Codex CLI 接入指南
- [`docs/integrations/hermes.md`](integrations/hermes.md) — Hermes Agent 接入指南
- [`docs/mcp-design.md`](mcp-design.md) — 协议设计规范（transport、命名、错误处理）
