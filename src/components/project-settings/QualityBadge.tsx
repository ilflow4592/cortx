/** 스캔 품질 등급 뱃지 — Rich/Partial/Sparse 색상 매핑. */
import type { ProjectQuality } from '../../types/project';

const CONFIG: Record<ProjectQuality, { label: string; bg: string; fg: string }> = {
  rich: { label: 'Rich', bg: 'rgba(52,211,153,0.15)', fg: '#34d399' },
  partial: { label: 'Partial', bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
  sparse: { label: 'Sparse', bg: 'rgba(161,161,170,0.15)', fg: '#a1a1aa' },
};

export function QualityBadge({ quality }: { quality: ProjectQuality }) {
  const { label, bg, fg } = CONFIG[quality];
  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 4,
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </span>
  );
}
