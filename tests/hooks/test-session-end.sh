#!/usr/bin/env bash
# Test SessionEnd hook behaviors

set -e

cd "$(dirname "$0")/../.." || exit 1
HOOK="./plugins/claude-code/hooks/session-end.sh"

TEST_WS=/tmp/pm-test-sessionend
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS"

# --- Test 1: basic call, exit 0, stdout empty ---
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"reason":"exit"}' | bash "$HOOK" > /tmp/se-out 2> /tmp/se-err
)
SE_EXIT=$?
[ "$SE_EXIT" -eq 0 ] && echo "PASS: session-end exits 0" || echo "FAIL: exit=$SE_EXIT"
if [ ! -s /tmp/se-out ]; then
  echo "PASS: session-end stdout empty"
else
  echo "FAIL: stdout has content: $(cat /tmp/se-out)"
fi

# --- Test 2: stderr should contain reason log ---
if grep -q "reason=exit" /tmp/se-err; then
  echo "PASS: reason logged"
else
  echo "FAIL: reason not in stderr"
fi

# --- Test 3: stderr should contain validate_maintenance result ---
if grep -q "validate_maintenance: ok=" /tmp/se-err; then
  echo "PASS: validate_maintenance result logged"
else
  echo "FAIL: validate_maintenance result not in stderr"
fi

# --- Test 4: no files written ---
BEFORE=$(find "$TEST_WS" -type f 2>/dev/null | wc -l | tr -d ' ')
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"reason":"exit"}' | bash "$HOOK" > /dev/null 2>&1
)
AFTER=$(find "$TEST_WS" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$BEFORE" -eq "$AFTER" ]; then
  echo "PASS: session-end writes no files (BEFORE=$BEFORE AFTER=$AFTER)"
else
  echo "FAIL: session-end created files (BEFORE=$BEFORE AFTER=$AFTER)"
fi

# --- Test 5: unsafe workspace (HOME) → no-op ---
(
  export CLAUDE_PROJECT_DIR="$HOME"
  echo '{"reason":"exit"}' | bash "$HOOK" > /tmp/se-out2 2> /tmp/se-err2
)
if [ ! -s /tmp/se-out2 ]; then
  echo "PASS: home workspace rejected (stdout empty)"
else
  echo "FAIL: home workspace produced stdout"
fi

# --- Test 6: unknown reason handled ---
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"reason":"some_unknown_value"}' | bash "$HOOK" > /dev/null 2> /tmp/se-err3
)
[ $? -eq 0 ] && echo "PASS: unknown reason handled"
if grep -q "reason=some_unknown_value" /tmp/se-err3; then
  echo "PASS: unknown reason logged literally"
else
  echo "FAIL: unknown reason not logged"
fi

# --- Test 7: empty stdin (missing reason) → defaults to "unknown" ---
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '' | bash "$HOOK" > /dev/null 2> /tmp/se-err4
)
[ $? -eq 0 ] && echo "PASS: empty stdin handled"
if grep -q "reason=unknown" /tmp/se-err4; then
  echo "PASS: missing reason defaults to unknown"
else
  echo "FAIL: missing reason not defaulted to unknown"
fi

rm -rf "$TEST_WS"
echo "All session-end tests done."
