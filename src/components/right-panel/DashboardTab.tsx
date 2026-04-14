import { Zap } from 'lucide-react';
import type { PipelineState } from '../../types/task';
import type { PipelineConfig } from '../../services/pipelineConfig';
import { PipelineHeader } from './dashboard/PipelineHeader';
import { PhasesList } from './dashboard/PhasesList';
import { TokenUsageTable } from './dashboard/TokenUsageTable';

export function DashboardTab({
  pipeline,
  cwd,
  onResetClick,
  config,
}: {
  pipeline: PipelineState | undefined;
  cwd: string;
  onResetClick: () => void;
  config?: PipelineConfig;
}) {
  if (!pipeline?.enabled) {
    return (
      <div
        style={{
          padding: '32px 0',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ marginBottom: 8, opacity: 0.3 }}>
          <Zap size={24} strokeWidth={1.5} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginBottom: 16 }}>No pipeline active</div>
        <div style={{ fontSize: 10, color: 'var(--fg-dim)', lineHeight: 1.6 }}>
          Run{' '}
          <code style={{ background: 'var(--bg-surface-hover)', padding: '1px 5px', borderRadius: 3 }}>
            /pipeline:dev-task
          </code>{' '}
          to start
        </div>
      </div>
    );
  }

  return (
    <>
      <PipelineHeader pipeline={pipeline} onResetClick={onResetClick} />
      <PhasesList pipeline={pipeline} cwd={cwd} config={config} />
      <TokenUsageTable pipeline={pipeline} />
    </>
  );
}
