import { describe, it, expect } from 'vitest';
import { parseWorktrees, classifyWorktree } from '../../../src/components/worktree-cleanup/parsing';
import type { Task } from '../../../src/types/task';

describe('parseWorktrees', () => {
  it('extracts path/branch pairs from porcelain output', () => {
    const output = `worktree /repo/main
HEAD abc123
branch refs/heads/main

worktree /repo/.worktrees/feat
HEAD def456
branch refs/heads/feat/x`;
    expect(parseWorktrees(output)).toEqual([
      { path: '/repo/main', branch: 'main' },
      { path: '/repo/.worktrees/feat', branch: 'feat/x' },
    ]);
  });

  it('returns empty branch when not present', () => {
    const output = `worktree /repo/detached
HEAD abc123
detached`;
    expect(parseWorktrees(output)).toEqual([{ path: '/repo/detached', branch: '' }]);
  });

  it('returns empty array for blank input', () => {
    expect(parseWorktrees('')).toEqual([]);
  });
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
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
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('classifyWorktree', () => {
  it('returns orphan when no task matches', () => {
    expect(classifyWorktree(undefined)).toEqual({ category: 'orphan', ageInDays: Infinity });
  });

  it('marks done tasks as stale with computed age', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86400_000).toISOString();
    const result = classifyWorktree(makeTask({ status: 'done', updatedAt: tenDaysAgo }));
    expect(result.category).toBe('stale');
    expect(result.ageInDays).toBeGreaterThanOrEqual(9);
    expect(result.ageInDays).toBeLessThanOrEqual(10);
  });

  it('marks non-done tasks as active', () => {
    expect(classifyWorktree(makeTask({ status: 'active' })).category).toBe('active');
    expect(classifyWorktree(makeTask({ status: 'paused' })).category).toBe('active');
    expect(classifyWorktree(makeTask({ status: 'waiting' })).category).toBe('active');
  });
});
