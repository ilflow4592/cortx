/** DiffViewer 도메인 타입. */

export type DiffMode = 'branch' | 'staged' | 'unstaged';

export interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  header: string;
  lines: { type: 'add' | 'del' | 'ctx'; content: string }[];
}

export interface ParsedDiff {
  file: string;
  hunks: DiffHunk[];
}
