/**
 * 파이프라인 phase 전환 로직. runPipeline 에서 추출한 순수 함수 모음.
 *
 * - `PHASE_BY_COMMAND`: slash command → done/activate phase 매핑 테이블
 * - `applyPhaseTransition`: store 업데이트 + isRetry 감지 (부수효과 포함)
 * - `markerToPhaseUpdate`: [PIPELINE:xxx] 마커 → store 패치 적용 (순수+부수효과)
 */
import { useTaskStore } from '../../stores/taskStore';
import { messageCache } from '../chatState';
import type { PipelinePhase, PipelinePhaseEntry } from '../../types/task';

/**
 * slash command 로부터 phase 전환 규칙. Claude 가 마커를 emit 하기 전에 앱이
 * 선제적으로 이전 phase 를 done, 다음 phase 를 in_progress 로 마킹해
 * Progress 바 즉시 반응.
 */
export const PHASE_BY_COMMAND: Record<string, { done: string[]; activate: string }> = {
  '/pipeline:dev-implement': { done: ['grill_me', 'save'], activate: 'dev_plan' },
  // Plan 승인 후 재스폰 — dev_plan done 처리하고 implement 활성화.
  // Cortx 내부 전용 (사용자 입력 경로 아님).
  '/pipeline:_approve-plan': { done: ['grill_me', 'save', 'dev_plan'], activate: 'implement' },
  '/pipeline:dev-review-loop': {
    done: ['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr'],
    activate: 'review_loop',
  },
  '/pipeline:pr-review-fu': {
    done: ['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr'],
    activate: 'review_loop',
  },
};

/**
 * Command 실행 직전 호출. store 에 phase 전환을 적용하고 isRetry 여부 반환.
 *
 * isRetry: 활성화하려는 phase 가 이미 in_progress 면 true.
 * Claude 세션에 partial response + 미완료 tool_use 가 남아있어 --resume 시
 * 계획서 단계를 건너뛰고 구현을 이어가는 혼란이 있을 수 있음 → 호출자가
 * resolvedPrompt 앞에 재시작 지시를 prepend.
 */
export function applyPhaseTransition(taskId: string, command: string): { isRetry: boolean } {
  const baseCmd = command.split(/\s+/)[0];
  const transition = PHASE_BY_COMMAND[baseCmd];
  if (!transition) return { isRetry: false };

  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!task?.pipeline?.enabled) return { isRetry: false };

  const activateKey = transition.activate as keyof typeof task.pipeline.phases;
  const isRetry = task.pipeline.phases[activateKey]?.status === 'in_progress';
  const now = new Date().toISOString();
  const phases = { ...task.pipeline.phases };

  for (const p of transition.done) {
    const key = p as keyof typeof phases;
    if (phases[key] && phases[key].status !== 'done') {
      phases[key] = { ...phases[key], status: 'done', completedAt: now };
    }
  }
  phases[activateKey] = {
    ...(phases[activateKey] || {}),
    status: 'in_progress',
    startedAt: now,
  };

  useTaskStore.getState().updateTask(taskId, { pipeline: { ...task.pipeline, phases } });
  return { isRetry };
}

/**
 * Claude 가 스트림으로 emit 한 [PIPELINE:phase:status:memo?] 마커 1개를 파싱해
 * task.pipeline 에 반영. 유효성 검증은 호출자가 했다고 가정 (validPhaseKeys).
 *
 * 부수효과: store 업데이트 + dev_plan:done 시 devPlan 텍스트 저장 + desktop
 * notification (done 일 때).
 */
export function applyMarkerToStore(
  taskId: string,
  phase: string,
  status: 'in_progress' | 'done' | 'skipped' | 'pending',
  memo: string | undefined,
): void {
  const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
  if (!t?.pipeline?.enabled) return;

  const phases = { ...t.pipeline.phases };
  const entry = { ...(phases[phase as PipelinePhase] || {}) } as PipelinePhaseEntry;
  entry.status = status as PipelinePhaseEntry['status'];
  if (status === 'in_progress') entry.startedAt = new Date().toISOString();
  if (status === 'done' || status === 'skipped') entry.completedAt = new Date().toISOString();
  if (memo) entry.memo = memo;
  phases[phase as PipelinePhase] = entry;

  // Save dev plan — dev_plan:done 시 assistant 메시지 누적본을 devPlan 텍스트로 저장.
  if (phase === 'dev_plan' && status === 'done') {
    const cached = messageCache.get(taskId) || [];
    const planText = cached
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join('\n\n---\n\n');
    useTaskStore
      .getState()
      .updateTask(taskId, { pipeline: { ...t.pipeline, phases, devPlan: planText || t.pipeline.devPlan } });
  } else {
    useTaskStore.getState().updateTask(taskId, { pipeline: { ...t.pipeline, phases } });
  }

  if (status === 'done') {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const PHASE_NAMES: Record<string, string> = {
          grill_me: 'Grill-me',
          save: 'Save',
          dev_plan: 'Dev Plan',
          implement: 'Implement',
          commit_pr: 'PR',
          review_loop: 'Review',
          done: 'Done',
        };
        new Notification('Cortx Pipeline', { body: `${PHASE_NAMES[phase] || phase} completed` });
      }
    } catch {
      /* ignore */
    }
  }
}
