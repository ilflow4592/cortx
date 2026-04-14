import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { ClaudeProviderCard } from './ai-provider/ClaudeProviderCard';
import { OllamaProviderCard } from './ai-provider/OllamaProviderCard';
import { OpenAIProviderCard } from './ai-provider/OpenAIProviderCard';
import { ProviderSelector } from './ai-provider/ProviderSelector';
import { providerConfigs } from './ai-provider/config';
import type { AIProvider } from './ai-provider/types';

/** Settings 모달의 AI Provider 섹션 오케스트레이터.
 *  현재 선택된 프로바이더에 맞춰 Claude/OpenAI/Ollama 카드를 스위치한다. */
export function AIProviderSettings() {
  const settings = useSettingsStore();
  const [error, setError] = useState('');

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

  return (
    <>
      <ProviderSelector value={settings.aiProvider} onChange={handleSelectProvider} />

      {settings.aiProvider === 'claude' && (
        <ClaudeProviderCard isConnected={isConnected} error={error} setError={setError} />
      )}

      {settings.aiProvider === 'openai' && (
        <OpenAIProviderCard isConnected={isConnected} error={error} setError={setError} />
      )}

      {settings.aiProvider === 'ollama' && <OllamaProviderCard error={error} setError={setError} />}

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
