# PruneMem development notes

Notes for maintainers and future contributors. Not user-facing.

## Pitfalls discovered during Step 6.5.2 (Claude Code plugin integration)

### Hook tests must use subshell + export for environment variables

When writing bash tests that invoke a hook with custom environment variables,
**do not** use the form:

```bash
VAR=val cmd1 | bash hook.sh    # WRONG — VAR only reaches cmd1, hook sees NOT_SET
```

Use one of:

```bash
( export VAR=val; cmd1 | bash hook.sh )                # subshell + export
env VAR=val bash -c 'cmd1 | bash hook.sh'              # env wraps the pipeline
```

All `tests/hooks/test-*.sh` files use the subshell+export form. This was
discovered during 6.5.2-F when a spec drafted in form-A almost shipped before
the hook implementer corrected it during 6.5.2-E.

### `prunemem call update_working_state`'s `input` field is a file path, not an inline object

The MCP schema declares `input: { type: 'string' }` and the core function
treats it as a path passed to `readJson(filePath)`. Inline objects are
rejected at the MCP protocol layer with error -32602.

Correct usage from a hook:

```bash
update_input_file="$(mktemp /tmp/pm-uws.XXXXXX.json)"
cat > "$update_input_file" <<EOF
{"delta": {"completed_steps_added": ["edited foo.py"]}}
EOF

call_args="$(jq -nc --arg w "$workspace" --arg f "$update_input_file" \
  '{workspace: $w, input: $f, write: true}')"
prunemem call update_working_state --json "$call_args"
rm -f "$update_input_file"
```

`post-tool-use.sh` is the reference implementation. Other hooks (PreCompact's
former α part) tried to pass an inline object and never actually wrote
anything — the deceptive "success log" came from a faulty `jq -e` branch in
the caller, not from a real successful write.

This trap is silent because:
- MCP returns a protocol error, not a tool-level error
- The hook's response parser may incorrectly classify the error as success
  if not careful about distinguishing `.result.ok` vs MCP-level errors

When implementing new hooks that write working state, always write a smoke
test that verifies the file content changed on disk after the call, not just
that the call returned without exception.

## Hook trace workflow

The trace log mechanism (`PRUNEMEM_HOOK_TRACE=1` → `~/.prunemem-hook-trace.log`)
is for diagnostic use during plugin install verification or hook behavior
debugging. Default is OFF in production.

Recommended end-to-end test workflow (reference: 6.5.2-F-3):

1. Install plugin: `claude plugin install <plugin>@<marketplace>`
2. Create disposable workspace: `mkdir -p ~/some-throwaway-test`
3. Enable trace + optional opt-in features:
```bash
   export PRUNEMEM_HOOK_TRACE=1
   export PRUNEMEM_ENABLE_POSTTOOL=1   # only if testing PostToolUse
```
4. Launch Claude Code from that workspace, run a scripted scenario covering
   each hook (file edit → /compact → /exit)
5. Inspect `~/.prunemem-hook-trace.log` — each event block carries hook name,
   phase, environment snapshot, stdin payload, exit code
6. After verification, unset PRUNEMEM_HOOK_TRACE and remove the log file

## Codex CLI integration (Step 6.5.3)

### Cross-platform single plugin structure

One directory `plugins/claude-code/` serves both Claude Code (`.claude-plugin/`) and Codex (`.codex-plugin/`), sharing `hooks/` and `skills/`.

Two marketplace manifests:
- `.claude-plugin/marketplace.json` (Claude Code)
- Repository root `.agents/plugins/marketplace.json` (Codex)

Two hooks configurations:
- `hooks/hooks.json` (Claude Code, 4 events: SessionStart, PreCompact, SessionEnd, PostToolUse)
- `hooks/hooks.codex.json` (Codex, 3 events: SessionStart, PreCompact, UserPromptSubmit)

Codex selects `hooks.codex.json` via explicit pointer in `.codex-plugin/plugin.json`: `"hooks": "./hooks/hooks.codex.json"`. Without this, Codex would auto-detect `hooks/hooks.json`.

### Codex installation

```bash
codex plugin marketplace add <repo>
codex plugin add prunemem-memory@prunemem
```

Installation **copies** to `~/.codex/plugins/cache/.../0.3.0/`. After modifying source, **must remove+add to refresh cache** (version unchanged → `add` alone does not auto-refresh; remove+add forces refresh — confirmed via testing).

### Claude Code vs Codex platform differences

**No CLAUDE_PROJECT_DIR**: Codex does not set this environment variable. Workspace is resolved from stdin's `cwd` field. Resolution order: `CLAUDE_PROJECT_DIR → stdin.cwd → PRUNEMEM_WORKSPACE → PWD`. CLAUDE_PROJECT_DIR stays first to ensure Claude Code behavior unchanged.

**Environment variables**: Codex native vars are `PLUGIN_ROOT`/`PLUGIN_DATA`, with compatibility aliases `CLAUDE_PLUGIN_ROOT`/`CLAUDE_PLUGIN_DATA`. `hooks.codex.json` uses `${PLUGIN_ROOT}`. Codex **passes shell environment variables to hook subprocesses** (tested: PRUNEMEM_HOOK_TRACE works), so environment-based configuration works on Codex.

**No SessionEnd event** (Stop is ignored) → Codex does not wire SessionEnd.

**PreCompact / PostCompact are pure notification events**: stdout plain text is ignored, no additionalContext injection support → cannot use PostCompact for post-compact injection.

**SessionStart source=compact is for resuming compacted sessions (resume-like)**, not for in-session manual `/compact`. In-session `/compact` does not re-fire SessionStart.

**Codex post-compact context re-injection uses UserPromptSubmit** (supports additionalContext): snapshot-guarded — first user prompt after compact consumes PreCompact snapshot and re-injects, normal turns no-op. UserPromptSubmit **not wired on Claude Code** (Claude Code uses SessionStart-compact; wiring it would cause double injection).

**PostToolUse not wired on Codex**: Codex file edits use shell commands (`Ran ...`), not named Edit/Write tools. Matcher would match all shell commands (excessive noise). Codex working-state updates use skill-driven calls.

### Codex hook stdin fields

Shared: session_id / transcript_path / cwd / hook_event_name / model / permission_mode

PreCompact/PostCompact additional: turn_id, trigger (manual/auto)

UserPromptSubmit additional: prompt (user input text)

Note: trace enabled (PRUNEMEM_HOOK_TRACE=1) logs prompt text to trace log (privacy consideration).

### Injection output structure

```json
{"hookSpecificOutput": {"hookEventName": "<event>", "additionalContext": "<text>"}}
```

SessionStart and UserPromptSubmit use identical structure, only `hookEventName` differs. `_emit_additional_context` is parameterized, defaults to SessionStart.

## Hermes integration (Step 6.5.4)

### Integration shape: skill + MCP (no lifecycle hooks)

Hermes integration is **skill-driven + MCP tools** — no automatic lifecycle hooks.

- **MCP**: PruneMem MCP server registered as `prunemem` in `~/.hermes/config.yaml`
  (`mcp_servers.prunemem`), 11 tools, `hermes mcp test prunemem` passes.
- **Skill**: `skills/prunemem-memory-governance/SKILL.md` installed into
  `~/.hermes/skills/memory/prunemem-memory-governance/` (manual copy;
  `hermes skills install` does not accept local directories or file URLs).

### Why no hook automation

Hermes shell hooks (declared in `config.yaml` `hooks:`) support only:
`pre_tool_call`, `post_tool_call`, `pre_llm_call`, `subagent_stop`.

- **No session-start / compact / user-prompt events**.
- **Hook stdout is not parsed for `additionalContext` injection** — hooks are
  side-effect-only (notification / logging), not content-injection channels.
- Codex's SessionStart-inject / PreCompact-snapshot / UserPromptSubmit-recover
  pattern **cannot be ported** to Hermes.

### Why memory provider (beta) was abandoned

Hermes supports one external memory provider at a time (`memory.provider`).
Technically PruneMem could register as a provider via a Python plugin in
`$HERMES_HOME/plugins/<name>/`, but this was rejected because:

1. **Category mismatch**: The provider contract is retrieval/storage
   (`prefetch`, `sync_turn`), while PruneMem is a governance/curation system.
2. **Occupies the single provider slot**: Mutually exclusive with mem0, honcho,
   etc. — PruneMem and retrieval memory should be complementary, not competing.
3. **Language mismatch**: Hermes provider plugins are Python; PruneMem is
   JS+bash. Would require a new Python adapter layer.
4. **Firehose vs prune**: Per-turn `prefetch`/`sync` contradicts PruneMem's
   prune/curate philosophy.

**Key future note**: Hermes's memory provider interface is the **only door to
get deterministic lifecycle automation** on Hermes (`on_turn_start`,
`on_session_switch(reason=compression)`, `on_session_end`, per-turn prefetch
injection). Shell hooks do not offer these. If deterministic continuity ever
becomes a hard requirement on Hermes, memory provider is the only path
(costs: see above). Also note: `on_pre_compress()` return value is currently
ignored by the caller.

### MCP pointer

Hermes `mcp_servers.prunemem` points to the clone at
`/Users/yang/Tools/prunemem/PruneMem/` (functionally equivalent to Codex's
clone; harmless, to be unified in 6.5.6).

### Skill installation

Top-level `skills/prunemem-memory-governance/` was copied into
`~/.hermes/skills/memory/prunemem-memory-governance/`.

- Frontmatter is a **Hermes superset** (`version`, `author`, `license`,
  `platforms`, `metadata.hermes.tags`) — CC/Codex use the plugin-bundled copy
  (`plugins/claude-code/skills/...`) with a minimal frontmatter.
- The two frontmatters are **intentionally divergent**; unification will be
  evaluated in 6.5.6 (CC/Codex likely ignore extra fields, but needs testing).

### Hermes CLI limitation discovered

`hermes skills inspect <name>` only resolves hub-installed or bundled skills.
It **does not find local-directory skills** even though `hermes skills list`
shows them. This is a Hermes v0.14.0 behavior, not an installation failure.

## Step 6.5.4 补充 — Hermes working-state 写路径诊断与 6.5.6 修复计划

实测结论(α = skill + MCP):
- 读路径:可靠自动。agent 在 Hermes 会话中自动调用 prunemem 读回 working-state,recall/续接价值已落地。
- 写路径:skill 内容正确——当 skill 加载进上下文时,agent 会规范地"写 delta 文件 →
  update_working_state(dry-run → write)→ get_working_state 验证",不手编(已实测证明)。
  **但 Hermes 的 skill 自动加载对写任务不可靠。**

Hermes skill 加载机制(取证 + 实测):渐进式披露。系统提示常驻各 skill 的 `description`
(快照见 `~/.hermes/.skills_prompt_snapshot.json`),完整 SKILL.md 由模型按相关性 / 被点名时
按需加载(会话里显示 `📚 skill`)。
- 现象:显式点名或询问 skill → 加载(📚)→ agent 写对;一句"把进展记录进工作状态"这类
  任务 prompt → 不加载 → agent 裸奔 → 直接手编 working-state 文件。
- 试过且无效的杠杆:
  - 改进 `description` 加触发词(含中文原话"记录进展""更新工作状态""把进展记录进工作状态")
    —— 仍未触发自动加载。
  - `hermes curator pin` —— 仅保护 skill 不被 curator 归档,**非上下文注入**,不能强制加载。
  - `.skills_prompt_snapshot.json` 机制飘忽(测试期间一度消失且不重建,可能导致 skill 描述
    未进 prompt)。

6.5.6 修复计划(写路径稳健解):
- **核心:把写工作流要点写进 `update_working_state` 工具的 `description`**(input 是
  `{delta:{...}}` 文件路径、数组用 `_added`/`_set` 后缀、标量直给、绝不手编 working-state 文件)。
  工具 description 在模型上下文里**常驻**,不依赖 skill 加载——根治"无 skill + 工具 description
  无用 → 手编"这一失败模式。
- **选配:让 `update_working_state` 直接收内联 delta**(加 `delta` 对象参数),省掉"写文件→
  传路径"两步,进一步降低误用。
- **依赖:Hermes/Codex 用的是 clone(`/Users/yang/Tools/...`),需 clone 对账(重指向主仓库
  或更新 clone)才能在 Hermes 上生效**;与 6.5.6 既有的 clone 统一项合并。
- 修复后在 Hermes 复测写路径:不喂 skill、直接下写任务,看是否凭工具 description 正确调用、
  不手编。

Hermes 上 α 的诚实定位:**读 = 自动可靠;写 = skill/工具逻辑正确,但需常驻工具 description
加持(6.5.6)或用户显式点名 skill 才可靠。**

### 6.5.6 工具 description 还需覆盖的一个陷阱(实测 doc-10/11)

`update_working_state` 的 `input` 必须是 **update-input** 形状(顶层 `delta`):
`{"delta": {...}}`;**不是** generated working-event 形状(`{"state_delta": {...}}`)。
agent 在实测中把两者搞混,写了 working-event 的 `state_delta`,导致 `update_working_state`
只读 `input.delta`(为空)→ 返回 `ok:true`/`written:true` 但只动了 `updated_at`,目标字段未变
(空合并)。6.5.6 的工具 description 自解释要明确:input 取 `delta`、给出最小正确形状、并提示
"working-event 的 state_delta 不会被读取"。

