/** UpdateChecker 도메인 타입. */

export type Phase = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installed' | 'error';

export interface DownloadProgressState {
  downloaded: number;
  total?: number;
}
