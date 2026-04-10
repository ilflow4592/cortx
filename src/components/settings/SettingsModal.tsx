import { useState } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import { AIProviderSettings } from './AIProviderSettings';
import { SourcesSettings } from './SourcesSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { TelemetrySettings } from './TelemetrySettings';
import { useT } from '../../i18n';

type STab = 'ai' | 'sources' | 'appearance' | 'telemetry';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const sources = useContextPackStore((s) => s.sources);
  const [tab, setTab] = useState<STab>('ai');
  const t = useT();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('settings.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-tabs">
          <button className={`modal-tab ${tab === 'ai' ? 'active' : ''}`} onClick={() => setTab('ai')}>
            🤖 {t('settings.aiProvider')}
          </button>
          <button className={`modal-tab ${tab === 'sources' ? 'active' : ''}`} onClick={() => setTab('sources')}>
            📦 {t('settings.contextSources')}
          </button>
          <button
            className={`modal-tab ${tab === 'appearance' ? 'active' : ''}`}
            onClick={() => setTab('appearance')}
          >
            🎨 {t('settings.appearance')}
          </button>
          <button
            className={`modal-tab ${tab === 'telemetry' ? 'active' : ''}`}
            onClick={() => setTab('telemetry')}
          >
            📊 Telemetry
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
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'telemetry' && <TelemetrySettings />}
        </div>
      </div>
    </div>
  );
}
