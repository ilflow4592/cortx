import { useState } from 'react';
import { startAnthropicOAuth } from '../../../services/oauth';
import { useSettingsStore } from '../../../stores/settingsStore';

interface ClaudeProviderCardProps {
  isConnected: boolean;
  error: string;
  setError: (err: string) => void;
}

/** Claude 프로바이더용 카드: OAuth 로그인 또는 API 키 입력 UI. */
export function ClaudeProviderCard({ isConnected, error, setError }: ClaudeProviderCardProps) {
  const settings = useSettingsStore();
  const [oauthLoading, setOauthLoading] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey);

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

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 10,
        background: isConnected ? '#34d39908' : '#0c0c10',
        border: `1px solid ${isConnected ? '#34d39925' : 'var(--bg-chip)'}`,
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
                  color: 'var(--fg-faint)',
                  background: 'var(--bg-chip)',
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
            <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>Credentials stored locally only.</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg-primary)', marginBottom: 16 }}>
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
              color: '#e5e5e5',
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
            <div style={{ flex: 1, height: 1, background: 'var(--bg-chip)' }} />
            <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>or use API key directly</span>
            <div style={{ flex: 1, height: 1, background: 'var(--bg-chip)' }} />
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
                background: apiKeyDraft ? '#6366f1' : 'var(--bg-chip)',
                border: 'none',
                color: apiKeyDraft ? '#fff' : 'var(--fg-faint)',
                cursor: settings.apiKey ? 'pointer' : 'default',
                fontFamily: 'inherit',
              }}
            >
              Connect
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12 }}>
            <span style={{ fontSize: 10 }}>🔒</span>
            <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
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
  );
}
