/** McpServerManager의 공용 아이콘 버튼 — 호버 강조. */
import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface HoverBtnProps {
  onClick: () => void;
  disabled?: boolean;
  hoverColor: string;
  title: string;
  children: ReactNode;
}

export function HoverIconButton({ onClick, disabled, hoverColor, title, children }: HoverBtnProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: !disabled && hovered ? `${hoverColor}15` : 'none',
        border: `1px solid ${!disabled && hovered ? `${hoverColor}40` : 'transparent'}`,
        color: disabled ? 'var(--fg-dim)' : hovered ? hoverColor : 'var(--fg-subtle)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

/** 서버 행 오른쪽의 컴팩트한 편집/삭제 버튼 */
export function RowIconButton({ onClick, disabled, hoverColor, title, children }: HoverBtnProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 26,
        height: 26,
        borderRadius: 5,
        background: !disabled && hovered ? `${hoverColor}15` : 'transparent',
        border: `1px solid ${!disabled && hovered ? `${hoverColor}40` : 'var(--border-muted)'}`,
        color: disabled ? 'var(--border-strong)' : hovered ? hoverColor : 'var(--fg-subtle)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
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
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      <X size={16} strokeWidth={1.5} />
    </button>
  );
}
