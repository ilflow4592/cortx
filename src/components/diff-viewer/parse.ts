/** `git diff` 출력 파서 — stat 라인과 unified diff 모두 지원. */
import type { DiffFile, DiffHunk, ParsedDiff } from './types';

/** `git diff --stat` 라인에서 파일별 +/- 카운트 추출. */
export function parseStat(output: string): DiffFile[] {
  const lines = output.trim().split('\n');
  const files: DiffFile[] = [];
  for (const line of lines) {
    const match = line.match(/^\s*(.+?)\s*\|\s*(\d+)\s*([+-]*)/);
    if (!match) continue;
    const path = match[1].trim();
    const plusCount = (match[3].match(/\+/g) || []).length;
    const minusCount = (match[3].match(/-/g) || []).length;
    files.push({ path, additions: plusCount, deletions: minusCount });
  }
  return files;
}

/** `git diff` 전체 출력 → 파일별 hunks. `diff --git` 단위로 분할. */
export function parseDiffOutput(output: string): ParsedDiff[] {
  const diffs: ParsedDiff[] = [];
  const fileParts = output.split(/^diff --git /m).filter(Boolean);
  for (const part of fileParts) {
    const lines = part.split('\n');
    const headerLine = lines[0] || '';
    const bMatch = headerLine.match(/b\/(.+)/);
    const file = bMatch ? bMatch[1] : headerLine;
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;

    for (const line of lines.slice(1)) {
      if (line.startsWith('@@')) {
        currentHunk = { header: line, lines: [] };
        hunks.push(currentHunk);
      } else if (currentHunk) {
        if (line.startsWith('+')) {
          currentHunk.lines.push({ type: 'add', content: line.slice(1) });
        } else if (line.startsWith('-')) {
          currentHunk.lines.push({ type: 'del', content: line.slice(1) });
        } else if (line.startsWith(' ') || line === '') {
          currentHunk.lines.push({ type: 'ctx', content: line.slice(1) || '' });
        }
      }
    }
    diffs.push({ file, hunks });
  }
  return diffs;
}

/** 파싱된 diff hunks에서 파일별 +/- 카운트 재계산 (--stat 없이 동작) */
export function extractStatFromDiffs(diffs: ParsedDiff[]): DiffFile[] {
  return diffs.map((d) => {
    let additions = 0;
    let deletions = 0;
    for (const h of d.hunks) {
      for (const l of h.lines) {
        if (l.type === 'add') additions++;
        if (l.type === 'del') deletions++;
      }
    }
    return { path: d.file, additions, deletions };
  });
}
