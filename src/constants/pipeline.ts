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
