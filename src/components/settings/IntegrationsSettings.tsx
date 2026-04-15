/**
 * @module settings/IntegrationsSettings
 *
 * 외부 서비스 인증 토큰 관리 UI. OS Keychain에 저장 (localStorage 미사용).
 *
 * 현재: Notion API token만. 향후 GitHub PAT / Slack Bot token 등 추가 가능.
 */

import { useEffect, useState } from 'react';
import { getNotionApiToken, setNotionApiToken, clearNotionApiToken } from '../../services/secrets';

export function IntegrationsSettings() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <NotionTokenCard />
    </div>
  );
}

function NotionTokenCard() {
  const [stored, setStored] = useState<string | null>(null); // null=loading, ''=none, 'set'=present
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const t = await getNotionApiToken();
      setStored(t ? 'set' : '');
    })();
  }, []);

  const save = async () => {
    const v = input.trim();
    if (!v) return;
    if (!/^(ntn_|secret_)/i.test(v)) {
      setMsg({ kind: 'err', text: '토큰 형식이 다름 (ntn_… 또는 secret_… 으로 시작)' });
      return;
    }
    setBusy(true);
    try {
      await setNotionApiToken(v);
      setStored('set');
      setInput('');
      setMsg({ kind: 'ok', text: 'OS Keychain에 저장됨' });
    } catch (e) {
      setMsg({ kind: 'err', text: `저장 실패: ${String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await clearNotionApiToken();
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
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Notion API Token</h3>
        <StatusBadge status={stored} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px' }}>
        Internal Integration token (ntn_… / secret_…). 설정 시 Pin/검색이 REST API를 우선 사용해 5배 빠름. 토큰은 OS
        Keychain에 암호화 저장 — localStorage에는 절대 보관 안 됨.
      </p>
      <p style={{ fontSize: 11, color: 'var(--fg-faint)', margin: '0 0 12px' }}>
        발급:{' '}
        <a
          href="https://www.notion.so/my-integrations"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent)' }}
        >
          notion.so/my-integrations
        </a>{' '}
        → New integration → Internal → Read content. 사용할 페이지마다 ‘연결’에서 integration 추가 필요.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="password"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={stored === 'set' ? '••• stored •••' : 'ntn_… 또는 secret_…'}
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
          onClick={save}
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
          onClick={clear}
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
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: msg.kind === 'ok' ? '#22c55e' : '#ef4444',
          }}
        >
          {msg.text}
        </div>
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
