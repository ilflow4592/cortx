import type { AIProvider } from '../../stores/settingsStore';

interface PresetGroup {
  provider: AIProvider;
  models: string[];
}

interface InputAreaProps {
  input: string;
  isLoading: boolean;
  displayModel: string;
  activeModelId: string;
  hasOverride: boolean;
  showModelPicker: boolean;
  presetModels: PresetGroup[];
  onInputChange: (v: string) => void;
  onSend: () => void;
  onToggleModelPicker: () => void;
  onSelectModel: (provider: AIProvider, modelId: string) => void;
  onClearOverride: () => void;
}

/**
 * Chat input row: text field, model picker popover, send button.
 * Purely presentational — parent owns the state and handlers.
 */
export function InputArea({
  input,
  isLoading,
  displayModel,
  activeModelId,
  hasOverride,
  showModelPicker,
  presetModels,
  onInputChange,
  onSend,
  onToggleModelPicker,
  onSelectModel,
  onClearOverride,
}: InputAreaProps) {
  return (
    <div className="chat-input">
      <input
        type="text"
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="메시지를 입력하세요..."
      />
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          className="model-select"
          onClick={onToggleModelPicker}
          style={{ background: 'none', border: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
        >
          <span className="m-dot" />
          {displayModel} ▾
        </button>
        {showModelPicker && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              right: 0,
              marginBottom: 4,
              background: '#0c0c10',
              border: '1px solid var(--bg-chip)',
              borderRadius: 10,
              padding: 6,
              zIndex: 20,
              minWidth: 220,
              maxHeight: 300,
              overflowY: 'auto',
            }}
          >
            {hasOverride && (
              <button
                onClick={onClearOverride}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  background: 'none',
                  border: 'none',
                  color: '#ef4444',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  borderRadius: 6,
                  marginBottom: 4,
                }}
              >
                ✕ Use global default
              </button>
            )}
            {presetModels.map((group) => (
              <div key={group.provider}>
                <div
                  style={{
                    padding: '6px 10px',
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'var(--fg-faint)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {group.provider}
                </div>
                {group.models.map((m) => (
                  <button
                    key={m}
                    onClick={() => onSelectModel(group.provider, m)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 10px',
                      background: activeModelId === m ? 'rgba(99,102,241,0.08)' : 'none',
                      border: 'none',
                      color: activeModelId === m ? '#818cf8' : 'var(--fg-muted)',
                      fontSize: 11,
                      cursor: 'pointer',
                      fontFamily: "'JetBrains Mono', monospace",
                      borderRadius: 6,
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <button className="send-btn" onClick={onSend} disabled={!input.trim() || isLoading}>
        ↑
      </button>
    </div>
  );
}
