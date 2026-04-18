/**
 * Pipeline session helpers — useClaudeSession.ts 에서 분리한 파이프라인 전용
 * 헬퍼. 순수하게 store 만 읽고 쓰므로 별도 모듈로 분리해 테스트 용이성 ↑.
 *
 * - ensurePipelineInitialized: pipeline 첫 호출 시 default phases 구성
 * - selectModelForPhase: 현재 phase 에 따라 Sonnet/Opus 선택
 * - resolveTextForSession: resume vs 첫 메시지 분기 (skill 해석 포함)
 */
import { useTaskStore } from '../../stores/taskStore';
import type { PipelinePhase, PipelinePhaseEntry } from '../../types/task';
import { resolveSlashCommand } from './_slashResolver';

export function ensurePipelineInitialized(taskId: string): void {
  const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (currentTask && !currentTask.pipeline?.enabled) {
    const defaultPhases: Record<PipelinePhase, PipelinePhaseEntry> = {
      grill_me: { status: 'in_progress', startedAt: new Date().toISOString() },
      save: { status: 'pending' },
      dev_plan: { status: 'pending' },
      implement: { status: 'pending' },
      commit_pr: { status: 'pending' },
      review_loop: { status: 'pending' },
      done: { status: 'pending' },
    };
    useTaskStore.getState().updateTask(taskId, {
      pipeline: { enabled: true, phases: defaultPhases },
    });
  }
  const taskNow = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (taskNow && (taskNow.status === 'waiting' || taskNow.status === 'paused')) {
    useTaskStore.getState().startTask(taskId);
  }
}

export function selectModelForPhase(taskId: string): string | null {
  const currentPipeline = useTaskStore.getState().tasks.find((t) => t.id === taskId)?.pipeline;
  if (currentPipeline?.phases?.implement?.status === 'in_progress') {
    return 'claude-sonnet-4-6'; // Implementation: Sonnet (cost-effective)
  }
  return null; // Grill-me, Dev Plan, Review: Opus (default)
}

/**
 * Resume 세션에는 skill 해석을 건너뛰고 pipeline args 만 자동 채움.
 * 첫 메시지에는 전체 skill 파일 해석.
 */
export async function resolveTextForSession(
  text: string,
  taskId: string,
  cwd: string,
  hasExistingSession: boolean,
): Promise<string> {
  if (!hasExistingSession) {
    return resolveSlashCommand(text, taskId, cwd);
  }
  const parts = text.startsWith('/') ? text.slice(1).split(/\s+/) : [];
  const cmdName = parts[0] || '';
  let args = parts.slice(1).join(' ');
  if (cmdName.startsWith('pipeline:') && !args.trim()) {
    const t = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    if (t) args = `${t.branchName || ''} ${t.title || ''}`.trim();
  }
  return args ? `/${cmdName} ${args}` : text;
}
