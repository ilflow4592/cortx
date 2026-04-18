/**
 * 활성 phase 에 맞춰 claude_spawn 의 model / effort / disallowedTools /
 * permissionMode / bashTimeoutMs 를 계산. runPipeline.ts 에서 분리한 순수 함수.
 *
 * grill_me / save / dev_plan (GRILLME_PHASES) 에서는 runaway 스캔 차단이
 * 핵심 — Glob/Grep/find/rg/ag/tree/ls:* 를 CLI 레벨에서 막고, Context Pack 에
 * 이미 fullText 가 있는 소스에 대응하는 MCP 서버는 재조회 낭비 제거.
 */
import type { ContextItem } from '../../types/contextPack';
import type { PipelineState, PipelinePhase } from '../../types/task';

const GRILLME_PHASES: ReadonlyArray<PipelinePhase> = ['grill_me', 'save', 'dev_plan'];

export interface SpawnPermissions {
  selectedModel: string | null;
  selectedEffort: 'medium';
  disallowedTools: string[] | null;
  activePhase: PipelinePhase | undefined;
  permissionMode: 'plan' | 'bypassPermissions';
  bashTimeoutMs: number | null;
}

export function computeSpawnPermissions(
  pipeline: PipelineState | undefined,
  contextItems: ContextItem[],
): SpawnPermissions {
  const phases = pipeline?.phases;
  const activePhase = phases
    ? (Object.keys(phases) as PipelinePhase[]).find((p) => phases[p]?.status === 'in_progress')
    : undefined;

  // Model: dev_plan / implement / review_loop → Sonnet. 그 외 (grill_me/save) → default(Opus).
  const activePhaseForModel = phases
    ? (['dev_plan', 'implement', 'review_loop'] as const).find((p) => phases[p]?.status === 'in_progress')
    : undefined;
  const selectedModel = activePhaseForModel ? 'claude-sonnet-4-6' : null;

  let disallowedTools: string[] | null = null;
  if (activePhase && GRILLME_PHASES.includes(activePhase)) {
    const hasUnfetched = (pattern: RegExp) =>
      contextItems.some((i) => i.url && pattern.test(i.url) && !i.metadata?.fullText);
    const tools: string[] = [];
    if (!hasUnfetched(/notion\.(so|site)/)) tools.push('mcp__notion__*');
    if (!hasUnfetched(/slack\.com/)) tools.push('mcp__slack__*');
    if (!hasUnfetched(/github\.com\/[^/]+\/[^/]+\/(issues|pull)\//)) tools.push('mcp__github__*');
    // dev_plan/grill_me/save 단계 하드 차단 목록:
    // - Serena MCP: LSP 인덱싱 수 분, 첫 symbol 쿼리 hang.
    // - Glob/Grep: 모노레포 전체 스캔 시 수 분 소요. Read 로 충분.
    // - Task/Agent: subagent spawn 오버헤드 30초+ 가 실제 작업보다 큼.
    // - Bash(find/grep/rg/ag/ls -R/tree): Claude 가 Glob 차단을 shell 로
    //   우회해 `find -type f -name ...` 같은 워크트리 전체 스캔을 돌리는
    //   실측 케이스. 동일 목적이므로 Bash 레벨에서도 막음.
    // 일반 Bash (git status, ./gradlew 등) 는 여전히 허용.
    tools.push(
      'mcp__serena__*',
      'Glob',
      'Grep',
      'Task',
      'Agent',
      'Bash(find:*)',
      'Bash(grep:*)',
      'Bash(rg:*)',
      'Bash(ag:*)',
      'Bash(fd:*)',
      'Bash(tree:*)',
      'Bash(ls:*)',
    );
    disallowedTools = tools.length > 0 ? tools : null;
  }

  const permissionMode: 'plan' | 'bypassPermissions' = activePhase === 'dev_plan' ? 'plan' : 'bypassPermissions';

  const bashTimeoutMs = activePhase && GRILLME_PHASES.includes(activePhase) ? 30000 : null;

  return {
    selectedModel,
    selectedEffort: 'medium',
    disallowedTools,
    activePhase,
    permissionMode,
    bashTimeoutMs,
  };
}
