#!/usr/bin/env bash
# Test PreCompact hook behaviors

set -e

cd "$(dirname "$0")/../.." || exit 1
HOOK="./plugins/claude-code/hooks/pre-compact.sh"

TEST_WS=/tmp/pm-test-precompact
rm -rf "$TEST_WS"
mkdir -p "$TEST_WS"

# --- Test 1: basic call creates snapshot ---
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"trigger":"auto"}' | bash "$HOOK" > /tmp/pc-out1 2> /tmp/pc-err1
)
[ $? -eq 0 ] && echo "PASS: pre-compact exits 0"

SNAP_COUNT=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 \
              -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$SNAP_COUNT" -ge 1 ]; then
  echo "PASS: snapshot file created ($SNAP_COUNT file)"
else
  echo "FAIL: no snapshot file created"
fi

SNAP_FILE=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 \
            -name 'pre-compact-*.json' -type f 2>/dev/null | head -1)
if jq . "$SNAP_FILE" >/dev/null 2>&1; then
  echo "PASS: snapshot is valid JSON"
fi

SNAP_BASE=$(basename "$SNAP_FILE")
if echo "$SNAP_BASE" | grep -qE '^pre-compact-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z\.json$'; then
  echo "PASS: snapshot filename format correct"
fi

# --- Test 2: stdout must be empty ---
if [ ! -s /tmp/pc-out1 ]; then
  echo "PASS: pre-compact stdout is empty (no decision JSON)"
else
  echo "FAIL: pre-compact stdout has content: $(cat /tmp/pc-out1)"
fi

# --- Test 3: capacity management — write 7 snapshots, keep latest 5 ---
rm -rf "$TEST_WS/.prunemem-isolated"
mkdir -p "$TEST_WS/.prunemem-isolated/snapshots"
for _i in 1 2 3 4 5 6 7; do
  (
    export CLAUDE_PROJECT_DIR="$TEST_WS"
    echo '{"trigger":"auto"}' | bash "$HOOK" > /dev/null 2>&1
  )
  sleep 1
  echo "wrote snapshot $_i"
done

FINAL_COUNT=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 \
              -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$FINAL_COUNT" -eq 5 ]; then
  echo "PASS: cleanup keeps exactly 5 snapshots (FINAL_COUNT=$FINAL_COUNT)"
else
  echo "FAIL: cleanup count off (FINAL_COUNT=$FINAL_COUNT, expected 5)"
fi

# --- Test 4: unsafe workspace (HOME) -> no new snapshot ---
HOME_SNAP_DIR="$HOME/.prunemem-isolated/snapshots"
EXISTED_BEFORE=$(find "$HOME_SNAP_DIR" -maxdepth 1 -name 'pre-compact-*.json' \
                 -type f 2>/dev/null | wc -l | tr -d ' ')
(
  export CLAUDE_PROJECT_DIR="$HOME"
  echo '{"trigger":"auto"}' | bash "$HOOK" > /dev/null 2>&1
)
EXISTED_AFTER=$(find "$HOME_SNAP_DIR" -maxdepth 1 -name 'pre-compact-*.json' \
                -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$EXISTED_BEFORE" -eq "$EXISTED_AFTER" ]; then
  echo "PASS: home workspace rejected (no new snapshot in HOME)"
else
  echo "FAIL: created snapshot in HOME, snapshot count changed"
fi

# --- Integration: PreCompact writes snapshot, SessionStart consumes it ---
rm -rf "$TEST_WS"
mkdir -p "$TEST_WS"

(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"trigger":"auto"}' | bash "./plugins/claude-code/hooks/pre-compact.sh" > /dev/null 2>&1
)

SNAP_BEFORE=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 \
              -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')
[ "$SNAP_BEFORE" -eq 1 ] && echo "PASS: integration — snapshot present after PreCompact"

(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  echo '{"source":"compact"}' | bash "./plugins/claude-code/hooks/session-start.sh" > /tmp/int-out 2> /tmp/int-err
)

SNAP_AFTER=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 \
             -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')
CONSUMED=$(find "$TEST_WS/.prunemem-isolated/snapshots/consumed" -maxdepth 1 \
           -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$SNAP_AFTER" -eq 0 ] && [ "$CONSUMED" -eq 1 ]; then
  echo "PASS: integration — snapshot moved to consumed/ after SessionStart"
else
  echo "FAIL: integration — SNAP_AFTER=$SNAP_AFTER CONSUMED=$CONSUMED"
fi

rm -rf "$TEST_WS"

echo "All pre-compact tests done."
