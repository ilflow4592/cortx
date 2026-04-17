/** 우측 패널 — 선택된 phase 의 속성 편집. */
import type { CustomPhase } from '../../types/customPipeline';

interface Props {
  phase: CustomPhase | null;
  onChange: (patch: Partial<CustomPhase>) => void;
  disabled?: boolean;
}

export function PhaseDetail({ phase, onChange, disabled }: Props) {
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
