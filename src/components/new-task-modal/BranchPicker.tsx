import { useEffect, useRef, useState } from 'react';

interface BranchPickerProps {
  branches: string[];
  currentBranch: string;
  onSelect: (branch: string) => void;
  open: boolean;
  onToggle: () => void;
}

export function BranchPicker({ branches, currentBranch, onSelect, open, onToggle }: BranchPickerProps) {
  const [branchSearch, setBranchSearch] = useState('');
  const [focusIdx, setFocusIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
      // open prop 변화 시 1회 초기화 — cascading 아님.
      /* eslint-disable react-hooks/set-state-in-effect */
      setFocusIdx(0);
      setBranchSearch('');
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [open]);

  const filtered = branches.filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector<HTMLElement>(`[data-branch-idx="${focusIdx}"]`);
    if (item) item.scrollIntoView({ block: 'nearest' });
  }, [focusIdx, open]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length === 0) {
      if (e.key === 'Escape') onToggle();
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
        onSelect(pick);
        setBranchSearch('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onToggle();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusIdx(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setFocusIdx(filtered.length - 1);
    }
  };

  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 11,
          background: 'var(--bg-chip)',
          border: '1px solid var(--border-muted)',
          color: '#818cf8',
          cursor: 'pointer',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {currentBranch} ⌃
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            zIndex: 50,
            width: 240,
            background: 'var(--bg-chip)',
            border: '1px solid var(--border-muted)',
            borderRadius: 8,
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '8px', borderBottom: '1px solid #1e1e26' }}>
            <input
              ref={searchRef}
              value={branchSearch}
              onChange={(e) => {
                setBranchSearch(e.target.value);
                setFocusIdx(0);
              }}
              onKeyDown={handleKey}
              placeholder="Search branch..."
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-primary)',
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div ref={listRef} style={{ maxHeight: 180, overflowY: 'auto', padding: 4 }}>
            {filtered.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--fg-faint)' }}>No branches found</div>
            )}
            {filtered.map((b, idx) => {
              const isFocused = idx === focusIdx;
              const isSelected = b === currentBranch;
              const bg = isFocused ? 'rgba(129,140,248,0.18)' : isSelected ? 'rgba(99,102,241,0.08)' : 'none';
              return (
                <button
                  key={b}
                  type="button"
                  data-branch-idx={idx}
                  onClick={() => {
                    onSelect(b);
                    setBranchSearch('');
                  }}
                  onMouseEnter={() => setFocusIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    background: bg,
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: isSelected || isFocused ? 'var(--fg-primary)' : '#888895',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 14 }}>{isSelected ? '✓' : ''}</span>
                  {b}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}
