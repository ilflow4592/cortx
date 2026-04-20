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

/** 모델 계열별 버전 — UI 뱃지 표시용. Rust 실제 모델 ID 와 동기화 유지. */
export const MODEL_VERSIONS: Record<string, string> = {
  Opus: '4.7',
  Sonnet: '4.6',
  Haiku: '4.5',
};

/** 일반 채팅 기본 모델 버전 (Opus 4.7 / 1M context). pipeline 비활성 뱃지 fallback. */
export const MODEL_VERSION = MODEL_VERSIONS.Opus;

export function modelVersionFor(modelName: string | undefined): string {
  if (!modelName) return MODEL_VERSION;
  return MODEL_VERSIONS[modelName] ?? MODEL_VERSION;
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
