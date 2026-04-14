/** Conductor 스타일 검색 가능한 브랜치 드롭다운. 외부 클릭으로 닫힘. */
import { useState, useEffect, useRef } from 'react';

interface Props {
  value: string;
  branches: string[];
  onChange: (b: string) => void;
}

export function BranchPicker({ value, branches, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 14px',
          background: 'var(--bg-chip)',
          border: '1px solid #27272a',
          borderRadius: 8,
          color: '#d4d4d8',
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer',
        }}
      >
        {value}
        <span style={{ fontSize: 10, color: 'var(--fg-subtle)', marginLeft: 4 }}>⌃</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            zIndex: 50,
            width: 320,
            background: '#0c0c10',
            border: '1px solid #27272a',
            borderRadius: 10,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--bg-chip)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: 'var(--fg-faint)', fontSize: 14 }}>🔍</span>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Select target branch..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: '#d4d4d8',
                fontSize: 13,
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--fg-faint)' }}>No branches found</div>
            )}
            {filtered.map((b) => (
              <button
                key={b}
                onClick={() => {
                  onChange(b);
                  setOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 12px',
                  background: value === b ? 'rgba(99,102,241,0.06)' : 'none',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13,
                  color: value === b ? 'var(--fg-primary)' : 'var(--fg-muted)',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (value !== b) e.currentTarget.style.background = '#12121a';
                }}
                onMouseLeave={(e) => {
                  if (value !== b) e.currentTarget.style.background = 'none';
                }}
              >
                <span style={{ width: 16, textAlign: 'center', fontSize: 12, color: '#818cf8' }}>
                  {value === b ? '✓' : ''}
                </span>
                {b}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
