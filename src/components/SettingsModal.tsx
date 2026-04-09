import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useSettingsStore, type AIProvider } from '../stores/settingsStore';
import { startAnthropicOAuth } from '../services/oauth';
import { useContextPackStore } from '../stores/contextPackStore';
import type { ContextSourceConfig, ContextSourceType } from '../types/contextPack';

type STab = 'ai' | 'sources';

interface ProviderConfig {
  value: AIProvider;
  label: string;
  icon: string;
  model: string;
  keyUrl: string;
  keyPageLabel: string;
  placeholder: string;
  steps: string[];
}

const providerConfigs: ProviderConfig[] = [
  {
    value: 'claude',
    label: 'Claude',
    icon: '🟣',
    model: 'claude-sonnet-4-20250514',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPageLabel: 'Anthropic Console',
    placeholder: 'sk-ant-api03-...',
    steps: [
      'Click "Connect" to open Anthropic Console',
      'Sign in or create an Anthropic account',
      'Click "Create Key" and copy it',
      'Paste your key below',
    ],
  },
  {
    value: 'openai',
    label: 'OpenAI',
    icon: '🟢',
    model: 'gpt-4o',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPageLabel: 'OpenAI Platform',
    placeholder: 'sk-proj-...',
    steps: [
      'Click "Connect" to open OpenAI Platform',
      'Sign in to your OpenAI account',
      'Click "Create new secret key" and copy it',
      'Paste your key below',
    ],
  },
  {
    value: 'ollama',
    label: 'Ollama',
    icon: '🦙',
    model: 'llama3.2',
    keyUrl: '',
    keyPageLabel: '',
    placeholder: '',
    steps: [
      'Install Ollama from ollama.com',
      'Run: ollama pull llama3.2',
      'Make sure Ollama is running locally',
      'Click "Test Connection" to verify',
    ],
  },
];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const sources = useContextPackStore((s) => s.sources);
  const [tab, setTab] = useState<STab>('ai');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            🤖 AI Provider
          </button>
          <button className={`modal-tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>
            📦 Context Sources
          </button>
        </div>
        <div className="modal-body">
          {tab === 'ai' && <AIProviderSettings />}
          {tab === 'sources' && (
            <SourcesSettings
              sources={sources}
              onAdd={(s) => useContextPackStore.getState().addSource(s)}
              onUpdate={(i, u) => useContextPackStore.getState().updateSource(i, u)}
              onRemove={(i) => useContextPackStore.getState().removeSource(i)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function AIProviderSettings() {
  const settings = useSettingsStore();
  const [verifying, setVerifying] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey);

  // Connected = authMethod is explicitly set AND matching credential exists
  const isConnected =
    settings.aiProvider === 'claude'
      ? (settings.authMethod === 'api-key' && !!settings.apiKey) ||
        (settings.authMethod === 'oauth' && !!settings.oauthAccessToken)
      : settings.aiProvider === 'openai'
        ? !!settings.apiKey
        : false; // ollama handled separately

  const handleSelectProvider = (provider: AIProvider) => {
    const cfg = providerConfigs.find((p) => p.value === provider)!;
    settings.setSettings({ aiProvider: provider, modelId: cfg.model });
    setError('');
  };

  // Claude OAuth login
  const handleClaudeOAuth = async () => {
    setOauthLoading(true);
    setError('');
    try {
      const result = await startAnthropicOAuth();
      if (result.accessToken) {
        settings.setSettings({
          authMethod: 'oauth',
          oauthAccessToken: result.accessToken,
          oauthRefreshToken: result.refreshToken || '',
        });
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleDisconnect = () => {
    settings.setSettings({ apiKey: '', oauthAccessToken: '', oauthRefreshToken: '', authMethod: 'oauth' });
  };

  // OpenAI API key verify
  const handleVerifyOpenAI = async () => {
    setVerifying(true);
    try {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
      });
      if (!resp.ok) setError('Invalid API key');
      else setError('');
    } catch {
      setError('Connection failed');
    } finally {
      setVerifying(false);
    }
  };

  // Ollama test
  const handleTestOllama = async () => {
    setVerifying(true);
    setError('');
    try {
      const resp = await fetch(`${settings.ollamaUrl}/api/tags`);
      if (!resp.ok) setError('Ollama not responding');
    } catch {
      setError('Cannot connect to Ollama');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      {/* Provider selector */}
      <div className="field">
        <span className="field-label">AI Provider</span>
        <div className="provider-grid">
          {providerConfigs.map((p) => (
            <button
              key={p.value}
              className={`provider-btn ${settings.aiProvider === p.value ? 'active' : ''}`}
              onClick={() => handleSelectProvider(p.value)}
            >
              <span style={{ fontSize: 16, marginRight: 4 }}>{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Claude: OAuth login ── */}
      {settings.aiProvider === 'claude' && (
        <div
          style={{
            padding: 16,
            borderRadius: 10,
            background: isConnected ? '#34d39908' : '#0c0c10',
            border: `1px solid ${isConnected ? '#34d39925' : '#18181b'}`,
            marginBottom: 20,
          }}
        >
          {isConnected ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#34d399',
                      boxShadow: '0 0 6px #34d39960',
                    }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>Connected to Anthropic</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: '#3f3f46',
                      background: '#18181b',
                      padding: '1px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {settings.authMethod === 'oauth' ? 'OAuth' : 'API Key'}
                  </span>
                </div>
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
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                <span style={{ fontSize: 10 }}>🔒</span>
                <span style={{ fontSize: 10, color: '#3f3f46' }}>Credentials stored locally only.</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e4e4e7', marginBottom: 16 }}>
                Log in with Anthropic
              </div>

              {/* OAuth login button */}
              <button
                onClick={handleClaudeOAuth}
                disabled={oauthLoading}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  opacity: oauthLoading ? 0.6 : 1,
                }}
              >
                {oauthLoading ? (
                  <>
                    <div className="loading-dot" style={{ background: '#fff' }} /> Waiting for login...
                  </>
                ) : (
                  <>
                    Log In via Anthropic Console <span style={{ opacity: 0.6, fontWeight: 400 }}>(API Billing)</span>
                  </>
                )}
              </button>

              {/* Client ID — shown below button */}
              <div style={{ marginTop: 8, marginBottom: 6 }}>
                <input
                  className="field-input mono"
                  style={{ fontSize: 11, padding: '8px 12px' }}
                  value={settings.oauthClientId}
                  onChange={(e) => {
                    settings.setSettings({ oauthClientId: e.target.value });
                    setError('');
                  }}
                  placeholder="OAuth Client ID (required for login)"
                />
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#18181b' }} />
                <span style={{ fontSize: 10, color: '#3f3f46' }}>or use API key directly</span>
                <div style={{ flex: 1, height: 1, background: '#18181b' }} />
              </div>

              {/* API key fallback */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field-input mono"
                  style={{ flex: 1, fontSize: 12 }}
                  type="password"
                  value={apiKeyDraft}
                  onChange={(e) => {
                    setApiKeyDraft(e.target.value);
                    setError('');
                  }}
                  placeholder="sk-ant-api03-..."
                />
                <button
                  onClick={() => {
                    if (!apiKeyDraft) return;
                    settings.setSettings({ apiKey: apiKeyDraft, authMethod: 'api-key' });
                  }}
                  disabled={!apiKeyDraft}
                  style={{
                    padding: '0 16px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                    background: apiKeyDraft ? '#6366f1' : '#18181b',
                    border: 'none',
                    color: apiKeyDraft ? '#fff' : '#3f3f46',
                    cursor: settings.apiKey ? 'pointer' : 'default',
                    fontFamily: 'inherit',
                  }}
                >
                  Connect
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
                <span style={{ fontSize: 10 }}>🔒</span>
                <span style={{ fontSize: 10, color: '#3f3f46' }}>
                  Your data will be handled by Anthropic under its terms.
                </span>
              </div>
            </>
          )}
          {error && (
            <div className="error-box" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── OpenAI: API key ── */}
      {settings.aiProvider === 'openai' && (
        <div
          style={{
            padding: 16,
            borderRadius: 10,
            background: isConnected ? '#34d39908' : '#0c0c10',
            border: `1px solid ${isConnected ? '#34d39925' : '#18181b'}`,
            marginBottom: 20,
          }}
        >
          {isConnected ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#34d399',
                    boxShadow: '0 0 6px #34d39960',
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#34d399' }}>Connected to OpenAI</span>
              </div>
              <button
                onClick={() => settings.setSettings({ apiKey: '' })}
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
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa' }}>Connect OpenAI</span>
                <button
                  type="button"
                  onClick={() => openUrl('https://platform.openai.com/api-keys').catch(() => {})}
                  style={{
                    fontSize: 11,
                    color: '#818cf8',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  🔑 Get API Key ↗
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="field-input mono"
                  style={{ flex: 1, fontSize: 12 }}
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => {
                    settings.setSettings({ apiKey: e.target.value, authMethod: 'api-key' });
                    setError('');
                  }}
                  placeholder="sk-proj-..."
                />
                <button
                  onClick={handleVerifyOpenAI}
                  disabled={!settings.apiKey || verifying}
                  style={{
                    padding: '0 14px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    flexShrink: 0,
                    background: '#18181b',
                    border: '1px solid #27272a',
                    color: '#a1a1aa',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    opacity: settings.apiKey ? 1 : 0.4,
                  }}
                >
                  {verifying ? '...' : 'Verify'}
                </button>
              </div>
            </>
          )}
          {error && (
            <div className="error-box" style={{ marginTop: 10 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <span style={{ fontSize: 10 }}>🔒</span>
            <span style={{ fontSize: 10, color: '#3f3f46' }}>Stored locally. Never sent to Cortx servers.</span>
          </div>
        </div>
      )}

      {/* ── Ollama: local ── */}
      {settings.aiProvider === 'ollama' && (
        <div
          style={{
            padding: 16,
            borderRadius: 10,
            background: '#0c0c10',
            border: '1px solid #18181b',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#a1a1aa', marginBottom: 14 }}>Connect Ollama</div>
          <div className="field" style={{ marginBottom: 10 }}>
            <span className="field-label">Ollama URL</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field-input mono"
                style={{ flex: 1 }}
                value={settings.ollamaUrl}
                onChange={(e) => {
                  settings.setSettings({ ollamaUrl: e.target.value });
                  setError('');
                }}
                placeholder="http://localhost:11434"
              />
              <button
                onClick={handleTestOllama}
                disabled={verifying}
                style={{
                  padding: '0 14px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 500,
                  flexShrink: 0,
                  background: '#18181b',
                  border: '1px solid #27272a',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {verifying ? '...' : 'Test'}
              </button>
            </div>
          </div>
          {error && <div className="error-box">{error}</div>}
          <span className="field-hint">Make sure Ollama is running locally.</span>
        </div>
      )}

      {/* Model */}
      <div className="field">
        <span className="field-label">Model</span>
        <input
          className="field-input mono"
          value={settings.modelId}
          onChange={(e) => settings.setSettings({ modelId: e.target.value })}
        />
      </div>
    </>
  );
}

function SourcesSettings({
  sources,
  onAdd,
  onUpdate,
  onRemove,
}: {
  sources: ContextSourceConfig[];
  onAdd: (s: ContextSourceConfig) => void;
  onUpdate: (i: number, u: Partial<ContextSourceConfig>) => void;
  onRemove: (i: number) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const types: { type: ContextSourceType; label: string }[] = [
    { type: 'github', label: '🐙 GitHub' },
    { type: 'slack', label: '💬 Slack' },
    { type: 'notion', label: '📄 Notion' },
  ];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span className="field-label" style={{ margin: 0 }}>
          Context Sources
        </span>
        <div style={{ position: 'relative' }}>
          <button className="ctx-btn ctx-btn-collect" style={{ fontSize: 11 }} onClick={() => setShowAdd(!showAdd)}>
            + Add Source
          </button>
          {showAdd && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                background: '#0c0c10',
                border: '1px solid #18181b',
                borderRadius: 8,
                padding: 4,
                zIndex: 10,
                minWidth: 160,
              }}
            >
              {types.map((t) => (
                <button
                  key={t.type}
                  onClick={() => {
                    onAdd({
                      type: t.type,
                      enabled: true,
                      token: '',
                      ...(t.type === 'github' ? { owner: '', repo: '' } : {}),
                      ...(t.type === 'slack' ? { slackChannel: '' } : {}),
                      ...(t.type === 'notion' ? { notionDatabaseId: '' } : {}),
                    });
                    setShowAdd(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#a1a1aa',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    borderRadius: 6,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {sources.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 12, color: '#3f3f46' }}>
          No sources configured. Add GitHub, Slack, or Notion.
        </div>
      )}
      {sources.map((s, i) => (
        <SourceCard key={i} source={s} onUpdate={(u) => onUpdate(i, u)} onRemove={() => onRemove(i)} />
      ))}
      <div className="field-hint" style={{ marginTop: 16 }}>
        Tokens are stored locally only. API calls go directly from your machine to each provider.
      </div>
    </>
  );
}

function SourceCard({
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
              background: isConnected ? 'rgba(52,211,153,0.08)' : '#232330',
              color: isConnected ? '#34d399' : '#6b6b78',
            }}
          >
            <span
              style={{ width: 5, height: 5, borderRadius: '50%', background: isConnected ? '#34d399' : '#52525e' }}
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
              background: tokenDraft ? '#6366f1' : '#232330',
              color: tokenDraft ? '#fff' : '#52525e',
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
