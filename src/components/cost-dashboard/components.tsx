/** Cost dashboard 공용 UI 조각들 — 카드/섹션/버튼/태스크 행. */
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { TaskUsage } from './types';
import { formatNum, formatUsd } from './format';

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  accent: string;
}

export function StatCard({ icon, label, value, accent }: StatCardProps) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-surface-hover)',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}

interface SectionProps {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}

export function Section({ icon, title, children }: SectionProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

interface HoverButtonProps {
  active: boolean;
  onClick: () => void;
  activeBg: string;
  activeBorder: string;
  activeColor: string;
  hoverBg: string;
  hoverBorder: string;
  children: ReactNode;
}

export function HoverButton({
  active,
  onClick,
  activeBg,
  activeBorder,
  activeColor,
  hoverBg,
  hoverBorder,
  children,
}: HoverButtonProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '5px 12px',
        borderRadius: 5,
        fontSize: 11,
        background: active ? activeBg : hovered ? hoverBg : 'none',
        border: `1px solid ${active ? activeBorder : hovered ? hoverBorder : 'var(--border-muted)'}`,
        color: active ? activeColor : hovered ? 'var(--fg-muted)' : 'var(--fg-subtle)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

export function CloseButton({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(239,68,68,0.1)' : 'none',
        border: `1px solid ${hovered ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
        color: hovered ? '#ef4444' : 'var(--fg-faint)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        marginLeft: 8,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      <X size={16} strokeWidth={1.5} />
    </button>
  );
}

export function TopTaskRow({ task }: { task: TaskUsage }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: hovered ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--bg-surface-hover)'}`,
        borderRadius: 6,
        transition: 'all 120ms ease',
        cursor: 'default',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: hovered ? 'var(--fg-primary)' : 'var(--fg-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', fontFamily: 'monospace', marginTop: 2 }}>
          {formatNum(task.totalIn)} in / {formatNum(task.totalOut)} out
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--accent-bright)', fontFamily: 'monospace', flexShrink: 0 }}>
        {formatUsd(task.totalCost)}
      </div>
    </div>
  );
}
