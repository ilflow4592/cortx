# Getting Started with Cortx

> 15분 튜토리얼 — 설치부터 첫 PR 생성까지.

Cortx 는 Claude Code CLI 를 task-중심 개발 워크플로우로 감싼 데스크톱 앱.
이 문서는 **처음 사용하는 개발자** 가 15분 내에 Cortx 로 첫 PR 을 만들도록 돕는 최소 경로.

---

## 0. 사전 준비 (5분)

### macOS

```bash
# Claude CLI 설치 + 로그인
npm install -g @anthropic-ai/claude-code
claude login

# Cortx 설치 (DMG 다운로드)
# https://github.com/ilflow4592/cortx/releases/latest 에서 최신 `Cortx-<version>.dmg` 받기
```

DMG 를 열고 `Cortx.app` 을 `/Applications` 으로 드래그. 앱 처음 실행 시 우클릭
→ Open 으로 Gatekeeper 경고 우회 (현재 unsigned 빌드).

### Windows / Linux

[releases page](https://github.com/ilflow4592/cortx/releases/latest) 에서
플랫폼별 설치 파일 다운로드. Rust + Node 22 이 필요한 경우 `./setup.sh` 가
자동 설치. Linux 는 현재 제한적 지원 — 문제 발생 시 이슈 등록.

### 필수 체크

```bash
claude --version   # ≥ 1.0
node --version     # ≥ 22
git --version      # ≥ 2.30
```

셋 다 잘 나오면 진행 가능.

---

## 1. 첫 프로젝트 등록 (2분)

1. Cortx 앱 실행
2. 좌측 상단 **Projects** 탭 → **+ New Project** 클릭
3. 다음 입력:
   - **Name**: `my-service` (팀이 알아볼 만한 이름)
   - **Local Path**: 본인 git 저장소 경로 (예: `~/work/my-service`)
   - **Main Branch**: `main` 또는 `develop`
4. 프로젝트 생성 후 Cortx 가 자동으로:
   - 기술 스택 스캔 (Gradle/npm/Cargo/poetry 등)
   - 문서 품질 분석 (`README.md`, `CLAUDE.md`, `.ai/docs/`)
   - 언어 분포 히스토그램
5. Scan 결과가 마음에 들면 **Projects → 해당 프로젝트 → Settings** 에서
   MCP 서버 (GitHub, Slack, Notion 등) 개별 연결 가능.

프로젝트당 1회만 수행. 이후 새 태스크는 이 프로젝트를 선택해 만든다.

---

## 2. 첫 태스크 만들기 (2분)

1. **Dashboard** 탭으로 이동
2. **+ New Task** 클릭
3. 다음 입력:
   - **Project**: 1단계에서 만든 프로젝트 선택
   - **Title**: 한 줄 요약 (예: "사용자 프로필 편집 API 추가")
   - **Branch Name**: `feat/BE-1234-user-profile` (git-safe 문자만)
4. 태스크 생성 시 Cortx 가 자동으로:
   - `.worktrees/<branch-name>/` 에 git worktree 생성 → 메인 저장소와 독립
   - Claude CLI 세션 초기화 (아직 프로세스 spawn 은 안 됨)
   - 전용 PTY 터미널 준비

여러 태스크를 **동시에** 만들 수 있다. 각 태스크는 자기 worktree 에서 독립
실행되므로 메인 브랜치 이동 / stash / 충돌 걱정 없음.

---

## 3. Context Pack 구성 (2분)

태스크를 클릭해 열면 **Context Pack** 탭이 보인다. 여기에 Claude 가 참고할
**스펙 / 논의 / 관련 파일** 을 붙인다.

### 최소 구성 (선택)

- **Pin** 탭 → 드래그 앤 드롭으로 로컬 파일 첨부 (예: `requirements.md`)
- **GitHub** 탭 → Issue URL 붙여넣기 (예: `https://github.com/org/repo/issues/1234`)
- **Notion** 탭 → 페이지 URL 붙여넣기 (MCP 연결 완료 상태 필요)
- **Slack** 탭 → 채널/스레드 검색 후 첨부

적어도 **1개 이상** 붙이는 것을 권장. 비워도 작동하지만, Claude 가 맥락을 덜
이해한 상태로 Grill-me 를 시작하므로 질문이 더 많아진다.

Context Pack 은 파이프라인 시작 시 자동 주입되므로, 사용자가 수동으로 복붙할
필요 없음.

---

## 4. `/pipeline:dev-task` 실행 — Grill-me (3분)

태스크 내 **Claude** 탭으로 이동. 사이드바의 **Run Pipeline** 버튼 클릭 또는
직접 입력창에 `/pipeline:dev-task` 입력.

Claude 가 다음 순서로 동작:

1. **Context Pack 로딩** — 채팅에 `Loading Context Pack (N items)` 표시
2. **프로젝트 규칙 로딩** — `CLAUDE.md`, `.ai/docs/`, `ARCHITECTURE.md`
3. **코드베이스 탐색** — 관련 파일을 Claude 가 직접 Read
4. **Grill-me 질문 Q1, Q2, Q3** — 비즈니스 결정만 질문 (코드로 알 수 있는 건 묻지 않음)

각 질문에 짧게 답변:

- `Q1. ...? → a. 이메일만, b. 이메일+전화`  
  → 사용자: `a`
- `Q2. ...? → 사용자 본인이 수정, 관리자도 수정?`  
  → 사용자: `둘 다`

10개 내외 질문이 오간다. Dashboard 의 **grill_me** phase 가 `in_progress` →
`done` 으로 전환되면 준비 완료.

**팁**: 잘 모르겠으면 "너는 어떻게 생각해?" 라고 되물을 수 있다. Claude 가
권고안을 제시하고 "이 방향으로 진행할까요?" 로 확인받는다.

---

## 5. `/pipeline:dev-implement` — 개발 계획 + 구현 (3분 + α)

Grill-me 가 끝나면 입력창에 `/pipeline:dev-implement` 입력 (혹은 사이드바
Run Pipeline 버튼 재클릭).

Claude 가:

1. **개발 계획서** 를 작성해 채팅에 출력 (Plan mode)
2. 사용자에게 **승인 카드** (계획 보기 / 승인 / 수정 요청) 표시
3. 승인 시 자동으로 `bypassPermissions` 모드로 재spawn 해 **구현 시작**
4. 각 단계별 파일 수정 → 테스트 작성 → 테스트 실행
5. 구현 완료 시 "커밋하시겠습니까?" 로 확인 요청 후 **중단**

사용자는 Dashboard 에서 `dev_plan` → `implement` phase 진행 상황을 실시간으로
확인. 문제 생기면 ESC 키로 즉시 중단 (세션은 유지 — `/pipeline:dev-resume` 으로
이어 가능).

---

## 6. 커밋 + PR 생성 (2분)

구현 완료 메시지가 뜨면:

```
/git:commit
```

Claude 가 변경 파일 분석 → conventional commit 메시지 제안 → 사용자 확인 →
`git commit` 실행. 이어서:

```
/git:pr
```

프로젝트에 `.github/PULL_REQUEST_TEMPLATE.md` 가 있으면 그 양식대로 PR body
작성 → 사용자 확인 → `gh pr create` 실행 → **PR URL 채팅에 출력**.

Dashboard 의 `commit_pr` phase 가 `done` 으로 전환되면 끝.

---

## 7. Review Loop (선택)

CI 가 Claude-based PR review 를 돌리는 리포라면, review comment 가 달린 후:

```
/pipeline:dev-review-loop
```

Claude 가 모든 리뷰 코멘트를 분류 (Accept / Partial / Acknowledge / Reject),
수정 필요한 건 자동 수정 → 답글 → 사용자 확인 후 re-push → CI 재실행.
Approved 될 때까지 반복.

---

## 다음 단계

- **Custom Pipelines** — 내장 7단계 파이프라인 외에, 직접 skill 을 조합해
  사용자 정의 파이프라인 만들기. [docs/pipeline-customization.md](pipeline-customization.md) 참조.
- **MCP Server Manager** — 프로젝트별 MCP 서버 관리. Settings → MCP 탭.
- **Cost Dashboard** — 태스크별 Claude API 토큰 사용량 + 비용 추적.
- **Daily Report** — 집중 시간 / interrupt 통계 / focus ratio.
- **Command Palette** — `⌘K` 로 빠른 탐색 / 명령 실행.

---

## 문제 해결

| 증상                       | 원인              | 해결                                       |
| -------------------------- | ----------------- | ------------------------------------------ |
| `claude` 명령 찾을 수 없음 | Claude CLI 미설치 | `npm install -g @anthropic-ai/claude-code` |
| Gatekeeper 경고 (macOS)    | Unsigned 빌드     | 앱 우클릭 → Open                           |
| PTY 터미널 빈 화면         | PTY 초기화 실패   | 태스크 재선택 or 앱 재시작                 |
| 파이프라인이 안 돌아감     | Claude 세션 충돌  | Stop 버튼 → 재시도                         |
| Context Pack 빈 상태       | MCP 서버 미연결   | Settings → MCP 에서 서버 추가              |

자세한 아키텍처와 고급 설정은 [docs/cortx-pipeline-manual.md](cortx-pipeline-manual.md) 참조.

버그 / 기능 요청: https://github.com/ilflow4592/cortx/issues
