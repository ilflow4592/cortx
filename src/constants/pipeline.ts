import type { PipelinePhase } from '../types/task';

export const PHASE_KEYS = new Set<PipelinePhase>(['grill_me', 'obsidian_save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done']);

export const PHASE_ORDER: PipelinePhase[] = ['grill_me', 'obsidian_save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done'];

export const PHASE_NAMES: Record<PipelinePhase, string> = {
  grill_me: 'Grill-me', obsidian_save: 'Save', dev_plan: 'Dev Plan',
  implement: 'Implement', commit_pr: 'PR', review_loop: 'Review', done: 'Done',
};

export const PHASE_MODELS: Record<PipelinePhase, string> = {
  grill_me: 'Opus', obsidian_save: 'Opus', dev_plan: 'Opus',
  implement: 'Sonnet', commit_pr: 'Sonnet', review_loop: 'Opus', done: '-',
};
