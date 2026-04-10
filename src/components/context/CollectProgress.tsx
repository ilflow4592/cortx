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
            {p.status === 'pending' && <span style={{ color: '#4d5868' }}>○</span>}
            {p.status === 'collecting' && (
              <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
            )}
            {p.status === 'done' && <span style={{ color: '#34d399' }}>✓</span>}
            {p.status === 'error' && <span style={{ color: '#ef4444' }}>✗</span>}
          </span>
          <span style={{ color: p.status === 'collecting' ? '#e8eef5' : '#888895', textTransform: 'capitalize' }}>
            {p.type}
          </span>
          {p.status === 'done' && (
            <span style={{ color: '#4d5868' }}>
              — {p.itemCount} items
              {p.tokenUsage && (
                <span style={{ marginLeft: 6, color: '#3d4856' }}>
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
                    color: '#4d5868',
                    fontSize: 10,
                    marginTop: 2,
                    wordBreak: 'break-all',
                    maxWidth: 400,
                    cursor: 'pointer',
                    userSelect: 'text',
                    WebkitUserSelect: 'text',
                  }}
                >
                  {p.error.slice(0, 200)} <span style={{ color: '#3d4856' }}>📋</span>
                </span>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Total token usage */}
      {progress.some((p) => p.tokenUsage) && (
        <div style={{ fontSize: 10, color: '#3d4856', marginTop: 4, textAlign: 'right' }}>
          Total: ~{totalTokens} tokens
        </div>
      )}
    </div>
  );
}
