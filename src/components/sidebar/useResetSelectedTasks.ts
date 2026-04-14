/**
 * useResetSelectedTasks — 선택된 태스크들을 초기화하는 비동기 액션 훅.
 *
 * 각 태스크에 대해:
 *   1. Claude 세션 중지
 *   2. worktree/repo 작업 디렉토리에서 git 변경사항 폐기 (checkout, clean, reset)
 *   3. pipeline/timer/interrupts 필드 초기화
 *   4. 상태를 'waiting'으로 되돌리고 메시지/세션/로딩 캐시 삭제
 *
 * Tauri API는 CLAUDE.md 규칙에 따라 동적 import.
 */
import { useCallback } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import { messageCache, sessionCache, loadingCache } from '../../utils/chatState';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export function useResetSelectedTasks() {
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);

  return useCallback(
    async (selectedTasks: Set<string>) => {
      for (const id of selectedTasks) {
        const t = tasks.find((task) => task.id === id);
        if (!t) continue;
        await invoke('claude_stop_task', { taskId: id }).catch(() => {});
        const proj = t.projectId ? projects.find((p) => p.id === t.projectId) : null;
        const taskCwd = t.worktreePath || t.repoPath || proj?.localPath || '';
        if (taskCwd) {
          await invoke('run_shell_command', {
            cwd: taskCwd,
            command: 'git checkout -- . 2>/dev/null',
          }).catch(() => {});
          await invoke('run_shell_command', {
            cwd: taskCwd,
            command: 'git clean -fd 2>/dev/null',
          }).catch(() => {});
          await invoke('run_shell_command', {
            cwd: taskCwd,
            command: 'git reset origin/develop 2>/dev/null',
          }).catch(() => {});
          await invoke('run_shell_command', {
            cwd: taskCwd,
            command: 'git checkout -- . 2>/dev/null',
          }).catch(() => {});
        }
        useTaskStore
          .getState()
          .updateTask(id, { pipeline: undefined, elapsedSeconds: 0, interrupts: [] });
        useTaskStore.getState().setTaskStatus(id, 'waiting');
        messageCache.delete(id);
        sessionCache.delete(id);
        loadingCache.delete(id);
      }
    },
    [tasks, projects],
  );
}
