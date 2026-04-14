/**
 * Pipeline phase auto-transition on user approval text.
 *
 * 사용자가 "진행해" / "yes" 등을 입력하면 현재 활성 파이프라인 단계를 다음으로
 * 넘긴다. 기존에는 handleSend 안에서 if-else 3개 블록으로 존재하던 로직을
 * 규칙 테이블로 재구성.
 */
import { useTaskStore } from '../../stores/taskStore';
import { sendNotification } from '../../utils/notification';
import type { PipelinePhase, PipelineState } from '../../types/task';
import type { Message } from './types';

const APPROVAL_WORDS = ['y', 'ㅇ', 'ㅇㅇ', '진행', '진행해', '진행해줘', 'yes', 'ok', '네', '응', '좋아', 'go'];

/** 사용자 입력이 단순 승인 표현인지 판정 (소문자 전체 일치) */
export function isApproval(text: string): boolean {
  return APPROVAL_WORDS.includes(text.toLowerCase());
}

interface TransitionRule {
  /** 현재 `in_progress`여야 하는 단계 */
  from: PipelinePhase;
  /** 전환 후 `in_progress`로 바꿀 다음 단계 (없으면 종결) */
  to?: PipelinePhase;
  /** 마지막 assistant 메시지에 포함돼야 하는 키워드 (OR). 생략 시 무조건 전환 */
  requireKeywords?: string[];
  notifyBody: string;
  /** dev_plan → implement: assistant 메시지 집계를 `devPlan` 필드에 아카이브 */
  archivePlan?: boolean;
}

/**
 * 전환 규칙은 순서대로 평가되며 최초 매치만 적용된다.
 * 규칙 추가 시 이 배열만 수정하면 됨 — if-else 체인 확장 금지.
 */
const TRANSITIONS: TransitionRule[] = [
  {
    from: 'dev_plan',
    to: 'implement',
    notifyBody: 'Dev Plan completed — starting implementation',
    archivePlan: true,
  },
  {
    from: 'implement',
    to: 'commit_pr',
    requireKeywords: ['커밋', 'commit'],
    notifyBody: 'Implementation completed — committing',
  },
  {
    from: 'commit_pr',
    requireKeywords: ['PR', 'pr'],
    notifyBody: 'PR created',
  },
];

/**
 * 사용자 텍스트가 승인어면 현재 활성 단계에 대응하는 규칙을 적용.
 * 실행당 최대 1개 전환. `getMessages`는 규칙의 키워드 검사·plan 아카이브 용도.
 */
export function applyPhaseTransitionOnUserInput(params: {
  taskId: string;
  userText: string;
  getMessages: () => Message[];
}): void {
  if (!isApproval(params.userText)) return;

  const task = useTaskStore.getState().tasks.find((t) => t.id === params.taskId);
  if (!task?.pipeline?.enabled) return;

  for (const rule of TRANSITIONS) {
    if (task.pipeline.phases[rule.from]?.status !== 'in_progress') continue;

    if (rule.requireKeywords) {
      const lastAssistant = params
        .getMessages()
        .filter((m) => m.role === 'assistant')
        .pop();
      if (!lastAssistant) continue;
      const content = lastAssistant.content;
      if (!rule.requireKeywords.some((kw) => content.includes(kw))) continue;
    }

    const now = new Date().toISOString();
    const phases = { ...task.pipeline.phases };
    phases[rule.from] = { ...phases[rule.from], status: 'done', completedAt: now };
    if (rule.to) {
      phases[rule.to] = { ...phases[rule.to], status: 'in_progress', startedAt: now };
    }

    const pipelineUpdate: Partial<PipelineState> & { phases: PipelineState['phases']; devPlan?: string } = {
      phases,
    };
    if (rule.archivePlan) {
      const planText = params
        .getMessages()
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .join('\n\n---\n\n');
      if (planText.length > 50) pipelineUpdate.devPlan = planText;
    }

    useTaskStore.getState().updateTask(params.taskId, {
      pipeline: { ...task.pipeline, ...pipelineUpdate } as PipelineState,
    });
    sendNotification('Cortx Pipeline', rule.notifyBody);
    return;
  }
}
