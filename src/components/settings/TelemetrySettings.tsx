/**
 * Telemetry settings — opt-in local event logging + optional remote flush.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { listEvents, countUnsent, clearEvents, flushToEndpoint, type TelemetryEvent } from '../../services/telemetry';
import { AlertTriangle, Trash2, Upload, RefreshCw } from 'lucide-react';

export function TelemetrySettings() {
  const enabled = useSettingsStore((s) => s.telemetryEnabled);
  const endpoint = useSettingsStore((s) => s.telemetryEndpoint);
  const verifierLlmEnabled = useSettingsStore((s) => s.verifierLlmEnabled);
  const setSettings = useSettingsStore((s) => s.setSettings);

  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [unsent, setUnsent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'info' | 'error'; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, count] = await Promise.all([listEvents(50), countUnsent()]);
      setEvents(list);
      setUnsent(count);
    } catch (err) {
      setStatus({ type: 'error', message: String(err) });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async data load
    load();
  }, [load]);

  const handleClear = async () => {
    if (!confirm('Delete all stored telemetry events? This cannot be undone.')) return;
    await clearEvents();
    await load();
    setStatus({ type: 'info', message: 'All events cleared' });
  };

  const handleFlush = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const result = await flushToEndpoint();
      setStatus({
        type: result.failed > 0 ? 'error' : 'info',
        message: `Sent ${result.sent}, failed ${result.failed}`,
      });
      await load();
    } catch (err) {
      setStatus({ type: 'error', message: String(err) });
    }
    setLoading(false);
  };

  const kindColor = (kind: string) => {
    switch (kind) {
      case 'crash':
        return 'var(--red)';
      case 'error':
        return '#f97316';
      case 'action':
        return 'var(--indigo)';
      case 'metric':
        return 'var(--accent-bright)';
      default:
        return 'var(--fg-muted)';
    }
  };

  return (
    <div>
      {/* Privacy notice */}
      <div
        style={{
          padding: 12,
          marginBottom: 18,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-muted)',
          borderRadius: 6,
          fontSize: 11,
          color: 'var(--fg-muted)',
          lineHeight: 1.6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <AlertTriangle size={12} color="var(--yellow)" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ color: 'var(--fg-secondary)' }}>Privacy:</strong> Telemetry is <strong>opt-in</strong> and
            stored <strong>locally in SQLite</strong>. Events are never sent anywhere unless you configure an endpoint
            and explicitly flush. Sensitive fields (keys, tokens, paths, titles, content) are automatically redacted.
          </div>
        </div>
      </div>

      {/* Enable toggle */}
      <div className="field" style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setSettings({ telemetryEnabled: e.target.checked })}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>Enable local telemetry</span>
        </label>
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 4, marginLeft: 24 }}>
          When enabled, crashes and key actions are recorded locally. Events are viewable below.
        </div>
      </div>

      {/* Verifier LLM toggle */}
      <div className="field" style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={verifierLlmEnabled}
            onChange={(e) => setSettings({ verifierLlmEnabled: e.target.checked })}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--fg-primary)', fontWeight: 500 }}>Enable Verifier LLM</span>
        </label>
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 4, marginLeft: 24 }}>
          복잡한 규칙(예: 근거 제시 여부) 평가에 소형 Haiku 모델 사용. 호출당 약 1-2K 토큰 비용 발생.
        </div>
      </div>

      {/* Endpoint */}
      <div className="field" style={{ marginBottom: 16 }}>
        <span className="field-label">Remote endpoint (optional)</span>
        <input
          className="field-input mono"
          style={{ fontSize: 11 }}
          value={endpoint}
          onChange={(e) => setSettings({ telemetryEndpoint: e.target.value })}
          placeholder="https://your-server.com/telemetry"
          disabled={!enabled}
        />
        <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 4 }}>
          Leave empty to keep events local only. POST format: <code>{`{ events: [...], appVersion, platform }`}</code>
        </div>
      </div>

      {/* Stats + actions */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          padding: '10px 12px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-muted)',
          borderRadius: 6,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1, fontSize: 11, color: 'var(--fg-secondary)' }}>
          <strong>{events.length}</strong> events ({unsent} unsent)
        </div>
        <button onClick={load} disabled={loading} style={iconBtnStyle}>
          <RefreshCw size={12} strokeWidth={1.5} />
        </button>
        {enabled && endpoint && (
          <button
            onClick={handleFlush}
            disabled={loading || unsent === 0}
            style={iconBtnStyle}
            title="Flush to endpoint"
          >
            <Upload size={12} strokeWidth={1.5} />
          </button>
        )}
        <button onClick={handleClear} disabled={loading || events.length === 0} style={iconBtnStyle} title="Clear all">
          <Trash2 size={12} strokeWidth={1.5} />
        </button>
      </div>

      {status && (
        <div
          style={{
            padding: '6px 10px',
            marginBottom: 12,
            fontSize: 11,
            borderRadius: 5,
            background: status.type === 'error' ? 'rgba(239,68,68,0.08)' : 'var(--accent-bg)',
            border: `1px solid ${status.type === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--accent-border)'}`,
            color: status.type === 'error' ? 'var(--red)' : 'var(--accent-bright)',
          }}
        >
          {status.message}
        </div>
      )}

      {/* Events list */}
      <div
        style={{
          maxHeight: 300,
          overflowY: 'auto',
          border: '1px solid var(--border-muted)',
          borderRadius: 6,
        }}
      >
        {events.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--fg-muted)' }}>
            {enabled ? 'No events yet' : 'Telemetry is disabled'}
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 6px',
                  borderRadius: 3,
                  background: `${kindColor(event.kind)}15`,
                  border: `1px solid ${kindColor(event.kind)}40`,
                  color: kindColor(event.kind),
                  fontFamily: "'JetBrains Mono', monospace",
                  textTransform: 'uppercase',
                  flexShrink: 0,
                }}
              >
                {event.kind}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: 'var(--fg-secondary)',
                  fontFamily: "'JetBrains Mono', monospace",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {event.name}
              </span>
              {event.sent && <span style={{ fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>✓ sent</span>}
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--fg-faint)',
                  fontFamily: "'JetBrains Mono', monospace",
                  flexShrink: 0,
                }}
              >
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 4,
  background: 'var(--bg-chip)',
  border: '1px solid var(--border-muted)',
  color: 'var(--fg-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
