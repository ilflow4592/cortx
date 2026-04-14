import { useState, useEffect } from 'react';
import type { ContextSourceConfig } from '../../types/contextPack';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export function SourceCard({
  source,
  onUpdate,
  onRemove,
}: {
  source: ContextSourceConfig;
  onUpdate: (u: Partial<ContextSourceConfig>) => void;
  onRemove: () => void;
}) {
  const label = source.type === 'github' ? '🐙 GitHub' : source.type === 'slack' ? '💬 Slack' : '📄 Notion';
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [tokenDraft, setTokenDraft] = useState(source.token);

  const [ghCliAuth, setGhCliAuth] = useState(false);

  // Check gh CLI auth for GitHub sources without token
  useEffect(() => {
    if (source.type === 'github' && !source.token) {
      invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: '/',
        command: 'gh auth status 2>&1',
      })
        .then((r) => {
          if (r.success || r.output.includes('Logged in')) {
            setGhCliAuth(true);
            if (!source.enabled) onUpdate({ enabled: true });
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onUpdate is a prop callback; adding it causes infinite re-renders
  }, [source.type, source.token]);

  const isConnected = source.enabled && (!!source.token || (source.type === 'github' && ghCliAuth));

  const handleConnect = async () => {
    if (!tokenDraft) return;
    setVerifying(true);
    setVerifyError('');

    try {
      if (source.type === 'github') {
        const resp = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${tokenDraft}` },
        });
        if (!resp.ok) {
          setVerifyError('Invalid GitHub token');
          setVerifying(false);
          return;
        }
      } else if (source.type === 'slack') {
        const resp = await fetch('https://slack.com/api/auth.test', {
          headers: { Authorization: `Bearer ${tokenDraft}` },
        });
        const data = await resp.json();
        if (!data.ok) {
          setVerifyError(`Slack error: ${data.error}`);
          setVerifying(false);
          return;
        }
      } else if (source.type === 'notion') {
        const resp = await fetch('https://api.notion.com/v1/users/me', {
          headers: { Authorization: `Bearer ${tokenDraft}`, 'Notion-Version': '2022-06-28' },
        });
        if (!resp.ok) {
          setVerifyError('Invalid Notion token');
          setVerifying(false);
          return;
        }
      }
      // Success — save token and enable
      onUpdate({ token: tokenDraft, enabled: true });
    } catch (err) {
      setVerifyError(`Connection failed: ${err}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleDisconnect = () => {
    onUpdate({ token: '', enabled: false });
    setTokenDraft('');
    setVerifyError('');
  };

  return (
    <div
      className="source-card"
      style={{
        borderColor: isConnected ? '#34d39925' : undefined,
        background: isConnected ? 'rgba(52,211,153,0.02)' : undefined,
      }}
    >
      <div className="source-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="source-card-title">{label}</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 600,
              background: isConnected ? 'rgba(52,211,153,0.08)' : 'var(--bg-chip)',
              color: isConnected ? '#34d399' : 'var(--fg-subtle)',
            }}
          >
            <span
              style={{ width: 5, height: 5, borderRadius: '50%', background: isConnected ? '#34d399' : 'var(--fg-subtle)' }}
            />
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <button className="source-remove" onClick={onRemove}>
          Remove
        </button>
      </div>

      {isConnected ? (
        /* Connected state */
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#888895', fontFamily: "'JetBrains Mono', monospace" }}>
            {source.token
              ? `${source.token.slice(0, 8)}...${source.token.slice(-4)}`
              : source.type === 'github' && ghCliAuth
                ? 'via gh CLI'
                : '—'}
          </span>
          {source.token && (
            <button
              onClick={handleDisconnect}
              style={{
                fontSize: 11,
                color: '#ef4444',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Disconnect
            </button>
          )}
        </div>
      ) : (
        /* Not connected state */
        <>
          <div className="field" style={{ marginBottom: 10 }}>
            <span className="field-label">Token</span>
            <input
              className="field-input mono"
              type="password"
              value={tokenDraft}
              onChange={(e) => {
                setTokenDraft(e.target.value);
                setVerifyError('');
              }}
              placeholder={source.type === 'github' ? 'ghp_...' : source.type === 'slack' ? 'xoxb-...' : 'secret_...'}
            />
          </div>
          {source.type === 'github' && (
            <div className="source-row" style={{ marginBottom: 10 }}>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <span className="field-label">Owner</span>
                <input
                  className="field-input mono"
                  value={source.owner || ''}
                  onChange={(e) => onUpdate({ owner: e.target.value })}
                  placeholder="org-or-user"
                />
              </div>
              <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                <span className="field-label">Repo</span>
                <input
                  className="field-input mono"
                  value={source.repo || ''}
                  onChange={(e) => onUpdate({ repo: e.target.value })}
                  placeholder="repo-name"
                />
              </div>
            </div>
          )}
          {source.type === 'slack' && (
            <div className="field" style={{ marginBottom: 10 }}>
              <span className="field-label">Channel ID (optional)</span>
              <input
                className="field-input mono"
                value={source.slackChannel || ''}
                onChange={(e) => onUpdate({ slackChannel: e.target.value })}
                placeholder="C01234567"
              />
            </div>
          )}
          {source.type === 'notion' && (
            <div className="field" style={{ marginBottom: 10 }}>
              <span className="field-label">Database ID (optional)</span>
              <input
                className="field-input mono"
                value={source.notionDatabaseId || ''}
                onChange={(e) => onUpdate({ notionDatabaseId: e.target.value })}
                placeholder="abc123..."
              />
            </div>
          )}
          {verifyError && (
            <div className="error-box" style={{ marginBottom: 10 }}>
              {verifyError}
            </div>
          )}
          <button
            onClick={handleConnect}
            disabled={!tokenDraft || verifying}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 8,
              background: tokenDraft ? '#6366f1' : 'var(--bg-chip)',
              color: tokenDraft ? '#fff' : 'var(--fg-subtle)',
              border: 'none',
              fontSize: 13,
              fontWeight: 600,
              cursor: tokenDraft ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            {verifying ? 'Verifying...' : 'Connect'}
          </button>
        </>
      )}
    </div>
  );
}
