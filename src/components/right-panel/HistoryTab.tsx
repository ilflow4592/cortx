import type { CollectHistoryEntry } from '../../stores/contextPackStore';

export function HistoryTab({ taskHistory }: { taskHistory: CollectHistoryEntry[] }) {
  return (
    <>
      <div className="rp-section">Search History</div>
      {taskHistory.length === 0 ? (
        <div style={{ fontSize: 11, color: '#3d4856', padding: '16px 0', textAlign: 'center' }}>
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
                  background: '#1a1f26',
                  border: '1px solid #1e2530',
                }}
              >
                {/* Time + duration */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: '#4d5868' }}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 10, color: '#4d5868' }}>{duration}</span>
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
                        background: '#242d38',
                        color: '#a1a1aa',
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
                        color: '#6b6b78',
                        textTransform: 'capitalize',
                        padding: '1px 5px',
                        borderRadius: 3,
                        background: '#1e2530',
                      }}
                    >
                      {r}
                    </span>
                  ))}
                  <span style={{ fontSize: 9, color: '#3d4856' }}>|</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: '#7dbdbd',
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
                            color: r.error ? '#ef4444' : r.itemCount > 0 ? '#34d399' : '#4d5868',
                            width: 10,
                          }}
                        >
                          {r.error ? '✗' : r.itemCount > 0 ? '✓' : '○'}
                        </span>
                        <span style={{ color: '#888895', textTransform: 'capitalize', width: 50 }}>
                          {r.type}
                        </span>
                        <span style={{ color: r.error ? '#ef4444' : '#4d5868' }}>
                          {r.error ? 'failed' : `${r.itemCount} items`}
                        </span>
                        {r.tokenUsage && !r.error && (
                          <span style={{ color: '#3d4856', marginLeft: 'auto' }}>
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
                            color: '#4d5868',
                            marginLeft: 16,
                            marginTop: 2,
                            wordBreak: 'break-all',
                            cursor: 'pointer',
                            userSelect: 'text',
                            WebkitUserSelect: 'text',
                          }}
                        >
                          {r.error.slice(0, 150)} <span style={{ color: '#3d4856' }}>📋</span>
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
                    borderTop: '1px solid #1e2530',
                    fontSize: 10,
                  }}
                >
                  <span style={{ color: '#6b6b78' }}>{entry.totalItems} items total</span>
                  {entry.totalTokens > 0 && (
                    <span style={{ color: '#3d4856' }}>~{entry.totalTokens} tokens</span>
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
