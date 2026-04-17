import { lazy, Suspense, useState } from 'react';
import { Zap, Settings } from 'lucide-react';
import type { PipelineState } from '../../types/task';
import type { PipelineConfig } from '../../services/pipelineConfig';
import { PipelineHeader } from './dashboard/PipelineHeader';
import { PhasesList } from './dashboard/PhasesList';
import { CustomPhasesList } from './dashboard/CustomPhasesList';
import { TokenUsageTable } from './dashboard/TokenUsageTable';

// PipelineBuilder 는 DnD + 여러 서브컴포넌트로 무거움 → lazy load
const PipelineBuilder = lazy(() =>
  import('../pipeline-builder/PipelineBuilder').then((m) => ({ default: m.PipelineBuilder })),
);

export function DashboardTab({
  pipeline,
  cwd,
  onResetClick,
  config,
  taskId,
}: {
  pipeline: PipelineState | undefined;
  cwd: string;
  onResetClick: () => void;
  config?: PipelineConfig;
  taskId: string;
}) {
  const [showBuilder, setShowBuilder] = useState(false);
  const isCustomMode = pipeline?.pipelineMode === 'custom';

  if (!pipeline?.enabled) {
    return (
      <>
        <div
          style={{
            padding: '32px 16px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ marginBottom: 8, opacity: 0.3 }}>
            <Zap size={24} strokeWidth={1.5} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-faint)', marginBottom: 16 }}>No pipeline active</div>
          <div
            style={{
              fontSize: 10,
              color: 'var(--fg-dim)',
              lineHeight: 1.6,
              overflowWrap: 'anywhere',
              textAlign: 'center',
            }}
          >
            Run{' '}
            <code
              style={{
                background: 'var(--bg-surface-hover)',
                padding: '1px 5px',
                borderRadius: 3,
                wordBreak: 'break-all',
              }}
            >
              /pipeline:dev-task
            </code>{' '}
            to start or customize your own
          </div>
          <button
            onClick={() => setShowBuilder(true)}
            style={{
              marginTop: 14,
              padding: '5px 12px',
              fontSize: 10,
              background: 'var(--bg-surface)',
              color: 'var(--accent-bright)',
              border: '1px solid var(--accent-bg)',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Settings size={12} /> Customize Pipeline
          </button>
        </div>
        {showBuilder && (
          <Suspense fallback={null}>
            <PipelineBuilder taskId={taskId} cwd={cwd} onClose={() => setShowBuilder(false)} />
          </Suspense>
        )}
      </>
    );
  }

  return (
    <>
      <PipelineHeader pipeline={pipeline} onResetClick={onResetClick} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px 0',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 3,
            fontWeight: 500,
            color: isCustomMode ? 'var(--accent-bright)' : 'var(--fg-dim)',
            background: isCustomMode ? 'var(--accent-bg)' : 'var(--bg-chip)',
            border: `1px solid ${isCustomMode ? 'var(--accent-bg)' : 'var(--border-muted)'}`,
          }}
          title={isCustomMode ? '커스텀 파이프라인 실행 중/완료' : '내장 파이프라인 (grill-me → ... → done)'}
        >
          {isCustomMode ? '⚡ Custom Pipeline' : '📦 Built-in Pipeline'}
        </span>
        <button
          onClick={() => setShowBuilder(true)}
          style={{
            padding: '3px 8px',
            fontSize: 9,
            background: 'transparent',
            color: 'var(--fg-subtle)',
            border: '1px solid var(--border-muted)',
            borderRadius: 3,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
          }}
          title={
            isCustomMode
              ? '현재 커스텀 파이프라인 편집/실행'
              : '커스텀 파이프라인으로 전환 (빨간 ■ 로 현재 중단 후 사용 권장)'
          }
        >
          <Settings size={10} /> {isCustomMode ? 'Edit' : 'Customize / Switch'}
        </button>
      </div>
      {isCustomMode ? (
        <CustomPhasesList pipeline={pipeline} cwd={cwd} />
      ) : (
        <PhasesList pipeline={pipeline} cwd={cwd} config={config} />
      )}
      <TokenUsageTable pipeline={pipeline} />
      {showBuilder && (
        <Suspense fallback={null}>
          <PipelineBuilder taskId={taskId} cwd={cwd} onClose={() => setShowBuilder(false)} />
        </Suspense>
      )}
    </>
  );
}
