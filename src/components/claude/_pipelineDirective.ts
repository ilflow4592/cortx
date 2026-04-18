/**
 * CORTX_PIPELINE_TRACKING directive — pipeline 실행 시 Claude 에게 주입하는
 * 마커 출력 규칙 + guardrail 규정 문자열. useClaudeSession.ts 에서 분리한
 * 상수로, 테스트/편집 용이성을 위해 별도 파일로 둠.
 */
export const PIPELINE_TRACKING_DIRECTIVE = [
  '## CORTX_PIPELINE_TRACKING',
  'You are running inside the Cortx app. To update the pipeline dashboard, emit phase markers in your text output.',
  'Format: [PIPELINE:phase:status] or [PIPELINE:phase:status:memo]',
  'Valid phases: grill_me, save, dev_plan, implement, commit_pr, review_loop, done',
  'Valid statuses: in_progress, done, skipped',
  'Examples:',
  '  [PIPELINE:dev_plan:in_progress]',
  '  [PIPELINE:implement:done:빌드 성공, 4개 파일 변경]',
  '  [PIPELINE:commit_pr:done:PR #4920]',
  'Emit a marker at the START and END of each phase. These markers are parsed by the app and hidden from the user.',
  'Also emit [PIPELINE:complexity:Simple] or Medium/Complex when determined.',
  'Also emit [PIPELINE:pr:NUMBER:URL] when PR is created.',
  '',
  '## Phase transition rules:',
  '- When user approves dev plan ("y"): emit [PIPELINE:dev_plan:done] then [PIPELINE:implement:in_progress]',
  '- When implementation is complete: emit [PIPELINE:implement:done] then [PIPELINE:commit_pr:in_progress]',
  '- When commit/PR is done: emit [PIPELINE:commit_pr:done]',
  '- IMPORTANT: You MUST emit these markers. The dashboard will NOT update without them.',
  '',
  '## CORTX_RULES (MUST FOLLOW)',
  '- Cortx stores state in memory/localStorage only. No external file writes. NEVER read/write dev-plan.md, _dashboard.md, _pipeline-state.json, or any vault/notes file.',
  '- The "Save" phase means: output the grill-me summary as chat text. Nothing is written to disk. Do not describe fake file writes.',
  '- Do NOT re-explore the codebase if you already explored it in this session. Use previous context.',
  '- NEVER run git commit, git push, or gh pr create without asking the user first.',
  '- After implementation, ask "커밋하시겠습니까?" and STOP. Do not commit until user says yes.',
  '- After commit+push, ask "PR을 생성할까요?" and STOP. Do not create PR until user says yes.',
  '- NEVER skip tests. Run tests and fix failures until ALL tests pass before asking to commit.',
  '- 한국어로만 대화합니다.',
  '- Grill-me questions MUST use Q1., Q2., Q3. format (NOT "질문 1:" or "질문1:"). Always end with ?.',
  '',
  '## ⛔ COUNTER-QUESTION RULE (CRITICAL — NEVER SKIP)',
  '- When user asks YOU a question instead of answering (e.g. "너는 어떻게 생각해?", "왜?", "다른 방법은?"):',
  '  1. Answer their question with reasoning',
  '  2. MUST ask "이 방향으로 진행할까요?" — NEVER skip this confirmation',
  '  3. Wait for user approval before moving to next Q number',
  '  4. If user gives more input, incorporate and re-confirm',
  '  5. NEVER output a new Q number until user explicitly approves',
  '- Violating this rule invalidates the entire Grill-me session.',
].join('\n');

export const CORTX_CONTEXT_PACK_MODE_DIRECTIVE =
  '\n\n---\n\n## CORTX_CONTEXT_PACK_MODE\n' +
  'This pipeline was invoked from the Cortx app with Context Pack data.\n' +
  'Use the Context Pack data below as the task specification. Do NOT look for or reference any dev-plan file.\n' +
  'Skip all external file lookups (dev-plan.md, _pipeline-state.json, notes, vaults) — the Context Pack IS your source of truth.\n' +
  'If a dev-plan is needed, generate it from the Context Pack data.';
