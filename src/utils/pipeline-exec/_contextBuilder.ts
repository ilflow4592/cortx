/**
 * Claude 에 주입할 contextSummary 블록 생성. runPipeline 에서 추출.
 *
 * 구성:
 *  1. CORTX_PIPELINE_TRACKING (항상) — phase 마커 emit 지시
 *  2. isFreshStart 일 때만:
 *     - CORTX_RULES — 커밋/PR 승인 / 한국어 / Grill-me 포맷 등
 *     - CORTX_PROJECT_CONTEXT — project-context.md 본문 (있을 때)
 *     - CORTX_CONTEXT_PACK_MODE — Notion/Slack/GitHub/Pin fullText
 *
 * Continuation (--resume) 일 때는 이미 이전 세션 시스템 프롬프트에 포함됐으므로
 * PIPELINE_TRACKING 만 남기고 나머지 skip (동일 17KB+ 재파싱 방지).
 */
import { invoke } from './tauri';

export interface ContextPackItem {
  sourceType?: string;
  title: string;
  summary?: string;
  url?: string;
  metadata?: { fullText?: string };
}

async function loadProjectContextMd(cwd: string): Promise<string> {
  try {
    const ctxRes = await invoke<{ success: boolean; output: string }>('run_shell_command', {
      cwd: '/',
      command: `cat "${cwd}/.cortx/project-context.md" 2>/dev/null`,
    });
    if (ctxRes.success && ctxRes.output.trim()) return ctxRes.output;
  } catch {
    /* no project-context.md yet */
  }
  return '';
}

export async function buildContextSummary(
  cwd: string,
  isFreshStart: boolean,
  contextItems: ContextPackItem[],
): Promise<string> {
  const summaryParts: string[] = [
    '## CORTX_PIPELINE_TRACKING',
    'You are running inside the Cortx app. To update the pipeline dashboard, emit phase markers in your text output.',
    'Format: [PIPELINE:phase:status] or [PIPELINE:phase:status:memo]',
    'Valid phases: grill_me, save, dev_plan, implement, commit_pr, review_loop, done',
    'Valid statuses: in_progress, done, skipped',
    'Examples:',
    '- When starting grill-me: emit [PIPELINE:grill_me:in_progress]',
    '- When grill-me is complete: emit [PIPELINE:grill_me:done]',
    '- When dev plan starts: emit [PIPELINE:dev_plan:in_progress]',
    '- When commit/PR is done: emit [PIPELINE:commit_pr:done]',
    '- IMPORTANT: You MUST emit these markers. The dashboard will NOT update without them.',
  ];

  if (!isFreshStart) return summaryParts.join('\n');

  summaryParts.push(
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
    '- Grill-me 첫 질문(**Q1.**) 출력 전까지 Grep/Glob/Read/Bash 호출 금지. project-context.md와 Context Pack fullText만 사용.',
    '- Context Pack에 Notion/Slack/GitHub fullText가 있으면 해당 MCP 도구 재호출 금지 (mcp__notion__*, mcp__slack__*, mcp__github__*).',
  );

  // Pre-load project-context.md (중복 주입 방지: continuation 때는 이미 이전 세션에 포함)
  const projectContextMd = cwd ? await loadProjectContextMd(cwd) : '';
  if (projectContextMd) {
    summaryParts.push('', '---', '', '## CORTX_PROJECT_CONTEXT (pre-loaded)');
    summaryParts.push('project-context.md가 이미 아래에 포함돼 있습니다. 같은 파일을 Read 도구로 다시 읽지 마세요.');
    summaryParts.push('Tech Stack, Rule Files, 임베드된 CLAUDE.md/AGENTS.md 본문이 모두 포함됨.');
    summaryParts.push('', projectContextMd);
  }

  if (contextItems.length > 0) {
    summaryParts.push('', '---', '', '## CORTX_CONTEXT_PACK_MODE');
    summaryParts.push('This pipeline was invoked from the Cortx app with Context Pack data.');
    summaryParts.push(
      'Use the Context Pack data below as the task specification. Do NOT look for or reference any dev-plan file.',
    );
    summaryParts.push(
      'Skip all external file lookups (dev-plan.md, _pipeline-state.json, notes, vaults) — the Context Pack IS your source of truth.',
    );
    summaryParts.push('If a dev-plan is needed, generate it from the Context Pack data.');
    const sourceLabels: Record<string, string> = {
      github: 'GitHub',
      slack: 'Slack',
      notion: 'Notion',
      pin: 'Pinned',
    };
    const bySource: Record<string, ContextPackItem[]> = {};
    for (const item of contextItems) {
      const key = item.sourceType || 'other';
      (bySource[key] ??= []).push(item);
    }
    for (const [source, items] of Object.entries(bySource)) {
      const label = sourceLabels[source] || source;
      const lines = items.map((item) => {
        const parts = [`- **${item.title}**`];
        if (item.summary && item.summary !== 'Pinned') parts.push(`  ${item.summary}`);
        const hasFullText = !!item.metadata?.fullText;
        // fullText가 있으면 URL은 감춤 — Claude가 원본 URL을 보고 MCP로 재조회하는 유인 제거
        if (item.url && item.url.startsWith('http') && !hasFullText) parts.push(`  ${item.url}`);
        if (hasFullText) {
          parts.push(`\n<!-- 본문 이미 포함됨 — ${label} MCP로 재조회 금지 -->\n${item.metadata!.fullText}`);
        }
        return parts.join('\n');
      });
      summaryParts.push('', `## ${label}`, ...lines);
    }
  }

  return summaryParts.join('\n');
}
