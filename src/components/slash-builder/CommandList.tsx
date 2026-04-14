/** Slash command 목록 표시 — 스코프별 카테고리 + 개별 행. */
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { SlashCommand } from './api';

interface CategoryProps {
  title: string;
  description: string;
  commands: SlashCommand[];
  selected: SlashCommand | null;
  onSelect: (cmd: SlashCommand) => void;
  onDelete: (cmd: SlashCommand) => void;
  disabled: boolean;
}

export function CategoryList({
  title,
  description,
  commands,
  selected,
  onSelect,
  onDelete,
  disabled,
}: CategoryProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: 'var(--fg-subtle)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          padding: '6px 8px 2px',
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 9,
          color: 'var(--fg-dim)',
          padding: '0 8px 6px',
          fontFamily: "'JetBrains Mono', monospace",
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {description}
      </div>
      {commands.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--fg-dim)', padding: '4px 8px', fontStyle: 'italic' }}>
          No commands
        </div>
      )}
      {commands.map((cmd) => (
        <CommandRow
          key={`${cmd.source}-${cmd.name}`}
          cmd={cmd}
          isSelected={selected?.name === cmd.name && selected?.source === cmd.source}
          onSelect={() => onSelect(cmd)}
          onDelete={() => onDelete(cmd)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

interface RowProps {
  cmd: SlashCommand;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  disabled: boolean;
}

function CommandRow({ cmd, isSelected, onSelect, onDelete, disabled }: RowProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 8px',
        borderRadius: 5,
        background: isSelected ? 'var(--accent-bg)' : hovered ? 'var(--bg-surface-hover)' : 'transparent',
        border: `1px solid ${isSelected ? 'var(--accent-border)' : 'transparent'}`,
        cursor: 'pointer',
        transition: 'all 120ms ease',
      }}
    >
      <button
        onClick={onSelect}
        disabled={disabled}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'none',
          border: 'none',
          color: isSelected ? 'var(--fg-primary)' : 'var(--fg-secondary)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          textAlign: 'left',
          padding: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        /{cmd.name}
      </button>
      {(hovered || isSelected) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={disabled}
          title="Delete"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-faint)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Trash2 size={11} strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
