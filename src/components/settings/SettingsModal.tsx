import { useState, lazy, Suspense } from 'react';
import { ModalBackdrop } from '../common/ModalBackdrop';

// 각 탭은 lazy chunk로 분리. 활성 탭만 다운로드돼 SettingsModal 자체 로드 시간 단축.
const IntegrationsSettings = lazy(() =>
  import('./IntegrationsSettings').then((m) => ({ default: m.IntegrationsSettings })),
);
const AppearanceSettings = lazy(() => import('./AppearanceSettings').then((m) => ({ default: m.AppearanceSettings })));
const TelemetrySettings = lazy(() => import('./TelemetrySettings').then((m) => ({ default: m.TelemetrySettings })));
const GuardrailsSettings = lazy(() => import('./GuardrailsSettings').then((m) => ({ default: m.GuardrailsSettings })));

type STab = 'integrations' | 'appearance' | 'telemetry' | 'guardrails';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<STab>('integrations');

  return (
    <ModalBackdrop
      onClose={onClose}
      ariaLabel="Settings"
      dialogStyle={{ width: 640, height: 'min(720px, 90vh)', maxHeight: 'none' }}
    >
      <div className="modal-header">
        <h2>Settings</h2>
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="modal-tabs">
        <button
          className={`modal-tab ${tab === 'integrations' ? 'active' : ''}`}
          onClick={() => setTab('integrations')}
        >
          🔐 Integrations
        </button>
        <button className={`modal-tab ${tab === 'appearance' ? 'active' : ''}`} onClick={() => setTab('appearance')}>
          🎨 Appearance
        </button>
        <button className={`modal-tab ${tab === 'telemetry' ? 'active' : ''}`} onClick={() => setTab('telemetry')}>
          📊 Telemetry
        </button>
        <button className={`modal-tab ${tab === 'guardrails' ? 'active' : ''}`} onClick={() => setTab('guardrails')}>
          🛡️ Guardrails
        </button>
      </div>
      <div className="modal-body">
        <Suspense fallback={<div style={{ padding: 20, color: 'var(--fg-faint)', fontSize: 12 }}>Loading...</div>}>
          {tab === 'integrations' && <IntegrationsSettings />}
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'telemetry' && <TelemetrySettings />}
          {tab === 'guardrails' && <GuardrailsSettings />}
        </Suspense>
      </div>
    </ModalBackdrop>
  );
}
