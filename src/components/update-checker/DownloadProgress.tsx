/** 다운로드 진행률 바 + 바이트 요약. */
import type { DownloadProgressState } from './types';

interface Props {
  progress: DownloadProgressState | null;
}

export function DownloadProgress({ progress }: Props) {
  const progressPct =
    progress && progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : 0;

  return (
    <div style={{ padding: '16px 0' }}>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 12, textAlign: 'center' }}>
        Downloading update...
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--bg-surface-hover)',
          borderRadius: 3,
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: '100%',
            width: progress?.total ? `${progressPct}%` : '40%',
            background: 'var(--accent)',
            transition: 'width 120ms ease',
          }}
        />
      </div>
      {progress?.total ? (
        <div
          style={{
            fontSize: 10,
            color: 'var(--fg-faint)',
            textAlign: 'center',
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {(progress.downloaded / 1024 / 1024).toFixed(1)}MB / {(progress.total / 1024 / 1024).toFixed(1)}MB (
          {progressPct}%)
        </div>
      ) : (
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', textAlign: 'center' }}>
          {(progress?.downloaded || 0 / 1024 / 1024).toFixed(1)}MB downloaded
        </div>
      )}
    </div>
  );
}
