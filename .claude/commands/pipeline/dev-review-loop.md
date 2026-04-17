# dev-review-loop — PR 리뷰 대응 + 재커밋 반복

⛔ **prod 브랜치 절대 접근 금지**

PR에 달린 CI 리뷰(Claude Code PR Review Follow-up / `pr-review-fu.yml`)를 분석하고, 코드 수정 + reply를 수행합니다.
커밋 및 푸시는 **반드시 사용자 확인 후**에만 실행합니다.

## 절대 규칙 (반드시 준수)

### 브랜치

- 현재 브랜치가 `feat/{TASK_ID}`가 맞는지 **읽기 전용 확인**만 수행 (`git branch --show-current`, `git status`).
- 다르면 **사용자에게 보고하고 중단**. 임의 복구 금지.
- ⛔ **브랜치 조작 명령 절대 금지**: `git checkout -b`, `git switch`, `git branch -D`, 다른 브랜치로 checkout 등.

### 탐색

- 리뷰 코멘트가 지적한 **파일과 주변 코드에 한해서만 Read** 허용.
- ⛔ **광범위 재탐색 금지**: Agent, Grep/Glob 코드베이스 전체 스캔, 무관 모듈 탐색.
- 리뷰에서 지적하지 않은 범위의 리팩토링/정리 금지. 지적된 이슈 해결에 **필요한 최소 변경**만.

### 커밋/푸시 승인

- **사용자 명시적 승인("y", "진행") 없이** git commit / git push 금지.
- 변경 내용 요약 + 커밋 메시지 안을 먼저 보여주고 "커밋·푸시해도 될까요?" 로 확인.

### 언어

- 한국어로만 대화합니다.

## Usage

```
/pipeline:dev-review-loop <태스크-ID>
```

## Arguments

- `$ARGUMENTS` — 태스크 ID (필수)

## Execution

### Step 0: 컨텍스트 로딩 및 검증

**병렬로** 수집 (한 번만 설정, 이후 단계에서 재정의 금지):

```bash
CURRENT_BRANCH=$(git branch --show-current)
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
PR_JSON=$(gh pr view --json number,url,state 2>/dev/null || echo '')
PR_NUMBER=$(echo "$PR_JSON" | jq -r '.number // empty')
PR_URL=$(echo "$PR_JSON" | jq -r '.url // empty')
```

**중단 조건 (마커 출력 전 검증)**:

- `PR_NUMBER`가 비었으면 → "현재 브랜치(`$CURRENT_BRANCH`)에 연결된 PR이 없습니다." 안내 후 **종료**. 마커 출력 금지.
- `CURRENT_BRANCH`가 `feat/{TASK_ID}` 패턴이 아니면 → 사용자에게 보고하고 **중단**.

검증을 통과한 뒤에만 마커 출력:

[PIPELINE:review_loop:in_progress]

**라운드 카운터** — 이 스킬 세션 내 로컬 변수로 추적합니다 (Cortx UI 파이프라인 상태에는 `reviewRounds` 마커를 전송하지 않음 — 해당 마커는 공식 파이프라인 단계가 아님):

- 최초 진입 시 `ROUND = 1` 로 시작.
- Step 6-2에서 Step 1로 복귀할 때마다 `ROUND += 1`.
- `ROUND > 5` 에 도달하면 사용자에게 "최대 5라운드 도달. 수동 전환할까요?" 질문 후 `y/n` 대기. `y` → Step 7 강제 완료, `n` → 진행.

---

### Step 1: 리뷰 코멘트 수집

CI 리뷰 봇이 남긴 코멘트 중 **아직 reply가 달리지 않은** 것만 수집합니다.

```bash
# 인라인 코멘트 — Bot 또는 리뷰 본문 패턴, reply 없음(in_reply_to_id == null)
gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/comments --paginate \
  --jq '
    [.[] | select(.in_reply_to_id == null)] as $top
    | ([.[] | select(.in_reply_to_id != null) | .in_reply_to_id] | unique) as $replied
    | $top
    | map(select(
        (.user.type == "Bot"
         or (.body | test("AI Code Review|최종 판정|Must Fix|Should Fix|PR 리뷰 결과|증분 리뷰|리뷰 결과")))
        and ([.id] | inside($replied) | not)
      ))
    | .[]
    | {id, path, line, body, commit_id}
  '

# 리뷰 본문(top-level review)
gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews --paginate \
  --jq '.[] | select(
    (.user.type == "Bot"
     or (.body | test("AI Code Review|최종 판정|Must Fix|Should Fix|PR 리뷰 결과|증분 리뷰|리뷰 결과")))
    and .state != "COMMENTED_EMPTY"
  ) | {id, state, body, commit_id}'
```

수집 결과가 0건이면: "새로 대응할 리뷰 코멘트가 없습니다." 안내 후 Step 6-1로 이동 (CI 상태만 재확인).

---

### Step 2: 코멘트 분석 및 분류

각 코멘트에 대해 **지적된 파일과 해당 라인 주변만** 열어 컨벤션·컨텍스트를 확인 후 분류:

- **✅ 수용** → 코드 수정
- **⚠️ 부분 수용** → 일부 수정
- **📝 인지** → 수정 없음 (범위 밖·향후 과제)
- **❌ 거절** → 수정 없음 (의도적 설계)

⛔ 분류 근거 확인을 위해 Agent 호출·Grep 전체 스캔 금지. 지적 파일 1~2개 Read 허용.

사용자에게 분류표를 보여주고 승인 대기:

```markdown
## PR 리뷰 분석 (라운드 {ROUND}/5)

| #   | 파일:라인 | 심각도 | 지적 내용 | 분류 | 대응 요약 |
| --- | --------- | ------ | --------- | ---- | --------- |

이대로 진행할까요? (y/수정사항)
```

사용자가 `y` 전에 Step 3으로 진행 금지.

---

### Step 3: 코드 수정 (수용/부분 수용 항목)

- 지적된 파일만 수정. 연관 수정이 꼭 필요한 경우 **사용자에게 이유를 알리고 확인** 후 추가.
- 프로젝트 컨벤션(CLAUDE.md/AGENTS.md) 준수.
- 빌드/테스트 명령은 **project-context.md의 `## Build & Test Commands` 섹션**을 참조. 하드코딩 금지.
  - 예: Gradle `./gradlew :{module}:test --tests "{TestClass}"`, npm `npm test`, cargo `cargo test {name}`, pytest `pytest {path}` 등.
- 수정 → 해당 스코프 테스트 실행 → 실패 시 재수정 반복. 모두 통과한 후 Step 4.

---

### Step 4: PR에 reply 달기

각 분류된 코멘트에 한국어 reply:

```bash
gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/comments/{comment_id}/replies \
  --method POST \
  -f body="답변 내용"
```

답변 형식:

- `✅ 수용합니다. {변경 요약}`
- `⚠️ 부분 수용. {변경 요약 + 미반영 사유}`
- `📝 인지합니다. {미수정 사유}`
- `❌ 거절합니다. {근거}`

**reply를 단 comment_id 목록을 기록**해 둡니다 (Step 5.5 resolve 범위 결정에 사용):

```bash
REPLIED_IDS_THIS_ROUND="{comma-separated comment_id list}"
```

---

### Step 5: 사용자 확인 → 커밋 & 푸시

**5-1. 요약 제시**:

```markdown
## 커밋 준비 (라운드 {ROUND})

**변경 파일**:
{git diff --stat 결과}

**커밋 메시지 (안)**:
```

fix({scope}): PR 리뷰 반영 (라운드 {n})

수용: {a}건, 부분 수용: {p}건, 거절: {r}건

```

커밋하고 푸시해도 될까요? (y/n/수정)
```

**5-2. 응답 처리**:

- **y** → 5-3 실행
- **n** → 중단, 추가 수정 대기
- **수정** → 반영 후 재확인

**5-3. 커밋 & 푸시** (사용자 `y` 후에만):

```bash
# 푸시 전 스냅샷 — Step 5.5 resolve 범위 산정용
THREADS_BEFORE=$(gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/comments --paginate \
  --jq '[.[] | select(.in_reply_to_id == null) | {id, position, node_id}]')

git add {변경 파일 명시적 나열}
git commit -m "$(cat <<'EOF'
fix({scope}): PR 리뷰 반영 (라운드 {n})

수용: {a}건, 부분 수용: {p}건, 거절: {r}건

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin "$CURRENT_BRANCH"
```

**5-4. 푸시 완료 로그**:

```
✅ 커밋 & 푸시 완료
🔗 PR: $PR_URL
```

---

### Step 5.5: 이번 라운드에 대응한 outdated 코멘트 resolve

푸시 직후, **이번 라운드에서 reply를 달고 해당 라인을 수정해 position이 null이 된** 스레드만 resolve합니다.

```bash
for COMMENT_ID in $(echo "$REPLIED_IDS_THIS_ROUND" | tr ',' ' '); do
  # 푸시 후 상태 재조회
  INFO=$(gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/comments \
    --jq ".[] | select(.id == $COMMENT_ID) | {position, node_id}")
  POS=$(echo "$INFO" | jq -r '.position')
  NODE=$(echo "$INFO" | jq -r '.node_id')

  # 푸시 전에 이미 position이 null이었다면(=이전 라운드에서 outdated) 이번 라운드의 기여 아님 → 건너뜀
  WAS_OUTDATED=$(echo "$THREADS_BEFORE" \
    | jq -r "any(.[]; .id == $COMMENT_ID and .position == null)")

  if [ "$POS" = "null" ] && [ "$WAS_OUTDATED" != "true" ] \
     && [ -n "$NODE" ] && [ "$NODE" != "null" ]; then
    gh api graphql -f query="mutation { resolveReviewThread(input: {threadId: \"$NODE\"}) { thread { isResolved } } }" 2>/dev/null
  fi
done
```

**규칙**:

- reply를 단 comment만 대상 (`REPLIED_IDS_THIS_ROUND` 기준).
- 푸시 전 이미 outdated였던 스레드는 제외.
- position이 여전히 유효한(null이 아닌) 코멘트는 resolve하지 않음.
- resolve 건수를 `resolved: {n}건` 로 라운드 요약에 표기.

---

### Step 6: CI 결과 대기 및 반복 판단

리뷰 주체(둘 다 동일한 봇 리뷰로 취급):

- **`pr-review.yml`** — 최초 PR 생성 시 트리거 (TOMS-server 등). 초기 리뷰.
- **`pr-review-fu.yml`** — 후속 push 시 트리거. 이전 지적 해결 추적 + 증분 리뷰.

두 워크플로우 모두 `gh pr review --approve` / `--request-changes` 로 제출하거나, 본문에 `최종 판정: ✅ Approved` / `❌ 승인 불가` 텍스트를 포함합니다. 따라서 **API `.state` 와 본문 텍스트 둘 다** 확인해 판정.

**6-1. 대기 및 조회** — 명시적 sleep + 최신 리뷰 1건 조회:

```bash
REVIEW_STATE=""
REVIEW_BODY=""
for attempt in 1 2 3; do
  sleep 120   # 각 시도마다 2분 대기 (총 최대 6분)
  LATEST=$(gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews --paginate \
    --jq '[.[] | select(
             .user.type == "Bot"
             or (.body | test("AI Code Review|최종 판정|Must Fix|Should Fix|PR 리뷰 결과|증분 리뷰|리뷰 결과"))
           )] | last')
  REVIEW_STATE=$(echo "$LATEST" | jq -r '.state // empty')
  REVIEW_BODY=$(echo "$LATEST" | jq -r '.body // empty')
  [ -n "$REVIEW_STATE" ] && break
done
```

- 이번 스킬 세션 **최초 진입** (푸시 전, 라운드 1 시작 직후)에도 동일 대기 로직을 타서 **PR 직후의 초기 `pr-review.yml` 결과**를 기다립니다. `dev-implement`가 PR 생성 직후 `dev-review-loop` 로 넘길 때 최초 리뷰가 아직 없으면 이 단계에서 6분까지 기다림.
- 최대 3회 후에도 비면 "CI 리뷰가 아직 완료되지 않았습니다. 수동 재확인 필요." 안내 후 종료 (파이프라인 상태는 `review_loop:in_progress` 로 유지).

**판정 통합 함수** (state + 본문):

```bash
is_approved() {
  [ "$REVIEW_STATE" = "APPROVED" ] && return 0
  # state가 COMMENTED여도 본문에 "최종 판정: ✅ Approved" 또는
  # "🔴 Must Fix: 0건 — 승인" 패턴이 있으면 승인으로 간주
  echo "$REVIEW_BODY" | grep -qE '최종 판정:.*✅.*Approved|Must Fix:.*0건.*승인' && return 0
  return 1
}

has_changes_requested() {
  [ "$REVIEW_STATE" = "CHANGES_REQUESTED" ] && return 0
  echo "$REVIEW_BODY" | grep -qE '승인 불가|🔴 Must Fix.*[1-9]' && return 0
  return 1
}
```

**6-2. 분기** — **APPROVED는 사용자 질문 없이 자동으로 Step 7 진행**:

- `is_approved` 참 → **즉시 Step 7 완료 처리** (확인 절차 없음, 자동 DONE).
- `has_changes_requested` 참 → **Step 1로 복귀** (다음 라운드).
- 둘 다 거짓 (`COMMENTED` 상태로 🟡 권고만) → 사용자에게:
  ```
  🟡 Must Fix 없음, 권고(🟡) 있음.
  추가 대응할까요? (y → Step 1 반복 / n → Step 7 완료)
  ```
- Step 0의 `reviewRounds >= 5` 체크에서 이미 걸러졌으므로 여기서는 별도 상한 처리 불필요.

---

### Step 7: 완료 처리

**트리거 조건** (둘 중 하나):

- Step 6-2 `is_approved` 참 → **사용자 확인 없이 자동 진입**.
- 사용자가 `COMMENTED` 분기에서 `n` 선택 또는 `ROUND > 5` 상한에서 `y` 선택.

두 경로 모두 아래 마커를 **즉시 출력**하여 Cortx 파이프라인 대시보드의 PROGRESS 를 DONE 으로 전환합니다 (`pipelineMarkers.ts` 파서가 `review_loop:done` + `done:done` 를 감지해 `updateTask` 로 반영).

[PIPELINE:review_loop:done]
[PIPELINE:done:done]

```
🎉 리뷰 승인! 루프 완료.

📋 태스크: {TASK_ID}
🔗 PR: $PR_URL
🔄 리뷰 라운드: {ROUND}회
✅ 수용: {총}건 | ⚠️ 부분: {총}건 | ❌ 거절: {총}건 | 🧹 resolved: {총}건
판정: ✅ 승인 — 🔴 Must Fix 전부 해결
```

---

## 주의사항

- **커밋/푸시는 반드시 사용자 확인 후에만 실행** — 자동 커밋/푸시 절대 금지.
- prod 브랜치 관련 명령 일체 금지.
- 리뷰어 식별: `user.type == "Bot"` 또는 리뷰 본문에 `AI Code Review|최종 판정|Must Fix|Should Fix|PR 리뷰 결과|증분 리뷰|리뷰 결과` 패턴.
- 광범위 재탐색·Agent 호출 금지 — 리뷰 지적 범위의 파일 Read만 허용.
- 한국어로만 대화.
