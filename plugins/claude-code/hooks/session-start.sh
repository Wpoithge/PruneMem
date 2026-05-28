#!/usr/bin/env bash
# PruneMem SessionStart hook (Task 6.5.2-B implementation)

set -u

# shellcheck source=./_lib.sh
source "$(dirname "$0")/_lib.sh"

export _PRUNEMEM_HOOK_NAME="session-start"

# 1. Check dependencies
_check_deps || _safe_exit "deps missing"
_check_prunemem || _safe_exit "prunemem missing"

# 2. Read stdin JSON
stdin_json="$(cat 2>/dev/null || echo '{}')"
source_val="$(echo "$stdin_json" | jq -r '.source // "startup"')"

_trace_event "session-start" "enter" "source=$source_val" "$stdin_json"

# 3. Branch on source
case "$source_val" in
  clear|resume)
    _log "source=$source_val, no-op"
    _trace_event "session-start" "exit:0" "branch=skip reason=source=$source_val" ""
    exit 0
    ;;
esac

# 4. Resolve workspace (extract stdin cwd for Codex compatibility)
stdin_cwd="$(echo "$stdin_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
workspace="$(_resolve_workspace "$stdin_cwd")" || _safe_exit "no workspace"

# 5. Check for pre-compact snapshot
snapshot_dir="$workspace/.prunemem-isolated/snapshots"
snapshot_file=""
snapshot_bundle="{}"
snapshot_timestamp=""

if [ -d "$snapshot_dir" ]; then
  snapshot_file="$(find "$snapshot_dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null \
                   | sort | tail -1)"
  if [ -n "$snapshot_file" ] && [ -f "$snapshot_file" ]; then
    snapshot_bundle="$(jq '.result.bundle.working_state // {}' "$snapshot_file" 2>/dev/null || echo '{}')"
    snapshot_timestamp="$(basename "$snapshot_file" \
                          | sed -E 's/^pre-compact-(.*)\.json$/\1/')"
    _log "found snapshot: $snapshot_timestamp"
  fi
fi

# 6. Call runtime_context
rt_args="$(_build_call_args "$workspace")"
rt_json="$(prunemem call runtime_context --json "$rt_args" 2>/dev/null || echo '{}')"
rt_bundle="$(echo "$rt_json" | jq '.result.bundle.working_state // {}' 2>/dev/null || echo '{}')"

# 7. Determine trustworthiness and presence of snapshot
rt_trust="$(_ws_has_substance "$rt_bundle")"
sn_has="$(echo "$snapshot_bundle" | jq -e 'type == "object" and (keys | length > 0)' >/dev/null 2>&1 && echo true || echo false)"

# 8. Three-branch merge
if [ "$rt_trust" = "true" ]; then
  # Branch 1: runtime_context is trustworthy → rt preferred
  merged="$(jq -n \
    --argjson rt "$rt_bundle" \
    --argjson sn "$snapshot_bundle" \
    '{
      task_title: ($rt.task_title // $sn.task_title // null),
      status:     ($rt.status     // $sn.status     // null),
      goal:       ($rt.goal       // $sn.goal       // null),
      completed_steps: (($rt.completed_steps // []) + ($sn.completed_steps // []) | unique),
      open_questions:  (($rt.open_questions  // []) + ($sn.open_questions  // []) | unique),
      next_actions:    (($rt.next_actions    // []) + ($sn.next_actions    // []) | unique)
    }')"
elif [ "$sn_has" = "true" ]; then
  # Branch 2: runtime_context is default, but snapshot has substance → sn preferred
  merged="$(jq -n \
    --argjson rt "$rt_bundle" \
    --argjson sn "$snapshot_bundle" \
    '{
      task_title: ($sn.task_title // $rt.task_title // null),
      status:     ($sn.status     // $rt.status     // null),
      goal:       ($sn.goal       // $rt.goal       // null),
      completed_steps: (($sn.completed_steps // []) + ($rt.completed_steps // []) | unique),
      open_questions:  (($sn.open_questions  // []) + ($rt.open_questions  // []) | unique),
      next_actions:    (($sn.next_actions    // []) + ($rt.next_actions    // []) | unique)
    }')"
else
  # Branch 3: neither runtime_context nor snapshot has substance → nothing to inject
  _log "runtime_context is default and no snapshot; nothing to inject"
  _trace_event "session-start" "exit:0" "branch=noop reason=no-substance" ""
  exit 0
fi

# 9. Secondary guard: even after merge, verify there's actual content
has_content="$(echo "$merged" | jq -r '
  (.task_title != null) or
  (.status != null) or
  (.goal != null) or
  (.completed_steps | length > 0) or
  (.open_questions | length > 0) or
  (.next_actions | length > 0)
')"

if [ "$has_content" != "true" ]; then
  _log "no content to inject"
  _trace_event "session-start" "exit:0" "branch=noop reason=no-content-after-merge" ""
  exit 0
fi

# 10. Build readable text
text="$(_build_context_text "$merged" "$snapshot_timestamp")"

# 11. Consume snapshot (if any)
if [ -n "$snapshot_file" ] && [ -f "$snapshot_file" ]; then
  _consume_snapshot "$snapshot_file" "$snapshot_dir"
fi

# 12. Output protocol JSON
_emit_additional_context "$text"
_trace_event "session-start" "exit:0" "branch=injected snapshot=$snapshot_timestamp" ""
exit 0
