#!/usr/bin/env bash
# PruneMem PostToolUse hook (Task 6.5.2-E implementation)
# Edit|Write|MultiEdit matcher, opt-in via PRUNEMEM_ENABLE_POSTTOOL=1.
# Appends one completed_step per file edit and updates last_agent_action_summary.

set -u

# shellcheck source=./_lib.sh
source "$(dirname "$0")/_lib.sh"

export _PRUNEMEM_HOOK_NAME="post-tool-use"

# 1. Opt-in check (must come first to keep no-op path cheap)
if [ "${PRUNEMEM_ENABLE_POSTTOOL:-}" != "1" ]; then
  cat >/dev/null 2>&1 || true
  _trace_event "post-tool-use" "exit:0" "branch=disabled" ""
  exit 0
fi

# 2. Check deps
_check_deps || _safe_exit "deps missing"
_check_prunemem || _safe_exit "prunemem missing"

# 3. Read stdin
stdin_json="$(cat 2>/dev/null || echo '{}')"

# 4. Extract file_path from tool_input
file_path="$(echo "$stdin_json" | jq -r '.tool_input.file_path // empty')"

if [ -z "$file_path" ]; then
  _log "no file_path in tool_input; skipping"
  _trace_event "post-tool-use" "exit:0" "branch=no-file-path" "$stdin_json"
  exit 0
fi

_trace_event "post-tool-use" "enter" "file_path=$file_path" "$stdin_json"

# 5. Resolve workspace (extract stdin cwd for Codex compatibility)
stdin_cwd="$(echo "$stdin_json" | jq -r '.cwd // empty' 2>/dev/null || echo "")"
workspace="$(_resolve_workspace "$stdin_cwd")" || _safe_exit "no workspace"

# 6. Compute relative path (python3; fallback to absolute path)
rel_path="$(python3 -c "
import os
try:
    print(os.path.relpath('$file_path', '$workspace'))
except Exception:
    print('$file_path')
" 2>/dev/null)"

[ -z "$rel_path" ] && rel_path="$file_path"

# 7. Build delta and call update_working_state
ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
step_text="edited $rel_path"
summary_text="edited $rel_path at $ts"

# update_working_state requires input as a file path, not inline JSON
delta_tmp="/tmp/pm-ptu-delta-$$-$ts.json"
jq -n \
  --arg step "$step_text" \
  --arg summ "$summary_text" \
  '{
    delta: {
      completed_steps_added: [$step],
      last_agent_action_summary: $summ
    }
  }' > "$delta_tmp" 2>/dev/null

preset="$(_resolve_preset)"
if [ -n "$preset" ]; then
  call_args="$(jq -nc \
    --arg w "$workspace" \
    --arg p "$preset" \
    --arg inp "$delta_tmp" \
    '{workspace: $w, preset: $p, input: $inp, write: true}')"
else
  call_args="$(jq -nc \
    --arg w "$workspace" \
    --arg inp "$delta_tmp" \
    '{workspace: $w, input: $inp, write: true}')"
fi

us_json="$(prunemem call update_working_state --json "$call_args" 2>/dev/null)"
rm -f "$delta_tmp" 2>/dev/null || true

us_ok="$(echo "$us_json" | jq -r '.result.ok // false' 2>/dev/null || echo false)"

if echo "$us_json" | jq -e '.result.ok == true' >/dev/null 2>&1; then
  _log "logged: $step_text"
else
  _log "update_working_state call failed (non-fatal)"
fi

_trace_event "post-tool-use" "exit:0" "rel_path=$rel_path step=$step_text us_ok=$us_ok" ""
exit 0
