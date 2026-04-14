/** DiffViewer 상단 툴바 — 모드 탭 + Stage All / Unstage All / Discard All / Refresh. */
import { Plus, Minus, Trash2, RotateCw } from 'lucide-react';
import type { DiffMode } from './types';
import { HeaderButton } from './buttons';

interface ToolbarProps {
  mode: DiffMode;
  onModeChange: (mode: DiffMode) => void;
  fileCount: number;
  busy: boolean;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardAllRequest: () => void;
  onRefresh: () => void;
}

export function Toolbar({
  mode,
  onModeChange,
  fileCount,
  busy,
  onStageAll,
  onUnstageAll,
  onDiscardAllRequest,
  onRefresh,
}: ToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}
    >
      {(['branch', 'staged', 'unstaged'] as DiffMode[]).map((m) => (
        <button key={m} className={`ctx-filter ${mode === m ? 'active' : ''}`} onClick={() => onModeChange(m)}>
          {m === 'branch' ? '🌿 Branch' : m === 'staged' ? '📦 Staged' : '📝 Unstaged'}
        </button>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
        {mode === 'unstaged' && fileCount > 0 && (
          <HeaderButton onClick={onStageAll} disabled={busy} color="#34d399" title="Stage all changes">
            <Plus size={11} strokeWidth={2} /> Stage All
          </HeaderButton>
        )}
        {mode === 'staged' && fileCount > 0 && (
          <HeaderButton onClick={onUnstageAll} disabled={busy} color="#eab308" title="Unstage all">
            <Minus size={11} strokeWidth={2} /> Unstage All
          </HeaderButton>
        )}
        {mode === 'unstaged' && fileCount > 0 && (
          <HeaderButton
            onClick={onDiscardAllRequest}
            disabled={busy}
            color="#ef4444"
            title="Discard all unstaged changes"
          >
            <Trash2 size={11} strokeWidth={2} /> Discard All
          </HeaderButton>
        )}
        <button
          onClick={onRefresh}
          disabled={busy}
          style={{
            background: 'none',
            border: 'none',
            color: busy ? 'var(--border-strong)' : 'var(--fg-subtle)',
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
          }}
          title="Refresh"
        >
          <RotateCw size={13} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
