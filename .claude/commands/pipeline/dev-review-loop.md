# dev-review-loop — PR 리뷰 대응 + 재커밋 반복

⛔ **prod 브랜치 절대 접근 금지**

PR에 달린 CI 리뷰(Claude Code PR Review Follow-up)를 분석하고, 코드 수정 + 답변을 수행합니다.
커밋 및 푸시는 **반드시 사용자 확인 후**에만 실행합니다.

## Usage

```bash
/pipeline:dev-review-loop <태스크-ID>
```

## Arguments

- `$ARGUMENTS` — 태스크 ID (필수)

## Execution

### Step 0: 컨텍스트 로딩

**병렬로** 다음을 수집합니다:

```bash
# 현재 브랜치 확인
git branch --show-current

# PR 번호 및 URL
gh pr view --json number,url --jq '{number: .number, url: .url}'

# PR 리뷰 상태 확인
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
```

PR이 없으면 사용자에게 알리고 중단합니다.

[PIPELINE:review_loop:in_progress]

---

### Step 1: 리뷰 코멘트 수집

CI 리뷰 봇이 남긴 코멘트를 수집합니다:

```bash
PR_NUMBER=$(gh pr view --json number --jq '.number')
OWNER_REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')

# PR review comments (inline comments)
gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/comments \
  --jq '.[] | select(
    .user.type == "Bot"
    or (.body | test("Must Fix|PR 리뷰 결과|증분 리뷰|리뷰 결과"))
  ) | {id: .id, path: .path, line: .line, body: .body, in_reply_to_id: .in_reply_to_id}'

# PR reviews (top-level review body)
gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews \
  --jq '.[] | select(
    .user.type == "Bot"
    or (.body | test("Must Fix|PR 리뷰 결과|증분 리뷰|리뷰 결과"))
  ) | {id: .id, state: .state, body: .body}'
```

- 리뷰가 없으면: "PR 리뷰 코멘트가 아직 없습니다." 안내 후 종료
- 이미 reply가 달린 코멘트는 건너뜁니다

---

### Step 2: 코멘트 분석 및 분류

각 코멘트에 대해 해당 파일과 주변 코드, 프로젝트 컨벤션을 확인하여 분류:
- **✅ 수용** → 코드 수정
- **⚠️ 부분 수용** → 일부 수정
- **📝 인지** → 수정 없음 (범위 밖)
- **❌ 거절** → 수정 없음 (의도적 설계)

사용자에게 분류 결과를 보여주고 확인을 받습니다:

```markdown
## PR 리뷰 분석 (라운드 {n}/{max})

| # | 파일 | 지적 내용 | 분류 | 대응 |
|---|------|----------|------|------|

이대로 진행할까요? (y/수정사항)
```

---

### Step 3: 코드 수정 (수용/부분 수용 항목)

1. 해당 파일을 읽고 수정
2. 관련 파일도 함께 수정
3. 필요 시 테스트 추가/수정
4. 빌드 확인: `./gradlew compileJava`
5. 테스트 실행: `./gradlew :{module}:test --tests "{TestClass}"` (해당하는 경우)

---

### Step 4: PR에 답변 달기

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

---

### Step 5: 사용자 확인 → 커밋 & 푸시

코드 수정이 있는 경우, **반드시 사용자 확인을 받은 후에만** 커밋 및 푸시합니다.

**5-1. 변경 내용 요약 제시**:

```markdown
## 커밋 준비

**변경 파일**:
{git diff --stat 결과}

**커밋 메시지 (안)**:
```
fix({scope}): PR 리뷰 반영 (라운드 {n})

수용: {a}건, 부분 수용: {p}건, 거절: {r}건
```

커밋하고 푸시해도 될까요? (y/n/수정)
```

**5-2. 사용자 응답 처리**:
- **y** → 커밋 및 푸시 실행
- **n** → 커밋 중단, 추가 수정 대기
- **수정 내용** → 피드백 반영 후 다시 확인 요청

**5-3. 커밋 & 푸시** (사용자 "y" 후에만):

```bash
git add {변경 파일 명시적 나열}
git commit -m "$(cat <<'EOF'
fix({scope}): PR 리뷰 반영 (라운드 {n})

수용: {a}건, 부분 수용: {p}건, 거절: {r}건
EOF
)"
git push origin $(git branch --show-current)
```

**5-4. 푸시 완료 후 PR 링크 제공**:
```
✅ 커밋 & 푸시 완료
🔗 PR: {PR URL}
```

---

### Step 5.5: Outdated 코멘트 자동 resolve

푸시 후, **이번 라운드에서 reply를 달고 코드를 수정한 코멘트** 중 outdated 상태(`position == null`)인 것을 자동으로 resolve합니다.

```bash
REPLIED_THREAD_IDS=$(gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/comments \
  --jq '[.[] | select(.in_reply_to_id != null)] | map(.in_reply_to_id) | unique | .[]')

for COMMENT_ID in $REPLIED_THREAD_IDS; do
  COMMENT_INFO=$(gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/comments \
    --jq ".[] | select(.id == $COMMENT_ID) | {position: .position, node_id: .node_id}")
  POSITION=$(echo "$COMMENT_INFO" | jq -r '.position')
  NODE_ID=$(echo "$COMMENT_INFO" | jq -r '.node_id')

  if [ "$POSITION" = "null" ] && [ -n "$NODE_ID" ] && [ "$NODE_ID" != "null" ]; then
    gh api graphql -f query="mutation { resolveReviewThread(input: {threadId: \"$NODE_ID\"}) { thread { isResolved } } }" 2>/dev/null
  fi
done
```

**규칙**:
- reply를 달지 않은 코멘트는 절대 resolve하지 않음
- outdated가 아닌(`position != null`) 코멘트는 resolve하지 않음
- resolve 결과를 카운트하여 라운드 요약에 `resolved: {n}건` 표시

---

### Step 6: 반복 판단

푸시 후 CI가 `pr-review-fu.yml` 워크플로우를 트리거합니다.
이 워크플로우는 내부적으로 `/pipeline:pr-review-fu #{PR번호}`를 실행하여:
1. 이전 리뷰 지적 항목의 해결 여부 추적 (🔴 Must Fix / 🟡 Should Fix)
2. 마지막 AI 리뷰 이후 push된 새 코드에 대한 증분 리뷰
3. 종합 판정: APPROVED / CHANGES_REQUESTED

CI 리뷰가 완료될 때까지 **대기**한 뒤 결과를 확인합니다.

**6-1. CI 리뷰 상태 확인** (푸시 후 1~3분 대기 후 조회):

```bash
# 최신 Bot 리뷰의 승인 상태 확인
REVIEW_STATE=$(gh api repos/$OWNER_REPO/pulls/$PR_NUMBER/reviews \
  --jq '[.[] | select(.user.type == "Bot" or (.body | test("Must Fix|PR 리뷰 결과|증분 리뷰")))] | last | .state')
```

**6-2. 분기**:

- **`APPROVED`** → ✅ 승인됨. **Step 7(완료)로 이동**.
- **`CHANGES_REQUESTED`** → 🔴 Must Fix 미해결. **Step 1로 돌아가서 반복**.
- **`COMMENTED`** → 🟡 권고만 남음 (Must Fix 없음). **사용자에게 판단 요청**:
  ```
  🟡 리뷰 결과: Must Fix 없음, 권고(🟡) {n}건 남음.
  추가 대응하시겠습니까? (y → Step 1로 반복 / n → Step 7로 완료)
  ```
- **리뷰 미완료** (CI 아직 실행 중) → 2분 대기 후 재조회 (최대 3회).
- **최대 5라운드** 도달 시 → 사용자에게 수동 전환 제안.

---

### Step 7: 완료 처리

**CI 리뷰에서 `APPROVED`를 받았을 때만** done 처리합니다.

[PIPELINE:review_loop:done]
[PIPELINE:done:done]

```
🎉 리뷰 승인! 루프 완료.

📋 태스크: {TASK_ID}
🔗 PR: {PR URL}
🔄 리뷰 라운드: {n}회
✅ 수용: {총 수용}건 | ⚠️ 부분: {총 부분}건 | ❌ 거절: {총 거절}건
판정: ✅ 승인 — 🔴 Must Fix 전부 해결
```

---

## 주의사항

- **커밋/푸시는 반드시 사용자 확인 후에만 실행** — 자동 커밋/푸시 절대 금지
- prod 브랜치 관련 명령 일체 금지
- 한국어로만 대화
- 리뷰어 식별: `user.type == "Bot"` 또는 리뷰 본문에 `Must Fix|PR 리뷰 결과|증분 리뷰` 패턴
