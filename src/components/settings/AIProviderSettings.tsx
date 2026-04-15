import { useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { ClaudeProviderCard } from './ai-provider/ClaudeProviderCard';

/** Settings 모달의 Claude 인증/모델 섹션. 과거 다중 프로바이더 선택 UI는 제거됨. */
export function AIProviderSettings() {
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const authMethod = useSettingsStore((s) => s.authMethod);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const oauthAccessToken = useSettingsStore((s) => s.oauthAccessToken);
  const modelId = useSettingsStore((s) => s.modelId);
  const setSettings = useSettingsStore((s) => s.setSettings);
  const [error, setError] = useState('');

  // 과거 세션에서 openai/ollama로 설정된 경우 claude로 강제 정규화.
  useEffect(() => {
    if (aiProvider !== 'claude') setSettings({ aiProvider: 'claude' });
  }, [aiProvider, setSettings]);

  const isConnected = (authMethod === 'api-key' && !!apiKey) || (authMethod === 'oauth' && !!oauthAccessToken);

  return (
    <>
      <ClaudeProviderCard isConnected={isConnected} error={error} setError={setError} />

      <div className="field">
        <span className="field-label">Model</span>
        <input
          className="field-input mono"
          value={modelId}
          onChange={(e) => setSettings({ modelId: e.target.value })}
        />
      </div>
    </>
  );
}
