/**
 * Pipeline marker parser.
 *
 * Claude가 스트리밍하는 텍스트 안에 `[PIPELINE:key:value:memo]` 형식으로 진행 상황을
 * 내장한다. 훅 closure 의존을 없애기 위해 파싱(pure)과 store 적용(side-effect)을 분리.
 *
 *  - `parsePipelineMarkers(text)` → `{ cleaned, updates }` (순수)
 *  - `applyPipelineMarkerUpdates(taskId, updates, getMessages)` → store 업데이트 + 알림
 */
import { useTaskStore } from '../../stores/taskStore';
import type { PipelinePhase, PhaseStatus, PipelineState } from '../../types/task';
import { PHASE_KEYS, PHASE_NAMES } from '../../constants/pipeline';
import { sendNotification } from '../../utils/notification';
import type { Message } from './types';

export type PipelineMarkerUpdate =
  | { kind: 'complexity'; value: string }
  | { kind: 'pr'; number: number; url: string }
  | { kind: 'phase'; phase: PipelinePhase; status: PhaseStatus; memo?: string };

// value 위치는 phase status (in_progress/done/...) 또는 pr 번호 (digits) 모두 허용.
// memo는 `:` 다음 `]` 직전까지 무엇이든 (URL, "#4920", 한글 메모 등).
const PIPELINE_MARKER_RE = /\[PIPELINE:([a-zA-Z_]+):([a-zA-Z0-9_]+)(?::([^\]]*))?\]/g;

/**
 * 입력 텍스트에서 파이프라인 마커를 추출해 업데이트 목록으로 변환.
 * 마커는 표시 텍스트에서 제거된다. 알 수 없는 key는 무시 (파이프라인 미지원 → noop).
 */
export function parsePipelineMarkers(text: string): {
  cleaned: string;
  updates: PipelineMarkerUpdate[];
} {
  const updates: PipelineMarkerUpdate[] = [];
  let cleaned = text;
  const re = new RegExp(PIPELINE_MARKER_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const [fullMatch, key, value, memo] = match;
    if (key === 'complexity') {
      updates.push({ kind: 'complexity', value });
    } else if (key === 'pr') {
      updates.push({ kind: 'pr', number: parseInt(value) || 0, url: memo || '' });
    } else if (PHASE_KEYS.has(key as PipelinePhase)) {
      updates.push({
        kind: 'phase',
        phase: key as PipelinePhase,
        status: value as PhaseStatus,
        memo,
      });
    }
    cleaned = cleaned.replace(fullMatch, '');
  }
  return { cleaned, updates };
}

/**
 * 파싱된 업데이트를 task store에 적용 + 단계 완료 시 macOS 알림.
 * `getMessages`는 dev_plan 단계 완료 시 assistant 메시지 집계용.
 */
export function applyPipelineMarkerUpdates(
  taskId: string,
  updates: PipelineMarkerUpdate[],
  getMessages: () => Message[],
): void {
  for (const u of updates) {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    if (!task?.pipeline?.enabled) continue;

    if (u.kind === 'complexity') {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: { ...task.pipeline, complexity: u.value },
      });
      continue;
    }

    if (u.kind === 'pr') {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: { ...task.pipeline, prNumber: u.number, prUrl: u.url },
      });
      continue;
    }

    // u.kind === 'phase'
    const now = new Date().toISOString();
    const phases = { ...task.pipeline.phases };
    phases[u.phase] = {
      ...phases[u.phase],
      status: u.status,
      ...(u.status === 'in_progress' ? { startedAt: now } : {}),
      ...(u.status === 'done' || u.status === 'skipped' ? { completedAt: now } : {}),
      ...(u.memo ? { memo: u.memo } : {}),
    };

    // dev_plan 완료 시점의 assistant 메시지를 devPlan 필드에 아카이브
    const pipelinePatch: Partial<PipelineState> = { phases };
    if (u.phase === 'dev_plan' && u.status === 'done') {
      const planText = getMessages()
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .join('\n\n---\n\n');
      if (planText.length > 50) {
        (pipelinePatch as PipelineState & { devPlan: string }).devPlan = planText;
      }
    }

    useTaskStore.getState().updateTask(taskId, {
      pipeline: { ...task.pipeline, ...pipelinePatch } as PipelineState,
    });

    if (u.status === 'done') {
      sendNotification('Cortx Pipeline', `${PHASE_NAMES[u.phase] || u.phase} completed`);
    }
  }
}
