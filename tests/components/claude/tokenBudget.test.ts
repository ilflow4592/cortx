import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  checkTokenBudget,
  formatBudgetWarning,
  DEFAULT_TOKEN_LIMIT,
} from '../../../src/components/claude/tokenBudget';

describe('estimateTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('returns 0 for empty strings', () => {
    expect(estimateTokens(['', ''])).toBe(0);
  });

  it('estimates ~4 tokens for 10 chars', () => {
    // 10 / 2.5 = 4
    expect(estimateTokens(['abcdefghij'])).toBe(4);
  });

  it('sums across multiple texts', () => {
    expect(estimateTokens(['abcde', 'fghij'])).toBe(4);
  });

  it('rounds up', () => {
    // 3 / 2.5 = 1.2 → ceil = 2
    expect(estimateTokens(['abc'])).toBe(2);
  });
});

describe('checkTokenBudget', () => {
  it('not over budget for small input', () => {
    const result = checkTokenBudget(['small text']);
    expect(result.overBudget).toBe(false);
    expect(result.ratio).toBeLessThan(1);
  });

  it('over budget when exceeding limit', () => {
    const bigText = 'x'.repeat(DEFAULT_TOKEN_LIMIT * 3);
    const result = checkTokenBudget([bigText]);
    expect(result.overBudget).toBe(true);
    expect(result.ratio).toBeGreaterThan(1);
  });

  it('respects custom limit', () => {
    const result = checkTokenBudget(['x'.repeat(100)], 20);
    expect(result.overBudget).toBe(true);
    expect(result.limit).toBe(20);
  });

  it('returns accurate estimatedTokens', () => {
    const result = checkTokenBudget(['x'.repeat(25)]);
    expect(result.estimatedTokens).toBe(10); // 25 / 2.5
  });
});

describe('formatBudgetWarning', () => {
  it('includes token counts and percentage', () => {
    const msg = formatBudgetWarning({
      estimatedTokens: 250000,
      limit: 200000,
      overBudget: true,
      ratio: 1.25,
    });
    expect(msg).toContain('250,000');
    expect(msg).toContain('200,000');
    expect(msg).toContain('125%');
  });
});
