/** Dashboard 상단 phase 스테퍼 + 하단 상세 phase 행 렌더러. */
import { type ReactNode } from 'react';
import { CheckCircle2, Loader2, SkipForward, Circle, Download } from 'lucide-react';
import type { PhaseStatus, PipelineState } from '../../../types/task';
import { PHASE_ORDER, PHASE_NAMES, PHASE_MODELS } from '../../../constants/pipeline';
import type { PipelineConfig } from '../../../services/pipelineConfig';
import { formatTokens } from './types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

function phaseIcon(status: PhaseStatus): ReactNode {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={14} color="#34d399" strokeWidth={2} />;
    case 'in_progress':
      return <Loader2 size={14} color="var(--accent)" strokeWidth={2} className="spin" />;
    case 'skipped':
      return <SkipForward size={14} color="var(--fg-faint)" strokeWidth={1.5} />;
    default:
      return <Circle size={14} color="var(--fg-dim)" strokeWidth={1.5} />;
  }
}

function phaseColor(status: PhaseStatus): string {
  switch (status) {
    case 'done':
      return '#34d399';
    case 'in_progress':
      return 'var(--accent-bright)';
    case 'skipped':
      return 'var(--fg-faint)';
    default:
      return 'var(--border-strong)';
  }
}

interface Props {
  pipeline: PipelineState;
  cwd: string;
  config?: PipelineConfig;
}

export function PhasesList({ pipeline, cwd, config }: Props) {
  const phaseNames = config?.names || PHASE_NAMES;
  const phaseModels = config?.models || PHASE_MODELS;
  const hidden = config?.hidden || new Set();
  const visibleOrder = PHASE_ORDER.filter((p) => !hidden.has(p));

  return (
    <>
      {/* Progress stepper */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginBottom: 16,
          padding: '10px 12px',
          background: 'var(--bg-chip)',
          borderRadius: 8,
          border: '1px solid var(--border-muted)',
        }}
      >
        {visibleOrder.map((phase, i) => {
          const entry = pipeline.phases[phase] || { status: 'pending' as PhaseStatus };
          return (
            <span key={phase} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ display: 'flex', alignItems: 'center' }}>{phaseIcon(entry.status)}</span>
              <span
                style={{
                  fontSize: 9,
                  color: phaseColor(entry.status),
                  fontWeight: entry.status === 'in_progress' ? 600 : 400,
                }}
              >
                {phaseNames[phase]}
              </span>
              {i < visibleOrder.length - 1 && (
                <span style={{ color: 'var(--border-strong)', fontSize: 9, margin: '0 1px' }}>→</span>
              )}
            </span>
          );
        })}
      </div>

      {/* Detail table */}
      <div className="rp-section">Phases</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visibleOrder.map((phase) => {
          const entry = pipeline.phases[phase] || { status: 'pending' as PhaseStatus };
          const isActive = entry.status === 'in_progress';
          const model = phaseModels[phase];
          return (
            <div
              key={phase}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 6,
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                border: isActive ? '1px solid var(--accent-bg)' : '1px solid transparent',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', width: 18, justifyContent: 'center' }}>
                {phaseIcon(entry.status)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: phaseColor(entry.status),
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {phaseNames[phase]}
              </span>
              {model !== '-' && (
                <span
                  style={{
                    fontSize: 8,
                    color: model === 'Opus' ? '#ab98c7' : 'var(--accent)',
                    background: model === 'Opus' ? 'rgba(171,152,199,0.08)' : 'var(--accent-bg)',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {model}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {entry.memo && (
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--fg-faint)',
                    maxWidth: 100,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.memo}
                </span>
              )}
              {phase === 'dev_plan' && pipeline.devPlan && (
                <button
                  onClick={async () => {
                    const fileName = 'dev-plan.md';
                    const b64 = btoa(unescape(encodeURIComponent(pipeline.devPlan!)));
                    await invoke('run_shell_command', {
                      cwd: cwd,
                      command: `echo '${b64}' | base64 -d > '${fileName}' && open -R '${fileName}'`,
                    }).catch(() => {});
                  }}
                  title="Download dev-plan.md"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <Download size={12} strokeWidth={1.5} />
                </button>
              )}
              {(entry.inputTokens || entry.outputTokens) && (
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--fg-faint)',
                    whiteSpace: 'nowrap',
                    fontFamily: "'Fira Code', monospace",
                  }}
                >
                  {formatTokens((entry.inputTokens || 0) + (entry.outputTokens || 0))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
