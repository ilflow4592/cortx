import { describe, it, expect } from 'vitest';
import { taskToMarkdown, tasksToJson } from '../../src/services/taskExport';
import type { Task } from '../../src/types/task';
import type { Project } from '../../src/types/project';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Test Task',
    status: 'active',
    layer: 'focus',
    branchName: 'feat/test',
    worktreePath: '/worktree/path',
    repoPath: '/repo/path',
    memo: '',
    elapsedSeconds: 0,
    chatHistory: [],
    interrupts: [],
    createdAt: '2026-04-10T00:00:00Z',
    updatedAt: '2026-04-10T00:30:00Z',
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'My Project',
    localPath: '/home/user/myproject',
    githubOwner: 'owner',
    githubRepo: 'repo',
    baseBranch: 'main',
    slackChannels: [],
    color: '#818cf8',
    createdAt: '2026-04-10T00:00:00Z',
    ...overrides,
  };
}

describe('taskToMarkdown', () => {
  it('produces markdown with title as h1', () => {
    const md = taskToMarkdown(makeTask({ title: 'Fix bug' }), null);
    expect(md).toContain('# Fix bug');
  });

  it('includes task metadata section', () => {
    const md = taskToMarkdown(makeTask(), null);
    expect(md).toContain('## Metadata');
    expect(md).toContain('- **Status**: active');
    expect(md).toContain('- **Layer**: focus');
    expect(md).toContain('- **Branch**: `feat/test`');
  });

  it('includes project name when project is provided', () => {
    const md = taskToMarkdown(makeTask(), makeProject({ name: 'Cortx' }));
    expect(md).toContain('- **Project**: Cortx');
  });

  it('omits project line when project is null', () => {
    const md = taskToMarkdown(makeTask(), null);
    expect(md).not.toContain('**Project**');
  });

  it('includes memo section when memo is set', () => {
    const md = taskToMarkdown(makeTask({ memo: 'Important notes' }), null);
    expect(md).toContain('## Memo');
    expect(md).toContain('Important notes');
  });

  it('omits memo section when memo is empty', () => {
    const md = taskToMarkdown(makeTask({ memo: '' }), null);
    expect(md).not.toContain('## Memo');
  });

  it('formats elapsed time with hours/minutes/seconds', () => {
    const md1 = taskToMarkdown(makeTask({ elapsedSeconds: 5 }), null);
    expect(md1).toContain('5s');
    const md2 = taskToMarkdown(makeTask({ elapsedSeconds: 125 }), null);
    expect(md2).toContain('2m 5s');
    const md3 = taskToMarkdown(makeTask({ elapsedSeconds: 3700 }), null);
    expect(md3).toContain('1h 1m 40s');
  });

  it('includes chat history when present', () => {
    const task = makeTask({
      chatHistory: [
        {
          id: 'm1',
          role: 'user',
          content: 'Hello Claude',
          timestamp: '2026-04-10T01:00:00Z',
        },
        {
          id: 'm2',
          role: 'assistant',
          content: 'Hi there!',
          model: 'claude-opus-4-6',
          timestamp: '2026-04-10T01:00:05Z',
        },
      ],
    });
    const md = taskToMarkdown(task, null);
    expect(md).toContain('## Chat History');
    expect(md).toContain('Hello Claude');
    expect(md).toContain('Hi there!');
    expect(md).toContain('claude-opus-4-6');
  });

  it('includes pipeline table with phase totals', () => {
    const task = makeTask({
      pipeline: {
        enabled: true,
        phases: {
          grill_me: { status: 'done', inputTokens: 1000, outputTokens: 500, costUsd: 0.01 },
          obsidian_save: { status: 'pending' },
          dev_plan: { status: 'done', inputTokens: 2000, outputTokens: 1500, costUsd: 0.04 },
          implement: { status: 'in_progress' },
          commit_pr: { status: 'pending' },
          review_loop: { status: 'pending' },
          done: { status: 'pending' },
        },
      },
    });
    const md = taskToMarkdown(task, null);
    expect(md).toContain('## Pipeline');
    expect(md).toContain('Grill-me');
    expect(md).toContain('Dev Plan');
    // Totals
    expect(md).toContain('3,000'); // 1000 + 2000 input
    expect(md).toContain('2,000'); // 500 + 1500 output
    expect(md).toContain('$0.0500'); // 0.01 + 0.04
  });

  it('includes PR URL when present', () => {
    const task = makeTask({
      pipeline: {
        enabled: true,
        phases: {
          grill_me: { status: 'done' },
          obsidian_save: { status: 'pending' },
          dev_plan: { status: 'pending' },
          implement: { status: 'pending' },
          commit_pr: { status: 'done' },
          review_loop: { status: 'pending' },
          done: { status: 'pending' },
        },
        prUrl: 'https://github.com/owner/repo/pull/42',
      },
    });
    const md = taskToMarkdown(task, null);
    expect(md).toContain('https://github.com/owner/repo/pull/42');
  });

  it('includes interrupts when present', () => {
    const task = makeTask({
      interrupts: [
        {
          id: 'i1',
          pausedAt: '2026-04-10T01:00:00Z',
          resumedAt: '2026-04-10T01:15:00Z',
          reason: 'meeting',
          memo: 'standup',
          durationSeconds: 900,
        },
      ],
    });
    const md = taskToMarkdown(task, null);
    expect(md).toContain('## Interrupts');
    expect(md).toContain('meeting');
    expect(md).toContain('standup');
  });
});

describe('tasksToJson', () => {
  it('produces valid JSON with format marker', () => {
    const json = tasksToJson([makeTask()], []);
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('cortx-task-export');
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBeTruthy();
    expect(Array.isArray(parsed.tasks)).toBe(true);
    expect(parsed.tasks).toHaveLength(1);
  });

  it('includes only projects referenced by exported tasks', () => {
    const task = makeTask({ projectId: 'p1' });
    const project1 = makeProject({ id: 'p1', name: 'Used' });
    const project2 = makeProject({ id: 'p2', name: 'NotUsed' });
    const json = tasksToJson([task], [project1, project2]);
    const parsed = JSON.parse(json);
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].name).toBe('Used');
  });

  it('omits projects array when tasks have no project', () => {
    const task = makeTask({ projectId: undefined });
    const json = tasksToJson([task], [makeProject()]);
    const parsed = JSON.parse(json);
    expect(parsed.projects).toHaveLength(0);
  });

  it('preserves task chat history in JSON roundtrip', () => {
    const task = makeTask({
      chatHistory: [{ id: 'm1', role: 'user', content: 'test', timestamp: '2026-04-10T00:00:00Z' }],
    });
    const json = tasksToJson([task], []);
    const parsed = JSON.parse(json);
    expect(parsed.tasks[0].chatHistory).toHaveLength(1);
    expect(parsed.tasks[0].chatHistory[0].content).toBe('test');
  });

  it('preserves pipeline state in JSON roundtrip', () => {
    const task = makeTask({
      pipeline: {
        enabled: true,
        phases: {
          grill_me: { status: 'done', inputTokens: 100 },
          obsidian_save: { status: 'pending' },
          dev_plan: { status: 'pending' },
          implement: { status: 'pending' },
          commit_pr: { status: 'pending' },
          review_loop: { status: 'pending' },
          done: { status: 'pending' },
        },
      },
    });
    const json = tasksToJson([task], []);
    const parsed = JSON.parse(json);
    expect(parsed.tasks[0].pipeline.enabled).toBe(true);
    expect(parsed.tasks[0].pipeline.phases.grill_me.inputTokens).toBe(100);
  });
});
