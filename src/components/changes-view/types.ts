/** ChangesView 도메인 타입. */

export interface ChangedFile {
  path: string;
  /** Git status code: M, A, D, R, ? */
  status: string;
}

export interface DiffHunk {
  header: string;
  /** num은 add/ctx에서 file 라인 번호, del에서는 0 */
  lines: { type: 'add' | 'del' | 'ctx'; num: number; content: string }[];
}
