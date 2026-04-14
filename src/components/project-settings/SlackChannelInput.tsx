/** Slack 채널 ID 칩 입력기 — Enter 또는 Add 버튼으로 추가, X로 제거. */
import { useState } from 'react';

interface Props {
  channels: string[];
  onChange: (c: string[]) => void;
}

export function SlackChannelInput({ channels, onChange }: Props) {
  const [input, setInput] = useState('');

  const addChannel = () => {
    const ch = input.trim();
    if (ch && !channels.includes(ch)) {
      onChange([...channels, ch]);
      setInput('');
    }
  };

  return (
    <div>
      {channels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {channels.map((ch) => (
            <span
              key={ch}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 6,
                background: 'var(--bg-chip)',
                border: '1px solid var(--border-muted)',
                fontSize: 11,
                color: 'var(--fg-muted)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              #{ch}
              <button
                onClick={() => onChange(channels.filter((c) => c !== ch))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--fg-subtle)',
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="field-input mono"
          style={{ flex: 1, fontSize: 12 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addChannel();
            }
          }}
          placeholder="Channel ID (e.g. C01234567)"
        />
        <button
          type="button"
          onClick={addChannel}
          disabled={!input.trim()}
          style={{
            padding: '0 14px',
            borderRadius: 8,
            fontSize: 12,
            background: input.trim() ? '#6366f1' : 'var(--bg-chip)',
            border: 'none',
            color: input.trim() ? '#fff' : 'var(--fg-subtle)',
            cursor: input.trim() ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
