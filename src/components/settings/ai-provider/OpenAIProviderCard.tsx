import { useState } from 'react';
import { useSettingsStore } from '../../../stores/settingsStore';
import { openUrl, verifyOpenAIKey } from './api';

interface OpenAIProviderCardProps {
  isConnected: boolean;
  error: string;
  setError: (err: string) => void;
}

/** OpenAI 프로바이더용 카드: API 키 입력 + 유효성 검증. */
export function OpenAIProviderCard({ isConnected, error, setError }: OpenAIProviderCardProps) {
  const settings = useSettingsStore();
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const ok = await verifyOpenAIKey(settings.apiKey);
      if (!ok) setError('Invalid API key');
      else setError('');
    } catch {
      setError('Connection failed');
    } finally {
      setVerifying(false);
    }
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)' }}>Connect OpenAI</span>
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
              onClick={handleVerify}
              disabled={!settings.apiKey || verifying}
              style={{
                padding: '0 14px',
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 500,
                flexShrink: 0,
                background: 'var(--bg-chip)',
                border: '1px solid #27272a',
                color: 'var(--fg-muted)',
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
        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>Stored locally. Never sent to Cortx servers.</span>
      </div>
    </div>
  );
}
