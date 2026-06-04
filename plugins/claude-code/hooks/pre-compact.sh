#!/usr/bin/env bash
# PruneMem PreCompact hook (Task 6.5.2-CD implementation)
# Writes a runtime_context snapshot before compaction. Snapshot timestamp
# implicitly records when compaction occurred.
# Note: This hook intentionally does NOT write a lifecycle marker via
# update_working_state. Snapshot file timestamp implicitly records when
# compaction occurred. See Task 6.5.2-CD for rationale.

set -u

# shellcheck source=./_lib.sh
source "$(dirname "$0")/_lib.sh"

export _PRUNEMEM_HOOK_NAME="pre-compact"

# 1. Check dependencies
_check_deps || _safe_exit "deps missing"
_check_prunemem || _safe_exit "prunemem missing"

# 2. Read stdin
stdin_json="$(cat 2>/dev/null || echo '{}')"
trigger_val="$(echo "$stdin_json" | jq -r '.trigger // "unknown"' 2>/dev/null || echo "unknown")"

_trace_event "pre-compact" "enter" "trigger=$trigger_val" "$stdin_json"

# 3. Resolve workspace (extract stdin cwd for Codex compatibility)
stdin_cwd="$(echo "$stdin_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
workspace="$(_resolve_workspace "$stdin_cwd")" || _safe_exit "no workspace"

# 4. Generate timestamp
ts="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"

# 5. β: Write snapshot
snapshot_dir="$workspace/.prunemem-isolated/snapshots"
mkdir -p "$snapshot_dir" 2>/dev/null || _log "failed to mkdir snapshots"

snapshot_file="$snapshot_dir/pre-compact-$ts.json"
rt_args="$(_build_call_args "$workspace")"
rt_json="$(prunemem call runtime_context --json "$rt_args" 2>/dev/null)"

if [ -n "$rt_json" ] && echo "$rt_json" | jq . >/dev/null 2>&1; then
  echo "$rt_json" > "$snapshot_file" && \
    _log "snapshot written: $snapshot_file" || \
    _log "failed to write snapshot"
else
  _log "runtime_context call failed or returned empty; skipping snapshot"
fi

# 6. Cleanup old snapshots (keep latest 5 in snapshots/)
_cleanup_old_snapshots "$snapshot_dir" 5

_trace_event "pre-compact" "exit:0" "snapshot=$snapshot_file" ""
exit 0
