#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/../.." || exit 1

# 准备:用一个隔离的 trace path 避免污染用户家目录
TRACE_PATH=/tmp/pm-test-trace.log
rm -f "$TRACE_PATH"

TEST_WS=/tmp/pm-test-trace-ws
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS"

# 测试 1: 默认 OFF — 未设 PRUNEMEM_HOOK_TRACE,trace 文件不存在
rm -f "$TRACE_PATH"
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  export PRUNEMEM_HOOK_TRACE_PATH="$TRACE_PATH"
  unset PRUNEMEM_HOOK_TRACE
  echo '{"source":"startup"}' | bash plugins/claude-code/hooks/session-start.sh > /dev/null 2>&1
)
[ ! -f "$TRACE_PATH" ] && echo "PASS 1: default off (no trace file)" \
                      || echo "FAIL 1: trace file unexpectedly created"

# 测试 1b: opt-in — 设 PRUNEMEM_HOOK_TRACE=1,trace 文件存在并包含预期字段
rm -f "$TRACE_PATH"
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  export PRUNEMEM_HOOK_TRACE_PATH="$TRACE_PATH"
  export PRUNEMEM_HOOK_TRACE=1
  echo '{"source":"startup"}' | bash plugins/claude-code/hooks/session-start.sh > /dev/null 2>&1
)
[ -f "$TRACE_PATH" ] && echo "PASS 1b-a: opt-in trace file created"
grep -q "hook=session-start" "$TRACE_PATH" && echo "PASS 1b-b: hook name recorded"
grep -q "phase=enter" "$TRACE_PATH" && echo "PASS 1b-c: enter phase recorded"
grep -q "phase=exit:" "$TRACE_PATH" && echo "PASS 1b-d: exit phase recorded"
grep -q "CLAUDE_PROJECT_DIR=$TEST_WS" "$TRACE_PATH" && echo "PASS 1b-e: env recorded"
grep -q "source.*startup" "$TRACE_PATH" && echo "PASS 1b-f: stdin recorded"

# 测试 3: 四个 hook 都能 trace
rm -f "$TRACE_PATH"
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  export PRUNEMEM_HOOK_TRACE_PATH="$TRACE_PATH"
  export PRUNEMEM_HOOK_TRACE=1
  echo '{"source":"startup"}'   | bash plugins/claude-code/hooks/session-start.sh > /dev/null 2>&1
  echo '{"trigger":"auto"}'      | bash plugins/claude-code/hooks/pre-compact.sh   > /dev/null 2>&1
  echo '{"reason":"exit"}'       | bash plugins/claude-code/hooks/session-end.sh   > /dev/null 2>&1
  export PRUNEMEM_ENABLE_POSTTOOL=1
  echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$TEST_WS"'/foo.py"}}' \
    | bash plugins/claude-code/hooks/post-tool-use.sh > /dev/null 2>&1
)
grep -q "hook=session-start" "$TRACE_PATH"  && echo "PASS 3a: session-start traced"
grep -q "hook=pre-compact"   "$TRACE_PATH"  && echo "PASS 3b: pre-compact traced"
grep -q "hook=session-end"   "$TRACE_PATH"  && echo "PASS 3c: session-end traced"
grep -q "hook=post-tool-use" "$TRACE_PATH"  && echo "PASS 3d: post-tool-use traced"

# 测试 4: post-tool-use 在 disabled 状态下也 trace(便于实测看 "为啥没生效")
rm -f "$TRACE_PATH"
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  export PRUNEMEM_HOOK_TRACE_PATH="$TRACE_PATH"
  export PRUNEMEM_HOOK_TRACE=1
  unset PRUNEMEM_ENABLE_POSTTOOL
  echo '{"tool_name":"Edit","tool_input":{"file_path":"'"$TEST_WS"'/foo.py"}}' \
    | bash plugins/claude-code/hooks/post-tool-use.sh > /dev/null 2>&1
)
grep -q "branch=disabled" "$TRACE_PATH" && echo "PASS 4: disabled branch traced"

# 测试 5: 多次触发,每条事件块完整且不交错(简单顺序检查)
rm -f "$TRACE_PATH"
for i in 1 2 3 4 5; do
  (
    export CLAUDE_PROJECT_DIR="$TEST_WS"
    export PRUNEMEM_HOOK_TRACE_PATH="$TRACE_PATH"
    export PRUNEMEM_HOOK_TRACE=1
    echo '{"source":"startup"}' | bash plugins/claude-code/hooks/session-start.sh > /dev/null 2>&1
  )
done
EVENT_COUNT=$(grep -c "^====" "$TRACE_PATH")
# 5 次 hook × 2 个 phase(enter + exit)= 10 个事件块
if [ "$EVENT_COUNT" -eq 10 ]; then
  echo "PASS 5a: 10 event blocks recorded (5 enters + 5 exits)"
else
  echo "FAIL 5a: expected 10 event blocks, got $EVENT_COUNT"
fi

# 测试 6: TRACE_PATH 父目录不存在时,自动创建
rm -rf /tmp/pm-trace-deep
DEEP_PATH=/tmp/pm-trace-deep/nested/dir/trace.log
(
  export CLAUDE_PROJECT_DIR="$TEST_WS"
  export PRUNEMEM_HOOK_TRACE_PATH="$DEEP_PATH"
  export PRUNEMEM_HOOK_TRACE=1
  echo '{"source":"startup"}' | bash plugins/claude-code/hooks/session-start.sh > /dev/null 2>&1
)
[ -f "$DEEP_PATH" ] && echo "PASS 6: trace creates nested dir"
rm -rf /tmp/pm-trace-deep

# 清理
rm -rf "$TEST_WS"
rm -f "$TRACE_PATH"
echo "All trace tests done."
