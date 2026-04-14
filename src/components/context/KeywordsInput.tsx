interface KeywordsInputProps {
  storedKeywords: string[];
  showKeywords: boolean;
  setShowKeywords: (v: boolean) => void;
  keywordDraft: string;
  setKeywordDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (kw: string) => void;
}

export function KeywordsInput({
  storedKeywords,
  showKeywords,
  setShowKeywords,
  keywordDraft,
  setKeywordDraft,
  onAdd,
  onRemove,
}: KeywordsInputProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          marginBottom: showKeywords ? 8 : 0,
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          fontFamily: 'inherit',
        }}
        onClick={() => setShowKeywords(!showKeywords)}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
            color: 'var(--fg-faint)',
          }}
        >
          Search Keywords ({storedKeywords.length})
        </span>
        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{showKeywords ? '▾' : '▸'}</span>
      </button>

      {showKeywords && (
        <div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {storedKeywords.map((kw) => (
              <span
                key={kw}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  background: 'var(--bg-surface-hover)',
                  color: 'var(--fg-muted)',
                  fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                }}
              >
                {kw}
                <button
                  onClick={() => onRemove(kw)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--fg-faint)',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAdd();
                }
              }}
              placeholder="e.g. BE-1390, 오토부킹"
              style={{
                flex: 1,
                background: 'var(--bg-chip)',
                border: '1px solid var(--bg-surface-hover)',
                borderRadius: 6,
                padding: '5px 10px',
                fontSize: 11,
                color: 'var(--fg-primary)',
                fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                outline: 'none',
              }}
            />
            <button
              onClick={onAdd}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                background: 'var(--bg-surface-hover)',
                border: '1px solid var(--fg-dim)',
                color: '#888895',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
