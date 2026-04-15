/**
 * @module settings/IntegrationsSettings
 *
 * 외부 서비스(Notion/GitHub/Slack) 통합 관리 — 각 카드 1개가
 *   · 토큰 (OS Keychain)
 *   · 수집 범위 (owner/repo · channel · database ID)
 *   · 활성화 토글 (contextPackStore.sources[].enabled)
 * 를 모두 담당한다. 과거 "Context Sources" 탭과 분리돼 있던 토큰/범위 설정이
 * 여기로 통합되면서 사용자는 1 서비스 = 1 카드 모델로 설정한다.
 */

import { useEffect, useState } from 'react';
import type { ContextSourceConfig, ContextSourceType } from '../../types/contextPack';
import { useContextPackStore } from '../../stores/contextPackStore';
import {
  getNotionApiToken,
  setNotionApiToken,
  clearNotionApiToken,
  getGithubPat,
  setGithubPat,
  clearGithubPat,
  getSlackBotToken,
  setSlackBotToken,
  clearSlackBotToken,
} from '../../services/secrets';

interface ServiceConfig {
  title: string;
  emoji: string;
  description: string;
  issueLink: { url: string; label: string; suffix: string };
  placeholder: string;
  validate: (token: string) => string | null;
  get: () => Promise<string | undefined>;
  set: (t: string) => Promise<void>;
  clear: () => Promise<void>;
}

const CONFIGS: Record<'github' | 'slack' | 'notion', ServiceConfig> = {
  notion: {
    title: 'Notion',
    emoji: '📄',
    description: 'Internal Integration token + database ID를 설정하면 REST API로 Pin/검색이 5배 빠름.',
    issueLink: {
      url: 'https://www.notion.so/my-integrations',
      label: 'notion.so/my-integrations',
      suffix: '→ New integration → Internal → Read content. 사용할 페이지마다 연결 추가.',
    },
    placeholder: 'ntn_… 또는 secret_…',
    validate: (v) => (/^(ntn_|secret_)/i.test(v) ? null : '토큰 형식이 다름 (ntn_… 또는 secret_… 으로 시작)'),
    get: getNotionApiToken,
    set: setNotionApiToken,
    clear: clearNotionApiToken,
  },
  github: {
    title: 'GitHub',
    emoji: '🐙',
    description: 'Fine-grained or Classic PAT + owner/repo로 Issues/PR/Commit 검색.',
    issueLink: {
      url: 'https://github.com/settings/tokens',
      label: 'github.com/settings/tokens',
      suffix: '→ Generate new token → repo 스코프 체크. 또는 터미널에서 `gh auth login` 사용 가능.',
    },
    placeholder: 'ghp_… 또는 github_pat_…',
    validate: (v) => (/^(ghp_|github_pat_)/i.test(v) ? null : '토큰 형식이 다름 (ghp_… 또는 github_pat_… 으로 시작)'),
    get: getGithubPat,
    set: setGithubPat,
    clear: clearGithubPat,
  },
  slack: {
    title: 'Slack',
    emoji: '💬',
    description: 'Bot User OAuth Token + channel ID로 채널 메시지 검색.',
    issueLink: {
      url: 'https://api.slack.com/apps',
      label: 'api.slack.com/apps',
      suffix: '→ Create App → OAuth & Permissions → Bot Token Scopes (channels:history, search:read).',
    },
    placeholder: 'xoxb-…',
    validate: (v) => (/^xoxb-/i.test(v) ? null : '토큰 형식이 다름 (xoxb-… 으로 시작)'),
    get: getSlackBotToken,
    set: setSlackBotToken,
    clear: clearSlackBotToken,
  },
};

export function IntegrationsSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <IntegrationCard type="notion" />
      <IntegrationCard type="github" />
      <IntegrationCard type="slack" />
    </div>
  );
}

function IntegrationCard({ type }: { type: 'github' | 'slack' | 'notion' }) {
  const cfg = CONFIGS[type];
  const sources = useContextPackStore((s) => s.sources);
  const source = sources.find((s) => s.type === type);
  const enabled = source?.enabled ?? false;

  // 토큰 상태
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    void cfg.get().then((t) => setHasToken(!!t));
  }, [cfg]);

  // source upsert — 없으면 생성, 있으면 index 기반 업데이트
  const upsertSource = (patch: Partial<ContextSourceConfig>) => {
    const state = useContextPackStore.getState();
    const idx = state.sources.findIndex((s) => s.type === type);
    if (idx < 0) {
      state.addSource({ type, enabled: true, ...patch });
    } else {
      state.updateSource(idx, patch);
    }
  };

  const onSaveToken = async () => {
    const v = tokenInput.trim();
    if (!v) return;
    const err = cfg.validate(v);
    if (err) {
      setMsg({ kind: 'err', text: err });
      return;
    }
    setBusy(true);
    try {
      await cfg.set(v);
      setHasToken(true);
      setTokenInput('');
      setMsg({ kind: 'ok', text: 'OS Keychain에 저장됨' });
      // 토큰 저장 시 자동으로 소스 활성화 (사용자 의도: 저장 = 사용하겠다)
      if (!source) upsertSource({});
    } catch (e) {
      setMsg({ kind: 'err', text: `저장 실패: ${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const onClearToken = async () => {
    setBusy(true);
    try {
      await cfg.clear();
      setHasToken(false);
      setMsg({ kind: 'ok', text: 'Keychain에서 삭제됨' });
    } catch (e) {
      setMsg({ kind: 'err', text: `삭제 실패: ${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 16,
        background: 'var(--bg-elevated)',
      }}
    >
      {/* Header: 제목 + Enable 토글 + 상태 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          {cfg.emoji} {cfg.title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StatusBadge hasToken={hasToken} enabled={enabled} />
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-muted)' }}
            title="수집 파이프라인 사용 여부"
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => upsertSource({ enabled: e.target.checked })}
              style={{ margin: 0 }}
            />
            Enable
          </label>
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 8px' }}>{cfg.description}</p>
      <p style={{ fontSize: 11, color: 'var(--fg-faint)', margin: '0 0 14px' }}>
        발급:{' '}
        <a href={cfg.issueLink.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          {cfg.issueLink.label}
        </a>{' '}
        {cfg.issueLink.suffix}
      </p>

      {/* Token */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', textTransform: 'uppercase', marginBottom: 6 }}>
          Token (OS Keychain)
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={hasToken ? '••• stored •••' : cfg.placeholder}
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              background: 'var(--bg-chip)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              padding: '6px 10px',
              fontSize: 12,
              color: 'var(--fg-primary)',
              fontFamily: 'Fira Code, JetBrains Mono, monospace',
            }}
          />
          <button
            onClick={onSaveToken}
            disabled={busy || !tokenInput.trim()}
            style={{
              padding: '6px 12px',
              background: 'var(--accent)',
              color: '#e5e5e5',
              border: 'none',
              borderRadius: 4,
              fontSize: 12,
              cursor: busy || !tokenInput.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !tokenInput.trim() ? 0.5 : 1,
            }}
          >
            저장
          </button>
          <button
            onClick={onClearToken}
            disabled={busy || !hasToken}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: '#ef4444',
              border: '1px solid #ef4444',
              borderRadius: 4,
              fontSize: 12,
              cursor: busy || !hasToken ? 'not-allowed' : 'pointer',
              opacity: busy || !hasToken ? 0.5 : 1,
            }}
          >
            삭제
          </button>
        </div>
        {msg && (
          <div style={{ marginTop: 6, fontSize: 11, color: msg.kind === 'ok' ? '#22c55e' : '#ef4444' }}>{msg.text}</div>
        )}
      </div>

      {/* Scope — 서비스별 */}
      <ScopeFields type={type} source={source} onUpdate={upsertSource} />
    </div>
  );
}

function ScopeFields({
  type,
  source,
  onUpdate,
}: {
  type: ContextSourceType;
  source: ContextSourceConfig | undefined;
  onUpdate: (patch: Partial<ContextSourceConfig>) => void;
}) {
  const label = 'Scope (선택)';
  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--fg-faint)',
    textTransform: 'uppercase',
    marginBottom: 6,
  };
  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: 'var(--bg-chip)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 4,
    padding: '6px 10px',
    fontSize: 12,
    color: 'var(--fg-primary)',
    fontFamily: 'Fira Code, JetBrains Mono, monospace',
  };

  if (type === 'github') {
    return (
      <div>
        <div style={labelStyle}>{label}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={source?.owner || ''}
            onChange={(e) => onUpdate({ owner: e.target.value })}
            placeholder="owner (org 또는 user)"
            style={inputStyle}
          />
          <input
            value={source?.repo || ''}
            onChange={(e) => onUpdate({ repo: e.target.value })}
            placeholder="repo name"
            style={inputStyle}
          />
        </div>
      </div>
    );
  }

  if (type === 'slack') {
    return (
      <div>
        <div style={labelStyle}>{label}</div>
        <input
          value={source?.slackChannel || ''}
          onChange={(e) => onUpdate({ slackChannel: e.target.value })}
          placeholder="Channel ID (예: C01234567)"
          style={inputStyle}
        />
      </div>
    );
  }

  if (type === 'notion') {
    return (
      <div>
        <div style={labelStyle}>{label}</div>
        <input
          value={source?.notionDatabaseId || ''}
          onChange={(e) => onUpdate({ notionDatabaseId: e.target.value })}
          placeholder="Database ID (예: abc123…)"
          style={inputStyle}
        />
      </div>
    );
  }

  return null;
}

function StatusBadge({ hasToken, enabled }: { hasToken: boolean | null; enabled: boolean }) {
  if (hasToken === null) {
    return <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>loading…</span>;
  }
  const connected = hasToken && enabled;
  const bg = connected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(148, 163, 184, 0.1)';
  const color = connected ? '#22c55e' : '#94a3b8';
  const text = !hasToken ? 'no token' : !enabled ? 'disabled' : 'connected';
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 3,
        background: bg,
        color,
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}
