import { type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Loader2,
  SkipForward,
  Circle,
  Download,
  RotateCcw,
  Zap,
} from 'lucide-react';
import type { PhaseStatus, PipelineState } from '../../types/task';
import { PHASE_ORDER, PHASE_NAMES, PHASE_MODELS } from '../../constants/pipeline';

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function phaseIcon(status: PhaseStatus): ReactNode {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={14} color="#34d399" strokeWidth={2} />;
    case 'in_progress':
      return <Loader2 size={14} color="#5aa5a5" strokeWidth={2} className="spin" />;
    case 'skipped':
      return <SkipForward size={14} color="#4d5868" strokeWidth={1.5} />;
    default:
      return <Circle size={14} color="#3d4856" strokeWidth={1.5} />;
  }
}

function phaseColor(status: PhaseStatus): string {
  switch (status) {
    case 'done':
      return '#34d399';
    case 'in_progress':
      return '#7dbdbd';
    case 'skipped':
      return '#4d5868';
    default:
      return '#2a3642';
  }
}

export function DashboardTab({
  pipeline,
  cwd,
  onResetClick,
}: {
  pipeline: PipelineState | undefined;
  cwd: string;
  onResetClick: () => void;
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
        <div style={{ fontSize: 12, color: '#4d5868', marginBottom: 16 }}>No pipeline active</div>
        <div style={{ fontSize: 10, color: '#3d4856', lineHeight: 1.6 }}>
          Run{' '}
          <code style={{ background: '#242d38', padding: '1px 5px', borderRadius: 3 }}>
            /pipeline:dev-task
          </code>{' '}
          to start
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Progress stepper */}
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
            color: '#6b7585',
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
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginBottom: 16,
          padding: '10px 12px',
          background: '#1a1f26',
          borderRadius: 8,
          border: '1px solid #1e2530',
        }}
      >
        {PHASE_ORDER.map((phase, i) => {
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
                {PHASE_NAMES[phase]}
              </span>
              {i < PHASE_ORDER.length - 1 && (
                <span style={{ color: '#2a3642', fontSize: 9, margin: '0 1px' }}>→</span>
              )}
            </span>
          );
        })}
      </div>

      {/* Detail table */}
      <div className="rp-section">Phases</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PHASE_ORDER.map((phase) => {
          const entry = pipeline.phases[phase] || { status: 'pending' as PhaseStatus };
          const isActive = entry.status === 'in_progress';
          return (
            <div
              key={phase}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                borderRadius: 6,
                background: isActive ? 'rgba(90,165,165,0.06)' : 'transparent',
                border: isActive ? '1px solid rgba(90,165,165,0.15)' : '1px solid transparent',
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
                {PHASE_NAMES[phase]}
              </span>
              {PHASE_MODELS[phase] !== '-' && (
                <span
                  style={{
                    fontSize: 8,
                    color: PHASE_MODELS[phase] === 'Opus' ? '#ab98c7' : '#5aa5a5',
                    background:
                      PHASE_MODELS[phase] === 'Opus' ? 'rgba(171,152,199,0.08)' : 'rgba(90,165,165,0.08)',
                    padding: '1px 5px',
                    borderRadius: 3,
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  {PHASE_MODELS[phase]}
                </span>
              )}
              <span style={{ flex: 1 }} />
              {entry.memo && (
                <span
                  style={{
                    fontSize: 9,
                    color: '#4d5868',
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
                    color: '#5aa5a5',
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
                    color: '#4d5868',
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

      {/* Total tokens */}
      {(() => {
        const totalIn = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.inputTokens || 0), 0);
        const totalOut = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.outputTokens || 0), 0);
        const totalCost = PHASE_ORDER.reduce((s, p) => s + (pipeline.phases[p]?.costUsd || 0), 0);
        if (totalIn + totalOut === 0) return null;
        return (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 10px',
              marginTop: 8,
              borderTop: '1px solid #2a3642',
              fontSize: 10,
              color: '#6b7585',
              fontFamily: "'Fira Code', monospace",
            }}
          >
            <span>
              Total: {formatTokens(totalIn)} in / {formatTokens(totalOut)} out
            </span>
            {totalCost > 0 && <span>${totalCost.toFixed(4)}</span>}
          </div>
        );
      })()}

      {/* Metadata */}
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
