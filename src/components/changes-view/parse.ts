/** `git diff` 출력 파서 — file 라인 번호를 함께 추적해 인라인 표시 지원. */
import type { DiffHunk } from './types';

/**
 * unified diff에서 hunks를 추출. 각 add/ctx 라인은 우측(file) 라인 번호를
 * 보관하고, del 라인은 0으로 마킹한다 (현재 파일에 존재하지 않으므로).
 */
export function parseDiff(output: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let lineNum = 0;

  for (const line of output.split('\n')) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      lineNum = match ? parseInt(match[1]) - 1 : 0;
      current = { header: line, lines: [] };
      hunks.push(current);
    } else if (current) {
      if (line.startsWith('+')) {
        lineNum++;
        current.lines.push({ type: 'add', num: lineNum, content: line.slice(1) });
      } else if (line.startsWith('-')) {
        current.lines.push({ type: 'del', num: 0, content: line.slice(1) });
      } else if (line.startsWith(' ') || line === '') {
        lineNum++;
        current.lines.push({ type: 'ctx', num: lineNum, content: line.slice(1) || '' });
      }
    }
  }
  return hunks;
}
