/**
 * Worktree Cleanup dialog — scans all projects for worktrees and identifies:
 * - Orphan: on disk but no matching task in the app
 * - Stale:  matching task is done/completed and hasn't been touched in N days
 * - Active: matching task is still in progress (not cleanable)
 *
 * User can select worktrees to prune. Uses existing list_worktrees and
 * remove_worktree Tauri commands.
 */
import { useCallback, useEffect, useState } from 'react';
import { Trash2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { type Category, type WorktreeEntry, STALE_THRESHOLD_DAYS } from './worktree-cleanup/types';
import { parseWorktrees, classifyWorktree } from './worktree-cleanup/parsing';
import { listWorktrees, removeWorktree } from './worktree-cleanup/api';
import { CategorySection } from './worktree-cleanup/CategorySection';
import { RefreshButton, CloseButton } from './worktree-cleanup/buttons';
import { logger } from '../utils/logger';

interface Props {
  onClose: () => void;
}

export function WorktreeCleanup({ onClose }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const tasks = useTaskStore((s) => s.tasks);
  const [entries, setEntries] = useState<WorktreeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const scan = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const results: WorktreeEntry[] = [];
      for (const project of projects) {
        if (!project.localPath) continue;
        try {
          const result = await listWorktrees(project.localPath);
          if (!result.success) continue;
          const worktrees = parseWorktrees(result.output);
          for (const wt of worktrees) {
            // 메인 repo worktree 자체와 .worktrees/ 외부는 스킵
            if (wt.path === project.localPath) continue;
            if (!wt.path.includes('.worktrees')) continue;

            const task = tasks.find(
              (t) => t.worktreePath === wt.path || (t.projectId === project.id && t.branchName === wt.branch),
            );
            const { category, ageInDays } = classifyWorktree(task);
            results.push({
              projectId: project.id,
              projectName: project.name,
              worktreePath: wt.path,
              branch: wt.branch,
              taskId: task?.id,
              taskTitle: task?.title,
              taskStatus: task?.status,
              updatedAt: task?.updatedAt,
              category,
              ageInDays,
              // orphan + stale은 기본 선택 (bulk cleanup 편의)
              selected: category !== 'active',
            });
          }
        } catch (err) {
          logger.error(`[cortx] Failed to list worktrees for ${project.name}:`, err);
        }
      }
      setEntries(results);
    } catch (err) {
      setError(`Scan failed: ${err}`);
    }
    setLoading(false);
  }, [projects, tasks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial async data fetch
    scan();
  }, [scan]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const toggleEntry = (idx: number) => {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, selected: !e.selected } : e)));
  };

  const toggleAll = (category: Category) => {
    const allSelected = entries.filter((e) => e.category === category).every((e) => e.selected);
    setEntries((prev) => prev.map((e) => (e.category === category ? { ...e, selected: !allSelected } : e)));
  };

  const handleDelete = async () => {
    const selected = entries.filter((e) => e.selected);
    if (selected.length === 0) return;
    if (!confirm(`${selected.length}개 worktree를 삭제합니까? 이 작업은 되돌릴 수 없습니다.`)) return;

    setDeleting(true);
    const failed: string[] = [];
    for (const entry of selected) {
      const project = projects.find((p) => p.id === entry.projectId);
      if (!project) continue;
      try {
        const result = await removeWorktree(project.localPath, entry.worktreePath);
        if (!result.success) {
          failed.push(`${entry.worktreePath}: ${result.error}`);
        } else if (entry.taskId) {
          useTaskStore.getState().updateTask(entry.taskId, { worktreePath: '' });
        }
      } catch (err) {
        failed.push(`${entry.worktreePath}: ${err}`);
      }
    }
    setDeleting(false);
    if (failed.length > 0) {
      setError(`일부 삭제 실패:\n${failed.join('\n')}`);
    }
    await scan();
  };

  const selectedCount = entries.filter((e) => e.selected).length;
  const orphanEntries = entries.filter((e) => e.category === 'orphan');
  const staleEntries = entries.filter((e) => e.category === 'stale');
  const activeEntries = entries.filter((e) => e.category === 'active');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button
        type="button"
        aria-label="Close worktree cleanup"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'default',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 760,
          maxWidth: '95vw',
          maxHeight: '85vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Trash2 size={18} color="var(--accent)" strokeWidth={1.5} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-primary)' }}>Worktree Cleanup</div>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>
              {loading
                ? 'Scanning...'
                : `Found ${entries.length} worktrees (${orphanEntries.length} orphan, ${staleEntries.length} stale, ${activeEntries.length} active)`}
            </div>
          </div>
          <RefreshButton onClick={scan} disabled={loading} />
          <CloseButton onClose={onClose} />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {error && (
            <div
              style={{
                padding: 12,
                marginBottom: 12,
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 11,
                whiteSpace: 'pre-wrap',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {error}
            </div>
          )}

          {entries.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--fg-faint)', fontSize: 12 }}>
              No worktrees found. Nothing to clean up.
            </div>
          )}

          <CategorySection
            title="Orphan"
            description="앱에 해당 task가 없는 worktree (안전하게 삭제 가능)"
            color="#ef4444"
            icon={<AlertTriangle size={13} color="#ef4444" />}
            entries={orphanEntries}
            onToggle={(entry) => {
              const idx = entries.indexOf(entry);
              toggleEntry(idx);
            }}
            onToggleAll={() => toggleAll('orphan')}
          />

          <CategorySection
            title="Stale"
            description={`${STALE_THRESHOLD_DAYS}일 이상 지난 완료된 task의 worktree`}
            color="#eab308"
            icon={<Trash2 size={13} color="#eab308" />}
            entries={staleEntries}
            onToggle={(entry) => {
              const idx = entries.indexOf(entry);
              toggleEntry(idx);
            }}
            onToggleAll={() => toggleAll('stale')}
          />

          <CategorySection
            title="Active"
            description="진행 중인 task (삭제 비권장)"
            color="#34d399"
            icon={<RefreshCw size={13} color="#34d399" />}
            entries={activeEntries}
            onToggle={(entry) => {
              const idx = entries.indexOf(entry);
              toggleEntry(idx);
            }}
            onToggleAll={() => toggleAll('active')}
          />
        </div>

        {/* Footer */}
        {entries.length > 0 && (
          <div
            style={{
              padding: '14px 22px',
              borderTop: '1px solid var(--border-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>
              {selectedCount > 0 ? `${selectedCount} selected` : 'No selection'}
            </div>
            <button
              onClick={handleDelete}
              disabled={selectedCount === 0 || deleting}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                background: selectedCount > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(55,65,81,0.3)',
                border: `1px solid ${selectedCount > 0 ? 'rgba(239,68,68,0.4)' : 'var(--border-muted)'}`,
                color: selectedCount > 0 ? '#ef4444' : 'var(--fg-faint)',
                cursor: selectedCount > 0 && !deleting ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 120ms ease',
              }}
            >
              <Trash2 size={12} strokeWidth={1.5} />
              {deleting ? '삭제 중...' : `Delete Selected (${selectedCount})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
