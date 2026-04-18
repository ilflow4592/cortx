/**
 * Tauri WebKit 은 window.prompt() / window.confirm() 을 막아버려 null 을 조용히 반환.
 * 커스텀 인라인 모달로 대체.
 */
import { useEffect, useRef, useState } from 'react';

export interface PromptRequest {
  title: string;
  message?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: 'input' | 'confirm';
  resolve: (value: string | null) => void;
}

export function PromptModal({ req, onClose }: { req: PromptRequest; onClose: () => void }) {
  const [value, setValue] = useState(req.defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = () => {
    req.resolve(req.kind === 'confirm' ? 'ok' : value);
    onClose();
  };

  const cancel = () => {
    req.resolve(null);
    onClose();
  };

  return (
     
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          minWidth: 360,
          maxWidth: 480,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600 }}>{req.title}</div>
        {req.message && <div style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{req.message}</div>}
        {req.kind !== 'confirm' && (
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            style={{
              padding: '8px 10px',
              background: 'var(--bg-chip)',
              border: '1px solid var(--border-muted)',
              borderRadius: 4,
              color: 'var(--fg-primary)',
              fontSize: 12,
              outline: 'none',
            }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
          <button
            onClick={cancel}
            style={{
              padding: '5px 12px',
              fontSize: 11,
              background: 'var(--bg-surface)',
              color: 'var(--fg-secondary)',
              border: '1px solid var(--border-strong)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {req.cancelLabel || '취소'}
          </button>
          <button
            onClick={submit}
            style={{
              padding: '5px 12px',
              fontSize: 11,
              background: 'var(--accent)',
              color: 'white',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {req.confirmLabel || '확인'}
          </button>
        </div>
      </div>
    </div>
  );
}
