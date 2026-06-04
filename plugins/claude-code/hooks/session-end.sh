#!/usr/bin/env bash
# PruneMem SessionEnd hook (Task 6.5.2-CD implementation)
# Pure read-only: runs validate_maintenance and logs result. No writes.

set -u

# shellcheck source=./_lib.sh
source "$(dirname "$0")/_lib.sh"

export _PRUNEMEM_HOOK_NAME="session-end"

# 1. Check deps
_check_deps || _safe_exit "deps missing"
_check_prunemem || _safe_exit "prunemem missing"

# 2. Read stdin (drain it; reason is informational only)
stdin_json="$(cat 2>/dev/null || echo '{}')"
[ -z "$stdin_json" ] && stdin_json='{}'
reason_val="$(echo "$stdin_json" | jq -r '.reason // "unknown"' 2>/dev/null || echo "unknown")"
_log "session-end triggered, reason=$reason_val"

_trace_event "session-end" "enter" "reason=$reason_val" "$stdin_json"

# 3. Resolve workspace (extract stdin cwd for Codex compatibility)
stdin_cwd="$(echo "$stdin_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
workspace="$(_resolve_workspace "$stdin_cwd")" || _safe_exit "no workspace"

# 4. Run validate_maintenance (read-only)
preset="$(_resolve_preset)"
if [ -n "$preset" ]; then
  vm_args="$(jq -nc --arg w "$workspace" --arg p "$preset" '{workspace: $w, preset: $p}')"
else
  vm_args="$(jq -nc --arg w "$workspace" '{workspace: $w}')"
fi

vm_json="$(prunemem call validate_maintenance --json "$vm_args" 2>/dev/null)"

# 5. Log summary to stderr
if [ -z "$vm_json" ]; then
  _log "validate_maintenance call failed or returned empty"
  _trace_event "session-end" "exit:0" "vm_ok=unknown notes=0 reason=empty-response" ""
  exit 0
fi

vm_ok="$(echo "$vm_json" | jq -r '.result.ok // false')"
notes_count="$(echo "$vm_json" | jq -r '.result.notes // [] | length')"
_log "validate_maintenance: ok=$vm_ok, notes=$notes_count"

if [ "$notes_count" != "0" ] && [ "$notes_count" != "null" ]; then
  echo "$vm_json" | jq -r '.result.notes // [] | .[:3] | .[]' 2>/dev/null \
    | while IFS= read -r note; do
        _log "  note: $note"
      done
fi

_trace_event "session-end" "exit:0" "vm_ok=$vm_ok notes=$notes_count" ""
exit 0
