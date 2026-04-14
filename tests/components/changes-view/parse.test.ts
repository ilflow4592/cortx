import { describe, it, expect } from 'vitest';
import { parseDiff } from '../../../src/components/changes-view/parse';

describe('parseDiff', () => {
  it('tracks file line numbers for add/ctx, marks del with 0', () => {
    const diff = `@@ -10,3 +10,4 @@
 ctx1
-removed
+added1
+added2
 ctx2`;
    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(1);
    expect(hunks[0].header).toBe('@@ -10,3 +10,4 @@');
    expect(hunks[0].lines).toEqual([
      { type: 'ctx', num: 10, content: 'ctx1' },
      { type: 'del', num: 0, content: 'removed' },
      { type: 'add', num: 11, content: 'added1' },
      { type: 'add', num: 12, content: 'added2' },
      { type: 'ctx', num: 13, content: 'ctx2' },
    ]);
  });

  it('handles multiple hunks', () => {
    const diff = `@@ -1,1 +1,1 @@
+a
@@ -10,1 +10,1 @@
+b`;
    const hunks = parseDiff(diff);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].lines[0]).toEqual({ type: 'add', num: 1, content: 'a' });
    expect(hunks[1].lines[0]).toEqual({ type: 'add', num: 10, content: 'b' });
  });

  it('returns empty array for empty input', () => {
    expect(parseDiff('')).toEqual([]);
  });
});
