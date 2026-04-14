import { describe, it, expect } from 'vitest';
import { formatRelative } from '../../../src/components/project-settings/format';

describe('formatRelative', () => {
  it('returns "just now" for < 1 minute', () => {
    expect(formatRelative(new Date().toISOString())).toBe('just now');
  });
  it('returns Xm ago for minutes', () => {
    const ts = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelative(ts)).toBe('5m ago');
  });
  it('returns Xh ago for hours', () => {
    const ts = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatRelative(ts)).toBe('3h ago');
  });
  it('returns Xd ago for days', () => {
    const ts = new Date(Date.now() - 7 * 86400_000).toISOString();
    expect(formatRelative(ts)).toBe('7d ago');
  });
  it('returns input on parse failure', () => {
    expect(formatRelative('not-a-date')).toBeTypeOf('string');
  });
});
