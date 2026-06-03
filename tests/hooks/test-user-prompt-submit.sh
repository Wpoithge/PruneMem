#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../.." || exit 1
HOOK="./plugins/claude-code/hooks/user-prompt-submit.sh"

TEST_WS=/tmp/pm-ups-test

# 测试 1: 无 pending snapshot → no-op(stdout 空,exit 0)
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS"
OUT="$(
  unset CLAUDE_PROJECT_DIR
  export PRUNEMEM_HOOK_TRACE=0
  echo '{"cwd":"'"$TEST_WS"'","hook_event_name":"UserPromptSubmit"}' | bash "$HOOK" 2>/dev/null
)"
[ -z "$OUT" ] && echo "PASS 1: no snapshot → no-op (stdout empty)" || echo "FAIL 1: [$OUT]"

# 测试 2: 有实质 snapshot → 注入 + 消费
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS/.prunemem-isolated/snapshots"
cat > "$TEST_WS/.prunemem-isolated/snapshots/pre-compact-2026-05-27T10-00-00Z.json" <<'EOF'
{
  "ok": true, "tool": "prunemem_runtime_context",
  "result": { "ok": true, "bundle": { "working_state": {
    "task_title": "UPS injection task",
    "status": "in_progress",
    "completed_steps": ["ups step 1"]
  } } }
}
EOF
OUT="$(
  unset CLAUDE_PROJECT_DIR
  export PRUNEMEM_HOOK_TRACE=0
  echo '{"cwd":"'"$TEST_WS"'","hook_event_name":"UserPromptSubmit"}' | bash "$HOOK" 2>/dev/null
)"
echo "$OUT" | jq -e '.hookSpecificOutput.hookEventName == "UserPromptSubmit"' >/dev/null 2>&1 \
  && echo "PASS 2a: output hookEventName=UserPromptSubmit" || echo "FAIL 2a: [$OUT]"
echo "$OUT" | grep -q "UPS injection task" && echo "PASS 2b: snapshot content injected" || echo "FAIL 2b"
# snapshot 已被消费(移到 consumed/,snapshots/ 下应无 pending)
PENDING=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l)
CONSUMED=$(find "$TEST_WS/.prunemem-isolated/snapshots/consumed" -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l)
[ "$PENDING" -eq 0 ] && [ "$CONSUMED" -eq 1 ] && echo "PASS 2c: snapshot consumed" || echo "FAIL 2c: pending=$PENDING consumed=$CONSUMED"

# 测试 3: 注入后,下一轮(已无 pending)→ no-op(证明不会重复注入)
OUT2="$(
  unset CLAUDE_PROJECT_DIR
  export PRUNEMEM_HOOK_TRACE=0
  echo '{"cwd":"'"$TEST_WS"'","hook_event_name":"UserPromptSubmit"}' | bash "$HOOK" 2>/dev/null
)"
[ -z "$OUT2" ] && echo "PASS 3: second prompt no-op (no re-injection)" || echo "FAIL 3: [$OUT2]"

# 测试 4: snapshot 无实质内容(默认态)→ 消费但不注入
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS/.prunemem-isolated/snapshots"
cat > "$TEST_WS/.prunemem-isolated/snapshots/pre-compact-2026-05-27T11-00-00Z.json" <<'EOF'
{"ok":true,"result":{"ok":true,"bundle":{"working_state":{"task_title":"Unnamed task","status":"active","completed_steps":[]}}}}
EOF
OUT="$(
  unset CLAUDE_PROJECT_DIR
  export PRUNEMEM_HOOK_TRACE=0
  echo '{"cwd":"'"$TEST_WS"'","hook_event_name":"UserPromptSubmit"}' | bash "$HOOK" 2>/dev/null
)"
[ -z "$OUT" ] && echo "PASS 4a: default-state snapshot → no injection" || echo "FAIL 4a: [$OUT]"
PENDING=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l)
[ "$PENDING" -eq 0 ] && echo "PASS 4b: default-state snapshot still consumed" || echo "FAIL 4b: pending=$PENDING"

# 测试 5: 多个 pending snapshot → 全部消费,只注入最新
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS/.prunemem-isolated/snapshots"
for ts in 2026-05-27T09-00-00Z 2026-05-27T09-05-00Z 2026-05-27T09-10-00Z; do
cat > "$TEST_WS/.prunemem-isolated/snapshots/pre-compact-$ts.json" <<EOF
{"ok":true,"result":{"ok":true,"bundle":{"working_state":{"task_title":"task $ts","completed_steps":["s"]}}}}
EOF
done
OUT="$(
  unset CLAUDE_PROJECT_DIR
  export PRUNEMEM_HOOK_TRACE=0
  echo '{"cwd":"'"$TEST_WS"'","hook_event_name":"UserPromptSubmit"}' | bash "$HOOK" 2>/dev/null
)"
echo "$OUT" | grep -q "task 2026-05-27T09-10-00Z" && echo "PASS 5a: injected latest snapshot" || echo "FAIL 5a"
PENDING=$(find "$TEST_WS/.prunemem-isolated/snapshots" -maxdepth 1 -name 'pre-compact-*.json' -type f 2>/dev/null | wc -l)
[ "$PENDING" -eq 0 ] && echo "PASS 5b: all pending consumed" || echo "FAIL 5b: pending=$PENDING"

# 测试 6: workspace=HOME 拒绝
OUT="$(
  unset CLAUDE_PROJECT_DIR
  export PRUNEMEM_HOOK_TRACE=0
  echo '{"cwd":"'"$HOME"'","hook_event_name":"UserPromptSubmit"}' | bash "$HOOK" 2>/dev/null
)"
[ -z "$OUT" ] && echo "PASS 6: home workspace rejected (no injection)" || echo "FAIL 6: [$OUT]"

rm -rf "$TEST_WS"

# _emit_additional_context 参数化测试
bash -c '
source plugins/claude-code/hooks/_lib.sh
# 默认 → SessionStart
out="$(_emit_additional_context "hi")"
echo "$out" | jq -e ".hookSpecificOutput.hookEventName == \"SessionStart\"" >/dev/null && echo "PASS E1: default event=SessionStart" || echo "FAIL E1"
# 显式 → UserPromptSubmit
out="$(_emit_additional_context "hi" "UserPromptSubmit")"
echo "$out" | jq -e ".hookSpecificOutput.hookEventName == \"UserPromptSubmit\"" >/dev/null && echo "PASS E2: event=UserPromptSubmit" || echo "FAIL E2"
'

echo "All user-prompt-submit tests done."
