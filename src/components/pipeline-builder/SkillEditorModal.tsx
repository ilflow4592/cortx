/** 스킬 편집 모달 — 라이브러리 항목 클릭 시 오픈. builtin 은 Fork 버튼 제공. */
import { useEffect, useState } from 'react';
import { X, Copy } from 'lucide-react';
import type { SkillEntry } from '../../services/skillLibrary';
import { forkSkillToProject, readSkillBody, writeSkillBody } from '../../services/skillLibrary';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface Props {
  entry: SkillEntry;
  cwd: string;
  onClose: () => void;
  onSaved: () => void;
}

export function SkillEditorModal({ entry, cwd, onClose, onSaved }: Props) {
  const [body, setBody] = useState<string>('');
  const [status, setStatus] = useState<string>('loading...');
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await readSkillBody(entry.id, entry.kind, cwd);
        if (cancelled) return;
        setBody(b);
        setStatus('');
      } catch (e) {
        setStatus(`Load failed: ${e}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entry, cwd]);

  const isBuiltin = entry.kind === 'builtin';
  const readOnly = isBuiltin;

  const handleFork = async () => {
    setSaving(true);
    try {
      const newId = await forkSkillToProject(entry.id, cwd);
      setStatus(`Forked → ${newId}`);
      onSaved();
    } catch (e) {
      setStatus(`Fork failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (entry.kind !== 'project' && entry.kind !== 'user') return;
    const kind: 'project' | 'user' = entry.kind;
    setSaving(true);
    try {
      await writeSkillBody(entry.id, kind, body, cwd);
      setStatus('Saved');
      onSaved();
    } catch (e) {
      setStatus(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '80vw',
          maxWidth: 900,
          height: '80vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-muted)',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Fira Code', monospace", fontWeight: 500 }}>{entry.id}</div>
            <div style={{ fontSize: 10, color: 'var(--fg-dim)', marginTop: 2 }}>
              {entry.kind} — {entry.description}
            </div>
          </div>
          {isBuiltin && (
            <span
              style={{
                fontSize: 9,
                color: 'var(--amber, #f59e0b)',
                padding: '2px 6px',
                borderRadius: 3,
                background: 'rgba(245,158,11,0.1)',
              }}
            >
              builtin — read only
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-dim)',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', padding: 12 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={readOnly}
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--bg-chip)',
              border: '1px solid var(--border-muted)',
              borderRadius: 4,
              color: 'var(--fg-primary)',
              fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
              fontSize: 12,
              lineHeight: 1.5,
              padding: 10,
              resize: 'none',
              outline: 'none',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderTop: '1px solid var(--border-muted)',
            background: 'var(--bg-chip)',
          }}
        >
          <span style={{ flex: 1, fontSize: 10, color: 'var(--fg-dim)' }}>{status}</span>
          {isBuiltin ? (
            <button
              onClick={handleFork}
              disabled={saving}
              style={btnPrimary()}
              title="Copy to project .claude/commands for editing"
            >
              <Copy size={12} /> Fork to Project
            </button>
          ) : (
            <button onClick={handleSave} disabled={saving} style={btnPrimary()}>
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function btnPrimary(): React.CSSProperties {
  return {
    padding: '5px 12px',
    fontSize: 11,
    borderRadius: 4,
    border: '1px solid var(--accent)',
    background: 'var(--accent)',
    color: 'white',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontWeight: 600,
  };
}
