/** 좌측 패널 — builtin/project/user 스킬 + 내장/커스텀 agent 드래그 소스. 클릭 시 편집 모달. */
import { useEffect, useState } from 'react';
import type { SkillEntry } from '../../services/skillLibrary';
import { listSkillLibrary } from '../../services/skillLibrary';
import { listAgents } from '../../services/agentRegistry';
import type { ClaudeAgentEntry, CustomSkillRef } from '../../types/customPipeline';
import { DND_SKILL_MIME } from './dragTypes';
import { SkillEditorModal } from './SkillEditorModal';

interface Props {
  cwd: string;
  disabled?: boolean;
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

export function SkillLibrary({ cwd, disabled }: Props) {
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

  const onClickItem = (ref: CustomSkillRef) => {
    if (ref.kind === 'agent') return; // agent 는 편집 모달 현재 미지원 (phase detail 에서 prompt 편집)
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
                cursor: disabled ? 'not-allowed' : 'grab',
                fontSize: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: disabled ? 0.5 : 1,
                userSelect: 'none',
              }}
              title={item.description}
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
