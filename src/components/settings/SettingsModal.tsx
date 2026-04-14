import { useState, lazy, Suspense } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import { useT } from '../../i18n';
import { ModalBackdrop } from '../common/ModalBackdrop';

// 각 탭은 lazy chunk로 분리. 활성 탭만 다운로드돼 SettingsModal 자체 로드 시간 단축.
// AIProviderSettings가 가장 무거움 (496줄, OAuth/모델 검증 로직 포함).
const AIProviderSettings = lazy(() => import('./AIProviderSettings').then((m) => ({ default: m.AIProviderSettings })));
const SourcesSettings = lazy(() => import('./SourcesSettings').then((m) => ({ default: m.SourcesSettings })));
const AppearanceSettings = lazy(() => import('./AppearanceSettings').then((m) => ({ default: m.AppearanceSettings })));
const TelemetrySettings = lazy(() => import('./TelemetrySettings').then((m) => ({ default: m.TelemetrySettings })));

type STab = 'ai' | 'sources' | 'appearance' | 'telemetry';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const sources = useContextPackStore((s) => s.sources);
  const [tab, setTab] = useState<STab>('ai');
  const t = useT();

  return (
    <ModalBackdrop onClose={onClose} ariaLabel={t('settings.title')}>
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
        <button className={`modal-tab ${tab === 'appearance' ? 'active' : ''}`} onClick={() => setTab('appearance')}>
          🎨 {t('settings.appearance')}
        </button>
        <button className={`modal-tab ${tab === 'telemetry' ? 'active' : ''}`} onClick={() => setTab('telemetry')}>
          📊 Telemetry
        </button>
      </div>
      <div className="modal-body">
        <Suspense fallback={<div style={{ padding: 20, color: 'var(--fg-faint)', fontSize: 12 }}>Loading...</div>}>
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
        </Suspense>
      </div>
    </ModalBackdrop>
  );
}
