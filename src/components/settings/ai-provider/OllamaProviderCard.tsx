import { useState } from 'react';
import { useSettingsStore } from '../../../stores/settingsStore';
import { testOllama } from './api';

interface OllamaProviderCardProps {
  error: string;
  setError: (err: string) => void;
}

/** Ollama 프로바이더용 카드: 로컬 URL 설정 + 연결 테스트. */
export function OllamaProviderCard({ error, setError }: OllamaProviderCardProps) {
  const settings = useSettingsStore();
  const [verifying, setVerifying] = useState(false);

  const handleTest = async () => {
    setVerifying(true);
    setError('');
    try {
      const ok = await testOllama(settings.ollamaUrl);
      if (!ok) setError('Ollama not responding');
    } catch {
      setError('Cannot connect to Ollama');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 10,
        background: '#0c0c10',
        border: '1px solid var(--bg-chip)',
        marginBottom: 20,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-muted)', marginBottom: 14 }}>Connect Ollama</div>
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
            onClick={handleTest}
            disabled={verifying}
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
            }}
          >
            {verifying ? '...' : 'Test'}
          </button>
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
      <span className="field-hint">Make sure Ollama is running locally.</span>
    </div>
  );
}
