/** 우측 패널 — 선택된 phase 의 속성 편집 + 에이전트 할당. */
import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ClaudeAgentEntry, CustomPhase, CustomSkillRef } from '../../types/customPipeline';
import { listAgents } from '../../services/agentRegistry';

interface Props {
  phase: CustomPhase | null;
  onChange: (patch: Partial<CustomPhase>) => void;
  disabled?: boolean;
}

export function PhaseDetail({ phase, onChange, disabled }: Props) {
  const [agents, setAgents] = useState<ClaudeAgentEntry[]>([]);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  useEffect(() => {
    (async () => setAgents(await listAgents()))();
  }, []);

  if (!phase) {
    return (
      <div
        style={{
          borderLeft: '1px solid var(--border-muted)',
          padding: 16,
          fontSize: 11,
          color: 'var(--fg-dim)',
          background: 'var(--bg-surface)',
        }}
      >
        Phase 를 선택하면 속성 편집 UI 가 표시됩니다.
      </div>
    );
  }

  const disallowedStr = (phase.disallowedTools || []).join(', ');

  // phase.skills 에서 agent 블록만 추출
  const agentSkills = phase.skills.map((s, idx) => ({ skill: s, idx })).filter(({ skill }) => skill.kind === 'agent');

  const addAgent = (agent: ClaudeAgentEntry) => {
    if (disabled) return;
    const ref: CustomSkillRef = {
      kind: 'agent',
      subagentType: agent.subagentType,
      outputKey: `${agent.subagentType.replace(/[^a-zA-Z0-9_]/g, '_')}_result`,
    };
    onChange({ skills: [...phase.skills, ref] });
    setAgentPickerOpen(false);
  };

  const removeAgentAt = (idx: number) => {
    if (disabled) return;
    onChange({ skills: phase.skills.filter((_, i) => i !== idx) });
  };

  const updateAgentAt = (idx: number, patch: Partial<Extract<CustomSkillRef, { kind: 'agent' }>>) => {
    if (disabled) return;
    const next = phase.skills.map((s, i) => {
      if (i !== idx || s.kind !== 'agent') return s;
      return { ...s, ...patch };
    });
    onChange({ skills: next });
  };

  return (
    <div
      style={{
        borderLeft: '1px solid var(--border-muted)',
        padding: 16,
        overflowY: 'auto',
        background: 'var(--bg-surface)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Phase: {phase.label}</div>
      <div style={{ fontSize: 9, color: 'var(--fg-dim)', fontFamily: "'Fira Code', monospace", marginBottom: 14 }}>
        {phase.id}
      </div>

      <Field label="Phase ID">
        <Input
          value={phase.id}
          onChange={(v) => onChange({ id: v })}
          disabled={disabled}
          hint="영숫자 + 하이픈만. 변경 시 실행 상태 추적 연결 끊김"
        />
      </Field>

      <Field label="Display Label">
        <Input value={phase.label} onChange={(v) => onChange({ label: v })} disabled={disabled} />
      </Field>

      <Field label="Model">
        <Select
          value={phase.model || ''}
          options={['', 'Opus', 'Sonnet', 'Haiku']}
          onChange={(v) => onChange({ model: (v as 'Opus' | 'Sonnet' | 'Haiku') || undefined })}
          disabled={disabled}
        />
      </Field>

      <Field label="Effort">
        <Select
          value={phase.effort || 'medium'}
          options={['low', 'medium', 'high']}
          onChange={(v) => onChange({ effort: v as 'low' | 'medium' | 'high' })}
          disabled={disabled}
        />
      </Field>

      <Field label="Permission Mode">
        <Select
          value={phase.permissionMode || 'bypassPermissions'}
          options={['bypassPermissions', 'plan', 'default']}
          onChange={(v) => onChange({ permissionMode: v as CustomPhase['permissionMode'] })}
          disabled={disabled}
          hint="plan 모드면 Write/Edit 차단 + ExitPlanMode 승인 카드 자동 렌더"
        />
      </Field>

      <Field label="Automation">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--fg-secondary)' }}>
          <input
            type="checkbox"
            checked={!!phase.auto}
            onChange={(e) => onChange({ auto: e.target.checked })}
            disabled={disabled}
          />
          auto — 이전 phase done 시 자동 시작
        </label>
      </Field>

      <Field label="Max Turns">
        <Input
          value={String(phase.maxTurns || '')}
          onChange={(v) => {
            const n = parseInt(v, 10);
            onChange({ maxTurns: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
          disabled={disabled}
          hint="미지정 시 Claude CLI 기본값 (30)"
        />
      </Field>

      {/* 에이전트 할당 — 이 phase 에서 실행할 에이전트들 */}
      <Field label={`Agents (${agentSkills.length})`}>
        {agentSkills.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginBottom: 6 }}>이 phase 에 할당된 에이전트 없음</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 6 }}>
            {agentSkills.map(({ skill, idx }) => {
              if (skill.kind !== 'agent') return null;
              const entry = agents.find((a) => a.subagentType === skill.subagentType);
              return (
                <div
                  key={idx}
                  style={{
                    padding: 8,
                    background: 'var(--bg-chip)',
                    border: '1px solid var(--border-muted)',
                    borderLeft: '3px solid var(--amber, #f59e0b)',
                    borderRadius: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span>{entry?.icon || '🤖'}</span>
                    <span style={{ fontSize: 11, fontWeight: 500, fontFamily: "'Fira Code', monospace", flex: 1 }}>
                      {skill.subagentType}
                    </span>
                    <button
                      onClick={() => removeAgentAt(idx)}
                      disabled={disabled}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--fg-dim)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        padding: 2,
                      }}
                      title="제거"
                    >
                      <X size={10} />
                    </button>
                  </div>
                  {entry?.description && (
                    <div style={{ fontSize: 9, color: 'var(--fg-dim)', marginBottom: 4 }}>{entry.description}</div>
                  )}
                  <input
                    type="text"
                    value={skill.outputKey || ''}
                    onChange={(e) => updateAgentAt(idx, { outputKey: e.target.value })}
                    disabled={disabled}
                    placeholder="outputKey (다음 스킬에서 {key} 로 참조)"
                    style={{
                      width: '100%',
                      padding: '3px 6px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-muted)',
                      borderRadius: 3,
                      color: 'var(--fg-primary)',
                      fontSize: 10,
                      fontFamily: "'Fira Code', monospace",
                      outline: 'none',
                      marginBottom: 3,
                    }}
                  />
                  <textarea
                    value={skill.prompt || ''}
                    onChange={(e) => updateAgentAt(idx, { prompt: e.target.value })}
                    disabled={disabled}
                    placeholder={`에이전트 지시 (미지정 시 기본). {key} 로 이전 산출물 참조 가능`}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      background: 'var(--bg-app)',
                      border: '1px solid var(--border-muted)',
                      borderRadius: 3,
                      color: 'var(--fg-primary)',
                      fontFamily: "'Fira Code', monospace",
                      fontSize: 10,
                      minHeight: 50,
                      resize: 'vertical',
                      outline: 'none',
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
        <button
          onClick={() => setAgentPickerOpen((v) => !v)}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '5px 8px',
            background: 'var(--bg-chip)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 4,
            color: 'var(--accent-bright)',
            fontSize: 10,
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <Plus size={10} /> {agentPickerOpen ? '닫기' : '에이전트 추가'}
        </button>
        {agentPickerOpen && (
          <div
            style={{
              marginTop: 4,
              maxHeight: 220,
              overflowY: 'auto',
              border: '1px solid var(--border-muted)',
              borderRadius: 4,
              background: 'var(--bg-app)',
            }}
          >
            {agents.map((a) => (
              <button
                key={a.subagentType}
                onClick={() => addAgent(a)}
                disabled={disabled}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  padding: '5px 8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg-secondary)',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  fontSize: 10,
                  borderBottom: '1px solid var(--border-muted)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span>{a.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Fira Code', monospace", fontSize: 10 }}>{a.displayName}</div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--fg-dim)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {a.description}
                  </div>
                </div>
                {a.isCustom && <span style={{ fontSize: 8, color: 'var(--rose, #f87171)' }}>custom</span>}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label="Disallowed Tools">
        <textarea
          value={disallowedStr}
          onChange={(e) => {
            const list = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            onChange({ disallowedTools: list.length > 0 ? list : undefined });
          }}
          disabled={disabled}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'var(--bg-chip)',
            border: '1px solid var(--border-muted)',
            borderRadius: 4,
            color: 'var(--fg-primary)',
            fontFamily: "'Fira Code', monospace",
            fontSize: 10,
            minHeight: 50,
            resize: 'vertical',
            outline: 'none',
          }}
          placeholder="Glob, Grep, Task, Bash(find:*)"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label
        style={{
          display: 'block',
          fontSize: 9,
          color: 'var(--fg-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  disabled,
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '6px 8px',
          background: 'var(--bg-chip)',
          border: '1px solid var(--border-muted)',
          borderRadius: 4,
          color: 'var(--fg-primary)',
          fontSize: 11,
          outline: 'none',
        }}
      />
      {hint && <div style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 3 }}>{hint}</div>}
    </>
  );
}

function Select({
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '6px 8px',
          background: 'var(--bg-chip)',
          border: '1px solid var(--border-muted)',
          borderRadius: 4,
          color: 'var(--fg-primary)',
          fontSize: 11,
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o || '(default)'}
          </option>
        ))}
      </select>
      {hint && <div style={{ fontSize: 9, color: 'var(--fg-dim)', marginTop: 3 }}>{hint}</div>}
    </>
  );
}
