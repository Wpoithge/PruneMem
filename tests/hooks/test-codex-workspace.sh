#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../.." || exit 1

TEST_WS=/tmp/pm-codex-ws
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS"

# 测试 1: _resolve_workspace 单元 — Codex 风格(无 CLAUDE_PROJECT_DIR,传 stdin cwd)
bash -c '
source plugins/claude-code/hooks/_lib.sh
unset CLAUDE_PROJECT_DIR
unset PRUNEMEM_WORKSPACE
out="$(_resolve_workspace "/tmp/pm-codex-ws")"
[ "$out" = "/tmp/pm-codex-ws" ] && echo "PASS 1: stdin cwd resolved" || echo "FAIL 1: got [$out]"
'

# 测试 2: CLAUDE_PROJECT_DIR 优先级高于 stdin cwd(Claude Code 行为不变)
bash -c '
source plugins/claude-code/hooks/_lib.sh
export CLAUDE_PROJECT_DIR=/tmp/pm-codex-ws
out="$(_resolve_workspace "/some/other/cwd/that/does/not/exist")"
[ "$out" = "/tmp/pm-codex-ws" ] && echo "PASS 2: CLAUDE_PROJECT_DIR wins over stdin cwd" || echo "FAIL 2: got [$out]"
'

# 测试 3: stdin cwd = $HOME 被安全检查拒绝
bash -c '
source plugins/claude-code/hooks/_lib.sh
unset CLAUDE_PROJECT_DIR
unset PRUNEMEM_WORKSPACE
_resolve_workspace "$HOME" && echo "FAIL 3: should reject HOME" || echo "PASS 3: stdin cwd=HOME rejected"
'

# 测试 4: 端到端 — session-start.sh 用 Codex 风格 stdin(无 CLAUDE_PROJECT_DIR,
#         stdin 含 cwd + source),且放一个真实 snapshot,验证能注入
rm -rf "$TEST_WS" && mkdir -p "$TEST_WS/.prunemem-isolated/snapshots"
cat > "$TEST_WS/.prunemem-isolated/snapshots/pre-compact-2026-05-26T10-00-00Z.json" <<'EOF'
{
  "ok": true, "tool": "prunemem_runtime_context",
  "result": { "ok": true, "bundle": { "working_state": {
    "task_title": "Codex stdin cwd task",
    "status": "in_progress",
    "completed_steps": ["codex step 1"]
  } } }
}
EOF
OUT="$(
  unset CLAUDE_PROJECT_DIR
  export PRUNEMEM_HOOK_TRACE=0
  echo '{"source":"compact","cwd":"'"$TEST_WS"'","hook_event_name":"SessionStart"}' \
    | bash plugins/claude-code/hooks/session-start.sh 2>/dev/null
)"
echo "$OUT" | grep -q "Codex stdin cwd task" && echo "PASS 4: session-start resolves workspace from stdin cwd" || echo "FAIL 4: output=[$OUT]"
rm -rf "$TEST_WS"

echo "All codex-workspace tests done."
