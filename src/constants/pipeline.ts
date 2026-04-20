import type { PipelinePhase } from '../types/task';

export const PHASE_KEYS = new Set<PipelinePhase>([
  'grill_me',
  'save',
  'dev_plan',
  'implement',
  'commit_pr',
  'review_loop',
  'done',
]);

export const PHASE_ORDER: PipelinePhase[] = [
  'grill_me',
  'save',
  'dev_plan',
  'implement',
  'commit_pr',
  'review_loop',
  'done',
];

export const PHASE_NAMES: Record<PipelinePhase, string> = {
  grill_me: 'Grill-me',
  save: 'Save',
  dev_plan: 'Dev Plan',
  implement: 'Implement',
  commit_pr: 'PR',
  review_loop: 'Review',
  done: 'Done',
};

export const PHASE_MODELS: Record<PipelinePhase, string> = {
  grill_me: 'Opus',
  save: 'Opus',
  dev_plan: 'Sonnet',
  implement: 'Sonnet',
  commit_pr: 'Sonnet',
  review_loop: 'Sonnet',
  done: '-',
};

/**
 * 모델 계열별 버전 — pipeline 뱃지 표시용. Cortx 가 명시적으로 강제하는 모델에만
 * 적용 (현재 Sonnet 만 해당 — dev_plan/implement/review_loop). 일반 채팅은 CLI
 * `/model` 설정에 위임하므로 version 표시 불가 → "Default" 뱃지로 대체.
 * Anthropic 이 Sonnet/Haiku 를 bump 하면 이 표만 갱신하면 됨.
 */
export const MODEL_VERSIONS: Record<string, string> = {
  Sonnet: '4.6',
  Haiku: '4.5',
};

export function modelVersionFor(modelName: string | undefined): string {
  if (!modelName) return '';
  return MODEL_VERSIONS[modelName] ?? '';
}

/**
 * 단계별 effort 레벨 — runPipeline 에서 `--effort` 플래그로 CLI 에 전달되는 값과
 * 일치시켜 뱃지에 표시. 변경 시 두 곳(여기 + runPipeline selectedEffort) 동시 수정.
 */
export const PHASE_EFFORT: Record<PipelinePhase, string> = {
  grill_me: 'medium',
  save: 'medium',
  dev_plan: 'medium',
  implement: 'medium',
  commit_pr: 'medium',
  review_loop: 'medium',
  done: '',
};
