import type { PipelinePhase, PipelineState } from '../../types/task';

const ALL_PIPELINE_COMMANDS = [
  'pipeline:dev-task',
  'pipeline:dev-implement',
  'pipeline:dev-review-loop',
  'pipeline:dev-resume',
  'pipeline:pr-review-fu',
] as const;

export function isPipelineCommand(name: string): boolean {
  return name.startsWith('pipeline:');
}

/**
 * Return the set of pipeline slash commands that should be visible in the chat
 * dropdown given the current pipeline state. Non-pipeline commands are never
 * filtered — this function only controls the pipeline:* subset.
 *
 * Phase-based exposure:
 * - PROGRESS empty (no pipeline enabled or grill_me not done) → dev-task
 * - grill_me done, implement not done → dev-implement
 * - implement done → pr-review-fu (follow-up on PR review)
 */
export function getAllowedPipelineCommands(pipeline: PipelineState | undefined): Set<string> {
  if (!pipeline?.enabled) return new Set(['pipeline:dev-task']);

  const phases = pipeline.phases;
  const grillDone = phases?.grill_me?.status === 'done';
  const implementDone = phases?.implement?.status === 'done';

  if (implementDone) return new Set(['pipeline:pr-review-fu']);
  if (grillDone) return new Set(['pipeline:dev-implement']);
  return new Set(['pipeline:dev-task']);
}

export function filterSlashCommandsByPipeline<T extends { name: string }>(
  commands: T[],
  pipeline: PipelineState | undefined,
): T[] {
  const allowed = getAllowedPipelineCommands(pipeline);
  return commands.filter((cmd) => !isPipelineCommand(cmd.name) || allowed.has(cmd.name));
}

/**
 * A pipeline command is "running" when the phase it would start is already
 * in progress. Clicking it again would double-trigger work, so the caller
 * should render it disabled.
 */
export function isPipelineCommandRunning(name: string, pipeline: PipelineState | undefined): boolean {
  if (!pipeline?.enabled) return false;
  const phases = pipeline.phases;
  const inProgress = (p: PipelinePhase) => phases?.[p]?.status === 'in_progress';

  switch (name) {
    case 'pipeline:dev-task':
      return inProgress('grill_me') || inProgress('save');
    case 'pipeline:dev-implement':
      return inProgress('dev_plan') || inProgress('implement');
    case 'pipeline:dev-review-loop':
    case 'pipeline:pr-review-fu':
      return inProgress('commit_pr') || inProgress('review_loop');
    default:
      return false;
  }
}

export { ALL_PIPELINE_COMMANDS };
