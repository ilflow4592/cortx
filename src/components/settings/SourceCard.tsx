/**
 * @module settings/SourceCard
 * 외부 소스(GitHub/Slack/Notion)의 수집 범위 설정 카드.
 * 토큰 자체는 Integrations 탭에서 OS Keychain에 저장 — 여기서는 토큰 입력 UI 없음.
 * owner/repo, channel ID, database ID 등 '어디서 수집할지'만 담당.
 */
import { useEffect, useState } from 'react';
import type { ContextSourceConfig } from '../../types/contextPack';
import { hasGithubPat, hasSlackBotToken, hasNotionApiToken } from '../../services/secrets';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

/** 서비스별 Keychain 토큰 존재 여부 확인. 실패 시 false. */
async function hasKeychainToken(type: ContextSourceConfig['type']): Promise<boolean> {
  try {
    if (type === 'github') return await hasGithubPat();
    if (type === 'slack') return await hasSlackBotToken();
    if (type === 'notion') return await hasNotionApiToken();
    return false;
  } catch {
    return false;
  }
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

  // Keychain 토큰 존재 여부 (null=loading, boolean=확정)
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  // GitHub 전용: gh CLI 인증 상태. token 없어도 gh CLI가 있으면 수집 가능.
  const [ghCliAuth, setGhCliAuth] = useState(source.type === 'github' && source.enabled);

  useEffect(() => {
    void hasKeychainToken(source.type).then(setHasToken);
  }, [source.type]);

  useEffect(() => {
    if (source.type !== 'github') return;
    invoke<{ success: boolean; output: string }>('run_shell_command', {
      cwd: '/',
      command: 'gh auth status 2>&1',
    })
      .then((r) => setGhCliAuth(r.success || r.output.includes('Logged in')))
      .catch(() => setGhCliAuth(false));
  }, [source.type]);

  // Connected 판정: Keychain 토큰 있음 OR (github + gh CLI 인증) — hasToken이 null이면 낙관적으로 enabled 사용
  const tokenKnown = hasToken !== null;
  const isConnected = source.enabled && ((tokenKnown ? hasToken : false) || (source.type === 'github' && ghCliAuth));

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
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: isConnected ? '#34d399' : 'var(--fg-subtle)',
              }}
            />
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        <button className="source-remove" onClick={onRemove}>
          Remove
        </button>
      </div>

      {/* 소스별 범위 입력 — 항상 편집 가능 */}
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

      {/* 토큰 안내 — Keychain에 없고 gh CLI fallback도 없는 경우만 */}
      {tokenKnown && !hasToken && !(source.type === 'github' && ghCliAuth) && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--fg-faint)',
            padding: 8,
            background: 'rgba(148,163,184,0.06)',
            borderRadius: 6,
            lineHeight: 1.5,
          }}
        >
          🔑 Token not configured. Set it in the{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Integrations</span> tab — tokens are stored in OS
          Keychain.
          {source.type === 'github' && ' Alternatively, authenticate via `gh auth login` in your terminal.'}
        </div>
      )}
    </div>
  );
}
