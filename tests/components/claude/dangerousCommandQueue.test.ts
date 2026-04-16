import { describe, it, expect, beforeEach } from 'vitest';
import {
  requestDangerDecision,
  subscribeDangerQueue,
  resolveDangerDecision,
  clearDangerQueue,
  type DangerRequest,
} from '../../../src/components/claude/dangerousCommandQueue';
import {
  isAllowedInSession,
  allowPatternInSession,
  clearAllowlist,
  clearAllAllowlists,
} from '../../../src/components/claude/dangerousCommandAlert';

describe('dangerousCommandQueue', () => {
  beforeEach(() => {
    clearDangerQueue();
  });

  it('resolves with user decision', async () => {
    let captured: DangerRequest | null = null;
    const unsub = subscribeDangerQueue((req) => {
      captured = req;
    });

    const promise = requestDangerDecision({
      taskId: 'task-1',
      command: 'rm -rf /',
      matches: [{ pattern: 'rm_rf_root', severity: 'critical', description: 'Root 삭제', snippet: 'rm -rf /' }],
    });

    // Host가 request 받음
    expect(captured).not.toBeNull();
    expect(captured!.command).toBe('rm -rf /');

    // 사용자 결정 시뮬레이션
    resolveDangerDecision(captured!.id, 'stop');

    const choice = await promise;
    expect(choice).toBe('stop');
    unsub();
  });

  it('handles continue decision', async () => {
    let captured: DangerRequest | null = null;
    subscribeDangerQueue((req) => {
      captured = req;
    });

    const promise = requestDangerDecision({
      taskId: 'task-2',
      command: 'dangerous',
      matches: [{ pattern: 'x', severity: 'critical', description: 'x', snippet: 'x' }],
    });
    resolveDangerDecision(captured!.id, 'continue');
    expect(await promise).toBe('continue');
  });

  it('clearDangerQueue auto-resolves as stop', async () => {
    const promise = requestDangerDecision({
      taskId: 'task-3',
      command: 'x',
      matches: [{ pattern: 'x', severity: 'critical', description: 'x', snippet: 'x' }],
    });
    clearDangerQueue();
    expect(await promise).toBe('stop');
  });
});

describe('dangerousCommandAlert (session allowlist)', () => {
  beforeEach(() => {
    clearAllAllowlists();
  });

  it('starts empty — no patterns allowed', () => {
    expect(isAllowedInSession('task-1', 'git_force_push')).toBe(false);
  });

  it('allowPatternInSession adds pattern', () => {
    allowPatternInSession('task-1', 'git_force_push');
    expect(isAllowedInSession('task-1', 'git_force_push')).toBe(true);
    expect(isAllowedInSession('task-1', 'rm_rf_root')).toBe(false);
  });

  it('per-task isolation', () => {
    allowPatternInSession('task-1', 'git_force_push');
    expect(isAllowedInSession('task-2', 'git_force_push')).toBe(false);
  });

  it('clearAllowlist removes task allowlist', () => {
    allowPatternInSession('task-1', 'git_force_push');
    clearAllowlist('task-1');
    expect(isAllowedInSession('task-1', 'git_force_push')).toBe(false);
  });
});
