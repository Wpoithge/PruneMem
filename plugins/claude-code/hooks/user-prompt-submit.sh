#!/usr/bin/env bash
# PruneMem UserPromptSubmit hook (Codex post-compact re-injection)
# On the first user prompt after a compaction, inject the pending PreCompact
# snapshot context, then consume it. No-op on normal prompts (no pending snapshot).
# Wired on Codex only (hooks.codex.json); NOT on Claude Code (which uses
# SessionStart source=compact instead).

set -u

# shellcheck source=./_lib.sh
source "$(dirname "$0")/_lib.sh"
export _PRUNEMEM_HOOK_NAME="user-prompt-submit"

_check_deps || _safe_exit "deps missing"

stdin_json="$(cat 2>/dev/null || echo '{}')"
stdin_cwd="$(echo "$stdin_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
workspace="$(_resolve_workspace "$stdin_cwd")" || _safe_exit "no workspace"

_trace_event "user-prompt-submit" "enter" "" "$stdin_json"

snapshot_dir="$workspace/.prunemem-isolated/snapshots"

# Find the latest unconsumed snapshot
snapshot_file=""
if [ -d "$snapshot_dir" ]; then
  snapshot_file="$(find "$snapshot_dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null \
                   | sort | tail -1)"
fi

# No pending snapshot → normal turn, immediate no-op
if [ -z "$snapshot_file" ] || [ ! -f "$snapshot_file" ]; then
  _trace_event "user-prompt-submit" "exit:0" "branch=no-snapshot" ""
  exit 0
fi

# Has snapshot → read working_state bundle
snapshot_bundle="$(jq '.result.bundle.working_state // {}' "$snapshot_file" 2>/dev/null || echo '{}')"
snap_ts="$(basename "$snapshot_file" | sed -E 's/^pre-compact-(.*)\.json$/\1/')"

# Consume ALL pending snapshots before injecting (prevents re-injection on subsequent turns)
_consume_all_pending_snapshots "$snapshot_dir"

# Only inject when snapshot has substantive content (avoid injecting default-state noise)
if [ "$(_ws_has_substance "$snapshot_bundle")" = "true" ]; then
  text="$(_build_context_text "$snapshot_bundle" "$snap_ts")"
  _trace_event "user-prompt-submit" "exit:0" "branch=injected snapshot=$snap_ts" ""
  _emit_additional_context "$text" "UserPromptSubmit"
  exit 0
else
  _trace_event "user-prompt-submit" "exit:0" "branch=consumed-no-substance" ""
  exit 0
fi
