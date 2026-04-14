/** DiffViewer의 헤더/행 액션 버튼 — 호버 시 컬러 강조. */
import { useState, type ReactNode } from 'react';

interface BtnProps {
  onClick: () => void;
  disabled?: boolean;
  color: string;
  title: string;
  children: ReactNode;
}

/** 헤더 영역의 padded 버튼 — 라벨 + 아이콘 조합 */
export function HeaderButton({ onClick, disabled, color, title, children }: BtnProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '4px 10px',
        borderRadius: 5,
        fontSize: 10,
        fontWeight: 500,
        background: disabled ? 'rgba(55,65,81,0.2)' : hovered ? `${color}20` : `${color}10`,
        border: `1px solid ${disabled ? 'var(--border-muted)' : `${color}35`}`,
        color: disabled ? 'var(--fg-dim)' : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

/** 파일 행 내의 컴팩트 22x22 액션 버튼 */
export function RowButton({ onClick, disabled, color, title, children }: BtnProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        background: disabled ? 'transparent' : hovered ? `${color}20` : 'transparent',
        border: `1px solid ${disabled ? 'transparent' : hovered ? `${color}40` : 'transparent'}`,
        color: disabled ? 'var(--border-strong)' : hovered ? color : 'var(--fg-faint)',
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
