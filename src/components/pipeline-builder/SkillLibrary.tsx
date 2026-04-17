/**
 * 좌측 패널 — builtin/project/user 스킬 + 내장/커스텀 agent.
 *
 * 두 가지 추가 방식:
 *  1. **클릭** (주요): 현재 파이프라인에 스킬 추가 (Tauri WebKit DnD 불안정 대응 폴백).
 *     cfg 없으면 새 파이프라인+Phase 1 자동 생성, cfg 있으면 selected phase 에 append,
 *     selected 가 없으면 마지막 phase 에 append, phase 없으면 새 phase 생성.
 *  2. **드래그앤드랍** (선택): 정상 작동 환경에서 여전히 지원.
 *
 * 연필 아이콘 버튼 (✎) → 스킬 편집 모달.
 */
import { useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { SkillEntry } from '../../services/skillLibrary';
import { listSkillLibrary } from '../../services/skillLibrary';
import { listAgents } from '../../services/agentRegistry';
import type { ClaudeAgentEntry, CustomSkillRef } from '../../types/customPipeline';
import { DND_SKILL_MIME } from './dragTypes';
import { SkillEditorModal } from './SkillEditorModal';

interface Props {
  cwd: string;
  disabled?: boolean;
  /** 클릭으로 스킬 추가. PipelineBuilder 에서 현재 cfg 에 맞게 처리 */
  onAddSkill: (ref: CustomSkillRef) => void;
}

type LibrarySection = {
  title: string;
  items: Array<{ ref: CustomSkillRef; label: string; description: string; icon: string; kind: string }>;
};

function skillEntryToItem(s: SkillEntry) {
  const icon = s.kind === 'builtin' ? '🔧' : s.kind === 'project' ? '📁' : '👤';
  const ref: CustomSkillRef =
    s.kind === 'builtin'
      ? { kind: 'builtin', id: s.id }
      : s.kind === 'project'
        ? { kind: 'project', id: s.id }
        : { kind: 'user', id: s.id };
  return { ref, label: s.displayName, description: s.description, icon, kind: s.kind };
}

function agentToItem(a: ClaudeAgentEntry) {
  const ref: CustomSkillRef = { kind: 'agent', subagentType: a.subagentType, outputKey: `${a.subagentType}_result` };
  return {
    ref,
    label: a.displayName,
    description: a.description,
    icon: a.icon,
    kind: a.isCustom ? 'agent-custom' : 'agent-builtin',
  };
}

export function SkillLibrary({ cwd, disabled, onAddSkill }: Props) {
  const [sections, setSections] = useState<LibrarySection[]>([]);
  const [editingSkill, setEditingSkill] = useState<SkillEntry | null>(null);
  const [skillEntries, setSkillEntries] = useState<SkillEntry[]>([]);

  const refresh = () => {
    (async () => {
      const [skills, agents] = await Promise.all([listSkillLibrary(cwd), listAgents()]);
      setSkillEntries(skills);
      const builtin = skills.filter((s) => s.kind === 'builtin').map(skillEntryToItem);
      const project = skills.filter((s) => s.kind === 'project').map(skillEntryToItem);
      const user = skills.filter((s) => s.kind === 'user').map(skillEntryToItem);
      const agentBuiltin = agents.filter((a) => !a.isCustom).map(agentToItem);
      const agentCustom = agents.filter((a) => a.isCustom).map(agentToItem);
      setSections([
        { title: 'Skills — Builtin', items: builtin },
        { title: 'Skills — Project', items: project },
        { title: 'Skills — User', items: user },
        { title: 'Agents — Builtin', items: agentBuiltin },
        { title: 'Agents — Custom', items: agentCustom },
      ]);
    })();
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  const onDragStart = (e: React.DragEvent, ref: CustomSkillRef) => {
    const payload = JSON.stringify(ref);
    e.dataTransfer.setData(DND_SKILL_MIME, payload);
    // WebKit fallback — text/plain 이 있어야 drag 가 정상 시작됨 (Tauri/Safari 버그)
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // 주요 액션: 클릭 시 파이프라인에 스킬 추가 (DnD 대체)
  const onClickItem = (ref: CustomSkillRef) => {
    if (disabled) return;
    onAddSkill(ref);
  };

  // 보조 액션: 연필 버튼 → 편집 모달 (agent 는 편집 미지원)
  const onEditClick = (ref: CustomSkillRef, ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (ref.kind === 'agent') return;
    const entry = skillEntries.find((s) => s.id === ref.id && s.kind === ref.kind);
    if (entry) setEditingSkill(entry);
  };

  return (
    <div
      style={{
        borderRight: '1px solid var(--border-muted)',
        overflowY: 'auto',
        padding: 10,
        background: 'var(--bg-surface)',
      }}
    >
      {sections.map((section) => (
        <div key={section.title} style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 9,
              color: 'var(--fg-dim)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: '8px 4px 4px',
            }}
          >
            {section.title}
          </div>
          {section.items.length === 0 && (
            <div style={{ fontSize: 10, color: 'var(--fg-dim)', padding: '4px 6px' }}>— none —</div>
          )}
          {section.items.map((item) => (
            <div
              key={`${item.kind}:${item.label}`}
              role="button"
              tabIndex={0}
              draggable={!disabled}
              onDragStart={(e) => onDragStart(e, item.ref)}
              onClick={() => onClickItem(item.ref)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onClickItem(item.ref);
                }
              }}
              style={{
                padding: '5px 8px',
                margin: '3px 0',
                background: 'var(--bg-chip)',
                border: '1px solid var(--border-muted)',
                borderLeft: `3px solid ${borderColorForKind(item.kind)}`,
                borderRadius: 4,
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: disabled ? 0.5 : 1,
                userSelect: 'none',
              }}
              title={`클릭해서 파이프라인에 추가 — ${item.description}`}
            >
              <span>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'Fira Code', monospace" }}>{item.label}</div>
                <div
                  style={{
                    fontSize: 9,
                    color: 'var(--fg-dim)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.description}
                </div>
              </div>
              {item.ref.kind !== 'agent' && (
                <button
                  onClick={(e) => onEditClick(item.ref, e)}
                  disabled={disabled}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--fg-dim)',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    padding: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                  title="편집"
                >
                  <Pencil size={10} />
                </button>
              )}
              <span style={{ color: 'var(--accent-bright)' }} title="추가">
                <Plus size={11} />
              </span>
            </div>
          ))}
        </div>
      ))}

      {editingSkill && (
        <SkillEditorModal
          entry={editingSkill}
          cwd={cwd}
          onClose={() => setEditingSkill(null)}
          onSaved={() => {
            setEditingSkill(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function borderColorForKind(kind: string): string {
  switch (kind) {
    case 'builtin':
      return 'var(--accent)';
    case 'project':
      return 'var(--teal, #14b8a6)';
    case 'user':
      return 'var(--purple, #ab98c7)';
    case 'agent-builtin':
      return 'var(--amber, #f59e0b)';
    case 'agent-custom':
      return 'var(--rose, #f87171)';
    default:
      return 'var(--border-strong)';
  }
}
