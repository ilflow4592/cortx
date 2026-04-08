#!/bin/bash
# confirm-delete: 파일 삭제 시 사용자 확인 요청
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# rm 명령인지 확인
if ! echo "$COMMAND" | grep -qE '^\s*rm\s'; then
  exit 0
fi

# 삭제 대상 파일 추출 (rm 명령에서 옵션 제외)
FILES=$(echo "$COMMAND" | sed 's/^\s*rm\s*//' | sed 's/-[rfvid]*\s*//g' | tr ' ' '\n' | grep -v '^$')

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "파일 삭제 확인이 필요합니다:\n${FILES}"
  }
}
EOF
exit 0
