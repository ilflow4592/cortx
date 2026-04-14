/** 상/하단 섹션 사이 drag-to-resize 핸들. */

interface Props {
  splitRatio: number;
  onChange: (ratio: number) => void;
}

export function ResizeHandle({ splitRatio, onChange }: Props) {
  return (
    <div
      style={{ height: 4, cursor: 'row-resize', background: 'var(--border-strong)', flexShrink: 0 }}
      onMouseDown={(e) => {
        const startY = e.clientY;
        const panel = e.currentTarget.parentElement;
        if (!panel) return;
        const startHeight = panel.clientHeight;
        const startRatio = splitRatio;
        const onMove = (ev: MouseEvent) => {
          const delta = ev.clientY - startY;
          const newRatio = Math.max(0.15, Math.min(0.85, startRatio + delta / startHeight));
          onChange(newRatio);
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }}
    />
  );
}
