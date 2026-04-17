/** 커스텀 파이프라인 진행도 렌더러. builtin 의 PhasesList 를 대신해 Dashboard 에서 사용. */
import { type ReactNode, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Circle, CircleAlert } from 'lucide-react';
import type { PipelineState } from '../../../types/task';
import type { CustomPipelineConfig, CustomSkillStatus, CustomSkillRef } from '../../../types/customPipeline';
import { readCustomPipeline } from '../../../services/customPipelineStore';

function phaseIcon(status: CustomSkillStatus): ReactNode {
  switch (status) {
    case 'done':
      return <CheckCircle2 size={14} color="#34d399" strokeWidth={2} />;
    case 'in_progress':
      return <Loader2 size={14} color="var(--accent)" strokeWidth={2} className="spin" />;
    case 'failed':
      return <CircleAlert size={14} color="var(--rose, #f87171)" strokeWidth={2} />;
    default:
      return <Circle size={14} color="var(--fg-dim)" strokeWidth={1.5} />;
  }
}

function statusColor(status: CustomSkillStatus): string {
  switch (status) {
    case 'done':
      return '#34d399';
    case 'in_progress':
      return 'var(--accent-bright)';
    case 'failed':
      return 'var(--rose, #f87171)';
    default:
      return 'var(--border-strong)';
  }
}

function skillRefLabel(ref: CustomSkillRef): string {
  switch (ref.kind) {
    case 'agent':
      return `agent:${ref.subagentType}`;
    default:
      return `${ref.kind}:${ref.id}`;
  }
}

interface Props {
  pipeline: PipelineState;
  cwd: string;
}

/**
 * pipelineMode === 'custom' 일 때 사용됨. configId 로 파일에서 phases 정의를 로드해
 * phase 단위 + skill 단위 상태를 함께 표시.
 */
export function CustomPhasesList({ pipeline, cwd }: Props) {
  const [cfg, setCfg] = useState<CustomPipelineConfig | null>(null);
  const active = pipeline.activeCustomPipeline;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await readCustomPipeline(active.configId, active.source, cwd);
        if (!cancelled) setCfg(loaded);
      } catch (e) {
        console.error('CustomPhasesList: failed to load config', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active?.configId, active?.source, cwd, active]);

  if (!active) {
    return (
      <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-dim)' }}>
        커스텀 파이프라인 상태가 아직 초기화되지 않았습니다.
      </div>
    );
  }
  if (!cfg) {
    return <div style={{ padding: 16, fontSize: 11, color: 'var(--fg-dim)' }}>파이프라인 정의 로딩 중...</div>;
  }

  return (
    <>
      {/* Progress stepper (커스텀 phase id 기반) */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          marginBottom: 12,
          padding: '8px 10px',
          background: 'var(--bg-chip)',
          borderRadius: 8,
          border: '1px solid var(--border-muted)',
        }}
      >
        {cfg.phases.map((phase, i) => {
          const st = active.phaseStates[phase.id]?.status || 'pending';
          return (
            <span key={phase.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {phaseIcon(st)}
              <span
                style={{
                  fontSize: 9,
                  color: statusColor(st),
                  fontWeight: st === 'in_progress' ? 600 : 400,
                  marginLeft: 2,
                }}
              >
                {phase.label}
              </span>
              {i < cfg.phases.length - 1 && (
                <span style={{ color: 'var(--border-strong)', fontSize: 9, margin: '0 1px' }}>→</span>
              )}
            </span>
          );
        })}
      </div>

      <div className="rp-section">Phases</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {cfg.phases.map((phase) => {
          const state = active.phaseStates[phase.id];
          const phaseStatus: CustomSkillStatus = state?.status || 'pending';
          const isActive = phaseStatus === 'in_progress';
          const skillCount = phase.skills.length;
          return (
            <div
              key={phase.id}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                border: isActive ? '1px solid var(--accent-bg)' : '1px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, display: 'flex', justifyContent: 'center' }}>{phaseIcon(phaseStatus)}</span>
                <span
                  style={{
                    fontSize: 11,
                    color: statusColor(phaseStatus),
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {phase.label}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--fg-dim)',
                    fontFamily: "'Fira Code', monospace",
                  }}
                >
                  {phase.id}
                </span>
                {phase.model && (
                  <span
                    style={{
                      fontSize: 8,
                      padding: '1px 5px',
                      borderRadius: 3,
                      fontWeight: 500,
                      color: phase.model === 'Opus' ? '#ab98c7' : 'var(--accent)',
                      background: phase.model === 'Opus' ? 'rgba(171,152,199,0.08)' : 'var(--accent-bg)',
                    }}
                  >
                    {phase.model} 4.6 · {phase.effort ?? 'medium'}
                  </span>
                )}
                {phase.permissionMode === 'plan' && (
                  <span
                    style={{
                      fontSize: 8,
                      padding: '1px 5px',
                      borderRadius: 3,
                      fontWeight: 500,
                      color: 'var(--amber, #f59e0b)',
                      background: 'rgba(245, 158, 11, 0.1)',
                    }}
                  >
                    plan
                  </span>
                )}
                {phase.auto && (
                  <span
                    style={{
                      fontSize: 8,
                      padding: '1px 5px',
                      borderRadius: 3,
                      fontWeight: 500,
                      color: '#34d399',
                      background: 'rgba(52, 211, 153, 0.12)',
                    }}
                  >
                    auto
                  </span>
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 9, color: 'var(--fg-dim)' }}>{skillCount} skills</span>
              </div>

              {/* skill stack (phase 활성 시만 표시) */}
              {isActive && skillCount > 0 && (
                <div style={{ marginTop: 6, paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {phase.skills.map((sref, si) => {
                    const st = (state?.skillStates[si] as CustomSkillStatus) || 'pending';
                    return (
                      <div
                        key={si}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 10,
                          color: statusColor(st),
                          fontFamily: "'Fira Code', monospace",
                        }}
                      >
                        {phaseIcon(st)}
                        <span>{skillRefLabel(sref)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {state?.error && (
                <div style={{ marginTop: 4, fontSize: 9, color: 'var(--rose, #f87171)' }}>{state.error}</div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
