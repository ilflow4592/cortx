/**
 * @module settings/IntegrationsSettings
 *
 * 외부 서비스 인증 토큰 관리 UI. OS Keychain에 저장 (localStorage 미사용).
 *
 * 지원 서비스: Notion / GitHub / Slack.
 * 각 카드는 동일한 구조(조회/저장/삭제/상태)를 공유하므로 SecretTokenCard로 일반화.
 */

import { useEffect, useState } from 'react';
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

interface SecretTokenCardProps {
  title: string;
  description: string;
  issueLink: { url: string; label: string; suffix: string };
  placeholder: string;
  validate: (token: string) => string | null;
  load: () => Promise<string | undefined>;
  save: (token: string) => Promise<void>;
  clear: () => Promise<void>;
}

function SecretTokenCard({
  title,
  description,
  issueLink,
  placeholder,
  validate,
  load,
  save,
  clear,
}: SecretTokenCardProps) {
  const [stored, setStored] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await load();
      setStored(t ? 'set' : '');
    })();
  }, [load]);

  const onSave = async () => {
    const v = input.trim();
    if (!v) return;
    const err = validate(v);
    if (err) {
      setMsg({ kind: 'err', text: err });
      return;
    }
    setBusy(true);
    try {
      await save(v);
      setStored('set');
      setInput('');
      setMsg({ kind: 'ok', text: 'OS Keychain에 저장됨' });
    } catch (e) {
      setMsg({ kind: 'err', text: `저장 실패: ${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    setBusy(true);
    try {
      await clear();
      setStored('');
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{title}</h3>
        <StatusBadge status={stored} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>{description}</p>
      <p style={{ fontSize: 11, color: 'var(--fg-faint)', margin: '0 0 12px' }}>
        발급:{' '}
        <a href={issueLink.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
          {issueLink.label}
        </a>{' '}
        {issueLink.suffix}
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={stored === 'set' ? '••• stored •••' : placeholder}
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
          onClick={onSave}
          disabled={busy || !input.trim()}
          style={{
            padding: '6px 12px',
            background: 'var(--accent)',
            color: '#e5e5e5',
            border: 'none',
            borderRadius: 4,
            fontSize: 12,
            cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >
          저장
        </button>
        <button
          onClick={onClear}
          disabled={busy || stored !== 'set'}
          style={{
            padding: '6px 12px',
            background: 'transparent',
            color: '#ef4444',
            border: '1px solid #ef4444',
            borderRadius: 4,
            fontSize: 12,
            cursor: busy || stored !== 'set' ? 'not-allowed' : 'pointer',
            opacity: busy || stored !== 'set' ? 0.5 : 1,
          }}
        >
          삭제
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: 8, fontSize: 11, color: msg.kind === 'ok' ? '#22c55e' : '#ef4444' }}>{msg.text}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === null) {
    return <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>loading…</span>;
  }
  if (status === 'set') {
    return (
      <span
        style={{
          fontSize: 10,
          padding: '2px 8px',
          borderRadius: 3,
          background: 'rgba(34, 197, 94, 0.08)',
          color: '#22c55e',
          fontWeight: 600,
        }}
      >
        configured
      </span>
    );
  }
  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 3,
        background: 'rgba(148, 163, 184, 0.1)',
        color: '#94a3b8',
        fontWeight: 600,
      }}
    >
      not set
    </span>
  );
}

export function IntegrationsSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SecretTokenCard
        title="Notion API Token"
        description="Internal Integration token (ntn_… / secret_…). 설정 시 Pin/검색이 REST API를 우선 사용해 5배 빠름. 토큰은 OS Keychain에 암호화 저장 — localStorage에는 절대 보관 안 됨."
        issueLink={{
          url: 'https://www.notion.so/my-integrations',
          label: 'notion.so/my-integrations',
          suffix: '→ New integration → Internal → Read content. 사용할 페이지마다 ‘연결’에서 integration 추가 필요.',
        }}
        placeholder="ntn_… 또는 secret_…"
        validate={(v) => (/^(ntn_|secret_)/i.test(v) ? null : '토큰 형식이 다름 (ntn_… 또는 secret_… 으로 시작)')}
        load={getNotionApiToken}
        save={setNotionApiToken}
        clear={clearNotionApiToken}
      />
      <SecretTokenCard
        title="GitHub Personal Access Token"
        description="Fine-grained or Classic PAT (ghp_… / github_pat_…). Issues/PR/Commit 검색용. repo 스코프 필요."
        issueLink={{
          url: 'https://github.com/settings/tokens',
          label: 'github.com/settings/tokens',
          suffix: '→ Generate new token → repo 스코프 체크.',
        }}
        placeholder="ghp_… 또는 github_pat_…"
        validate={(v) =>
          /^(ghp_|github_pat_)/i.test(v) ? null : '토큰 형식이 다름 (ghp_… 또는 github_pat_… 으로 시작)'
        }
        load={getGithubPat}
        save={setGithubPat}
        clear={clearGithubPat}
      />
      <SecretTokenCard
        title="Slack Bot Token"
        description="Bot User OAuth Token (xoxb-…). 채널 메시지 검색용. channels:history, search:read 스코프 필요."
        issueLink={{
          url: 'https://api.slack.com/apps',
          label: 'api.slack.com/apps',
          suffix: '→ Create App → OAuth & Permissions → Bot Token Scopes.',
        }}
        placeholder="xoxb-…"
        validate={(v) => (/^xoxb-/i.test(v) ? null : '토큰 형식이 다름 (xoxb-… 으로 시작)')}
        load={getSlackBotToken}
        save={setSlackBotToken}
        clear={clearSlackBotToken}
      />
    </div>
  );
}
