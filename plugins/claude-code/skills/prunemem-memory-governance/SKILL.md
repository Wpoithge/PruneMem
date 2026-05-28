---
name: prunemem-memory-governance
description: Use when the user works with PruneMem memory governance - starting a session, switching tasks, completing milestones, reaching context capacity, or explicitly asking to remember/summarize/archive. Covers all 11 prunemem_* tools; reads can be invoked autonomously, writes require user confirmation.
---

# PruneMem Memory Governance

## Overview

PruneMem 是记忆治理系统，提供 11 个 MCP tool（5 个纯读、6 个可写）。
所有写类 tool 默认 `write: false`（dry-run）。Agent 可自主调用读类 tool；
写类 tool 在传 `write: true` 前必须取得用户显式确认。

本 skill 按语义信号（而非生命周期事件）指导调用时机和方式。
Host 专属的 hook 集成（SessionStart、PreCompact 等）由 host 框架单独处理，
不在 Agent 判断范围内。

## The Iron Law

READS AUTONOMOUS, WRITES NEED CONFIRMATION, ARCHIVE_SESSION IS NOT THE ANSWER.

`prunemem_archive_session` 不写盘，也不清空 working memory。
它只根据已有的 `session-packet.json` 计算 archive 对象并返回。
没有 tool 能从 live conversation 直接归档。用户说"归档"时，
先解释此限制，再询问真实意图。

## Critical Boundaries

1. **archive_session 是纯计算。** 它返回 archive 对象但不写盘，
   也不能从 live conversation 生成 session packet。用户说"归档这次对话"时，
   不要调用此 tool。

2. **run_sample_pipeline 的 write:false 仍会写文件。** `write` 只控制最终
   `updateRegistries` 步骤。内部 extract 和 judge 会无条件写入 `.generated.json`
   中间产物。不要把它当"安全探索"工具用。

3. **isolated preset 读写分离。** 读路径仍指向 `examples/`，写路径切到
   `.prunemem-isolated/`。isolated 下先写后读时，第二次读不到第一次写的内容，
   除非显式传 `state` 路径。

4. **update_working_state 只能合并，不能删除或压缩。** 没有"瘦身 working state"
   的语义。用户抱怨上下文太长时，直接告知此限制。

5. **没有从 live conversation 直接归档的 tool。**
   `src/archive/build-session-packet.js` 未暴露为 MCP tool。
   Agent 不能把当前对话转成 session packet。

## When to Use This Skill

检测到以下任一语义信号时启用：

- **Session 开场** - User 开始新会话，需要拉上下文。
- **Task 切换** - User 切换到不同任务或目标。
- **里程碑达成** - User 完成一个阶段或明确说"这部分做完了"。
- **容量阈值** - User 说"上下文太长"或 working state 过度膨胀。
- **显式触发** - User 说"记住这个"、"总结一下"、"归档"、"运行治理"，
  或直接要求调用某个 PruneMem tool。

## Quick Decision Rubric

### Session 开场
先调 `prunemem_get_working_state` 了解当前任务。如 working state 存在且相关，
再调 `prunemem_runtime_context` 拿完整 bundle。跳过 `archive_session`。
开场阶段不调任何写类 tool。

### Task 切换
调 `get_working_state` 确认当前状态。如需更新，先以 `write: false` 调
`update_working_state`，展示合并结果给用户，确认后再 `write: true`。
不要自作主张把旧任务标为"已完成"。

### 里程碑达成
调 `execution_plan` 和 `get_working_state` 确认哪个 milestone 已完成。
用 `update_working_state`（先 dry-run）更新 `completed_steps` 和
`in_progress_steps`。不要调 `run_sample_pipeline`——它不是里程碑记录工具。

### 容量阈值
调 `get_working_state` 和 `validate_maintenance` 评估现状。
无法自动修复，因为 `update_working_state` 没有删除/压缩语义。
向用户给出两个选项：(a) 由 host hook 处理；(b) 手动编辑。
注：v0.3.0 没有"把 candidate memories 自动迁移到长期 registry"的 tool 路径。
`curator_apply` 只治理 registry 层，不读 working state，也不处理
`candidate_long_term_memories`。不要为"清理"调 `archive_session` 或
`run_sample_pipeline`。

### 显式触发
"记住这个" -> 用 `update_working_state`（先 dry-run）保存到 working state。
"总结一下" -> 调 `runtime_context` 从 bundle 生成摘要，无需写操作。
"归档" -> 解释限制，问用户是指 host hook 自动处理还是手动管理。
"运行治理" -> 先 `validate_maintenance`，再按需 dry-run `repair_source_paths`
或 `curator_apply`，确认后再 write。
"跑一遍 pipeline" -> 仅当用户明确提到"从 session packet 抽事实"时才考虑
`run_sample_pipeline`。提醒 `.generated.json` 副作用，建议传 `mock: true`
或 `preset: isolated`。

## Don't

- 用户说"归档这次对话"时，不要调 `archive_session`。它无法归档 live conversation。
- 不要把 `run_sample_pipeline` 当"探索"或"安全测试"工具。`write: false` 也会写文件。
- 不要自主调用任何写类 tool 的 `write: true`。总是先 dry-run，展示结果，取得确认。
- 不要把"milestone 完成"当成"项目结束"。后面可能还有更多 milestone。

## Full Documentation

完整策略见 `docs/agent-playbook.md`，包含每信号的详细指导、全部 7 条边界、
tool 参数速查表和已知的 docs/code 冲突说明。
