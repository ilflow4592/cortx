import type { ReactNode } from 'react';
import type { ContextItem } from '../../types/contextPack';

interface SourceFilterBarProps {
  taskItems: ContextItem[];
  newCount: number;
  sourceFilter: string | null;
  setSourceFilter: (v: string | null) => void;
  onClear: () => void;
  sourceIcon: (t: string) => ReactNode;
}

export function SourceFilterBar({
  taskItems,
  newCount,
  sourceFilter,
  setSourceFilter,
  onClear,
  sourceIcon,
}: SourceFilterBarProps) {
  if (taskItems.length === 0) return null;

  const sourceCounts: Record<string, number> = {};
  taskItems.forEach((i) => {
    sourceCounts[i.sourceType] = (sourceCounts[i.sourceType] || 0) + 1;
  });
  const sourceTypes = Object.keys(sourceCounts);

  return (
    <div
      className="ctx-filters"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setSourceFilter(null)}
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 500,
            background: sourceFilter === null ? 'var(--accent-bg)' : 'none',
            border: sourceFilter === null ? '1px solid var(--accent-bg)' : '1px solid transparent',
            color: sourceFilter === null ? 'var(--accent-bright)' : 'var(--fg-subtle)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          All ({taskItems.length})
        </button>
        {sourceTypes.map((st) => (
          <button
            key={st}
            onClick={() => setSourceFilter(sourceFilter === st ? null : st)}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: sourceFilter === st ? 'var(--accent-bg)' : 'none',
              border: sourceFilter === st ? '1px solid var(--accent-bg)' : '1px solid transparent',
              color: sourceFilter === st ? 'var(--accent-bright)' : 'var(--fg-subtle)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {sourceIcon(st)}
            {st} ({sourceCounts[st]})
          </button>
        ))}
        {newCount > 0 && <span className="ctx-new-count">{newCount} NEW</span>}
      </div>
      <button
        onClick={onClear}
        style={{
          background: 'none',
          border: 'none',
          fontSize: 10,
          color: 'var(--fg-faint)',
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Clear collected
      </button>
    </div>
  );
}
