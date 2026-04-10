import type { CollectHistoryEntry } from '../../stores/contextPackStore';

export function HistoryTab({ taskHistory }: { taskHistory: CollectHistoryEntry[] }) {
  return (
    <>
      <div className="rp-section">Search History</div>
      {taskHistory.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', padding: '16px 0', textAlign: 'center' }}>
          No searches yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...taskHistory].reverse().map((entry) => {
            const totalSec = Math.floor(entry.durationMs / 1000);
            const h = Math.floor(totalSec / 3600);
            const m = Math.floor((totalSec % 3600) / 60);
            const s = totalSec % 60;
            const duration =
              h > 0
                ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
                : `${m}:${String(s).padStart(2, '0')}`;
            return (
              <div
                key={entry.id}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--bg-chip)',
                  border: '1px solid var(--border-muted)',
                }}
              >
                {/* Time + duration */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>{duration}</span>
                </div>

                {/* Keywords */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {entry.keywords.map((kw) => (
                    <span
                      key={kw}
                      style={{
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontSize: 10,
                        background: 'var(--bg-surface-hover)',
                        color: 'var(--fg-muted)',
                        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                      }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>

                {/* Resources + Model */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}
                >
                  {entry.resources.map((r) => (
                    <span
                      key={r}
                      style={{
                        fontSize: 9,
                        color: 'var(--fg-subtle)',
                        textTransform: 'capitalize',
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: 'var(--border-muted)',
                      }}
                    >
                      {r}
                    </span>
                  ))}
                  <span style={{ fontSize: 9, color: 'var(--fg-dim)' }}>|</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--accent-bright)',
                      fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                    }}
                  >
                    {entry.model.replace('claude-', '').replace(/-\d+$/, '')}
                  </span>
                </div>

                {/* Results per source */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {entry.results.map((r) => (
                    <div key={r.type}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                        <span
                          style={{
                            color: r.error ? '#ef4444' : r.itemCount > 0 ? '#34d399' : 'var(--fg-faint)',
                            width: 10,
                          }}
                        >
                          {r.error ? '✗' : r.itemCount > 0 ? '✓' : '○'}
                        </span>
                        <span style={{ color: '#888895', textTransform: 'capitalize', width: 50 }}>
                          {r.type}
                        </span>
                        <span style={{ color: r.error ? '#ef4444' : 'var(--fg-faint)' }}>
                          {r.error ? 'failed' : `${r.itemCount} items`}
                        </span>
                        {r.tokenUsage && !r.error && (
                          <span style={{ color: 'var(--fg-dim)', marginLeft: 'auto' }}>
                            ~{r.tokenUsage.input + r.tokenUsage.output} tok
                          </span>
                        )}
                      </div>
                      {r.error && (
                        <div
                          onClick={() => navigator.clipboard.writeText(r.error || '')}
                          title="Click to copy"
                          style={{
                            fontSize: 9,
                            color: 'var(--fg-faint)',
                            marginLeft: 16,
                            marginTop: 2,
                            wordBreak: 'break-all',
                            cursor: 'pointer',
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                          }}
                        >
                          {r.error.slice(0, 150)} <span style={{ color: 'var(--fg-dim)' }}>📋</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 6,
                    paddingTop: 6,
                    borderTop: '1px solid var(--border-muted)',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: 'var(--fg-subtle)' }}>{entry.totalItems} items total</span>
                  {entry.totalTokens > 0 && (
                    <span style={{ color: 'var(--fg-dim)' }}>~{entry.totalTokens} tokens</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
