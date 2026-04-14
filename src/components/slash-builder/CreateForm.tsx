/** 새 slash command 생성 폼 — 이름/스코프 입력 후 생성. */
import { useEffect, useRef } from 'react';
import { Plus } from 'lucide-react';
import type { Source } from './api';

interface Props {
  name: string;
  setName: (n: string) => void;
  source: Source;
  setSource: (s: Source) => void;
  projectCwd: string;
  onCreate: () => void;
  onCancel: () => void;
  saving: boolean;
}

export function CreateForm({ name, setName, source, setSource, projectCwd, onCreate, onCancel, saving }: Props) {
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  return (
    <div
      style={{
        flex: 1,
        padding: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 360,
          padding: 22,
          background: 'var(--bg-surface-hover)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: '#818cf8', marginBottom: 14 }}>New Slash Command</div>

        <div style={{ marginBottom: 12 }}>
          <label
            htmlFor="slash-builder-name"
            style={{
              display: 'block',
              fontSize: 10,
              color: 'var(--fg-subtle)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Name
          </label>
          <input
            id="slash-builder-name"
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-command or group:my-command"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCreate();
            }}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 5,
              color: 'var(--fg-primary)',
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
            }}
          />
          <div style={{ fontSize: 9, color: 'var(--fg-faint)', marginTop: 4 }}>
            Use <code style={{ color: 'var(--fg-subtle)' }}>:</code> for subgroups (pipeline:dev-task)
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div
            style={{
              display: 'block',
              fontSize: 10,
              color: 'var(--fg-subtle)',
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Scope
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setSource('project')}
              disabled={!projectCwd}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 5,
                fontSize: 11,
                background: source === 'project' ? 'var(--accent-bg)' : 'none',
                border: `1px solid ${source === 'project' ? 'var(--accent-border)' : 'var(--border-strong)'}`,
                color: !projectCwd
                  ? 'var(--fg-dim)'
                  : source === 'project'
                    ? 'var(--accent-bright)'
                    : 'var(--fg-subtle)',
                cursor: projectCwd ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              Project
            </button>
            <button
              onClick={() => setSource('user')}
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 5,
                fontSize: 11,
                background: source === 'user' ? 'rgba(129,140,248,0.15)' : 'none',
                border: `1px solid ${source === 'user' ? 'rgba(129,140,248,0.4)' : 'var(--border-strong)'}`,
                color: source === 'user' ? '#818cf8' : 'var(--fg-subtle)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Global (~/.claude)
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '6px 14px',
              borderRadius: 5,
              fontSize: 11,
              background: 'none',
              border: '1px solid var(--fg-dim)',
              color: 'var(--fg-muted)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={!name.trim() || saving}
            style={{
              padding: '6px 14px',
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 500,
              background: name.trim() ? 'var(--accent-bg)' : 'rgba(55,65,81,0.3)',
              border: `1px solid ${name.trim() ? 'var(--accent-border)' : 'var(--border-muted)'}`,
              color: name.trim() ? 'var(--accent-bright)' : 'var(--fg-faint)',
              cursor: name.trim() && !saving ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Plus size={11} strokeWidth={2} />
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
