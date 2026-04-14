/** Category별 worktree 그룹 + 토글 버튼 + 개별 EntryRow. */
import { useState, type ReactNode } from 'react';
import type { WorktreeEntry } from './types';

interface SectionProps {
  title: string;
  description: string;
  color: string;
  icon: ReactNode;
  entries: WorktreeEntry[];
  onToggle: (e: WorktreeEntry) => void;
  onToggleAll: () => void;
}

export function CategorySection({ title, description, color, icon, entries, onToggle, onToggleAll }: SectionProps) {
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>({entries.length})</span>
        <span style={{ fontSize: 10, color: 'var(--fg-faint)', flex: 1 }}> · {description}</span>
        <button
          onClick={onToggleAll}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-subtle)',
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '2px 8px',
            borderRadius: 4,
          }}
        >
          Toggle all
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.map((entry) => (
          <EntryRow key={entry.worktreePath} entry={entry} accent={color} onToggle={() => onToggle(entry)} />
        ))}
      </div>
    </div>
  );
}

interface RowProps {
  entry: WorktreeEntry;
  accent: string;
  onToggle: () => void;
}

function EntryRow({ entry, accent, onToggle }: RowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: hovered ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
        border: `1px solid ${entry.selected ? `${accent}40` : 'var(--bg-surface-hover)'}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 120ms ease',
      }}
    >
      <input
        type="checkbox"
        checked={entry.selected}
        onChange={() => {}}
        style={{ cursor: 'pointer', accentColor: accent }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--fg-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.taskTitle || <span style={{ color: 'var(--fg-subtle)', fontStyle: 'italic' }}>(no task)</span>}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--fg-faint)',
            fontFamily: "'JetBrains Mono', monospace",
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.projectName} · {entry.branch || '(no branch)'}
        </div>
      </div>
      {entry.ageInDays !== Infinity && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--fg-faint)',
            fontFamily: "'JetBrains Mono', monospace",
            flexShrink: 0,
          }}
        >
          {entry.ageInDays}d
        </div>
      )}
    </div>
  );
}
