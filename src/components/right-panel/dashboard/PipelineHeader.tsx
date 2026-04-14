/** Dashboard 상단 Progress 헤더 — complexity 칩 + Reset 버튼. */
import { RotateCcw } from 'lucide-react';
import type { PipelineState } from '../../../types/task';

interface Props {
  pipeline: PipelineState;
  onResetClick: () => void;
}

export function PipelineHeader({ pipeline, onResetClick }: Props) {
  return (
    <div
      className="rp-section"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Progress
        {pipeline.complexity && (
          <span
            style={{
              fontSize: 8,
              fontWeight: 500,
              textTransform: 'none',
              letterSpacing: 0,
              padding: '1px 6px',
              borderRadius: 3,
              color:
                pipeline.complexity === 'Complex'
                  ? '#ef4444'
                  : pipeline.complexity === 'Medium'
                    ? '#f59e0b'
                    : '#34d399',
              background:
                pipeline.complexity === 'Complex'
                  ? 'rgba(239,68,68,0.08)'
                  : pipeline.complexity === 'Medium'
                    ? 'rgba(245,158,11,0.08)'
                    : 'rgba(52,211,153,0.08)',
            }}
          >
            {pipeline.complexity}
          </span>
        )}
      </span>
      <button
        onClick={onResetClick}
        title="Reset session"
        className="icon-btn-subtle"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--fg-subtle)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 9,
          textTransform: 'none',
          letterSpacing: 0,
          fontWeight: 400,
          borderRadius: 4,
          padding: '2px 6px',
        }}
      >
        <RotateCcw size={10} strokeWidth={1.5} /> Reset
      </button>
    </div>
  );
}
