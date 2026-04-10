import { useState } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import { AIProviderSettings } from './AIProviderSettings';
import { SourcesSettings } from './SourcesSettings';

type STab = 'ai' | 'sources';

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
