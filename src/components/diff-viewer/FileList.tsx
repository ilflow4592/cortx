/** DiffViewer 파일 목록 + 확장된 hunk 렌더러. */
import { Plus, Minus, Trash2 } from 'lucide-react';
import type { DiffFile, DiffMode, ParsedDiff } from './types';
import { RowButton } from './buttons';

interface FileListProps {
  stat: DiffFile[];
  diffs: ParsedDiff[];
  mode: DiffMode;
  loading: boolean;
  busy: boolean;
  expandedFile: string | null;
  onToggleExpand: (path: string) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFileRequest: (path: string) => void;
}

export function FileList({
  stat,
  diffs,
  mode,
  loading,
  busy,
  expandedFile,
  onToggleExpand,
  onStageFile,
  onUnstageFile,
  onDiscardFileRequest,
}: FileListProps) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
      {stat.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 32, fontSize: 12, color: 'var(--fg-faint)' }}>No changes</div>
      )}
      {stat.map((file, idx) => {
        const diff = diffs.find((d) => d.file === file.path || d.file.endsWith(file.path));
        const isExpanded = expandedFile === file.path;
        return (
          <div key={`${file.path}-${idx}`}>
            <div
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                gap: 8,
                padding: '6px 16px',
                borderBottom: '1px solid #ffffff06',
                color: 'var(--fg-muted)',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
              }}
            >
              <button
                onClick={() => onToggleExpand(file.path)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'none',
                  border: 'none',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  textAlign: 'left',
                  minWidth: 0,
                  padding: 0,
                }}
              >
                <span style={{ color: 'var(--fg-subtle)', flexShrink: 0 }}>{isExpanded ? '▼' : '▶'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.path}
                </span>
                <span style={{ color: '#34d399', flexShrink: 0 }}>+{file.additions}</span>
                <span style={{ color: '#ef4444', flexShrink: 0 }}>-{file.deletions}</span>
              </button>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, marginLeft: 6 }}>
                {mode === 'unstaged' && (
                  <>
                    <RowButton
                      onClick={() => onStageFile(file.path)}
                      disabled={busy}
                      color="#34d399"
                      title="Stage this file"
                    >
                      <Plus size={11} strokeWidth={2} />
                    </RowButton>
                    <RowButton
                      onClick={() => onDiscardFileRequest(file.path)}
                      disabled={busy}
                      color="#ef4444"
                      title="Discard changes"
                    >
                      <Trash2 size={11} strokeWidth={1.5} />
                    </RowButton>
                  </>
                )}
                {mode === 'staged' && (
                  <RowButton
                    onClick={() => onUnstageFile(file.path)}
                    disabled={busy}
                    color="#eab308"
                    title="Unstage this file"
                  >
                    <Minus size={11} strokeWidth={2} />
                  </RowButton>
                )}
              </div>
            </div>
            {isExpanded && diff && (
              <div
                style={{
                  background: 'var(--bg-surface)',
                  borderBottom: '1px solid var(--border-subtle)',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  lineHeight: 1.7,
                  overflow: 'auto',
                }}
              >
                {diff.hunks.map((hunk, hi) => (
                  <div key={hi}>
                    <div style={{ padding: '4px 16px', color: '#6366f1', background: '#6366f108' }}>{hunk.header}</div>
                    {hunk.lines.map((line, li) => (
                      <div
                        key={li}
                        style={{
                          padding: '0 16px',
                          background:
                            line.type === 'add'
                              ? 'rgba(52,211,153,0.06)'
                              : line.type === 'del'
                                ? 'rgba(239,68,68,0.06)'
                                : 'transparent',
                          color: line.type === 'add' ? '#34d399' : line.type === 'del' ? '#ef4444' : 'var(--fg-subtle)',
                          whiteSpace: 'pre',
                        }}
                      >
                        {line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '} {line.content}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
