#!/bin/bash
# quality-gate: git commit 전 코드 품질 검증
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# git commit 명령인지 확인
if ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  exit 0
fi

# 스테이징된 파일 목록
STAGED=$(git diff --cached --name-only 2>/dev/null)
if [ -z "$STAGED" ]; then
  exit 0
fi

ERRORS=""

# LocalDateTime.now() 직접 호출 검사
BAD_FILES=$(echo "$STAGED" | xargs grep -l 'LocalDateTime\.now()' 2>/dev/null || true)
if [ -n "$BAD_FILES" ]; then
  ERRORS="${ERRORS}LocalDateTime.now() 직접 호출 발견: ${BAD_FILES}\n"
fi

# 하드코딩된 시크릿 패턴 검사
BAD_FILES=$(echo "$STAGED" | xargs grep -lE '(password|secret|token|api_key)\s*=\s*"[^"]+"' 2>/dev/null || true)
if [ -n "$BAD_FILES" ]; then
  ERRORS="${ERRORS}하드코딩된 시크릿 발견: ${BAD_FILES}\n"
fi

# unused import 검사 (Java 파일만)
JAVA_FILES=$(echo "$STAGED" | grep '\.java$' || true)
if [ -n "$JAVA_FILES" ]; then
  BAD_FILES=$(echo "$JAVA_FILES" | xargs grep -l '^import .*\*;' 2>/dev/null || true)
  if [ -n "$BAD_FILES" ]; then
    ERRORS="${ERRORS}와일드카드 import 발견: ${BAD_FILES}\n"
  fi
fi

if [ -n "$ERRORS" ]; then
  echo "BLOCKED: Quality Gate 실패" >&2
  echo -e "$ERRORS" >&2
  exit 2
fi

exit 0
