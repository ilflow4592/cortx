#!/bin/bash
# block-prod: prod/main 브랜치에 대한 위험한 git 명령 차단
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# git checkout/switch/push to prod/main/master
if echo "$COMMAND" | grep -qE 'git\s+(checkout|switch|push|merge|rebase)\s+.*(prod|main|master)'; then
  echo "BLOCKED: prod/main/master 브랜치 접근이 차단되었습니다." >&2
  exit 2
fi

# git push --force
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force'; then
  echo "BLOCKED: force push는 차단되었습니다." >&2
  exit 2
fi

# --no-verify 사용 차단 (이중 방어)
if echo "$COMMAND" | grep -qE '--no-verify'; then
  echo "BLOCKED: --no-verify 사용이 차단되었습니다." >&2
  exit 2
fi

exit 0
