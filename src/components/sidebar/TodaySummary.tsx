/**
 * TodaySummary — Sidebar 최하단의 오늘 통계 (Focus / Interrupts / Done) + Report 버튼.
 *
 * 모든 합계는 부모(Sidebar)에서 계산해 props로 전달.
 */
import { BarChart3 } from 'lucide-react';
import { formatTime } from '../../utils/time';

interface TodaySummaryProps {
  totalFocus: number;
  totalInterrupts: number;
  totalInterruptTime: number;
  doneCount: number;
  totalCount: number;
  onOpenReport: () => void;
}

export function TodaySummary({
  totalFocus,
  totalInterrupts,
  totalInterruptTime,
  doneCount,
  totalCount,
  onOpenReport,
}: TodaySummaryProps) {
  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
      <div className="sb-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Today</span>
        <button
          onClick={onOpenReport}
          className="icon-btn-subtle"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--fg-dim)',
            cursor: 'pointer',
            fontSize: 10,
            fontFamily: 'inherit',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            borderRadius: 4,
            padding: '2px 6px',
          }}
        >
          <BarChart3 size={14} strokeWidth={1.5} /> Report
        </button>
      </div>
      <div className="sb-summary">
        <span>Focus</span>
        <span className="val" style={{ color: 'var(--accent-bright)' }}>
          {formatTime(totalFocus)}
        </span>
      </div>
      <div className="sb-summary">
        <span>Interrupts</span>
        <span className="val" style={{ color: '#eab308' }}>
          {totalInterrupts} ({formatTime(totalInterruptTime)})
        </span>
      </div>
      <div className="sb-summary">
        <span>Done</span>
        <span className="val" style={{ color: '#34d399' }}>
          {doneCount}/{totalCount}
        </span>
      </div>
    </div>
  );
}
