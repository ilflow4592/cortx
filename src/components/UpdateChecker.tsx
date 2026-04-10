/**
 * Update Checker dialog — triggers a manual update check, shows release notes,
 * and offers download-and-install with progress.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, X, AlertCircle, ArrowUp } from 'lucide-react';
import Markdown from 'react-markdown';
import { checkForUpdates, downloadAndInstall, relaunchApp, type UpdateInfo } from '../services/updater';

interface Props {
  onClose: () => void;
}

type Phase = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installed' | 'error';

export function UpdateChecker({ onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<{ downloaded: number; total?: number } | null>(null);
  const [error, setError] = useState('');

  const runCheck = useCallback(async () => {
    setPhase('checking');
    setError('');
    try {
      const result = await checkForUpdates();
      setInfo(result);
      setPhase(result.available ? 'available' : 'up-to-date');
    } catch (err) {
      setError(String(err));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async data load
    runCheck();
  }, [runCheck]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const runInstall = async () => {
    if (!info?.update) return;
    setPhase('downloading');
    setProgress({ downloaded: 0 });
    try {
      await downloadAndInstall(info.update, (downloaded, total) => {
        setProgress({ downloaded, total });
      });
      setPhase('installed');
    } catch (err) {
      setError(String(err));
      setPhase('error');
    }
  };

  const runRelaunch = async () => {
    try {
      await relaunchApp();
    } catch (err) {
      setError(String(err));
    }
  };

  const progressPct =
    progress && progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : 0;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '90vw',
          maxHeight: '85vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <ArrowUp size={18} color="var(--accent)" strokeWidth={1.5} />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' }}>Check for Updates</div>
          <CloseButton onClose={onClose} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {phase === 'checking' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 0',
                color: 'var(--fg-muted)',
                fontSize: 12,
              }}
            >
              <RefreshCw size={14} className="spinner" strokeWidth={1.5} />
              Checking for updates...
            </div>
          )}

          {phase === 'up-to-date' && info && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '24px 0',
                gap: 12,
              }}
            >
              <CheckCircle2 size={40} color="#34d399" strokeWidth={1.5} />
              <div style={{ fontSize: 14, color: 'var(--fg-primary)', fontWeight: 600 }}>You're up to date</div>
              <div style={{ fontSize: 11, color: 'var(--fg-subtle)', fontFamily: "'JetBrains Mono', monospace" }}>
                Cortx v{info.currentVersion}
              </div>
            </div>
          )}

          {phase === 'available' && info && (
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
              {info.releaseNotes && (
                <div
                  style={{
                    padding: 12,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--bg-surface-hover)',
                    borderRadius: 6,
                    marginBottom: 14,
                    fontSize: 11,
                    color: 'var(--fg-secondary)',
                    maxHeight: 240,
                    overflowY: 'auto',
                  }}
                >
                  <Markdown>{info.releaseNotes}</Markdown>
                </div>
              )}
              <button
                onClick={runInstall}
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
          )}

          {phase === 'downloading' && (
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
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }}>
                  {(progress.downloaded / 1024 / 1024).toFixed(1)}MB / {(progress.total / 1024 / 1024).toFixed(1)}MB ({progressPct}%)
                </div>
              ) : (
                <div style={{ fontSize: 10, color: 'var(--fg-faint)', textAlign: 'center' }}>
                  {(progress?.downloaded || 0 / 1024 / 1024).toFixed(1)}MB downloaded
                </div>
              )}
            </div>
          )}

          {phase === 'installed' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px 0',
                gap: 12,
              }}
            >
              <CheckCircle2 size={40} color="#34d399" strokeWidth={1.5} />
              <div style={{ fontSize: 14, color: 'var(--fg-primary)', fontWeight: 600 }}>Update installed</div>
              <div style={{ fontSize: 11, color: 'var(--fg-subtle)', textAlign: 'center' }}>
                Restart the app to apply the new version.
              </div>
              <button
                onClick={runRelaunch}
                style={{
                  marginTop: 8,
                  padding: '8px 18px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  background: 'rgba(52,211,153,0.15)',
                  border: '1px solid rgba(52,211,153,0.4)',
                  color: '#34d399',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Restart Now
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div>
              <div
                style={{
                  padding: 12,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 6,
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                }}
              >
                <AlertCircle size={14} color="#ef4444" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 4 }}>
                    Update check failed
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--fg-muted)',
                      fontFamily: "'JetBrains Mono', monospace",
                      wordBreak: 'break-word',
                    }}
                  >
                    {error}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--fg-faint)', lineHeight: 1.6 }}>
                Make sure the updater is properly configured with a signing public key and that the release endpoint
                is reachable. See <code style={{ color: 'var(--fg-subtle)' }}>docs/auto-update.md</code>.
              </div>
              <button
                onClick={runCheck}
                style={{
                  marginTop: 14,
                  width: '100%',
                  padding: '8px 14px',
                  borderRadius: 6,
                  fontSize: 11,
                  background: 'var(--accent-bg)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-bright)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <RefreshCw size={11} strokeWidth={1.5} /> Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(239,68,68,0.1)' : 'none',
        border: `1px solid ${hovered ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
        color: hovered ? '#ef4444' : 'var(--fg-faint)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      <X size={16} strokeWidth={1.5} />
    </button>
  );
}
