/** Command palette의 단일 항목 — 아이콘 + 라벨 + 선택 힌트. */
import type { ReactNode } from 'react';
import { Command } from 'cmdk';

interface Props {
  icon: ReactNode;
  label: string;
  hint?: string;
  keywords?: string[];
  onSelect: () => void;
}

export function PaletteItem({ icon, label, hint, keywords, onSelect }: Props) {
  return (
    <Command.Item
      value={[label, ...(keywords || [])].filter(Boolean).join(' ')}
      onSelect={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--fg-secondary)',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {hint && (
        <span
          style={{
            fontSize: 10,
            color: 'var(--fg-faint)',
            fontFamily: "'JetBrains Mono', monospace",
            flexShrink: 0,
          }}
        >
          {hint}
        </span>
      )}
    </Command.Item>
  );
}
