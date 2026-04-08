# Cortx Dev Pipeline 매뉴얼

> Cortx 앱 전용 파이프라인 가이드
> 기존 Obsidian 기반 `dev-pipeline-manual.md`와 별개로 운영

## 아키텍처 개요

```
┌─ Cortx 앱 (Tauri + React) ────────────────────────────────────┐
│                                                                 │
│  Context Pack ─────── 스펙 수집 (Notion, Slack, GitHub, Pin)    │
│  Claude CLI ─────── claude -p --resume --stream-json            │
│  Dashboard ──────── 7단계 Pipeline Progress 추적                │
│  Projects/Changes ─ 파일 트리 + Git diff 뷰                    │
│  Monaco Editor ──── 코드 편집 + diff 뷰                        │
│                                                                 │
│  슬래시 커맨드 (앱 내장, Cortx 전용 스킬)                       │
│  ├── /pipeline:dev-task        Grill-me + 스펙 정리             │
│  ├── /pipeline:dev-implement   개발 계획 + 구현 + 테스트 + PR   │
│  ├── /pipeline:dev-resume      중단 복구                        │
│  └── /pipeline:dev-review-loop 리뷰 대응 (CLI 버전 사용)       │
│                                                                 │
│  하네스 훅 (자동, ~/.claude/settings.json)                      │
│  ├── block-prod.sh     prod 브랜치 차단                         │
│  ├── quality-gate.sh   커밋 전 코드 검증                        │
│  └── confirm-delete.sh 파일 삭제 확인                           │
│                                                                 │
│  Git Hook (TOMS-server)                                         │
│  └── pre-commit        Quality Gate (git 레벨 방어)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Obsidian 버전과의 차이

| 항목 | Obsidian (CLI) | Cortx (앱) |
|------|---------------|------------|
| 스펙 소스 | Notion MCP 직접 검색 | Context Pack (사전 수집) |
| 대시보드 | `_dashboard.md` 파일 | 앱 내장 Dashboard |
| 상태 추적 | `_pipeline-state.json` | `task.pipeline` (localStorage) |
| dev-plan 저장 | Obsidian `Projects/{ID}/dev-plan.md` | worktree 내부 `dev-plan.md` |
| 스킬 소스 | `~/.claude/commands/pipeline/*.md` | 앱 내장 (`pipelineSkills.ts`) |
| 대화 연속성 | 세션 단위 | `--resume {session_id}` |
| Phase 전환 | Claude 마커 의존 | 앱에서 직접 전환 + 마커 보조 |
| 토큰 추적 | 없음 | Phase별 input/output 토큰 + 비용 |
| 알림 | 없음 | macOS Notification |

---

## 전체 흐름

```
/pipeline:dev-task
       │
       ├── Context Pack 로딩 (Notion, Slack 등)
       ├── 코드베이스 1회 스캔
       ├── Grill-me 대화 (한국어, 1:1)
       ├── 스펙 정리 → 사용자 확인
       └── Dashboard: Grill-me ✅ → Save ✅
       
       ↓ 사용자: /pipeline:dev-implement

/pipeline:dev-implement
       │
       ├── 이전 대화 컨텍스트 재사용 (--resume)
       ├── 개발 계획 수립 (복잡도 판별)
       ├── 사용자 "y" → Dev Plan ✅, dev-plan.md 저장
       ├── 구현 (직접 or Agent 위임)
       ├── Quality Gate + 테스트 전체 통과
       ├── 사용자 확인 → 커밋 + push
       ├── 사용자 확인 → PR 생성
       └── Dashboard: Implement ✅ → PR ✅
       
       ↓ Copilot 리뷰 후

/pipeline:dev-review-loop (CLI 버전 사용)
```

---

## Step 1: 태스크 시작 (`/pipeline:dev-task`)

### 사전 준비
1. Cortx에서 태스크 생성 (브랜치명 + 제목 설정)
2. Context Pack 탭에서 관련 Notion 페이지/Slack 메시지 수집
3. `Collect Now` 실행

### 실행
Claude 탭에서 입력:
```
/pipeline:dev-task
```
> 브랜치명과 제목은 앱이 자동으로 주입합니다.

### 자동으로 일어나는 일
1. **Context Pack 로딩** — 수집된 아이템이 system prompt로 전달
2. **코드베이스 스캔** — 1회만 수행 (이후 재스캔 금지)
3. **Grill-me 대화** — 한국어, 한 번에 하나의 질문
4. **Dashboard 업데이트** — Grill-me ✅ → Save ✅
5. **타이머 자동 시작** — 태스크가 waiting/paused면 active로 전환

### Grill-me 규칙
- 코드로 확인 가능한 건 직접 확인, 사용자에게 묻지 않음
- 기술적 구현 방식은 혼자 판단
- 비즈니스 의도/판단만 질문
- "끝", "완료", "다음" 입력 시 정리 단계로 이동

### 결과물
- Dashboard: Grill-me ✅, Save ✅
- 다음 단계 안내: `/pipeline:dev-implement`

---

## Step 2: 구현 + PR (`/pipeline:dev-implement`)

### 실행
```
/pipeline:dev-implement
```

### 자동으로 일어나는 일
1. **이전 대화 컨텍스트 재사용** — `--resume`으로 Grill-me 맥락 유지
2. **개발 계획 수립** — 변경 파일 목록, 구현 순서, 테스트 계획
3. **사용자 "y"** → Dashboard: Dev Plan ✅ + `dev-plan.md` 저장 (worktree 내부)
4. **구현** — 복잡도별 전략 (Simple: 직접, Medium/Complex: Agent)
5. **Quality Gate** — 빌드, LocalDateTime.now(), @Transactional, 시크릿, import 검증
6. **테스트** — 전체 통과할 때까지 반복
7. **사용자 확인 → 커밋 + push**
8. **사용자 확인 → PR 생성**
9. **Dashboard 업데이트** — Implement ✅ → PR ✅

### 복잡도별 전략

| 복잡도 | 파일 수 | 탐색 전략 | 구현 전략 |
|--------|---------|----------|----------|
| Simple | 1~5 | 직접 Read + Grep | 메인 컨텍스트 직접 |
| Medium | 6~15 | Explorer Agent 1개 | 직접 구현 |
| Complex | 15+ | Explorer Agent 3개 병렬 | Agent(worktree) 위임 |

### 커밋/PR 규칙
- **절대 자동 커밋/push/PR 금지**
- 구현 완료 → "커밋하시겠습니까?" → 사용자 승인 → 커밋 + push
- push 완료 → "PR을 생성할까요?" → 사용자 승인 → PR 생성

### 코드 품질 규칙
- `List<Object[]>` 금지 — DTO/Projection/Map 사용
- 기존 프로젝트 패턴/네이밍 준수
- SOLID, Null Safety, 유지보수성

### 결과물
- Dashboard: Dev Plan ✅ (다운로드 아이콘), Implement ✅, PR ✅
- worktree 내부 `dev-plan.md`
- PR 생성 완료

---

## Step 3: 리뷰 대응 (`/pipeline:dev-review-loop`)

> 현재 CLI 버전 스킬을 사용합니다. Cortx 전용 버전 미구현.

Copilot 리뷰가 PR에 달린 후 실행:
```
/pipeline:dev-review-loop
```

---

## Step 4: 중단 복구 (`/pipeline:dev-resume`)

```
/pipeline:dev-resume
```

Dashboard의 pipeline 상태를 기반으로 재개 지점을 자동 판단합니다.

---

## Dashboard

### Progress 바
```
✅ Grill-me → ✅ Save → ✅ Dev Plan → 🔄 Implement → ○ PR → ○ Review → ○ Done
```

### Phase 전환 방식
| 전환 | 트리거 |
|------|--------|
| Grill-me → Save | Claude 마커 `[PIPELINE:grill_me:done]` |
| Save → Dev Plan | Claude 마커 `[PIPELINE:obsidian_save:done]` |
| Dev Plan → Implement | 사용자 "y" 입력 (앱에서 직접 전환) |
| Implement → PR | 사용자 커밋 승인 (앱에서 직접 전환) |
| PR → done | 사용자 PR 승인 (앱에서 직접 전환) |

### 토큰 추적
- 각 Phase 옆에 토큰 사용량 표시 (K/M 단위)
- 하단에 Total: input / output + USD 비용

### 산출물
- Dev Plan 행 옆 다운로드 아이콘 → `dev-plan.md` (worktree에 저장)

### Reset Session
- Progress 옆 Reset 버튼 → 모달 확인
- 초기화 항목: Pipeline progress, 타이머, Claude 세션, 태스크 상태, Git 변경사항

---

## Claude CLI 호출 구조

```
사용자 입력 → ClaudeChat.tsx (프롬프트 조립)
           → pty.rs (zsh -l -c "cat msg | claude -p - --stream-json --resume {sid}")
           → stdout 스트리밍 → JSON 파싱 → Markdown 렌더링
```

### 주요 플래그
| 플래그 | 용도 |
|--------|------|
| `-p -` | stdin에서 프롬프트 읽기 |
| `--output-format stream-json` | JSON 스트리밍 출력 |
| `--verbose` | 상세 이벤트 출력 |
| `--model claude-opus-4-6` | 모델 지정 |
| `--permission-mode bypassPermissions` | 권한 우회 |
| `--resume {session_id}` | 이전 대화 이어가기 |
| `--append-system-prompt` | Context Pack + 트래킹 지시 |

### System Prompt (항상 전달)
- `CORTX_PIPELINE_TRACKING` — 마커 출력 지시
- `Phase transition rules` — 마커 전환 규칙
- `CORTX_RULES` — 코드베이스 재탐색 금지, 커밋/push 금지, 테스트 필수 등

---

## 안전장치

| 레이어 | 방어 | 우회 |
|--------|------|------|
| Cortx 앱 UI | "커밋하시겠습니까?" 확인 | Claude가 무시 가능 |
| Claude Hook (PreToolUse) | block-prod, quality-gate, confirm-delete | bypassPermissions로 우회 가능 |
| Git Hook (pre-commit) | LocalDateTime.now(), 시크릿, import 검증 | `--no-verify`로만 우회 |
| Git Hook + Claude Hook | `--no-verify` 사용 차단 | 이중 방어 |

---

## 파일 구조

```
cortx/
├── src/
│   ├── skills/
│   │   └── pipelineSkills.ts      ← Cortx 전용 스킬 (3개)
│   ├── components/
│   │   ├── ClaudeChat.tsx         ← Claude CLI 호출 + 마커 파싱 + Phase 전환
│   │   ├── RightPanel.tsx         ← Dashboard + Projects + Changes
│   │   ├── ChangesView.tsx        ← Git 변경사항 + Discard
│   │   ├── ProjectFiles.tsx       ← 파일 트리
│   │   ├── CodeEditor.tsx         ← Monaco 에디터
│   │   └── DiffEditor.tsx         ← Monaco Diff 에디터
│   ├── types/
│   │   └── task.ts                ← PipelineState, PipelinePhase 타입
│   └── stores/
│       └── taskStore.ts           ← pipeline 상태 관리 (localStorage)
├── src-tauri/src/
│   ├── pty.rs                     ← Claude CLI spawn + stdout 스트리밍
│   └── lib.rs                     ← Tauri 커맨드 등록
└── docs/
    └── cortx-pipeline-manual.md   ← 이 문서
```

---

## 빠른 참조

| 상황 | 명령어 |
|------|--------|
| 새 태스크 시작 | `/pipeline:dev-task` |
| 구현 시작 | `/pipeline:dev-implement` |
| 리뷰 대응 | `/pipeline:dev-review-loop` |
| 중단 복구 | `/pipeline:dev-resume` |
| Grill-me 종료 | "끝", "완료", "다음", "done" |
| 계획 승인 | "y" |
| 세션 초기화 | Dashboard → Reset 버튼 |
| 외부 에디터 | Projects/Changes → Open via 버튼 |
