# PruneMem for Claude Code

Lifecycle hooks + agent playbook for the PruneMem memory governance system.

## What this plugin does

- **Skill**: Loads the `prunemem-memory-governance` skill, guiding Claude Code
  on when and how to call PruneMem MCP tools.
- **SessionStart hook**: Reads the previous working state and pre-compact
  snapshot (if any), injects context into the new session.
- **PreCompact hook**: Saves a snapshot of the runtime context to disk so the
  new session after compaction can recover.
- **SessionEnd hook**: Persists working state and runs maintenance validation.
- **PostToolUse hook** (`Edit|Write|MultiEdit` matcher, opt-in): Appends a step
  to working state's `completed_steps` for each file edit, and updates
  `last_agent_action_summary`. Disabled by default — set
  `PRUNEMEM_ENABLE_POSTTOOL=1` to enable.

## Prerequisites

- PruneMem installed and `prunemem` CLI on PATH.
  See [PruneMem README](../../README.md) for installation.
- PruneMem MCP server registered in Claude Code (recommended but not required
  for hooks; the hooks call the CLI directly):

```bash
claude mcp add --scope user prunemem node /absolute/path/to/PruneMem/src/mcp/bin.js
```

## Install

After adding this repo as a marketplace:

```bash
claude plugin marketplace add Wpoithge/PruneMem
claude plugin install prunemem-memory@prunemem
```

## Configuration

The hooks resolve workspace path in this order:

1. `$CLAUDE_PROJECT_DIR` (set by Claude Code per session)
2. `$PRUNEMEM_WORKSPACE` (manual override)
3. `$PWD`

Refuses to run if resolved workspace is `$HOME` or `/`.

### PostToolUse hook (opt-in)

By default, the PostToolUse hook is disabled. To enable per-file-edit logging
into the working state, set:

```bash
export PRUNEMEM_ENABLE_POSTTOOL=1
```

This hook writes `completed_steps_added` and `last_agent_action_summary` to
PruneMem's working state on each Edit/Write/MultiEdit tool invocation. The
write target depends on `PRUNEMEM_PRESET`:

- Default preset (no env var set): writes to
  `<workspace>/examples/working-memory/session-demo.working-state.json`.
  Note this path is created inside your project — consider adding
  `examples/working-memory/` to your `.gitignore` if you don't want it tracked.
- Isolated preset (`PRUNEMEM_PRESET=isolated`): writes to
  `<workspace>/.prunemem-isolated/working-memory/`. Note: in isolated mode,
  PruneMem reads `base` from `examples/` but writes to `.prunemem-isolated/`,
  which means hook writes do NOT accumulate across calls (this is a known
  PruneMem v0.3.0 design).

### Hook execution trace (default off, opt-in for diagnostics)

For diagnostics during install or debugging, you can enable a trace log that
records every hook invocation (hook name, phase, PID, environment, stdin,
exit status). Off by default.

To enable:

```bash
export PRUNEMEM_HOOK_TRACE=1
```

Trace lines are appended to `~/.prunemem-hook-trace.log`. Override path with
`PRUNEMEM_HOOK_TRACE_PATH=/some/where.log`.

Recommended workflow: enable trace right after installing the plugin,
verify hooks fire as expected on a throwaway workspace, then unset the
variable for normal use.

## Status

This is a v0.4.0 plugin. Hook implementations land in stages
(Steps 6.5.2-B through 6.5.2-E). Current state:

- [x] Skeleton (6.5.2-A)
- [ ] SessionStart implementation (6.5.2-B)
- [ ] PreCompact implementation (6.5.2-C)
- [ ] SessionEnd implementation (6.5.2-D)
- [x] PostToolUse implementation (6.5.2-E)
