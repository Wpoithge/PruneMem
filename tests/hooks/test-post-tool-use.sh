#!/usr/bin/env bash
# Test PostToolUse hook behaviors

set -e

cd "$(dirname "$0")/../.." || exit 1
HOOK="./plugins/claude-code/hooks/post-tool-use.sh"

# --- Test 1: disabled (no PRUNEMEM_ENABLE_POSTTOOL) → no-op ---
TEST_WS=/tmp/pm-test-ptu-disabled
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS"

(
  unset PRUNEMEM_ENABLE_POSTTOOL
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/pm-test-ptu-disabled/foo.py"}}' \
    | bash "$HOOK" > /tmp/ptu-out1 2> /tmp/ptu-err1
)
[ $? -eq 0 ] && echo "PASS 1a: disabled hook exits 0" || echo "FAIL 1a: non-zero exit"
[ ! -s /tmp/ptu-out1 ] && echo "PASS 1b: disabled hook stdout empty" || echo "FAIL 1b: stdout has content"

FILES_AFTER=$(find "$TEST_WS" -type f 2>/dev/null | wc -l | tr -d ' ')
[ "$FILES_AFTER" -eq 0 ] && echo "PASS 1c: disabled hook writes nothing (FILES=$FILES_AFTER)" \
  || echo "FAIL 1c: disabled hook created files (FILES=$FILES_AFTER)"

rm -rf "$TEST_WS"

# --- Test 2: enabled → writes working state ---
TEST_WS=/tmp/pm-test-ptu-enabled
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS"

(
  export PRUNEMEM_ENABLE_POSTTOOL=1
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/pm-test-ptu-enabled/src/foo.py"}}' \
    | bash "$HOOK" > /tmp/ptu-out2 2> /tmp/ptu-err2
)
[ $? -eq 0 ] && echo "PASS 2a: enabled hook exits 0" || echo "FAIL 2a: non-zero exit"
[ ! -s /tmp/ptu-out2 ] && echo "PASS 2b: enabled hook stdout empty" || echo "FAIL 2b: stdout has content"

WS_FILE="$(find "$TEST_WS" -name 'session-demo.working-state.json' -type f 2>/dev/null | head -1)"
if [ -n "$WS_FILE" ]; then
  echo "PASS 2c: working state file created"
  STEPS=$(jq -r '.completed_steps[]' "$WS_FILE" 2>/dev/null)
  if echo "$STEPS" | grep -q "edited src/foo.py"; then
    echo "PASS 2d: step recorded with relative path"
  else
    echo "FAIL 2d: step not found, got: $STEPS"
  fi
  SUMMARY=$(jq -r '.last_agent_action_summary' "$WS_FILE" 2>/dev/null)
  if echo "$SUMMARY" | grep -q "edited src/foo.py at"; then
    echo "PASS 2e: summary updated"
  else
    echo "FAIL 2e: summary unexpected: $SUMMARY"
  fi
else
  echo "FAIL 2c: working state file not created (find returned nothing)"
fi

# --- Test 3: multiple edits accumulate; same-file dedup ---
(
  export PRUNEMEM_ENABLE_POSTTOOL=1
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/pm-test-ptu-enabled/src/bar.py"}}' \
    | bash "$HOOK" > /dev/null 2>&1
)

(
  export PRUNEMEM_ENABLE_POSTTOOL=1
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/pm-test-ptu-enabled/src/bar.py"}}' \
    | bash "$HOOK" > /dev/null 2>&1
)

STEPS_COUNT=$(jq -r '.completed_steps | length' "$WS_FILE" 2>/dev/null)
if [ "$STEPS_COUNT" -eq 2 ]; then
  echo "PASS 3a: deduped correctly (2 unique steps)"
else
  echo "FAIL 3a: expected 2 steps, got $STEPS_COUNT"
fi

# --- Test 4: missing file_path → graceful skip ---
(
  export PRUNEMEM_ENABLE_POSTTOOL=1
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"tool_name":"Edit","tool_input":{}}' \
    | bash "$HOOK" > /dev/null 2> /tmp/ptu-err4
)
grep -q "no file_path" /tmp/ptu-err4 && echo "PASS 4: missing file_path logged" \
  || echo "FAIL 4: missing file_path not logged"

# --- Test 5: unsafe workspace (HOME) → no-op ---
(
  export PRUNEMEM_ENABLE_POSTTOOL=1
  export CLAUDE_PROJECT_DIR="$HOME"
  echo '{"tool_name":"Edit","tool_input":{"file_path":"/tmp/foo.py"}}' \
    | bash "$HOOK" > /tmp/ptu-out5 2> /tmp/ptu-err5
)
[ ! -s /tmp/ptu-out5 ] && echo "PASS 5: home workspace rejected (stdout empty)" \
  || echo "FAIL 5: home workspace produced stdout"

rm -rf "$TEST_WS"
echo "All post-tool-use tests done."
