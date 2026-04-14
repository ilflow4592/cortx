export interface LinkPreview {
  url: string;
  title: string;
  description: string;
}

interface LinkPreviewCardProps {
  preview: LinkPreview | null;
  loading: boolean;
  onClose: () => void;
}

export function LinkPreviewCard({ preview, loading, onClose }: LinkPreviewCardProps) {
  if (!preview && !loading) return null;
  return (
    <div
      style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-muted)',
        background: 'var(--bg-app)',
        flexShrink: 0,
      }}
    >
      {loading ? (
        <div style={{ fontSize: 11, color: 'var(--fg-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="loading-dot" /> Loading preview...
        </div>
      ) : (
        preview && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-primary)' }}>
                {preview.title || 'No title'}
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--fg-faint)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                ×
              </button>
            </div>
            {preview.description && (
              <div style={{ fontSize: 11, color: '#888895', lineHeight: 1.5, marginBottom: 6 }}>
                {preview.description.slice(0, 200)}
              </div>
            )}
            <a
              href={preview.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 10,
                color: 'var(--accent-bright)',
                fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                wordBreak: 'break-all',
              }}
            >
              {preview.url}
            </a>
          </div>
        )
      )}
    </div>
  );
}
