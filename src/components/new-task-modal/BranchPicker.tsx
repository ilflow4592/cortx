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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

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
              onChange={(e) => setBranchSearch(e.target.value)}
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
          <div style={{ maxHeight: 180, overflowY: 'auto', padding: 4 }}>
            {branches
              .filter((b) => b.toLowerCase().includes(branchSearch.toLowerCase()))
              .map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    onSelect(b);
                    setBranchSearch('');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 10px',
                    background: b === currentBranch ? 'rgba(99,102,241,0.08)' : 'none',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    color: b === currentBranch ? 'var(--fg-primary)' : '#888895',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ width: 14 }}>{b === currentBranch ? '✓' : ''}</span>
                  {b}
                </button>
              ))}
          </div>
        </div>
      )}
    </span>
  );
}
