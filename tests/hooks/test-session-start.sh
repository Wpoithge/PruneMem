#!/usr/bin/env bash
# Test SessionStart hook key behaviors

set -e

cd "$(dirname "$0")/../.." || exit 1
HOOK="./plugins/claude-code/hooks/session-start.sh"

# --- Test 1: source=clear, no-op ---
echo '{"source":"clear"}' | bash "$HOOK" > /tmp/out1 2> /tmp/err1
if [ ! -s /tmp/out1 ]; then
  echo "PASS: clear is no-op (stdout empty)"
else
  echo "FAIL: clear produced stdout"
fi
grep -q "source=clear" /tmp/err1 && echo "PASS: clear logged" || echo "FAIL: clear not logged"

# --- Test 2: source=resume, no-op ---
echo '{"source":"resume"}' | bash "$HOOK" > /tmp/out2 2> /tmp/err2
if [ ! -s /tmp/out2 ]; then
  echo "PASS: resume is no-op (stdout empty)"
else
  echo "FAIL: resume produced stdout"
fi

# --- Test 3: source=startup with real workspace ---
# Expect exit 0; stdout may or may not contain content depending on working state.
(
  export CLAUDE_PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
  echo '{"source":"startup"}' | bash "$HOOK" > /tmp/out3 2> /tmp/err3
)
exit3=$?
if [ "$exit3" -eq 0 ]; then
  echo "PASS: startup exits 0"
else
  echo "FAIL: startup exit=$exit3"
fi

# --- Test 4: unsafe workspace (HOME) -> no-op ---
(
  export CLAUDE_PROJECT_DIR="$HOME"
  echo '{"source":"startup"}' | bash "$HOOK" > /tmp/out4 2> /tmp/err4
)
if [ ! -s /tmp/out4 ]; then
  echo "PASS: home workspace rejected (stdout empty)"
else
  echo "FAIL: home workspace produced stdout"
fi

# --- Test 5: synthetic snapshot consumed and injected ---
rm -rf /tmp/test-ws
mkdir -p /tmp/test-ws/.prunemem-isolated/snapshots
cat > /tmp/test-ws/.prunemem-isolated/snapshots/pre-compact-2026-05-22T10-00-00Z.json <<'SNAP'
{
  "ok": true,
  "tool": "prunemem_runtime_context",
  "result": {
    "ok": true,
    "bundle": {
      "working_state": {
        "task_title": "Test task from snapshot",
        "status": "in_progress",
        "completed_steps": ["step A", "step B"]
      }
    }
  }
}
SNAP

(
  export CLAUDE_PROJECT_DIR=/tmp/test-ws
  echo '{"source":"compact"}' | bash "$HOOK" > /tmp/out5 2> /tmp/err5
)

if [ -f /tmp/test-ws/.prunemem-isolated/snapshots/consumed/pre-compact-2026-05-22T10-00-00Z.json ]; then
  echo "PASS: snapshot consumed (moved to consumed/)"
else
  echo "FAIL: snapshot not consumed"
fi

# Snapshot data may be overridden by runtime_context defaults on empty workspace;
# verify that output contains injected context (any task title) and snapshot note.
if grep -q "Current task:" /tmp/out5; then
  echo "PASS: snapshot content injected (context present)"
else
  echo "FAIL: snapshot content not in stdout"
fi

if grep -q "Recovered state from snapshot taken at 2026-05-22T10-00-00Z" /tmp/out5; then
  echo "PASS: snapshot note present"
else
  echo "FAIL: snapshot note missing"
fi

# Verify stdout is valid JSON with hookSpecificOutput
if jq -e '.hookSpecificOutput.additionalContext' /tmp/out5 > /dev/null 2>&1; then
  echo "PASS: stdout is valid protocol JSON"
else
  echo "FAIL: stdout is not valid protocol JSON"
fi

# --- Test A: compact scenario, snapshot scalars must not be overwritten by defaults ---
TEST_WS=/tmp/pm-merge-branch2
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS/.prunemem-isolated/snapshots"
cat > "$TEST_WS/.prunemem-isolated/snapshots/pre-compact-2026-05-22T10-00-00Z.json" <<'EOF'
{
  "ok": true, "tool": "prunemem_runtime_context",
  "result": { "ok": true, "bundle": { "working_state": {
    "task_title": "Real task from snapshot",
    "status": "in_progress",
    "goal": "Real goal from snapshot",
    "completed_steps": ["snap step 1", "snap step 2"]
  } } }
}
EOF

OUTA="$(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"source":"compact"}' | bash "$HOOK"
)"

echo "$OUTA" | grep -q "Real task from snapshot" && echo "PASS A1: snapshot task_title preserved" || echo "FAIL A1"
echo "$OUTA" | grep -q "Unnamed task" && echo "FAIL A2: default task_title leaked" || echo "PASS A2: no default leak"
echo "$OUTA" | grep -q "Real goal from snapshot" && echo "PASS A3: snapshot goal preserved" || echo "FAIL A3"
echo "$OUTA" | grep -q "snap step 1" && echo "PASS A4: snapshot steps present" || echo "FAIL A4"

rm -rf "$TEST_WS"

# --- Test B: no snapshot + default state → branch 3, nothing injected ---
TEST_WS=/tmp/pm-merge-branch3
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS"
OUTB="$(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"source":"startup"}' | bash "$HOOK" 2>/dev/null
)"
if [ -z "$OUTB" ]; then
  echo "PASS B1: branch 3 injects nothing"
else
  echo "FAIL B1: unexpected output: $OUTB"
fi
rm -rf "$TEST_WS"

# --- Test C: _ws_has_substance unit tests ---
source "$(dirname "$0")/../../plugins/claude-code/hooks/_lib.sh"

R1="$(_ws_has_substance '{"task_title":"Unnamed task","status":"active","completed_steps":[]}')"
[ "$R1" = "false" ] && echo "PASS C1: default state → false" || echo "FAIL C1: got $R1"

R2="$(_ws_has_substance '{"completed_steps":["x"]}')"
[ "$R2" = "true" ] && echo "PASS C2: completed_steps → true" || echo "FAIL C2: got $R2"

R3="$(_ws_has_substance '{"last_agent_action_summary":"did something"}')"
[ "$R3" = "true" ] && echo "PASS C3: last_agent_action_summary → true" || echo "FAIL C3: got $R3"

R4="$(_ws_has_substance '{"task_title":"Real task"}')"
[ "$R4" = "false" ] && echo "PASS C4: task_title alone → false" || echo "FAIL C4: got $R4"

# Cleanup
rm -rf /tmp/test-ws

# --- Test D: _resolve_preset and _build_call_args ---
bash -c '
source plugins/claude-code/hooks/_lib.sh

# D1: no env var → empty string
unset PRUNEMEM_PRESET
out="$(_resolve_preset)"
[ -z "$out" ] && echo "PASS D1: no env → empty" || echo "FAIL D1: got [$out]"

# D2: PRUNEMEM_PRESET=isolated → "isolated"
PRUNEMEM_PRESET=isolated
out="$(_resolve_preset)"
[ "$out" = "isolated" ] && echo "PASS D2: PRUNEMEM_PRESET=isolated → isolated" || echo "FAIL D2: got [$out]"

# D3: _build_call_args without preset does not include preset field
unset PRUNEMEM_PRESET
out="$(_build_call_args /tmp/foo)"
echo "$out" | jq -e '"'"'has("preset") | not'"'"' >/dev/null && echo "PASS D3: no preset in args" || echo "FAIL D3: preset leaked into args"

# D4: _build_call_args with preset includes preset field
PRUNEMEM_PRESET=isolated
out="$(_build_call_args /tmp/foo)"
echo "$out" | jq -e '"'"'.preset == "isolated"'"'"' >/dev/null && echo "PASS D4: preset=isolated in args" || echo "FAIL D4: preset not in args"
'

echo "All session-start tests done."
