/** Phase 1개 시각화 — skill stack 드래그앤드랍. */
import { useRef } from 'react';
import { X, GripVertical } from 'lucide-react';
import type { CustomPhase, CustomSkillRef } from '../../types/customPipeline';
import { DND_SKILL_MIME, DND_STACKED_SKILL_MIME, DND_PHASE_MIME } from './dragTypes';
import { setDragPayload, getDragPayload, parseDragJson } from './dndUtils';

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
  // 호버 피드백은 ref 로 직접 DOM 조작 — React 리렌더가 drop event 를 무효화하는
  // WebKit 버그 회피
  const stackRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<HTMLDivElement>(null);

  const setStackHover = (on: boolean) => {
    const el = stackRef.current;
    if (!el) return;
    el.style.border = on ? '2px dashed var(--green, #34d399)' : '2px dashed transparent';
    el.style.background = on ? 'rgba(52,211,153,0.03)' : 'transparent';
  };

  const setPhaseHover = (on: boolean) => {
    const el = phaseRef.current;
    if (!el) return;
    const baseColor = selected ? 'var(--accent)' : 'var(--border-muted)';
    el.style.borderColor = on ? 'var(--green, #34d399)' : baseColor;
  };

  const onStackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setStackHover(false);
    if (disabled) return;

    // 1) 라이브러리에서 드래그된 신규 skill → append
    const skillRaw = getDragPayload(e, DND_SKILL_MIME);
    const skillRef = parseDragJson<CustomSkillRef>(
      skillRaw,
      (v): v is CustomSkillRef => !!v && typeof v === 'object' && 'kind' in v,
    );
    if (skillRef) {
      onSkillsChange([...phase.skills, skillRef]);
      return;
    }

    // 2) phase 내부 stacked skill reorder (cross-phase 이동은 v2+ 로 스킵)
    const stackedRaw = e.dataTransfer.getData(DND_STACKED_SKILL_MIME);
    if (stackedRaw) {
      const parsed = parseDragJson<{ phaseId: string; index: number }>(
        stackedRaw,
        (v): v is { phaseId: string; index: number } => !!v && typeof v === 'object' && 'phaseId' in v && 'index' in v,
      );
      if (parsed && parsed.phaseId === phase.id) {
        // same phase — reorder 지원 여지 (v1 에선 noop)
      }
    }
  };

  const removeSkill = (idx: number) => {
    if (disabled) return;
    onSkillsChange(phase.skills.filter((_, i) => i !== idx));
  };

  return (
    <div
      ref={phaseRef}
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) return;
        setDragPayload(e, DND_PHASE_MIME, phase.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnter={(e) => {
        if (disabled) return;
        if (!e.dataTransfer.types.includes(DND_PHASE_MIME)) return;
        e.preventDefault();
        setPhaseHover(true);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setPhaseHover(false);
      }}
      onDrop={(e) => {
        setPhaseHover(false);
        const fromId = e.dataTransfer.getData(DND_PHASE_MIME);
        if (fromId && fromId !== phase.id) {
          e.preventDefault();
          e.stopPropagation();
          onReorder(fromId, phase.id);
        }
      }}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-muted)'}`,
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
            // Tauri WebKit 에서 window.confirm 차단되므로 즉시 제거 (사용자가 실수 시 X 다시 클릭으로 되돌리기 어려움은 감수)
            if (!disabled) onRemove();
          }}
          disabled={disabled}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--fg-dim)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          title="Remove phase (즉시 제거)"
        >
          <X size={12} />
        </button>
      </div>

      {/* Skill stack — ref 기반 호버 피드백 (drop 안정성) */}
      <div
        ref={stackRef}
        onDragEnter={(e) => {
          if (disabled) return;
          e.preventDefault();
          setStackHover(true);
        }}
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setStackHover(false);
        }}
        onDrop={onStackDrop}
        style={{
          padding: phase.skills.length === 0 ? 0 : '6px 10px 8px',
          minHeight: 36,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          border: '2px dashed transparent',
          borderRadius: 4,
          background: 'transparent',
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
                setDragPayload(e, DND_STACKED_SKILL_MIME, JSON.stringify({ phaseId: phase.id, index: si }));
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
