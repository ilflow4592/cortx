import type { DiffHunk } from './types';

interface DiffHunkViewProps {
  hunks: DiffHunk[];
}

export function DiffHunkView({ hunks }: DiffHunkViewProps) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 12,
        lineHeight: 1.7,
      }}
    >
      {hunks.length === 0 && (
        <div style={{ padding: 16, color: 'var(--fg-subtle)', fontSize: 11 }}>No diff available</div>
      )}
      {hunks.map((hunk, hi) => (
        <div key={hi}>
          <div
            style={{
              padding: '4px 16px',
              color: 'var(--accent-bright)',
              background: 'rgba(90,165,165,0.04)',
              fontSize: 11,
            }}
          >
            {hunk.header}
          </div>
          {hunk.lines.map((line, li) => (
            <div
              key={li}
              style={{
                display: 'flex',
                minHeight: 20,
                background:
                  line.type === 'add'
                    ? 'rgba(52,211,153,0.06)'
                    : line.type === 'del'
                      ? 'rgba(239,68,68,0.06)'
                      : 'transparent',
              }}
            >
              <span
                style={{
                  width: 48,
                  textAlign: 'right',
                  paddingRight: 12,
                  color: 'var(--fg-dim)',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                {line.num || ''}
              </span>
              <span
                style={{
                  color: line.type === 'add' ? '#34d399' : line.type === 'del' ? '#ef4444' : 'var(--fg-subtle)',
                  whiteSpace: 'pre',
                  overflow: 'hidden',
                }}
              >
                {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '} {line.content}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
