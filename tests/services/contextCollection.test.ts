import { describe, it, expect } from 'vitest';
import {
  extractRegexKeywords,
  mergeKeywords,
  rankByKeywordMatch,
} from '../../src/services/contextCollection';
import type { ContextItem } from '../../src/types/contextPack';

function makeItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'i1',
    sourceType: 'github',
    title: '',
    summary: '',
    url: '',
    timestamp: '',
    ...overrides,
  };
}

describe('extractRegexKeywords', () => {
  it('extracts JIRA-style ticket IDs', () => {
    const items = [makeItem({ title: 'Fix BE-1234 timeout', summary: 'See PROJ-456' })];
    expect(extractRegexKeywords(items).sort()).toEqual(['BE-1234', 'PROJ-456']);
  });

  it('extracts feat/fix/hotfix branch names', () => {
    const items = [makeItem({ summary: 'merge feat/auth-rewrite into main, also fix/typo-fix landed' })];
    expect(extractRegexKeywords(items).sort()).toEqual(['feat/auth-rewrite', 'fix/typo-fix']);
  });

  it('extracts PR references like #1234', () => {
    const items = [makeItem({ title: 'review #4920 then merge #321' })];
    const kws = extractRegexKeywords(items);
    expect(kws).toContain('#4920');
    expect(kws).toContain('#321');
  });

  it('caps at 10 keywords', () => {
    const items = [
      makeItem({
        title: 'A-1 B-2 C-3 D-4 E-5 F-6 G-7 H-8 I-9 J-10 K-11 L-12',
      }),
    ];
    expect(extractRegexKeywords(items).length).toBeLessThanOrEqual(10);
  });

  it('returns empty array when no patterns match', () => {
    expect(extractRegexKeywords([makeItem({ title: 'plain text' })])).toEqual([]);
  });
});

describe('mergeKeywords', () => {
  it('preserves order: user → regex → semantic', () => {
    expect(mergeKeywords(['u1'], ['r1'], ['s1'])).toEqual(['u1', 'r1', 's1']);
  });

  it('deduplicates across sources', () => {
    expect(mergeKeywords(['shared'], ['shared', 'r1'], ['s1', 'shared'])).toEqual([
      'shared',
      'r1',
      's1',
    ]);
  });

  it('empty inputs work', () => {
    expect(mergeKeywords([], [], [])).toEqual([]);
  });
});

describe('rankByKeywordMatch', () => {
  it('puts items whose title contains a keyword first', () => {
    const items = [
      makeItem({ id: 'a', title: 'no match here' }),
      makeItem({ id: 'b', title: 'BE-1234 found' }),
      makeItem({ id: 'c', title: 'still no match' }),
    ];
    const ranked = rankByKeywordMatch(items, ['BE-1234']);
    expect(ranked[0].id).toBe('b');
  });

  it('case-insensitive matching', () => {
    const items = [makeItem({ id: 'a', title: 'no' }), makeItem({ id: 'b', title: 'Hello World' })];
    expect(rankByKeywordMatch(items, ['hello'])[0].id).toBe('b');
  });

  it('returns input as-is when keywords empty', () => {
    const items = [makeItem({ id: 'a' }), makeItem({ id: 'b' })];
    expect(rankByKeywordMatch(items, []).map((i) => i.id)).toEqual(['a', 'b']);
  });
});
