import type { SourceCollectStatus } from '../../stores/contextPackStore';

interface CollectProgressProps {
  progress: SourceCollectStatus[];
  isCollecting: boolean;
}

export function CollectProgress({ progress, isCollecting }: CollectProgressProps) {
  const visible =
    progress.length > 0 && (isCollecting || progress.some((p) => p.status === 'done' || p.status === 'error'));

  if (!visible) return null;

  const totalTokens = progress.reduce(
    (sum, p) => sum + (p.tokenUsage ? p.tokenUsage.input + p.tokenUsage.output : 0),
    0,
  );

  return (
    <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
      {progress.map((p) => (
        <div key={p.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
          <span style={{ width: 14, textAlign: 'center', flexShrink: 0 }}>
            {p.status === 'pending' && <span style={{ color: 'var(--fg-faint)' }}>○</span>}
            {p.status === 'collecting' && (
              <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
            )}
            {p.status === 'done' && <span style={{ color: '#34d399' }}>✓</span>}
            {p.status === 'error' && <span style={{ color: '#ef4444' }}>✗</span>}
          </span>
          <span style={{ color: p.status === 'collecting' ? 'var(--fg-primary)' : '#888895', textTransform: 'capitalize' }}>
            {p.type}
          </span>
          {p.status === 'done' && (
            <span style={{ color: 'var(--fg-faint)' }}>
              — {p.itemCount} items
              {p.tokenUsage && (
                <span style={{ marginLeft: 6, color: 'var(--fg-dim)' }}>
                  (~{p.tokenUsage.input + p.tokenUsage.output} tok)
                </span>
              )}
            </span>
          )}
          {p.status === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#ef4444' }}>— failed</span>
              {p.error && (
                <span
                  onClick={() => navigator.clipboard.writeText(p.error || '')}
                  title="Click to copy"
                  style={{
                    color: 'var(--fg-faint)',
                    fontSize: 10,
                    marginTop: 2,
                    wordBreak: 'break-all',
                    maxWidth: 400,
                    cursor: 'pointer',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                >
                  {p.error.slice(0, 200)} <span style={{ color: 'var(--fg-dim)' }}>📋</span>
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Total token usage */}
      {progress.some((p) => p.tokenUsage) && (
        <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 4, textAlign: 'right' }}>
          Total: ~{totalTokens} tokens
        </div>
      )}
    </div>
  );
}
