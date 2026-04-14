import { RefreshCw, Pin } from 'lucide-react';

export interface ModelOption {
  value: string;
  label: string;
}

interface ActionsBarProps {
  isCollecting: boolean;
  onCollect: () => void;
  onCancel: () => void;
  collectDisabled: boolean;
  showPin: boolean;
  togglePin: () => void;
  collectModel: string;
  setCollectModel: (v: string) => void;
  showModelMenu: boolean;
  setShowModelMenu: (v: boolean) => void;
  modelOptions: ModelOption[];
}

export function ActionsBar({
  isCollecting,
  onCollect,
  onCancel,
  collectDisabled,
  togglePin,
  collectModel,
  setCollectModel,
  showModelMenu,
  setShowModelMenu,
  modelOptions,
}: ActionsBarProps) {
  return (
    <div className="ctx-actions">
      {isCollecting ? (
        <button
          className="ctx-btn ctx-btn-collect"
          onClick={onCancel}
          style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}
        >
          ✕ Cancel
        </button>
      ) : (
        <button
          className="ctx-btn ctx-btn-collect"
          onClick={onCollect}
          disabled={collectDisabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            ...(collectDisabled ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
          }}
        >
          <RefreshCw size={13} /> Collect Now
        </button>
      )}
      <button
        className="ctx-btn ctx-btn-pin"
        onClick={togglePin}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Pin size={13} /> Pin
      </button>
      {/* Custom model dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowModelMenu(!showModelMenu)}
          className="icon-btn-subtle"
          style={{
            background: 'var(--bg-chip)',
            border: '1px solid var(--bg-surface-hover)',
            borderRadius: 6,
            padding: '6px 24px 6px 10px',
            fontSize: 11,
            color: 'var(--fg-subtle)',
            fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
            cursor: 'pointer',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title="Model for MCP search (Notion/Slack)"
        >
          {modelOptions.find((m) => m.value === collectModel)?.label ?? 'Haiku'}
          <span style={{ fontSize: 8, color: 'var(--fg-faint)', marginLeft: 4 }}>▼</span>
        </button>
        {showModelMenu && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setShowModelMenu(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'default',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: 4,
                zIndex: 100,
                background: '#1e2430',
                border: '1px solid #2d3748',
                borderRadius: 8,
                padding: '4px 0',
                minWidth: 110,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {modelOptions.map((m) => (
                <button
                  key={m.value}
                  onClick={() => {
                    setCollectModel(m.value);
                    setShowModelMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '6px 12px',
                    fontSize: 12,
                    border: 'none',
                    background: 'none',
                    color: collectModel === m.value ? '#e879a8' : 'var(--fg-muted)',
                    fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                    cursor: 'pointer',
                    fontWeight: collectModel === m.value ? 600 : 400,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ width: 14, textAlign: 'center' }}>{collectModel === m.value ? '✓' : ''}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
