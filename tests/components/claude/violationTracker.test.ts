import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordViolation,
  getViolationCount,
  resetViolations,
  clearAllViolations,
} from '../../../src/components/claude/violationTracker';

describe('violationTracker', () => {
  beforeEach(() => {
    clearAllViolations();
  });

  it('starts with 0 count for unseen task', () => {
    expect(getViolationCount('task-1')).toBe(0);
  });

  it('increments count on each violation', () => {
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    expect(getViolationCount('task-1')).toBe(2);
  });

  it('tracks counts per-task independently', () => {
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    recordViolation({ taskId: 'task-2', violationType: 'missing_confirmation' });
    recordViolation({ taskId: 'task-2', violationType: 'missing_confirmation' });
    expect(getViolationCount('task-1')).toBe(1);
    expect(getViolationCount('task-2')).toBe(2);
  });

  it('returns isAnomaly false below threshold', () => {
    const r1 = recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    const r2 = recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    expect(r1.isAnomaly).toBe(false);
    expect(r2.isAnomaly).toBe(false);
  });

  it('returns isAnomaly true at threshold (3)', () => {
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    const r3 = recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    expect(r3.isAnomaly).toBe(true);
    expect(r3.count).toBe(3);
  });

  it('resetViolations clears count for task', () => {
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    resetViolations('task-1');
    expect(getViolationCount('task-1')).toBe(0);
  });

  it('resetViolations does not affect other tasks', () => {
    recordViolation({ taskId: 'task-1', violationType: 'premature_q' });
    recordViolation({ taskId: 'task-2', violationType: 'premature_q' });
    resetViolations('task-1');
    expect(getViolationCount('task-1')).toBe(0);
    expect(getViolationCount('task-2')).toBe(1);
  });
});
