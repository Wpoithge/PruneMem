#!/usr/bin/env bash
# PruneMem Claude Code hook shared function library

set -u

# Log to stderr (stdout is the hook protocol channel)
_log() {
  echo "[prunemem-hook] $*" >&2
}

# Extract a key from stdin JSON using jq
# Usage: _stdin_get '.session_id'
_stdin_get() {
  local key="$1"
  jq -r "$key // empty" 2>/dev/null
}

# Check required dependencies
_check_deps() {
  local missing=()
  for cmd in bash jq node; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if [ ${#missing[@]} -gt 0 ]; then
    _log "missing dependencies: ${missing[*]}; hook will no-op"
    return 1
  fi
  return 0
}

# Check prunemem CLI availability
_check_prunemem() {
  if ! command -v prunemem >/dev/null 2>&1; then
    _log "prunemem CLI not in PATH; hook will no-op"
    return 1
  fi
  return 0
}

# Resolve workspace path with safety checks (Codex-compatible)
# Priority: $CLAUDE_PROJECT_DIR > stdin.cwd (param) > $PRUNEMEM_WORKSPACE > $PWD
# CLAUDE_PROJECT_DIR stays first to ensure Claude Code behavior unchanged.
# Usage: _resolve_workspace "<stdin_cwd_or_empty>"
_resolve_workspace() {
  local stdin_cwd="${1:-}"
  local ws=""
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
    ws="$CLAUDE_PROJECT_DIR"
  elif [ -n "$stdin_cwd" ]; then
    ws="$stdin_cwd"
  elif [ -n "${PRUNEMEM_WORKSPACE:-}" ]; then
    ws="$PRUNEMEM_WORKSPACE"
  else
    ws="$PWD"
  fi
  if ! _assert_safe_workspace "$ws"; then
    return 1
  fi
  echo "$ws"
}

# Reject dangerous workspace values
_assert_safe_workspace() {
  local ws="$1"
  case "$ws" in
    /*) ;;
    *) _log "workspace '$ws' is not absolute; refusing"; return 1 ;;
  esac
  if [ "$ws" = "$HOME" ] || [ "$ws" = "/" ]; then
    _log "refusing to use '$ws' as workspace (home or root)"
    return 1
  fi
  if [ ! -d "$ws" ]; then
    _log "workspace '$ws' does not exist or is not a directory"
    return 1
  fi
  return 0
}

# Emit additionalContext JSON for SessionStart / UserPromptSubmit
# Usage: _emit_additional_context "<text>" ["<event_name>"]
# event_name defaults to "SessionStart" (backward-compatible; session-start.sh callers unchanged)
_emit_additional_context() {
  local text="$1"
  local event_name="${2:-SessionStart}"
  jq -nc --arg t "$text" --arg e "$event_name" '{
    hookSpecificOutput: {
      hookEventName: $e,
      additionalContext: $t
    }
  }'
}

# Graceful exit: always exit 0 so the session is never blocked
_safe_exit() {
  local msg="${1:-hook failed silently}"
  _log "$msg"
  if [ -n "${_PRUNEMEM_HOOK_NAME:-}" ]; then
    _trace_event "$_PRUNEMEM_HOOK_NAME" "exit:safe" "msg=$msg" ""
  fi
  exit 0
}

# Check if a working_state JSON object contains substantive (non-default) content.
# Returns "true" if any of the tracked fields are non-empty; "false" otherwise.
# NOTE: task_title, status, and goal are intentionally NOT checked because
# defaultWorkingState() populates them with template strings even on an empty seed.
# Usage: _ws_has_substance "<working_state_json>"
_ws_has_substance() {
  local ws="$1"
  echo "$ws" | jq -e '
    ((.completed_steps // []) | length > 0) or
    ((.open_questions // []) | length > 0) or
    ((.next_actions // []) | length > 0) or
    ((.in_progress_steps // []) | length > 0) or
    ((.blocked_items // []) | length > 0) or
    ((.decisions_confirmed // []) | length > 0) or
    ((.constraints // []) | length > 0) or
    ((.artifacts // []) | length > 0) or
    ((.candidate_long_term_memories // []) | length > 0) or
    ((.user_request_summary // "") != "") or
    ((.last_user_intent // "") != "") or
    ((.last_agent_action_summary // "") != "")
  ' >/dev/null 2>&1 && echo "true" || echo "false"
}

# Build a readable markdown summary from merged bundle JSON.
# Usage: _build_context_text "<merged_json>" "<snapshot_timestamp_or_empty>"
_build_context_text() {
  local bundle="$1"
  local snap_ts="${2:-}"

  local task_title status goal
  task_title="$(echo "$bundle" | jq -r '.task_title // empty')"
  status="$(echo "$bundle" | jq -r '.status // empty')"
  goal="$(echo "$bundle" | jq -r '.goal // empty')"

  local out=""
  out="=== PruneMem Context (carried over) ==="$'\n'""

  [ -n "$task_title" ] && out+=$'\n'"Current task: $task_title"
  [ -n "$status" ]     && out+=$'\n'"Status: $status"
  [ -n "$goal" ]       && out+=$'\n'"Goal: $goal"

  # Append a titled list section from a jq array path.
  # Usage: _append_list <bundle_json> <jq_path> <header_text>
  _append_list() {
    local b="$1"
    local path="$2"
    local header="$3"
    local count items recent extra
    count="$(echo "$b" | jq -r "$path | length")"
    if [ "$count" -gt 0 ]; then
      out+=$'\n'"$header:"$'\n'
      if [ "$count" -le 5 ]; then
        items="$(echo "$b" | jq -r "$path | .[]")"
        while IFS= read -r line; do
          [ -n "$line" ] && out+="- $line"$'\n'
        done <<< "$items"
      else
        recent="$(echo "$b" | jq -r "$path | .[-5:] | .[]")"
        while IFS= read -r line; do
          [ -n "$line" ] && out+="- $line"$'\n'
        done <<< "$recent"
        extra=$((count - 5))
        out+="- ... and $extra more"$'\n'
      fi
    fi
  }

  _append_list "$bundle" '.completed_steps' 'Recent completed steps'
  _append_list "$bundle" '.open_questions'    'Open questions'
  _append_list "$bundle" '.next_actions'      'Next actions'

  if [ -n "$snap_ts" ]; then
    out+=$'\n'"Note: Recovered state from snapshot taken at $snap_ts."
    out+=$'\n'"Context was recently compacted."
  fi

  out+=$'\n'""
  out+=$'\n'"=== End of PruneMem Context ==="
  echo "$out"
}

# Consume (move) a snapshot into consumed/ and enforce FIFO limit of 10.
# Usage: _consume_snapshot "<snapshot_file>" "<snapshot_dir>"
_consume_snapshot() {
  local snap_file="$1"
  local snap_dir="$2"
  local consumed_dir="$snap_dir/consumed"

  mkdir -p "$consumed_dir" 2>/dev/null || return 0
  mv "$snap_file" "$consumed_dir/" 2>/dev/null || return 0

  local count
  count="$(find "$consumed_dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$count" -gt 10 ]; then
    find "$consumed_dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null \
      | sort | head -n $((count - 10)) | xargs rm -f 2>/dev/null
  fi
}

# Consume ALL pending pre-compact snapshots (move to consumed/, FIFO keep 10).
# Used by UserPromptSubmit hook to prevent repeated re-injection across turns.
# Usage: _consume_all_pending_snapshots "<snapshot_dir>"
_consume_all_pending_snapshots() {
  local snap_dir="$1"
  [ -d "$snap_dir" ] || return 0
  local consumed_dir="$snap_dir/consumed"
  mkdir -p "$consumed_dir" 2>/dev/null || return 0
  find "$snap_dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null \
    | while IFS= read -r f; do
        mv "$f" "$consumed_dir/" 2>/dev/null || true
      done
  # FIFO: keep at most 10
  local count
  count="$(find "$consumed_dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$count" -gt 10 ]; then
    find "$consumed_dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null \
      | sort | head -n $((count - 10)) | xargs rm -f 2>/dev/null
  fi
}

# Clean up un-consumed snapshots, keeping only the latest N.
# Usage: _cleanup_old_snapshots <snapshot_dir> [<keep_count>]
_cleanup_old_snapshots() {
  local dir="$1"
  local keep="${2:-5}"
  [ -d "$dir" ] || return 0

  local count
  count="$(find "$dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$count" -gt "$keep" ]; then
    find "$dir" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null \
      | sort | head -n $((count - keep)) | xargs rm -f 2>/dev/null
    _log "cleaned up $((count - keep)) old snapshot(s)"
  fi
}

# Resolve preset from PRUNEMEM_PRESET env var. Returns empty string if not set.
# Usage: preset="$(_resolve_preset)"
_resolve_preset() {
  local p="${PRUNEMEM_PRESET:-}"
  case "$p" in
    "" | " "*) echo "" ;;
    *) echo "$p" ;;
  esac
}

# Build JSON args for prunemem CLI calls. Includes preset field only when PRUNEMEM_PRESET is set.
# Usage: args="$(_build_call_args "<workspace>")"
_build_call_args() {
  local ws="$1"
  local preset
  preset="$(_resolve_preset)"
  if [ -n "$preset" ]; then
    jq -nc --arg w "$ws" --arg p "$preset" '{workspace: $w, preset: $p}'
  else
    jq -nc --arg w "$ws" '{workspace: $w}'
  fi
}

# Default trace behavior:
#   off unless PRUNEMEM_HOOK_TRACE=1
#   log path default ~/.prunemem-hook-trace.log,
#     override with PRUNEMEM_HOOK_TRACE_PATH
_trace_enabled() {
  [ "${PRUNEMEM_HOOK_TRACE:-0}" = "1" ]
}

_trace_path() {
  echo "${PRUNEMEM_HOOK_TRACE_PATH:-$HOME/.prunemem-hook-trace.log}"
}

# Write a single event block to the trace log. Multi-line content goes in via
# heredoc; the whole block is composed into one printf call so concurrent
# triggers don't interleave each other line-by-line.
#
# Usage:
#   _trace_event "<hook_name>" "<phase>" "<extra_kv_string_or_empty>" "<stdin_json>"
#
# - hook_name: session-start / pre-compact / session-end / post-tool-use
# - phase:    "enter" / "exit:<code>" / "noop:<reason>"
# - extra_kv: free-form "key=val key2=val2" string, may be empty
# - stdin_json: the raw stdin (may be empty)
_trace_event() {
  _trace_enabled || return 0

  local hook_name="$1"
  local phase="$2"
  local extra_kv="${3:-}"
  local stdin_json="${4:-}"

  local trace_file
  trace_file="$(_trace_path)"

  # Ensure parent dir exists (best effort, do not fail hook on this)
  local trace_dir
  trace_dir="$(dirname "$trace_file" 2>/dev/null)"
  [ -n "$trace_dir" ] && mkdir -p "$trace_dir" 2>/dev/null

  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%S.%NZ" 2>/dev/null || date -u +"%Y-%m-%dT%H:%M:%SZ")"

  # Write the whole block via a single printf call to the trace file. >> on
  # POSIX is atomic for short writes; this block is well under PIPE_BUF for
  # typical hook payloads, so concurrent triggers do not interleave.
  # (Capturing into a variable first would strip trailing newlines via $()
  #  command substitution, breaking the inter-block separator.)
  printf '==== %s | hook=%s phase=%s pid=%s ====\n  CLAUDE_PROJECT_DIR=%s\n  PWD=%s\n  PRUNEMEM_PRESET=%s\n  PRUNEMEM_ENABLE_POSTTOOL=%s\n  extra: %s\n  stdin: %s\n\n' \
    "$ts" \
    "$hook_name" \
    "$phase" \
    "$$" \
    "${CLAUDE_PROJECT_DIR:-NOT_SET}" \
    "${PWD:-NOT_SET}" \
    "${PRUNEMEM_PRESET:-NOT_SET}" \
    "${PRUNEMEM_ENABLE_POSTTOOL:-NOT_SET}" \
    "${extra_kv:-(none)}" \
    "${stdin_json:-(empty)}" \
    >> "$trace_file" 2>/dev/null || true
}
