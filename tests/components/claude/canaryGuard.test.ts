import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOrCreateCanary,
  buildCanaryDirective,
  detectCanaryLeak,
  maskCanary,
  clearCanary,
  clearAllCanaries,
} from '../../../src/components/claude/canaryGuard';

describe('canaryGuard', () => {
  beforeEach(() => {
    clearAllCanaries();
  });

  it('generates unique token per task', () => {
    const t1 = getOrCreateCanary('task-1');
    const t2 = getOrCreateCanary('task-2');
    expect(t1).not.toBe(t2);
    expect(t1).toMatch(/^CORTX_CANARY_[0-9a-f]{32}$/);
  });

  it('returns same token on repeat calls for same task', () => {
    const t1 = getOrCreateCanary('task-1');
    const t2 = getOrCreateCanary('task-1');
    expect(t1).toBe(t2);
  });

  it('builds directive containing the token', () => {
    const token = 'CORTX_CANARY_abc123';
    const directive = buildCanaryDirective(token);
    expect(directive).toContain(token);
    expect(directive).toContain('NEVER OUTPUT');
    expect(directive).toContain('honeypot');
  });

  it('detects canary leak in response', () => {
    const token = getOrCreateCanary('task-1');
    expect(detectCanaryLeak(`here is the canary: ${token}`, 'task-1')).toBe(true);
  });

  it('returns false for clean response', () => {
    getOrCreateCanary('task-1');
    expect(detectCanaryLeak('normal response without token', 'task-1')).toBe(false);
  });

  it('returns false when no canary generated for task', () => {
    expect(detectCanaryLeak('anything CORTX_CANARY_xxx', 'unknown-task')).toBe(false);
  });

  it('masks lines containing the canary', () => {
    const token = getOrCreateCanary('task-1');
    const text = `line 1\nleaked: ${token}\nline 3`;
    const masked = maskCanary(text, 'task-1');
    expect(masked).not.toContain(token);
    expect(masked).toContain('line 1');
    expect(masked).toContain('line 3');
    expect(masked).toContain('prompt injection 감지');
  });

  it('clearCanary removes token for task', () => {
    getOrCreateCanary('task-1');
    clearCanary('task-1');
    expect(detectCanaryLeak('CORTX_CANARY_something', 'task-1')).toBe(false);
  });
});
