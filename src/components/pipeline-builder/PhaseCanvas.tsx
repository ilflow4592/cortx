/** 중앙 캔버스 — phase 노드 세로 나열, 스킬 드래그 드롭, phase 간 재정렬. */
import { useRef } from 'react';
import { PhaseNode } from './PhaseNode';
import { DND_SKILL_MIME, DND_PHASE_MIME } from './dragTypes';
import { getDragPayload, parseDragJson } from './dndUtils';
import type { CustomPhase, CustomPipelineConfig, CustomSkillRef } from '../../types/customPipeline';

interface Props {
  cfg: CustomPipelineConfig | null;
  selectedPhaseId: string | null;
  onSelectPhase: (id: string) => void;
  onPhasesChange: (phases: CustomPhase[]) => void;
  /** cfg 가 null 일 때 빈 캔버스에 스킬 드롭 시 호출 — 새 파이프라인 + phase 동시 생성 */
  onCreateWithSkill: (skill: CustomSkillRef) => void;
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

export function PhaseCanvas({
  cfg,
  selectedPhaseId,
  onSelectPhase,
  onPhasesChange,
  onCreateWithSkill,
  disabled,
}: Props) {
  // 드롭 존 호버 피드백은 ref 로 DOM 직접 조작.
  // 이유: onDragOver 가 연속 발화할 때 setState → React 리렌더가 drop event 자체를
  // 무효화하는 WebKit 버그를 우회.
  const emptyRef = useRef<HTMLDivElement>(null);
  const setEmptyHoverDOM = (on: boolean) => {
    const el = emptyRef.current;
    if (!el) return;
    el.style.borderColor = on ? 'var(--green, #34d399)' : 'var(--border-strong)';
    el.style.background = on ? 'rgba(52,211,153,0.06)' : 'transparent';
    el.style.color = on ? 'var(--green, #34d399)' : 'var(--fg-dim)';
  };
  const trailingRef = useRef<HTMLDivElement>(null);
  const setTrailingHoverDOM = (on: boolean) => {
    const el = trailingRef.current;
    if (!el) return;
    el.style.borderColor = on ? 'var(--green, #34d399)' : 'var(--border-strong)';
    el.style.background = on ? 'rgba(52,211,153,0.03)' : 'transparent';
    el.style.color = on ? 'var(--green, #34d399)' : 'var(--fg-dim)';
  };

  if (!cfg) {
    // 빈 상태 — 스킬을 여기로 드롭하면 새 파이프라인 자동 생성
    return (
      <div
        ref={emptyRef}
        onDragEnter={(e) => {
          if (disabled) return;
          e.preventDefault();
          setEmptyHoverDOM(true);
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          // setState 하지 않음 — ref 로만 시각 피드백
        }}
        onDragLeave={(e) => {
          // 자식 요소 간 이동 시 dragleave 가 튀는 것을 방지
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setEmptyHoverDOM(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEmptyHoverDOM(false);
          if (disabled) return;
          const raw = getDragPayload(e, DND_SKILL_MIME);
          const ref = parseDragJson<CustomSkillRef>(
            raw,
            (v): v is CustomSkillRef => !!v && typeof v === 'object' && 'kind' in v,
          );
          if (ref) onCreateWithSkill(ref);
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: 40,
          gap: 12,
          color: 'var(--fg-dim)',
          background: 'transparent',
          border: `3px dashed var(--border-strong)`,
          borderRadius: 12,
          margin: 24,
          transition: 'all 0.15s',
        }}
      >
        <div style={{ fontSize: 32, opacity: 0.5 }}>⊕</div>
        <div style={{ fontSize: 13, fontWeight: 500, textAlign: 'center' }}>
          왼쪽 스킬을 <strong>클릭</strong>하거나 여기로 드래그하면 새 파이프라인이 생성됩니다
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', textAlign: 'center' }}>
          또는 상단의 <strong>+ New</strong> / <strong>Import</strong> / 드롭다운으로 기존 선택
        </div>
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
    e.stopPropagation();
    setTrailingHoverDOM(false);
    if (disabled) return;
    const raw = getDragPayload(e, DND_SKILL_MIME);
    const ref = parseDragJson<CustomSkillRef>(
      raw,
      (v): v is CustomSkillRef => !!v && typeof v === 'object' && 'kind' in v,
    );
    if (ref) appendPhaseFromSkill(ref);
  };

  return (
    <div
      style={{
        flex: 1,
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

        {/* Trailing drop zone — skill 드롭 시 새 phase 자동 생성. ref 기반 호버 (drop 안정성) */}
        <div
          ref={trailingRef}
          onDragEnter={(e) => {
            if (disabled) return;
            e.preventDefault();
            setTrailingHoverDOM(true);
          }}
          onDragOver={(e) => {
            if (disabled) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setTrailingHoverDOM(false);
          }}
          onDrop={onTrailingDrop}
          style={{
            marginTop: 10,
            padding: 14,
            border: `2px dashed var(--border-strong)`,
            borderRadius: 6,
            textAlign: 'center',
            color: 'var(--fg-dim)',
            fontSize: 10,
            fontStyle: 'italic',
            background: 'transparent',
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
