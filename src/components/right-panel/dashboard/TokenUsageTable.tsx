/** 전체 phase 합산 토큰/비용 요약 + 메타데이터(complexity/PR/리뷰 라운드). */
import type { PipelineState } from '../../../types/task';
import { PHASE_ORDER } from '../../../constants/pipeline';
import { formatTokens } from './types';

interface Props {
  pipeline: PipelineState;
}

export function TokenUsageTable({ pipeline }: Props) {
  const totalIn = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.inputTokens || 0), 0);
  const totalOut = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.outputTokens || 0), 0);
  const totalCost = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.costUsd || 0), 0);

  return (
    <>
      {totalIn + totalOut > 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 10px',
            marginTop: 8,
            borderTop: '1px solid var(--border-strong)',
            fontSize: 10,
            color: 'var(--fg-subtle)',
            fontFamily: "'Fira Code', monospace",
          }}
        >
          <span>
            Total: {formatTokens(totalIn)} in / {formatTokens(totalOut)} out
          </span>
          {totalCost > 0 && <span>${totalCost.toFixed(4)}</span>}
        </div>
      )}

      {(pipeline.complexity || pipeline.prUrl || pipeline.reviewRounds !== undefined) && (
        <>
          <div className="rp-section" style={{ marginTop: 14 }}>
            Info
          </div>
          <div className="wt-info">
            {pipeline.complexity && (
              <div className="wt-row">
                <span>Complexity</span>
                <span className="val">{pipeline.complexity}</span>
              </div>
            )}
            {pipeline.prNumber && (
              <div className="wt-row">
                <span>PR</span>
                <span className="val">#{pipeline.prNumber}</span>
              </div>
            )}
            {pipeline.reviewRounds !== undefined && (
              <div className="wt-row">
                <span>Review rounds</span>
                <span className="val">{pipeline.reviewRounds}</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
