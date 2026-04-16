# dev-implement — 개발 계획 + 구현 + 테스트 + **승인 후** 커밋/PR

⛔ **prod 브랜치 절대 접근 금지**

Context Pack의 스펙을 기반으로 개발 계획을 수립하고, 구현 및 테스트까지 수행합니다.
커밋·push·PR은 **각 단계마다 사용자 승인이 있어야만** 진행합니다 (자동 완주 금지).

## 절대 규칙 (반드시 준수)

### 컨텍스트

- **이전 대화(Grill-me) 컨텍스트를 우선 활용**하여 바로 개발 계획을 수립합니다.
- 단, 구현 대상 파일의 정확한 시그니처·최신 상태 확인을 위한 **최소 범위 Read/Grep은 허용**합니다.
- **광범위한 재탐색(무관 모듈 탐색, 코드베이스 전체 스캔)은 금지**합니다.
- dev-plan.md 파일을 찾지 마세요. Cortx는 어떤 파일도 외부에 저장하지 않습니다 (memory/localStorage만 사용).

### 브랜치

- Cortx가 task 생성 시점에 `.worktrees/<branch>/`에 **`feat/{TASK_ID}` 브랜치를 이미 생성**해둡니다. 이 스킬 실행 시점에 해당 브랜치에서 작업 중이어야 정상입니다.
- ⛔ **브랜치 조작 명령 절대 금지**: `git checkout -b`, `git switch`, `git branch -D`, `git checkout <다른-브랜치>` 등.
- **확인은 읽기 명령만** 허용: `git branch --show-current`, `git status`.
- 현재 브랜치가 `feat/{TASK_ID}`가 아니면 **사용자에게 보고하고 중단**. 임의 복구 시도 금지.

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

| #   | 파일 | 변경 유형 | 설명 |
| --- | ---- | --------- | ---- |

### 구현 순서

1. ...

### 테스트 계획

| #   | 테스트 클래스 | 대상 | 테스트 항목 |
| --- | ------------- | ---- | ----------- |

계획대로 진행할까요? (y/수정사항)
```

**사용자가 "y" 또는 승인하면 반드시 아래 마커를 출력한 뒤 다음 단계로 진행합니다:**

[PIPELINE:dev_plan:done]

### Step 1.5: 브랜치 확인 (생성 금지, 확인만)

[PIPELINE:implement:in_progress]

Cortx가 task 생성 시점에 `.worktrees/<branch>/`에 `feat/{TASK_ID}` 브랜치를 이미 만들어둔 상태입니다. 이 스킬 실행 시점에는 해당 브랜치에서 작업 중이어야 합니다.

**읽기 전용 검증만** 수행:

```bash
git branch --show-current    # → feat/{TASK_ID}
git status                   # 작업 트리 상태 확인
```

- 현재 브랜치가 `feat/{TASK_ID}`가 **아니면**: 상황을 사용자에게 보고하고 **중단**. 임의로 checkout/switch/branch 명령 실행 금지.
- 현재 브랜치가 맞으면: 그대로 Step 2로 진행.

### Step 2: 구현

**Simple**: 메인 컨텍스트에서 직접 구현. **불필요한 반복 Read는 최소화** (수정 전 확인 1회 + 수정 후 검증 1회 정도는 허용).
**Medium/Complex**: Agent(subagent_type="general-purpose", isolation="worktree") 위임.

구현 중간에 컴파일 확인: `./gradlew compileJava`

**코드 품질 규칙**:

- `List<Object[]>` 금지 — JPQL 집계 쿼리는 적절한 DTO/Projection 또는 `Map`으로 반환.
- Repository 반환 타입은 엔티티 또는 명시적 타입을 사용. raw Object 배열 사용 금지.
- 기존 프로젝트의 코드 패턴과 네이밍 컨벤션을 반드시 따를 것.

### Step 2.5: Quality Gate

| #   | 검증 항목                       | 검증 방법                            |
| --- | ------------------------------- | ------------------------------------ |
| 1   | 빌드 성공                       | `./gradlew compileJava`              |
| 2   | `LocalDateTime.now()` 직접 호출 | 변경 파일에서 Grep                   |
| 3   | Service에 `@Transactional` 누락 | 새로 추가/수정된 Service 메서드 확인 |
| 4   | 하드코딩된 토큰/시크릿          | 변경 파일에서 패턴 Grep              |
| 5   | unused import                   | 변경 파일에서 확인                   |

⚠️ 자동 수정 범위:

- **정적 이슈만 자동 수정** (unused import 제거, import 정리, 세미콜론 등 스타일 이슈) — 수정 후 재검증 (최대 2회).
- **설계 변경이 필요한 항목**(`@Transactional` 추가, `Clock` 주입, 시크릿 외부화 등)은 **사용자에게 보고 후 결정**. 임의로 구조 변경 금지.

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
구현이 완료되면 변경 파일 목록 + 테스트 결과 요약을 보여주고 사용자에게 물어봅니다:
"커밋해도 될까요?"
사용자가 승인하면 커밋 + push 진행:

- 우선 `/git:commit` 스킬 사용 (존재 시).
- 스킬이 없거나 실행 실패 시 **수동 fallback**: `git add <변경파일>` → Conventional Commit 메시지로 `git commit -m "..."` → `git push origin HEAD`.

**4-2. PR 생성 확인**
커밋 + push가 완료되면 사용자에게 물어봅니다:
"PR을 생성할까요?"
사용자가 승인하면:

- 우선 `/git:pr` 스킬 사용 (존재 시).
- 스킬이 없거나 실행 실패 시 **수동 fallback**: `gh pr create --base develop --title "..." --body "..."` 실행.

PR 생성 후: [PIPELINE:commit_pr:done:PR #{번호}]
PR 번호/URL 캡처: [PIPELINE:pr:{번호}:{URL}]

### Step 5: 완료 안내

```
✅ 구현 완료

👉 CI 리뷰가 달리면: /pipeline:dev-review-loop
```
