import { useState } from 'react';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useSettingsStore, type AIProvider } from '../../stores/settingsStore';
import { startAnthropicOAuth } from '../../services/oauth';

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

export function AIProviderSettings() {
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
