# dev-implement — Plan Mode + 승인 후 구현 + 테스트 + **승인 후** 커밋/PR

⛔ **prod 브랜치 절대 접근 금지**

**⚡ Cortx 는 이 명령을 `--permission-mode plan` 으로 스폰**. 따라서:

- Step 1 단계에서 Write/Edit 이 **CLI 레벨에서 하드 차단**됨. 계획만 작성하면 됨.
- 계획이 완성되면 **`ExitPlanMode` 도구**를 호출하여 제출 → 세션이 자동 종료됨.
- Cortx 가 승인 카드를 렌더하고, 사용자가 "승인" 클릭 시 재스폰 (이때 `bypassPermissions` 로 전환).
- 재스폰 시 `/pipeline:_approve-plan` 로 들어옴 — 그 시점부터 Step 2 (구현) 부터 진행.

## 절대 규칙 (반드시 준수)

### 컨텍스트 (Step 1 탐색 범위)

- **grill-me 결과를 1차 입력**으로 사용. 계획서 초안은 grill-me 에서 확정된 사항만으로 구성 가능해야 함.
- **Read 는 허용** — grill-me 에서 지목된 파일 또는 명백한 참조 대상(예: "NexusQuoteController 패턴 참고")에 한함.
- **⚡ 한 턴 batch 규칙 (필수)**: 여러 파일을 읽어야 하면 **한 번의 응답 안에서 Read 도구 호출을 동시에 나열**하세요 (병렬 실행). 순차적으로 하나씩 호출하지 마세요 — 턴 수만큼 왕복 지연이 누적됩니다.
- Step 1 금지 도구: **Agent, Grep/Glob 전체 스캔, WebFetch, Serena MCP**. 그리고 **Bash 의 `find` / `grep` / `rg` / `ag` / `fd` / `tree` / `ls -R` 같은 파일 탐색 명령도 금지** — 워크트리 전체 순회로 수 분 걸림. grill-me 에서 지목된 파일 경로를 그대로 Read 하거나, 경로 불확실 시 사용자에게 질문.
- **탐색 선언 문구 최소화**. "코드베이스를 확인합니다", "기존 패턴을 파악합니다" 같은 사전 해설 없이 **필요한 Read 를 바로 호출**하고, 결과를 받은 뒤 계획서 템플릿으로 진입.
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

이 메시지 상단에 Cortx가 자동 주입한 **`## 📋 GRILL-ME 결과`** 섹션이 완전한 개발 스펙입니다.
추가 탐색 없이 바로 아래 Step 1 계획서 템플릿을 작성합니다.

## Arguments

- `$ARGUMENTS` — 태스크 ID (필수)

## Execution

### Step 1: 개발 계획 수립

[PIPELINE:save:done]
[PIPELINE:dev_plan:in_progress]

**스펙 입력**: 이 메시지 상단의 두 섹션이 완전한 입력입니다:

1. `## 📋 GRILL-ME 스펙 요약` — 이전 단계에서 확정된 개발 스펙.
2. `## 📂 소스 파일 경로 맵` — 워크트리의 전체 소스 파일 경로 (`ls` / `find` / `Glob` 대체).

**첫 액션 규칙**: 이 마커 출력 직후, 탐색·확인·분석 선언 없이 **즉시 계획서 작성**:

- GRILL-ME 스펙만으로 계획 초안 작성 가능 → 바로 계획서 템플릿(`## 개발 계획: ...`) 작성.
- 특정 파일 본문 확인이 필요하면 → 경로 맵에서 클래스명 찾아 **필요한 Read 를 한 응답 안에 batch** (병렬 Read tool_use 동시 emit). 순차 호출 금지.
- **디렉토리 구조 확인 금지** — 경로는 이미 맵에 전부 있습니다. `Bash: ls`, `find`, `Glob`, `Grep`, Agent, Serena MCP 전부 금지.

**⚠️ 중요: grill-me 스펙 ≠ 개발 계획서**. grill-me에서 작성한 구현 범위·엣지 케이스·테스트 전략은 **입력 정보**이고, 여기서 만들 것은 **구체적 변경 파일 목록 + 구현 순서 + 테스트 계획이 포함된 정식 개발 계획서**입니다. "위에 이미 출력했다" 고 착각하지 마세요 — **아래 템플릿 형식으로 반드시 새로 출력**해야 합니다.

**⚡ 복잡도 판별 (필수)**:

파일 수 **와** 변경 성격을 함께 보고 판정. 둘 중 더 높은 기준을 적용.

| 복잡도      | 파일 수 | 변경 성격                                                                                          |
| ----------- | ------- | -------------------------------------------------------------------------------------------------- |
| **Simple**  | 1~5     | 단순 로직/뷰/문구 수정, rename, 단일 레이어 내 변경                                                |
| **Medium**  | 6~15    | 여러 레이어 병행(service+repository+controller+test), DTO 추가·변경, 기존 패턴 확장                |
| **Complex** | 15+     | 데이터 모델 변경, 트랜잭션·동시성·비동기 도입, 외부 시스템 연동, 광범위 테스트 영향, 아키텍처 변경 |

파일 수는 적어도 **변경 성격이 Complex**면 Complex로 판정. 예: 파일 3개만 바꿔도 트랜잭션 경계/도메인 이벤트 신설이면 Complex. 반대로 파일 10개라도 전부 단순 string replace면 Simple.

복잡도 판별 후: [PIPELINE:complexity:{Simple|Medium|Complex}]

**⛔ Step 1 금지 도구**: Agent, Grep/Glob 전체 스캔, WebFetch, Serena MCP (`mcp__serena__*`).

❌ **위반 예시**:

- "Serena 로 심볼 구조를 파악하겠습니다." → mcp**serena**\* 호출
- "Agent 로 코드베이스를 탐색하겠습니다." → Agent 호출
- 여러 파일이 필요한데 Read 를 **턴마다 1개씩 순차 호출** → 왕복 지연 누적

✅ **올바른 패턴 (한 턴 batch 호출)**:

- 파일 다수 필요 → 한 응답에 **Read tool_use 를 병렬로 동시 emit**. 예: `NexusQuoteController.java`, `NexusQuoteControllerTest.java`, `build.gradle` 을 하나의 응답에서 동시 Read.
- 결과 한 번에 수집 → 바로 `## 개발 계획: {TASK_ID}` 템플릿 작성.
- 파일 불필요하면 선언 문구 없이 바로 계획서.

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
```

**Plan Mode 에서는 이 계획을 채팅에 출력한 뒤 `ExitPlanMode` 도구로 제출**. 계획 본문과 동일한 markdown 을 `plan` 필드로 넘기세요. 사용자에게 "진행할까요?" 라고 물어볼 필요 없음 — Cortx 가 승인 카드를 렌더하여 사용자가 버튼으로 승인합니다. 세션은 ExitPlanMode 후 자동 종료되며, 승인 시 `/pipeline:_approve-plan` 로 재스폰됩니다.

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

**복잡도별 구현 전략**:

- **Simple (1~5 파일)**: 메인 컨텍스트에서 직접 구현. 에이전트 사용 금지. 불필요한 반복 Read 최소화 (수정 전 확인 1회 + 수정 후 검증 1회 허용).
- **Medium (6~15 파일)**: Explorer Agent 1개로 변경 대상 파일 구조 파악 후 직접 구현, 또는 Agent(subagent_type="general-purpose", isolation="worktree") 위임.
- **Complex (15+ 파일)**: Explorer Agent 최대 3개 병렬(계층별 분배) 후 Implementer Agent 위임.

**빌드 확인**: project-context.md의 `## Build & Test Commands` 섹션에 명시된 Build 명령 사용 (Tech Stack 감지 결과 기반 자동 생성됨).

**코드 품질 규칙**:

- **기존 프로젝트의 코드 패턴과 네이밍 컨벤션을 반드시 따를 것** — CLAUDE.md/AGENTS.md에 명시된 규칙이 최우선.
- Null Safety, SOLID, 유지보수성 준수.
- 프로젝트별 특수 규칙(JPQL 집계 반환, Repository 타입 등)은 해당 프로젝트 CLAUDE.md 참조.

**파일 삭제 규칙**: Cortx 환경은 `rm` / `git rm` 명령이 훅으로 차단됨. 파일을 제거해야 할 땐:

1. 워크트리 루트의 **`.cortx/trash/{YYYYMMDD-HHMMSS}/<원본 상대경로>`** 로 `mv` 이동.
   - 예: `src/main/java/.../CountryController.java` → `.cortx/trash/20260420-103000/src/main/java/.../CountryController.java`
   - timestamp 디렉토리는 `date +%Y%m%d-%H%M%S` 로 생성.
2. `.cortx/trash/` 는 `.gitignore` 에 등록되어 있어 commit/PR 에는 "파일 삭제됨" 으로만 기록됨.
3. 같은 세션에서 여러 파일 삭제 시 **동일 timestamp 디렉토리 재사용** 가능.
4. ⛔ 절대 금지: `rm`, `rm -rf`, `git rm`, `find ... -delete`. 파일 내용을 빈 껍데기로 덮어쓰는 우회도 금지 — 반드시 `mv` 사용.

**Lombok 우선 사용 (Java 프로젝트)**: `build.gradle`/`pom.xml` 에 `lombok` 의존성이 있으면 boilerplate 를 Lombok 어노테이션으로 대체:

- ✅ 허용: `@Getter`, `@AllArgsConstructor`, `@NoArgsConstructor`, `@RequiredArgsConstructor`, `@Builder`, `@ToString`, `@EqualsAndHashCode`, `@Slf4j`, `@Value`.
- ⛔ **`@Setter` / `@Data` 사용 금지** — 불변성 훼손 (`@Data` 는 `@Setter` 포함). 필드 변경이 필요하면 생성자 / Builder / 명시적 도메인 메서드로 구현.
- 기준: 동일한 boilerplate 를 Lombok 으로 대체 가능하면 항상 어노테이션 우선. 기존 파일에 수동 getter/constructor 가 있으면 **신규 코드에만 Lombok 적용** (기존 코드 대량 리팩터링 금지 — 변경 범위 최소화 원칙 유지).

### Step 2.5: Quality Gate

**공통 (언어 독립)**:

| #   | 검증 항목              | 검증 방법                                |
| --- | ---------------------- | ---------------------------------------- |
| 1   | 빌드 성공              | project-context.md의 Build 명령 실행     |
| 2   | 하드코딩된 토큰/시크릿 | 변경 파일에서 패턴 Grep (sk-, ghp\_, 등) |
| 3   | unused import          | 변경 파일에서 확인                       |

**프로젝트별 추가 규칙**: CLAUDE.md/AGENTS.md의 "Quality Gate" 또는 "Immediate Rules" 섹션에 정의된 항목 추가 검사.
예: Java/Spring 프로젝트면 `LocalDateTime.now()` 직접 호출 금지, Service `@Transactional` 누락 등 — **해당 프로젝트 CLAUDE.md에 명시돼 있을 때만** 검사.

⚠️ 자동 수정 범위:

- **정적 이슈만 자동 수정** (unused import 제거, import 정리, 세미콜론 등 스타일 이슈) — 수정 후 재검증 (최대 2회).
- **설계 변경이 필요한 항목**(`@Transactional` 추가, `Clock` 주입, 시크릿 외부화 등)은 **사용자에게 보고 후 결정**. 임의로 구조 변경 금지.

### Step 3: 테스트 실행 및 통과

**반드시 테스트를 실행하고, 전체 통과할 때까지 반복합니다.**

1. 기존 테스트 패턴과 동일 스타일로 테스트 코드 작성/수정 (Java/Spring이면 `@DisplayName` 한국어 등, 프로젝트 관례 유지).
2. 테스트 실행: **project-context.md의 `## Build & Test Commands` 섹션 참조.** 예:
   - Gradle: `./gradlew :{module}:test --tests "{TestClass}"`
   - npm: `npm test` 또는 `npx vitest run {path}`
   - pytest: `pytest {path}::{Class}::{method}`
   - cargo: `cargo test {name}`
   - go: `go test ./{pkg}`

   `{module}` 결정 가이드: settings 파일(`settings.gradle`, `pom.xml`, `package.json` workspaces 등)에서 **실제 변경 파일이 속한** 모듈 이름을 확인해 사용. 추측 금지.

3. **실패하면 코드를 수정하고 다시 실행. 모든 테스트가 통과할 때까지 반복합니다.**
4. 관련 모듈 전체 테스트도 실행하여 기존 테스트가 깨지지 않았는지 확인 (Build & Test Commands의 "Test (all)" 명령).
5. **테스트가 전부 통과한 후에만 Step 4로 진행합니다.** 테스트를 건너뛰지 마세요.

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
