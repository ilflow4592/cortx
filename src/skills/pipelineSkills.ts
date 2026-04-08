// Cortx-specific pipeline skill templates
// These replace the Obsidian-based versions when running inside the Cortx app.
// Key differences: Context Pack as source of truth, [PIPELINE:*] markers for dashboard, no Obsidian I/O.

export const CORTX_SKILLS: Record<string, string> = {
  'pipeline/dev-task': `# dev-task — Grill-me + 개발 계획서 작성

⛔ **prod 브랜치 절대 접근 금지**

Context Pack의 태스크 스펙을 기반으로 Grill-me 대화를 진행하고 개발 계획서를 작성합니다.

## 중요 규칙
- **가장 먼저** 아래 형식으로 시작 메시지를 출력합니다:
  \`\`\`
  📋 **{TASK_ID}** — {TASK_NAME}
  파이프라인을 시작합니다. Context Pack을 확인하고 코드베이스를 탐색합니다.
  \`\`\`
- **코드베이스 스캔은 Step 0에서 1회만 수행**합니다. Grill-me 대화 중 추가 스캔하지 마세요.
- Grill-me 중에는 질문에만 집중하고, 코드베이스 재탐색 없이 이미 파악한 내용으로 대화합니다.
- **반드시 한 질문씩만 하고, 사용자의 명시적 확인/답변을 받은 후에만 다음 질문으로 넘어갑니다.** 사용자가 답변하지 않은 내용을 스스로 판단하여 넘어가지 마세요.
- **질문에 대한 답변 또는 역질문에 대한 설명을 한 후, "답변이 되었을까요?" 라고 물어보세요.** 사용자가 되었다고 하면 다음 질문으로 넘어가고, 추가 질문이 있으면 이어서 답변합니다.
- **코드에서 직접 확인 가능한 내용은 질문하지 마세요.** "확인 차원"이라며 사용자에게 답변을 요구하지 마세요. 코드로 알 수 있는 건 직접 확인하고, 사용자에게는 비즈니스 판단이 필요한 질문만 합니다.
- **기술적 구현 방식(매퍼 시그니처, DTO 패턴, 쿼리 방식 등)은 혼자 판단하세요.** 기존 코드 패턴을 따르면 되는 기술적 결정은 사용자에게 묻지 마세요.
- **현재 작업 브랜치({TASK_ID})의 코드만 기준으로 판단하세요.** 다른 브랜치(예: -test, -backup 등)의 커밋이나 코드를 참조하지 마세요. git log나 git branch로 다른 브랜치를 탐색하지 마세요.
- 한국어로만 대화합니다.

## Arguments
- \`$ARGUMENTS\` — 업무번호(BE-XXXX)와 태스크 설명

## Execution

### Step 0: 컨텍스트 확인

[PIPELINE:grill_me:in_progress]

Context Pack에 제공된 내용(Notion 페이지, Slack 메시지 등)을 읽고 태스크 스펙을 파악합니다.
- 스펙에 오기/모순이 있을 수 있으므로 코드베이스와 교차 검증 필수
- Context Pack에 충분한 정보가 없으면 사용자에게 보충을 요청

### Step 1: Grill-me 대화

1. 모든 질문과 대화는 **한국어**로 진행
2. **한 번에 하나의 질문**만 합니다
3. 코드베이스에서 답을 찾을 수 있는 질문은 직접 코드를 탐색하여 먼저 확인
4. 코드베이스에서 확인/추측한 결과를 먼저 제시하고, 비즈니스 의도/판단만 질문
5. 도메인 문서는 도메인 비즈니스 태스크에서만 참조

**질문 영역**: 요구사항 명확화 → 기술적 제약 → 설계 결정 → 엣지 케이스 → 테스트 전략

"끝", "완료", "다음", "done" 입력 시 Step 2로 진행.

### Step 2: Grill-me 결과 정리

[PIPELINE:grill_me:done]
[PIPELINE:obsidian_save:in_progress]

대화 결과를 구조화하여 정리합니다:
- 요구사항 요약
- 기술적 결정사항
- 구현 범위 (예상 변경 파일)
- 엣지 케이스
- 테스트 전략

사용자에게 정리된 내용을 보여줍니다.

[PIPELINE:obsidian_save:done]

### Step 3: 다음 단계 안내

\`\`\`
✅ Grill-me 완료 & 스펙 정리 완료

👉 다음 단계: /pipeline:dev-implement
(개발 계획 수립 → 사용자 확인 → 구현)
\`\`\`
`,

  'pipeline/dev-implement': `# dev-implement — 개발 계획 수립 + 구현 + 테스트 + 커밋/PR

⛔ **prod 브랜치 절대 접근 금지**

Context Pack의 스펙을 기반으로 개발 계획을 수립하고, 구현 및 테스트 후 PR까지 생성합니다.

## 중요 규칙
- **가장 먼저** 아래 형식으로 시작 메시지를 출력합니다:
  \`\`\`
  🔨 **{TASK_ID}** — {TASK_NAME}
  구현 파이프라인을 시작합니다. Context Pack 스펙을 확인합니다.
  \`\`\`
- 한국어로만 대화합니다.
- **절대로 사용자의 명시적 승인("y", "진행해줘", "ㅇㅇ" 등) 없이 구현을 시작하지 마세요.** 개발 계획을 보여준 후 반드시 사용자 확인을 기다립니다.
- "어떻게 개발할지 보여줘", "코드로 보여줘" 같은 요청은 개발 계획을 보여달라는 뜻이지, 바로 구현하라는 뜻이 아닙니다.
- **현재 작업 브랜치({TASK_ID})의 코드만 기준으로 판단하세요.** 다른 브랜치의 커밋이나 코드를 참조하지 마세요.

## Arguments
- \`$ARGUMENTS\` — 태스크 ID (필수)

## Execution

### Step 0: 컨텍스트 확인

[PIPELINE:dev_plan:in_progress]

**이전 대화(Grill-me)에서 이미 스펙과 코드 구조를 파악했으므로 다시 탐색하지 마세요.**
이전 대화의 컨텍스트를 그대로 활용하여 개발 계획을 수립합니다.
dev-plan.md 파일을 찾지 마세요 — Cortx 앱에서는 Obsidian을 사용하지 않습니다.

### Step 1: 개발 계획 수립

**⚡ 복잡도 판별 (필수)**:
- **Simple (1~5 파일)**: 에이전트 사용 금지. 직접 Read + Grep.
- **Medium (6~15 파일)**: Explorer Agent 1개 사용.
- **Complex (15+ 파일)**: Explorer Agent 최대 3개 병렬 사용.

복잡도 판별 후: [PIPELINE:complexity:{Simple|Medium|Complex}]

**필수 준수 원칙**: SOLID, Null Safety, 유지보수성, 기존 패턴 준수

개발 계획을 사용자에게 보여주고 확인을 받습니다:

\`\`\`markdown
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
\`\`\`

**사용자가 "y" 또는 승인하면 반드시 아래 마커를 출력한 뒤 다음 단계로 진행합니다:**

[PIPELINE:dev_plan:done]

### Step 1.5: 브랜치 생성

[PIPELINE:implement:in_progress]

\`\`\`bash
git fetch origin develop
git checkout -b feat/{TASK_ID} origin/develop
\`\`\`

**항상 origin/develop 기준.** 이미 존재하면 base 확인.

### Step 2: 구현

**Simple**: 메인 컨텍스트에서 직접 구현. 각 파일 최대 1회 Read.
**Medium/Complex**: Agent(subagent_type="general-purpose", isolation="worktree") 위임.

구현 중간에 컴파일 확인: \`./gradlew compileJava\`

### Step 2.5: Quality Gate

| # | 검증 항목 | 검증 방법 |
|---|----------|----------|
| 1 | 빌드 성공 | \`./gradlew compileJava\` |
| 2 | \`LocalDateTime.now()\` 직접 호출 | 변경 파일에서 Grep |
| 3 | Service에 \`@Transactional\` 누락 | 새로 추가/수정된 Service 메서드 확인 |
| 4 | 하드코딩된 토큰/시크릿 | 변경 파일에서 패턴 Grep |
| 5 | unused import | 변경 파일에서 확인 |

⚠️ 항목은 자동 수정 후 재검증 (최대 2회).

### Step 3: 테스트 코드 작성

기존 테스트 패턴과 동일 스타일. \`@DisplayName\`으로 한국어 테스트명.
\`./gradlew :{module}:test --tests "{TestClass}"\`

### Step 4: 커밋 & PR 생성

[PIPELINE:implement:done]
[PIPELINE:commit_pr:in_progress]

**⚠️ 중요: 커밋, push, PR 생성을 자동으로 하지 않습니다.**

**4-1. 커밋 확인**
구현이 완료되면 변경 파일 목록을 보여주고 사용자에게 물어봅니다:
"커밋해도 될까요?"
사용자가 승인하면 \`/git:commit\` 스킬 기반으로 커밋 + push를 진행합니다.

**4-2. PR 생성 확인**
커밋 + push가 완료되면 사용자에게 물어봅니다:
"PR을 생성할까요?"
사용자가 승인하면 \`/git:pr\` 스킬 기반으로 PR을 생성합니다.

PR 생성 후: [PIPELINE:commit_pr:done:PR #{번호}]
PR 번호/URL 캡처: [PIPELINE:pr:{번호}:{URL}]

### Step 5: 완료 안내

\`\`\`
✅ 구현 완료

👉 Copilot 리뷰가 달리면: /pipeline:dev-review-loop
\`\`\`
`,

  'pipeline/dev-resume': `# dev-resume — 중단된 파이프라인 재개

⛔ **prod 브랜치 절대 접근 금지**

Cortx 앱 Dashboard의 pipeline 상태를 기반으로 중단된 작업을 재개합니다.

## 중요 규칙
- **가장 먼저** 아래 형식으로 시작 메시지를 출력합니다:
  \`\`\`
  🔄 **{TASK_ID}** — {TASK_NAME}
  중단된 파이프라인을 재개합니다. 상태를 분석합니다.
  \`\`\`
- 한국어로만 대화합니다.

## Arguments
- \`$ARGUMENTS\` — 태스크 ID (선택)

## Execution

### Step 1: 상태 분석

**병렬로** 다음을 확인합니다:
1. \`git branch --show-current\`
2. \`git status --short\`
3. \`git log --oneline origin/develop..HEAD\` (브랜치가 있는 경우)

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
3. PR 상태 (\`gh pr view\`)

### Step 4: 실행

자동 재개 가능한 경우 (implement, commit_pr):
사용자에게 재개 계획을 보여주고 확인 후 실행.

수동 재개 필요한 경우:
해당 파이프라인 명령을 안내.

[PIPELINE:{재개단계}:in_progress]
`,
};
