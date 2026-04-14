import { providerConfigs } from './config';
import type { AIProvider } from './types';

interface ProviderSelectorProps {
  value: AIProvider;
  onChange: (provider: AIProvider) => void;
}

/** 상단의 프로바이더 선택 버튼 그리드. */
export function ProviderSelector({ value, onChange }: ProviderSelectorProps) {
  return (
    <div className="field">
      <span className="field-label">AI Provider</span>
      <div className="provider-grid">
        {providerConfigs.map((p) => (
          <button
            key={p.value}
            className={`provider-btn ${value === p.value ? 'active' : ''}`}
            onClick={() => onChange(p.value)}
          >
            <span style={{ fontSize: 16, marginRight: 4 }}>{p.icon}</span>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
