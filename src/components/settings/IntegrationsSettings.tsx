/**
 * @module settings/IntegrationsSettings
 *
 * 외부 서비스(Notion/GitHub/Slack) 통합 관리 — 각 카드 1개가
 *   · 토큰 (OS Keychain)
 *   · 활성화 토글 (contextPackStore.sources[].enabled)
 * 을 담당한다. 1 서비스 = 1 카드. 수집 범위(owner/repo, channel, dbId)는 UI에서
 * 노출하지 않고 저장된 값이 있으면 그대로 사용 (설정 단순화).
 */

import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { ContextSourceConfig } from '../../types/contextPack';
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

// ── Brand SVG Icons (simple-icons, MIT) ──────────────────────

function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

function NotionIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z" />
    </svg>
  );
}

/** Slack 공식 4색 로고 */
function SlackIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#E01E5A"
        d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z"
      />
      <path
        fill="#36C5F0"
        d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z"
      />
      <path
        fill="#2EB67D"
        d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312z"
      />
      <path
        fill="#ECB22E"
        d="M15.165 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z"
      />
    </svg>
  );
}

// ── Service Config ───────────────────────────────────────────

interface ServiceConfig {
  title: string;
  Icon: (props: { size?: number }) => JSX.Element;
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
    Icon: NotionIcon,
    description: 'Internal Integration token을 저장하면 REST API로 Pin/검색이 5배 빠름.',
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
    Icon: GitHubIcon,
    description: 'Fine-grained or Classic PAT로 Issues/PR/Commit 검색.',
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
    Icon: SlackIcon,
    description: 'Bot User OAuth Token으로 채널 메시지 검색.',
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

  const Icon = cfg.Icon;

  return (
    <div
      style={{
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 16,
        background: 'var(--bg-elevated)',
      }}
    >
      {/* Header: 브랜드 아이콘 + 제목 + Enable 토글 + 상태 뱃지 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon size={18} />
          {cfg.title}
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
  );
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
