/** 중앙 캔버스 — phase 노드 세로 나열, 스킬 드래그 드롭, phase 간 재정렬. */
import { useState } from 'react';
import { PhaseNode } from './PhaseNode';
import { DND_SKILL_MIME, DND_PHASE_MIME } from './dragTypes';
import type { CustomPhase, CustomPipelineConfig, CustomSkillRef } from '../../types/customPipeline';

interface Props {
  cfg: CustomPipelineConfig | null;
  selectedPhaseId: string | null;
  onSelectPhase: (id: string) => void;
  onPhasesChange: (phases: CustomPhase[]) => void;
  disabled?: boolean;
}

function makeEmptyPhase(existingIds: Set<string>): CustomPhase {
  let i = 1;
  while (existingIds.has(`phase_${i}`)) i++;
  return {
    id: `phase_${i}`,
    label: `Phase ${i}`,
    skills: [],
    model: 'Sonnet',
    effort: 'medium',
    permissionMode: 'bypassPermissions',
  };
}

export function PhaseCanvas({ cfg, selectedPhaseId, onSelectPhase, onPhasesChange, disabled }: Props) {
  const [trailingHover, setTrailingHover] = useState(false);

  if (!cfg) {
    return (
      <div style={{ padding: 24, color: 'var(--fg-dim)', fontSize: 12 }}>
        왼쪽 툴바에서 파이프라인을 선택하거나 New 로 생성하세요.
      </div>
    );
  }

  const replaceSkills = (phaseId: string, skills: CustomSkillRef[]) => {
    onPhasesChange(cfg.phases.map((p) => (p.id === phaseId ? { ...p, skills } : p)));
  };

  const reorderPhase = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const srcIdx = cfg.phases.findIndex((p) => p.id === fromId);
    const tgtIdx = cfg.phases.findIndex((p) => p.id === toId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const next = [...cfg.phases];
    const [moved] = next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, moved);
    onPhasesChange(next);
  };

  const appendPhaseFromSkill = (ref: CustomSkillRef) => {
    const existingIds = new Set(cfg.phases.map((p) => p.id));
    const phase = makeEmptyPhase(existingIds);
    phase.skills.push(ref);
    onPhasesChange([...cfg.phases, phase]);
    onSelectPhase(phase.id);
  };

  const onTrailingDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setTrailingHover(false);
    if (disabled) return;
    const raw = e.dataTransfer.getData(DND_SKILL_MIME);
    if (!raw) return;
    try {
      const ref = JSON.parse(raw) as CustomSkillRef;
      appendPhaseFromSkill(ref);
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{
        overflowY: 'auto',
        padding: 20,
        background: 'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.04), transparent 50%), var(--bg-app)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 720 }}>
        {cfg.phases.map((phase, i) => (
          <div key={phase.id}>
            <PhaseNode
              phase={phase}
              selected={phase.id === selectedPhaseId}
              disabled={disabled}
              onSelect={() => onSelectPhase(phase.id)}
              onSkillsChange={(skills) => replaceSkills(phase.id, skills)}
              onReorder={reorderPhase}
              onRemove={() => onPhasesChange(cfg.phases.filter((p) => p.id !== phase.id))}
            />
            {i < cfg.phases.length - 1 && (
              <div
                style={{
                  color: 'var(--fg-dim)',
                  fontSize: 10,
                  padding: '3px 0 3px 26px',
                }}
              >
                ↓
              </div>
            )}
          </div>
        ))}

        {/* Trailing drop zone — skill 드롭 시 새 phase 자동 생성 */}
        <div
          onDragOver={(e) => {
            // WebKit 은 dragover 중 custom MIME 을 types 에 노출하지 않음 — type 체크 없이 항상 허용.
            // drop 핸들러가 getData 결과로 최종 판정.
            if (disabled) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setTrailingHover(true);
          }}
          onDragLeave={() => setTrailingHover(false)}
          onDrop={onTrailingDrop}
          style={{
            marginTop: 10,
            padding: 14,
            border: `2px dashed ${trailingHover ? 'var(--green, #34d399)' : 'var(--border-strong)'}`,
            borderRadius: 6,
            textAlign: 'center',
            color: trailingHover ? 'var(--green, #34d399)' : 'var(--fg-dim)',
            fontSize: 10,
            fontStyle: 'italic',
            background: trailingHover ? 'rgba(52,211,153,0.03)' : 'transparent',
          }}
        >
          {disabled ? 'read-only' : '⊕  Drop a skill here to create a new phase'}
        </div>

        {cfg.phases.length === 0 && (
          <button
            onClick={() => {
              const existingIds = new Set<string>();
              onPhasesChange([makeEmptyPhase(existingIds)]);
            }}
            disabled={disabled}
            style={{
              marginTop: 8,
              padding: '6px 12px',
              fontSize: 11,
              background: 'var(--bg-surface)',
              color: 'var(--fg-secondary)',
              border: '1px dashed var(--border-strong)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            + Add empty phase
          </button>
        )}
      </div>
    </div>
  );
}

// used by trailing drop to avoid unused import lint if not referenced elsewhere
export { DND_PHASE_MIME };
