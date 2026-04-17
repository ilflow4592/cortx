import { describe, it, expect } from 'vitest';
import {
  getAllowedPipelineCommands,
  filterSlashCommandsByPipeline,
  isPipelineCommand,
  isPipelineCommandRunning,
} from '../../../src/components/claude/pipelineCommandFilter';
import type { PipelineState, PipelinePhase, PhaseStatus } from '../../../src/types/task';

function makePipeline(overrides: Partial<Record<PipelinePhase, PhaseStatus>> = {}): PipelineState {
  const base: PhaseStatus = 'pending';
  const phases = {
    grill_me: { status: overrides.grill_me ?? base },
    save: { status: overrides.save ?? base },
    dev_plan: { status: overrides.dev_plan ?? base },
    implement: { status: overrides.implement ?? base },
    commit_pr: { status: overrides.commit_pr ?? base },
    review_loop: { status: overrides.review_loop ?? base },
    done: { status: overrides.done ?? base },
  };
  return { enabled: true, phases };
}

describe('isPipelineCommand', () => {
  it('detects pipeline namespace', () => {
    expect(isPipelineCommand('pipeline:dev-task')).toBe(true);
    expect(isPipelineCommand('git:commit')).toBe(false);
    expect(isPipelineCommand('help')).toBe(false);
  });
});

describe('getAllowedPipelineCommands', () => {
  it('returns dev-task when pipeline is undefined', () => {
    expect(getAllowedPipelineCommands(undefined)).toEqual(new Set(['pipeline:dev-task']));
  });

  it('returns dev-task when pipeline disabled', () => {
    const pipeline = makePipeline();
    expect(getAllowedPipelineCommands({ ...pipeline, enabled: false })).toEqual(new Set(['pipeline:dev-task']));
  });

  it('returns dev-task when grill_me is pending', () => {
    expect(getAllowedPipelineCommands(makePipeline())).toEqual(new Set(['pipeline:dev-task']));
  });

  it('returns dev-implement once grill_me is done', () => {
    expect(getAllowedPipelineCommands(makePipeline({ grill_me: 'done' }))).toEqual(new Set(['pipeline:dev-implement']));
  });

  it('still returns dev-implement during implement in_progress', () => {
    expect(getAllowedPipelineCommands(makePipeline({ grill_me: 'done', implement: 'in_progress' }))).toEqual(
      new Set(['pipeline:dev-implement']),
    );
  });

  it('returns pr-review-fu once implement is done', () => {
    expect(getAllowedPipelineCommands(makePipeline({ grill_me: 'done', implement: 'done' }))).toEqual(
      new Set(['pipeline:pr-review-fu']),
    );
  });
});

describe('isPipelineCommandRunning', () => {
  it('returns false for non-pipeline commands', () => {
    expect(isPipelineCommandRunning('git:commit', makePipeline({ grill_me: 'in_progress' }))).toBe(false);
  });

  it('returns false when pipeline disabled or undefined', () => {
    expect(isPipelineCommandRunning('pipeline:dev-task', undefined)).toBe(false);
    const p = makePipeline({ grill_me: 'in_progress' });
    expect(isPipelineCommandRunning('pipeline:dev-task', { ...p, enabled: false })).toBe(false);
  });

  it('marks dev-task running while grill_me or save is in_progress', () => {
    expect(isPipelineCommandRunning('pipeline:dev-task', makePipeline({ grill_me: 'in_progress' }))).toBe(true);
    expect(isPipelineCommandRunning('pipeline:dev-task', makePipeline({ save: 'in_progress' }))).toBe(true);
  });

  it('marks dev-implement running during dev_plan or implement', () => {
    expect(
      isPipelineCommandRunning('pipeline:dev-implement', makePipeline({ grill_me: 'done', dev_plan: 'in_progress' })),
    ).toBe(true);
    expect(
      isPipelineCommandRunning('pipeline:dev-implement', makePipeline({ grill_me: 'done', implement: 'in_progress' })),
    ).toBe(true);
  });

  it('marks review commands running during commit_pr or review_loop', () => {
    expect(
      isPipelineCommandRunning(
        'pipeline:pr-review-fu',
        makePipeline({ grill_me: 'done', implement: 'done', review_loop: 'in_progress' }),
      ),
    ).toBe(true);
  });

  it('returns false when no phase is in_progress', () => {
    expect(isPipelineCommandRunning('pipeline:dev-task', makePipeline({ grill_me: 'done' }))).toBe(false);
  });
});

describe('filterSlashCommandsByPipeline', () => {
  const cmds = [
    { name: 'pipeline:dev-task' },
    { name: 'pipeline:dev-implement' },
    { name: 'pipeline:dev-review-loop' },
    { name: 'pipeline:dev-resume' },
    { name: 'pipeline:pr-review-fu' },
    { name: 'git:commit' },
    { name: 'git:pr' },
    { name: 'help' },
  ];

  it('keeps all non-pipeline commands regardless of state', () => {
    const result = filterSlashCommandsByPipeline(cmds, undefined).map((c) => c.name);
    expect(result).toContain('git:commit');
    expect(result).toContain('git:pr');
    expect(result).toContain('help');
  });

  it('exposes only dev-task at empty progress', () => {
    const result = filterSlashCommandsByPipeline(cmds, undefined)
      .map((c) => c.name)
      .filter((n) => n.startsWith('pipeline:'));
    expect(result).toEqual(['pipeline:dev-task']);
  });

  it('exposes only dev-implement after grill_me done', () => {
    const result = filterSlashCommandsByPipeline(cmds, makePipeline({ grill_me: 'done' }))
      .map((c) => c.name)
      .filter((n) => n.startsWith('pipeline:'));
    expect(result).toEqual(['pipeline:dev-implement']);
  });

  it('exposes only pr-review-fu after implement done', () => {
    const result = filterSlashCommandsByPipeline(cmds, makePipeline({ grill_me: 'done', implement: 'done' }))
      .map((c) => c.name)
      .filter((n) => n.startsWith('pipeline:'));
    expect(result).toEqual(['pipeline:pr-review-fu']);
  });
});
