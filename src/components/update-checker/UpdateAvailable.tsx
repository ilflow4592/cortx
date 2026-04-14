/** 업데이트 가능 상태 카드 + 다운로드 버튼. */
import { ArrowUp, Download } from 'lucide-react';
import type { UpdateInfo } from './api';
import { ReleaseNotes } from './ReleaseNotes';

interface Props {
  info: UpdateInfo;
  onInstall: () => void;
}

export function UpdateAvailable({ info, onInstall }: Props) {
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 4 }}>New version available</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              color: 'var(--fg-subtle)',
              fontFamily: "'JetBrains Mono', monospace",
              textDecoration: 'line-through',
            }}
          >
            v{info.currentVersion}
          </span>
          <ArrowUp size={12} color="#34d399" />
          <span
            style={{
              fontSize: 15,
              color: '#34d399',
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
            }}
          >
            v{info.latestVersion}
          </span>
        </div>
        {info.releaseDate && (
          <div style={{ fontSize: 10, color: 'var(--fg-faint)', marginTop: 4 }}>Released: {info.releaseDate}</div>
        )}
      </div>
      {info.releaseNotes && <ReleaseNotes notes={info.releaseNotes} />}
      <button
        onClick={onInstall}
        style={{
          width: '100%',
          padding: '10px 16px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          background: 'rgba(52,211,153,0.15)',
          border: '1px solid rgba(52,211,153,0.4)',
          color: '#34d399',
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Download size={13} strokeWidth={1.5} /> Download & Install
      </button>
    </>
  );
}
