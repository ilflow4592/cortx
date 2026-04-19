/** Conductor 스타일 검색 가능한 브랜치 드롭다운. 외부 클릭으로 닫힘.
 *  키보드: ↑/↓ 로 항목 이동, Enter 로 선택, Escape 로 닫기. */
import { useState, useEffect, useRef } from 'react';

interface Props {
  value: string;
  branches: string[];
  onChange: (b: string) => void;
}

export function BranchPicker({ value, branches, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = branches.filter((b) => b.toLowerCase().includes(search.toLowerCase()));

  // 포커스된 항목이 보이도록 스크롤
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(`[data-branch-idx="${focusIdx}"]`);
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [focusIdx, open]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) {
      if (e.key === 'Escape') setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[focusIdx];
      if (pick) {
        onChange(pick);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIdx(filtered.length - 1);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setSearch('');
          setFocusIdx(0);
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
              ref={searchRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFocusIdx(0);
              }}
              onKeyDown={handleKey}
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

          <div ref={listRef} style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--fg-faint)' }}>No branches found</div>
            )}
            {filtered.map((b, idx) => {
              const isFocused = idx === focusIdx;
              const isSelected = value === b;
              const bg = isFocused ? 'rgba(129,140,248,0.18)' : isSelected ? 'rgba(99,102,241,0.06)' : 'none';
              return (
                <button
                  key={b}
                  data-branch-idx={idx}
                  onClick={() => {
                    onChange(b);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setFocusIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '8px 12px',
                    background: bg,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    color: isSelected || isFocused ? 'var(--fg-primary)' : 'var(--fg-muted)',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 16, textAlign: 'center', fontSize: 12, color: '#818cf8' }}>
                    {isSelected ? '✓' : ''}
                  </span>
                  {b}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
