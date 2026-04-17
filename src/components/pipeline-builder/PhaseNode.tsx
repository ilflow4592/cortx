/** Phase 1개 시각화 — skill stack 드래그앤드랍. */
import { useState } from 'react';
import { X, GripVertical } from 'lucide-react';
import type { CustomPhase, CustomSkillRef } from '../../types/customPipeline';
import { DND_SKILL_MIME, DND_STACKED_SKILL_MIME, DND_PHASE_MIME } from './dragTypes';

interface Props {
  phase: CustomPhase;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onSkillsChange: (skills: CustomSkillRef[]) => void;
  onReorder: (fromId: string, toId: string) => void;
  onRemove: () => void;
}

function skillLabel(ref: CustomSkillRef): string {
  switch (ref.kind) {
    case 'agent':
      return `agent:${ref.subagentType}`;
    default:
      return `${ref.kind}:${ref.id}`;
  }
}

function skillColor(ref: CustomSkillRef): string {
  switch (ref.kind) {
    case 'builtin':
      return 'var(--accent)';
    case 'project':
      return 'var(--teal, #14b8a6)';
    case 'user':
      return 'var(--purple, #ab98c7)';
    case 'agent':
      return 'var(--amber, #f59e0b)';
    default:
      return 'var(--border-strong)';
  }
}

export function PhaseNode({ phase, selected, disabled, onSelect, onSkillsChange, onReorder, onRemove }: Props) {
  const [dropHover, setDropHover] = useState(false);
  const [phaseDropHover, setPhaseDropHover] = useState(false);

  const onStackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHover(false);
    if (disabled) return;
    const skillRaw = e.dataTransfer.getData(DND_SKILL_MIME);
    if (skillRaw) {
      try {
        const ref = JSON.parse(skillRaw) as CustomSkillRef;
        onSkillsChange([...phase.skills, ref]);
      } catch {
        /* ignore */
      }
      return;
    }
    const stackedRaw = e.dataTransfer.getData(DND_STACKED_SKILL_MIME);
    if (stackedRaw) {
      try {
        const { phaseId: srcPhaseId, index: srcIdx } = JSON.parse(stackedRaw);
        if (srcPhaseId === phase.id) return;
        // cross-phase 이동: 원본 phase 에서 제거는 부모에서 처리 못함 (이 컴포넌트가 단일 phase)
        // → 간단히 append 만. 원본 phase 는 reorder 로 따로 처리해야 하지만 v1 에선 생략.
        // 실용상: 사용자는 보통 append 후 원본 제거를 직접 하거나, 본 이동 필요 시 X → drop 으로 대체.
        void srcIdx;
      } catch {
        /* ignore */
      }
    }
  };

  const removeSkill = (idx: number) => {
    if (disabled) return;
    onSkillsChange(phase.skills.filter((_, i) => i !== idx));
  };

  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) return;
        e.dataTransfer.setData(DND_PHASE_MIME, phase.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (disabled) return;
        if (e.dataTransfer.types.includes(DND_PHASE_MIME)) {
          e.preventDefault();
          setPhaseDropHover(true);
        }
      }}
      onDragLeave={() => setPhaseDropHover(false)}
      onDrop={(e) => {
        const fromId = e.dataTransfer.getData(DND_PHASE_MIME);
        if (fromId && fromId !== phase.id) {
          e.preventDefault();
          setPhaseDropHover(false);
          onReorder(fromId, phase.id);
        }
      }}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${
          phaseDropHover ? 'var(--green, #34d399)' : selected ? 'var(--accent)' : 'var(--border-muted)'
        }`,
        borderRadius: 6,
        marginBottom: 4,
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.phase-drag-handle')) return;
          onSelect();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          cursor: 'pointer',
          borderBottom: '1px solid var(--border-muted)',
          background: selected ? 'var(--accent-bg)' : 'transparent',
        }}
      >
        <span className="phase-drag-handle" style={{ color: 'var(--fg-dim)', cursor: 'grab' }}>
          <GripVertical size={14} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500 }}>{phase.label}</div>
          <div style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: "'Fira Code', monospace" }}>{phase.id}</div>
        </div>
        {phase.model && (
          <span
            style={{
              fontSize: 8,
              padding: '2px 5px',
              borderRadius: 3,
              color: phase.model === 'Opus' ? '#ab98c7' : 'var(--accent-bright)',
              background: phase.model === 'Opus' ? 'rgba(171,152,199,0.08)' : 'var(--accent-bg)',
            }}
          >
            {phase.model} 4.6 · {phase.effort || 'medium'}
          </span>
        )}
        {phase.permissionMode === 'plan' && (
          <span
            style={{
              fontSize: 8,
              padding: '2px 5px',
              borderRadius: 3,
              color: 'var(--amber, #f59e0b)',
              background: 'rgba(245,158,11,0.1)',
            }}
          >
            plan
          </span>
        )}
        {phase.auto && (
          <span
            style={{
              fontSize: 8,
              padding: '2px 5px',
              borderRadius: 3,
              color: '#34d399',
              background: 'rgba(52,211,153,0.12)',
            }}
          >
            auto
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!disabled && confirm(`Remove phase '${phase.label}'?`)) onRemove();
          }}
          disabled={disabled}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-dim)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          title="Remove phase"
        >
          <X size={12} />
        </button>
      </div>

      {/* Skill stack */}
      <div
        onDragOver={(e) => {
          if (disabled) return;
          if (e.dataTransfer.types.includes(DND_SKILL_MIME) || e.dataTransfer.types.includes(DND_STACKED_SKILL_MIME)) {
            e.preventDefault();
            setDropHover(true);
          }
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={onStackDrop}
        style={{
          padding: phase.skills.length === 0 ? 0 : '6px 10px 8px',
          minHeight: 36,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          border: dropHover ? '2px dashed var(--green, #34d399)' : '2px dashed transparent',
          borderRadius: 4,
          background: dropHover ? 'rgba(52,211,153,0.03)' : 'transparent',
        }}
      >
        {phase.skills.length === 0 ? (
          <div
            style={{
              padding: 14,
              textAlign: 'center',
              color: 'var(--fg-dim)',
              fontSize: 10,
              fontStyle: 'italic',
            }}
          >
            {disabled ? 'empty (read-only)' : 'Drop skills here'}
          </div>
        ) : (
          phase.skills.map((ref, si) => (
            <div
              key={si}
              draggable={!disabled}
              onDragStart={(e) => {
                if (disabled) return;
                e.dataTransfer.setData(DND_STACKED_SKILL_MIME, JSON.stringify({ phaseId: phase.id, index: si }));
                e.dataTransfer.effectAllowed = 'move';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                background: 'var(--bg-chip)',
                borderLeft: `3px solid ${skillColor(ref)}`,
                borderRadius: 3,
                fontSize: 10,
                cursor: disabled ? 'default' : 'grab',
              }}
            >
              <span style={{ fontFamily: "'Fira Code', monospace", flex: 1 }}>{skillLabel(ref)}</span>
              {ref.kind === 'agent' && ref.outputKey && (
                <span style={{ fontSize: 9, color: 'var(--fg-dim)' }}>→ {'{' + ref.outputKey + '}'}</span>
              )}
              <button
                onClick={() => removeSkill(si)}
                disabled={disabled}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg-dim)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  padding: '0 4px',
                }}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
