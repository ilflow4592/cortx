# dev-resume — 중단된 파이프라인 재개

⛔ **prod 브랜치 절대 접근 금지**

Cortx 앱 Dashboard의 pipeline 상태를 기반으로 중단된 작업을 재개합니다.

## 중요 규칙
- **가장 먼저** 아래 형식으로 시작 메시지를 출력합니다:
  ```
  🔄 **{TASK_ID}** — {TASK_NAME}
  중단된 파이프라인을 재개합니다. 상태를 분석합니다.
  ```
- 한국어로만 대화합니다.

## Arguments
- `$ARGUMENTS` — 태스크 ID (선택)

## Execution

### Step 1: 상태 분석

**병렬로** 다음을 확인합니다:
1. `git branch --show-current`
2. `git status --short`
3. `git log --oneline origin/develop..HEAD` (브랜치가 있는 경우)

Dashboard의 pipeline phases를 보고 재개 지점을 파악합니다.
(Cortx 앱이 system prompt에 현재 pipeline 상태를 제공합니다)

### Step 2: 재개 지점 판단

| resume_point | 재개 액션 |
|-------------|----------|
| grill_me | → /pipeline:dev-task 안내 |
| dev_plan | → /pipeline:dev-implement 안내 |
| implement (in_progress) | 브랜치 확인 후 구현 재개 |
| commit_pr (pending) | 빌드 확인 후 커밋/PR 재개 |
| review_loop | → /pipeline:dev-review-loop 안내 |
| done (pending) | 완료 처리만 수행 |

### Step 3: 컨텍스트 복원

재개에 필요한 컨텍스트를 병렬로 로딩:
1. Context Pack 스펙 (system prompt에서 제공됨)
2. 현재 브랜치의 커밋 히스토리
3. PR 상태 (`gh pr view`)

### Step 4: 실행

자동 재개 가능한 경우 (implement, commit_pr):
사용자에게 재개 계획을 보여주고 확인 후 실행.

수동 재개 필요한 경우:
해당 파이프라인 명령을 안내.

[PIPELINE:{재개단계}:in_progress]
