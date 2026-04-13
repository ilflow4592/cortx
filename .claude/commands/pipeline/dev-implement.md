# dev-implement — 개발 계획 수립 + 구현 + 테스트 + 커밋/PR

⛔ **prod 브랜치 절대 접근 금지**

Context Pack의 스펙을 기반으로 개발 계획을 수립하고, 구현 및 테스트 후 PR까지 생성합니다.

## 절대 규칙 (반드시 준수)

### 컨텍스트
- **이전 대화(Grill-me)에서 이미 스펙과 코드 구조를 파악했으므로 다시 탐색하지 마세요.**
- dev-plan.md 파일을 찾지 마세요. Obsidian을 사용하지 않습니다.
- 이전 대화의 컨텍스트를 그대로 활용하여 바로 개발 계획을 수립합니다.
- **현재 작업 브랜치({TASK_ID})만 사용.** 다른 브랜치 참조 금지.

### 구현 승인
- **사용자의 명시적 승인("y", "진행해줘") 없이 구현을 시작하지 마세요.**
- 개발 계획을 보여준 후 반드시 사용자 확인을 기다립니다.
- 사용자가 승인하면 반드시 [PIPELINE:dev_plan:done] 마커를 출력한 후 [PIPELINE:implement:in_progress] 마커를 출력하고 구현을 시작합니다.

### 커밋/푸시/PR 금지
- **절대로 사용자의 허락 없이 git commit, git push, PR 생성을 하지 마세요.**
- 구현이 완료되면 반드시 "커밋하시겠습니까?" 라고 물어보고, 사용자가 승인한 후에만 커밋 + push합니다.
- PR도 마찬가지로 "PR을 생성할까요?" 라고 물어보고 승인 후에만 생성합니다.

### 언어
- 한국어로만 대화합니다.

### 시작 메시지
🔨 **{TASK_ID}** — {TASK_NAME}
이전 Grill-me 결과를 바탕으로 개발 계획을 수립합니다.

## Arguments
- `$ARGUMENTS` — 태스크 ID (필수)

## Execution

### Step 1: 개발 계획 수립

[PIPELINE:dev_plan:in_progress]

**⚡ 복잡도 판별 (필수)**:
- **Simple (1~5 파일)**: 에이전트 사용 금지. 직접 Read + Grep.
- **Medium (6~15 파일)**: Explorer Agent 1개 사용.
- **Complex (15+ 파일)**: Explorer Agent 최대 3개 병렬 사용.

복잡도 판별 후: [PIPELINE:complexity:{Simple|Medium|Complex}]

**필수 준수 원칙**: SOLID, Null Safety, 유지보수성, 기존 패턴 준수

개발 계획을 사용자에게 보여주고 확인을 받습니다:

```markdown
## 개발 계획: {TASK_ID}
### 복잡도: {Simple|Medium|Complex} → 구현 전략: {직접|Agent 위임}
### 변경 파일 목록
| # | 파일 | 변경 유형 | 설명 |
|---|------|----------|------|
### 구현 순서
1. ...
### 테스트 계획
| # | 테스트 클래스 | 대상 | 테스트 항목 |
|---|-------------|------|-----------|

계획대로 진행할까요? (y/수정사항)
```

**사용자가 "y" 또는 승인하면 반드시 아래 마커를 출력한 뒤 다음 단계로 진행합니다:**

[PIPELINE:dev_plan:done]

### Step 1.5: 브랜치 생성

[PIPELINE:implement:in_progress]

```bash
git fetch origin develop
git checkout -b feat/{TASK_ID} origin/develop
```

**항상 origin/develop 기준.** 이미 존재하면 base 확인.

### Step 2: 구현

**Simple**: 메인 컨텍스트에서 직접 구현. 각 파일 최대 1회 Read.
**Medium/Complex**: Agent(subagent_type="general-purpose", isolation="worktree") 위임.

구현 중간에 컴파일 확인: `./gradlew compileJava`

**코드 품질 규칙**:
- `List<Object[]>` 금지 — JPQL 집계 쿼리는 적절한 DTO/Projection 또는 `Map`으로 반환.
- Repository 반환 타입은 엔티티 또는 명시적 타입을 사용. raw Object 배열 사용 금지.
- 기존 프로젝트의 코드 패턴과 네이밍 컨벤션을 반드시 따를 것.

### Step 2.5: Quality Gate

| # | 검증 항목 | 검증 방법 |
|---|----------|----------|
| 1 | 빌드 성공 | `./gradlew compileJava` |
| 2 | `LocalDateTime.now()` 직접 호출 | 변경 파일에서 Grep |
| 3 | Service에 `@Transactional` 누락 | 새로 추가/수정된 Service 메서드 확인 |
| 4 | 하드코딩된 토큰/시크릿 | 변경 파일에서 패턴 Grep |
| 5 | unused import | 변경 파일에서 확인 |

⚠️ 항목은 자동 수정 후 재검증 (최대 2회).

### Step 3: 테스트 실행 및 통과

**반드시 테스트를 실행하고, 전체 통과할 때까지 반복합니다.**

1. 기존 테스트 패턴과 동일 스타일로 테스트 코드 작성/수정
2. `@DisplayName`으로 한국어 테스트명 작성
3. 테스트 실행: `./gradlew :{module}:test --tests "{TestClass}"`
4. **실패하면 코드를 수정하고 다시 실행. 모든 테스트가 통과할 때까지 반복합니다.**
5. 관련 모듈 전체 테스트도 실행하여 기존 테스트가 깨지지 않았는지 확인: `./gradlew :{module}:test`
6. **테스트가 전부 통과한 후에만 Step 4로 진행합니다.** 테스트를 건너뛰지 마세요.

### Step 4: 커밋 & PR 생성

[PIPELINE:implement:done]
[PIPELINE:commit_pr:in_progress]

**⚠️ 중요: 커밋, push, PR 생성을 자동으로 하지 않습니다.**

**4-1. 커밋 확인**
구현이 완료되면 변경 파일 목록을 보여주고 사용자에게 물어봅니다:
"커밋해도 될까요?"
사용자가 승인하면 `/git:commit` 스킬 기반으로 커밋 + push를 진행합니다.

**4-2. PR 생성 확인**
커밋 + push가 완료되면 사용자에게 물어봅니다:
"PR을 생성할까요?"
사용자가 승인하면 `/git:pr` 스킬 기반으로 PR을 생성합니다.

PR 생성 후: [PIPELINE:commit_pr:done:PR #{번호}]
PR 번호/URL 캡처: [PIPELINE:pr:{번호}:{URL}]

### Step 5: 완료 안내

```
✅ 구현 완료

👉 CI 리뷰가 달리면: /pipeline:dev-review-loop
```
