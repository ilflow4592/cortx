#!/bin/bash
# quality-gate: git commit 전 코드 품질 검증 (React/TypeScript/Rust 프로젝트용)
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

# ── TypeScript/React 검사 ──

# console.log 잔재 검사 (테스트 파일 제외)
TS_FILES=$(echo "$STAGED" | grep -E '\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '\.spec\.' || true)
if [ -n "$TS_FILES" ]; then
  BAD_FILES=$(echo "$TS_FILES" | xargs grep -l 'console\.log' 2>/dev/null || true)
  if [ -n "$BAD_FILES" ]; then
    ERRORS="${ERRORS}console.log 잔재 발견: ${BAD_FILES}\n"
  fi
fi

# 'any' 타입 사용 검사
if [ -n "$TS_FILES" ]; then
  BAD_FILES=$(echo "$TS_FILES" | xargs grep -lE ':\s*any\b|as\s+any\b|<any>' 2>/dev/null || true)
  if [ -n "$BAD_FILES" ]; then
    ERRORS="${ERRORS}TypeScript 'any' 타입 사용 발견: ${BAD_FILES}\n"
  fi
fi

# Tauri API 정적 import 검사 (동적 import만 허용)
if [ -n "$TS_FILES" ]; then
  BAD_FILES=$(echo "$TS_FILES" | xargs grep -lE "^import .* from '@tauri-apps/" 2>/dev/null || true)
  if [ -n "$BAD_FILES" ]; then
    ERRORS="${ERRORS}Tauri API 정적 import 발견 (동적 import 사용 필요): ${BAD_FILES}\n"
  fi
fi

# @ts-ignore / @ts-nocheck 사용 검사
if [ -n "$TS_FILES" ]; then
  BAD_FILES=$(echo "$TS_FILES" | xargs grep -lE '@ts-ignore|@ts-nocheck' 2>/dev/null || true)
  if [ -n "$BAD_FILES" ]; then
    ERRORS="${ERRORS}@ts-ignore/@ts-nocheck 사용 발견: ${BAD_FILES}\n"
  fi
fi

# ── Rust 검사 ──

RS_FILES=$(echo "$STAGED" | grep '\.rs$' || true)

# unwrap() 사용 검사 (테스트 파일 제외)
if [ -n "$RS_FILES" ]; then
  NON_TEST_RS=$(echo "$RS_FILES" | grep -v 'tests/' | grep -v '_test\.rs' || true)
  if [ -n "$NON_TEST_RS" ]; then
    BAD_FILES=$(echo "$NON_TEST_RS" | xargs grep -l '\.unwrap()' 2>/dev/null || true)
    if [ -n "$BAD_FILES" ]; then
      ERRORS="${ERRORS}Rust unwrap() 사용 발견 (map_err 또는 ? 사용 권장): ${BAD_FILES}\n"
    fi
  fi
fi

# ── 공통 검사 ──

# 하드코딩된 시크릿 패턴 검사
ALL_CODE=$(echo "$STAGED" | grep -E '\.(ts|tsx|rs|json)$' || true)
if [ -n "$ALL_CODE" ]; then
  BAD_FILES=$(echo "$ALL_CODE" | xargs grep -lE '(password|secret|api_key|apiKey)\s*[:=]\s*"[^"]+"' 2>/dev/null || true)
  if [ -n "$BAD_FILES" ]; then
    ERRORS="${ERRORS}하드코딩된 시크릿 발견: ${BAD_FILES}\n"
  fi
fi

# .env 파일 커밋 방지
ENV_FILES=$(echo "$STAGED" | grep -E '\.env($|\.)' || true)
if [ -n "$ENV_FILES" ]; then
  ERRORS="${ERRORS}.env 파일 커밋 시도 발견: ${ENV_FILES}\n"
fi

if [ -n "$ERRORS" ]; then
  echo "BLOCKED: Quality Gate 실패" >&2
  echo -e "$ERRORS" >&2
  exit 2
fi

exit 0
