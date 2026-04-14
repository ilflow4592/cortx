import { Undo2 } from 'lucide-react';
import type { ChangedFile } from './types';

interface FileRowProps {
  file: ChangedFile;
  onSelect: () => void;
  onDiscard: (e: React.MouseEvent) => void;
}

export function FileRow({ file, onSelect, onDiscard }: FileRowProps) {
  const statusColor =
    file.status === 'M'
      ? '#eab308'
      : file.status === 'A'
        ? '#34d399'
        : file.status === 'D'
          ? '#ef4444'
          : 'var(--fg-subtle)';

  return (
    <button
      key={file.path}
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '5px 16px',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid #ffffff06',
        color: 'var(--fg-secondary)',
        cursor: 'pointer',
        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
        fontSize: 11,
        textAlign: 'left',
      }}
    >
      {file.status && (
        <span style={{ color: statusColor, fontSize: 10, fontWeight: 600, width: 14, flexShrink: 0 }}>
          {file.status}
        </span>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{file.path}</span>
      {file.status && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Discard changes"
          onClick={onDiscard}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onDiscard(e as unknown as React.MouseEvent);
            }
          }}
          title="Discard changes"
          style={{
            color: 'var(--fg-subtle)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            padding: '0 2px',
          }}
        >
          <Undo2 size={12} strokeWidth={1.5} />
        </span>
      )}
    </button>
  );
}
