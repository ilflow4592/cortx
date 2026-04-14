import { describe, it, expect, beforeEach } from 'vitest';
import { applyPipelineMarkerUpdates } from '../../../src/components/claude/pipelineMarkers';
import { useTaskStore } from '../../../src/stores/taskStore';
import type { Task } from '../../../src/types/task';
import type { Message } from '../../../src/components/claude/types';

function seedTask(overrides: Partial<Task> = {}): Task {
  const task: Task = {
    id: 't1',
    title: 'Test',
    status: 'active',
    layer: 'focus',
    branchName: 'feat/x',
    worktreePath: '',
    repoPath: '',
    memo: '',
    elapsedSeconds: 0,
    chatHistory: [],
    interrupts: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    pipeline: {
      enabled: true,
      complexity: '',
      phases: {},
      prNumber: 0,
      prUrl: '',
      devPlan: '',
    },
    ...overrides,
  };
  useTaskStore.setState({ tasks: [task], activeTaskId: 't1' });
  return task;
}

const noMessages = (): Message[] => [];

describe('applyPipelineMarkerUpdates', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], activeTaskId: null });
  });

  it('does nothing when task pipeline is disabled', () => {
    seedTask({ pipeline: { enabled: false, complexity: '', phases: {}, prNumber: 0, prUrl: '', devPlan: '' } });
    applyPipelineMarkerUpdates('t1', [{ kind: 'phase', phase: 'dev_plan', status: 'in_progress' }], noMessages);
    const after = useTaskStore.getState().tasks[0];
    expect(after.pipeline?.phases.dev_plan).toBeUndefined();
  });

  it('updates complexity', () => {
    seedTask();
    applyPipelineMarkerUpdates('t1', [{ kind: 'complexity', value: 'medium' }], noMessages);
    expect(useTaskStore.getState().tasks[0].pipeline?.complexity).toBe('medium');
  });

  it('sets phase status with timestamps', () => {
    seedTask();
    applyPipelineMarkerUpdates(
      't1',
      [{ kind: 'phase', phase: 'dev_plan', status: 'in_progress' }],
      noMessages,
    );
    const phase = useTaskStore.getState().tasks[0].pipeline?.phases.dev_plan;
    expect(phase?.status).toBe('in_progress');
    expect(phase?.startedAt).toBeDefined();
    expect(phase?.completedAt).toBeUndefined();
  });

  it('done status sets completedAt', () => {
    seedTask();
    applyPipelineMarkerUpdates(
      't1',
      [{ kind: 'phase', phase: 'dev_plan', status: 'done', memo: 'OK' }],
      noMessages,
    );
    const phase = useTaskStore.getState().tasks[0].pipeline?.phases.dev_plan;
    expect(phase?.status).toBe('done');
    expect(phase?.completedAt).toBeDefined();
    expect(phase?.memo).toBe('OK');
  });

  it('archives assistant messages as devPlan when dev_plan completes', () => {
    seedTask();
    const messages: Message[] = [
      { id: 'm1', role: 'user', content: 'hi' },
      { id: 'm2', role: 'assistant', content: 'A'.repeat(60) },
    ];
    applyPipelineMarkerUpdates('t1', [{ kind: 'phase', phase: 'dev_plan', status: 'done' }], () => messages);
    const after = useTaskStore.getState().tasks[0];
    expect(after.pipeline?.devPlan).toContain('A'.repeat(60));
  });

  it('skips devPlan archive if assistant text < 50 chars', () => {
    seedTask();
    const messages: Message[] = [{ id: 'm1', role: 'assistant', content: 'short' }];
    applyPipelineMarkerUpdates('t1', [{ kind: 'phase', phase: 'dev_plan', status: 'done' }], () => messages);
    expect(useTaskStore.getState().tasks[0].pipeline?.devPlan).toBe('');
  });
});
