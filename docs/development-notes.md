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

