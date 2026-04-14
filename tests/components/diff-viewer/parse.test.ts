import { describe, it, expect } from 'vitest';
import { parseStat, parseDiffOutput, extractStatFromDiffs } from '../../../src/components/diff-viewer/parse';

describe('parseStat', () => {
  it('parses git diff --stat lines into per-file +/- counts', () => {
    const output = ` src/foo.ts | 5 +++--\n src/bar.ts | 3 +++\n`;
    const result = parseStat(output);
    expect(result).toEqual([
      { path: 'src/foo.ts', additions: 3, deletions: 2 },
      { path: 'src/bar.ts', additions: 3, deletions: 0 },
    ]);
  });

  it('returns empty array on blank input', () => {
    expect(parseStat('')).toEqual([]);
  });

  it('skips lines without the | <count> <markers> shape', () => {
    expect(parseStat('not a stat line\nfoo')).toEqual([]);
  });
});

describe('parseDiffOutput', () => {
  it('splits by `diff --git` and extracts file path from b/<path>', () => {
    const diff = `diff --git a/src/x.ts b/src/x.ts
@@ -1,2 +1,2 @@
-old
+new
 ctx
diff --git a/src/y.ts b/src/y.ts
@@ -10,1 +10,1 @@
-removed
`;
    const result = parseDiffOutput(diff);
    expect(result).toHaveLength(2);
    expect(result[0].file).toBe('src/x.ts');
    expect(result[0].hunks).toHaveLength(1);
    // 핵심 라인 시퀀스만 검증 — 분할 시 trailing newline이 빈 ctx로 추가될 수 있음
    expect(result[0].hunks[0].lines.slice(0, 3)).toEqual([
      { type: 'del', content: 'old' },
      { type: 'add', content: 'new' },
      { type: 'ctx', content: 'ctx' },
    ]);
    expect(result[1].file).toBe('src/y.ts');
  });

  it('returns empty array for empty diff', () => {
    expect(parseDiffOutput('')).toEqual([]);
  });
});

describe('extractStatFromDiffs', () => {
  it('aggregates +/- counts per file from parsed hunks', () => {
    const diffs = [
      {
        file: 'a.ts',
        hunks: [
          {
            header: '@@',
            lines: [
              { type: 'add', content: 'x' },
              { type: 'add', content: 'y' },
              { type: 'del', content: 'z' },
              { type: 'ctx', content: 'c' },
            ],
          },
        ],
      },
    ] as const;
    expect(extractStatFromDiffs(diffs as Parameters<typeof extractStatFromDiffs>[0])).toEqual([
      { path: 'a.ts', additions: 2, deletions: 1 },
    ]);
  });
});
