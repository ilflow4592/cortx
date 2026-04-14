import { describe, it, expect } from 'vitest';
import {
  computeUsages,
  filterByPeriod,
  sumTotals,
  computeTrend,
  computePhaseBreakdown,
  computeProjectBreakdown,
  topNTasks,
} from '../../../src/components/cost-dashboard/aggregations';
import type { Task } from '../../../src/types/task';
import type { Project } from '../../../src/types/project';

function makeTask(overrides: Partial<Task> & { phaseUsage?: Record<string, { input: number; output: number; cost: number }> } = {}): Task {
  const phases = overrides.phaseUsage
    ? Object.fromEntries(
        Object.entries(overrides.phaseUsage).map(([k, v]) => [
          k,
          { status: 'done', inputTokens: v.input, outputTokens: v.output, costUsd: v.cost },
        ]),
      )
    : undefined;
  return {
    id: overrides.id || 't1',
    title: overrides.title || 'T',
    status: overrides.status || 'active',
    layer: 'focus',
    branchName: '',
    worktreePath: '',
    repoPath: '',
    memo: '',
    elapsedSeconds: 0,
    chatHistory: [],
    interrupts: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt || '2026-04-14T00:00:00Z',
    projectId: overrides.projectId,
    pipeline: phases ? ({ enabled: true, phases } as Task['pipeline']) : undefined,
  };
}

describe('computeUsages', () => {
  it('aggregates phase tokens into per-task totals', () => {
    const tasks = [
      makeTask({ id: 't1', phaseUsage: { dev_plan: { input: 100, output: 50, cost: 0.01 } } }),
      makeTask({ id: 't2' }), // no usage → filtered out
    ];
    const usages = computeUsages(tasks);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ taskId: 't1', totalIn: 100, totalOut: 50, totalCost: 0.01 });
  });

  it('filters out tasks with zero token usage and zero cost', () => {
    expect(computeUsages([makeTask({ id: 'x' })])).toEqual([]);
  });
});

describe('filterByPeriod', () => {
  const usages = [
    { taskId: 't-old', updatedAt: '2020-01-01T00:00:00Z' },
    { taskId: 't-new', updatedAt: new Date().toISOString() },
  ] as Parameters<typeof filterByPeriod>[0];

  it('all returns everything', () => {
    expect(filterByPeriod(usages, 'all')).toHaveLength(2);
  });
  it('today filters out old', () => {
    expect(filterByPeriod(usages, 'today').map((u) => u.taskId)).toEqual(['t-new']);
  });
  it('7d/30d filter out very old', () => {
    expect(filterByPeriod(usages, '7d').map((u) => u.taskId)).toEqual(['t-new']);
    expect(filterByPeriod(usages, '30d').map((u) => u.taskId)).toEqual(['t-new']);
  });
});

describe('sumTotals', () => {
  it('sums input/output/cost across usages', () => {
    const totals = sumTotals([
      { totalIn: 100, totalOut: 50, totalCost: 1, phases: {}, taskId: 'a', title: '', updatedAt: '' },
      { totalIn: 200, totalOut: 100, totalCost: 2, phases: {}, taskId: 'b', title: '', updatedAt: '' },
    ]);
    expect(totals).toEqual({ inT: 300, outT: 150, cost: 3, count: 2 });
  });
});

describe('computeTrend', () => {
  it('groups by day and sorts ascending', () => {
    const trend = computeTrend([
      { updatedAt: '2026-04-13T10:00:00Z', totalCost: 0.5 } as Parameters<typeof sumTotals>[0][0],
      { updatedAt: '2026-04-13T15:00:00Z', totalCost: 0.5 } as Parameters<typeof sumTotals>[0][0],
      { updatedAt: '2026-04-14T00:00:00Z', totalCost: 1 } as Parameters<typeof sumTotals>[0][0],
    ]);
    expect(trend).toEqual([
      ['2026-04-13', 1],
      ['2026-04-14', 1],
    ]);
  });
});

describe('computePhaseBreakdown', () => {
  it('aggregates per phase across tasks (PHASE_ORDER 순)', () => {
    const usages = [
      {
        taskId: 't',
        title: '',
        updatedAt: '',
        totalIn: 0,
        totalOut: 0,
        totalCost: 0,
        phases: {
          dev_plan: { inputTokens: 100, outputTokens: 50, costUsd: 0.01 },
          implement: { inputTokens: 200, outputTokens: 100, costUsd: 0.02 },
        },
      },
    ];
    const result = computePhaseBreakdown(usages as Parameters<typeof computePhaseBreakdown>[0]);
    expect(result.find((r) => r.phase === 'dev_plan')).toMatchObject({ input: 100, output: 50, cost: 0.01 });
    expect(result.find((r) => r.phase === 'implement')).toMatchObject({ input: 200, output: 100, cost: 0.02 });
  });
});

describe('computeProjectBreakdown', () => {
  const projects: Project[] = [
    { id: 'p1', name: 'Alpha', githubOwner: '', githubRepo: '', baseBranch: 'main', localPath: '', slackChannels: [], color: '#fff', createdAt: '' },
  ];

  it('groups usages by projectId, names unassigned', () => {
    const usages = [
      { taskId: 'a', title: '', updatedAt: '', totalIn: 10, totalOut: 5, totalCost: 1, projectId: 'p1', phases: {} },
      { taskId: 'b', title: '', updatedAt: '', totalIn: 20, totalOut: 10, totalCost: 2, phases: {} },
    ];
    const result = computeProjectBreakdown(usages as Parameters<typeof computeProjectBreakdown>[0], projects);
    expect(result).toHaveLength(2);
    // 비용 내림차순
    expect(result[0].name).toBe('(unassigned)');
    expect(result[0].cost).toBe(2);
    expect(result[1].name).toBe('Alpha');
    expect(result[1].cost).toBe(1);
  });
});

describe('topNTasks', () => {
  it('sorts by cost desc and slices to N', () => {
    const usages = [
      { taskId: 'a', totalCost: 1, title: '', updatedAt: '', totalIn: 0, totalOut: 0, phases: {} },
      { taskId: 'b', totalCost: 5, title: '', updatedAt: '', totalIn: 0, totalOut: 0, phases: {} },
      { taskId: 'c', totalCost: 3, title: '', updatedAt: '', totalIn: 0, totalOut: 0, phases: {} },
    ];
    const top2 = topNTasks(usages as Parameters<typeof topNTasks>[0], 2);
    expect(top2.map((u) => u.taskId)).toEqual(['b', 'c']);
  });
});
