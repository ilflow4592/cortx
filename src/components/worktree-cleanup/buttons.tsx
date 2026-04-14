/** Worktree cleanup 헤더의 새로고침/닫기 버튼. */
import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

export function RefreshButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered && !disabled ? 'var(--accent-bg)' : 'none',
        border: `1px solid ${hovered && !disabled ? 'var(--accent-border)' : 'transparent'}`,
        color: disabled ? 'var(--fg-dim)' : hovered ? 'var(--accent-bright)' : 'var(--fg-subtle)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
      title="Rescan"
    >
      <RefreshCw size={14} strokeWidth={1.5} className={disabled ? 'spinner' : ''} />
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
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      <X size={16} strokeWidth={1.5} />
    </button>
  );
}
