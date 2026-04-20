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
 * 모델 계열별 버전 — 뱃지 / Picker 표시용. Anthropic 이 minor 버전을 bump 하면
 * 이 표만 갱신. (CLI 자체 default 는 그대로 따라가지만 UI 표기는 별도.)
 */
export const MODEL_VERSIONS: Record<string, string> = {
  Opus: '4.7',
  Sonnet: '4.6',
  Haiku: '4.5',
};

export function modelVersionFor(modelName: string | undefined): string {
  if (!modelName) return '';
  return MODEL_VERSIONS[modelName] ?? '';
}

/** CLI alias ("opus"/"sonnet"/"haiku") → 표시명 ("Opus 4.7" 등) */
export const MODEL_ALIAS_TO_LABEL: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
};

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'max'] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];

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
