/**
 * 앱 마운트 시 1회 실행되는 초기 로드 — SQLite에서 task/project 복원 +
 * 부수 store 초기화 + 크래시 감지.
 *
 * App.tsx에서 useEffect 30줄 차지하던 로직을 단일 hook으로 분리.
 */
import { useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useContextPackStore } from '../stores/contextPackStore';
import { useModalStore } from '../stores/modalStore';
import { migrateFromLocalStorageIfNeeded, loadAllProjects, loadAllTasks } from '../services/db';

export function useInitialLoad(): void {
  useEffect(() => {
    (async () => {
      try {
        await migrateFromLocalStorageIfNeeded();
        const projects = await loadAllProjects();
        if (projects.length) useProjectStore.getState().loadProjects(projects);
        const { tasks, activeTaskId } = await loadAllTasks();
        if (tasks.length) useTaskStore.getState().loadTasks(tasks, activeTaskId);

        // active + pipeline in_progress인 task가 있으면 이전 실행이 중단된 것 — recovery 다이얼로그
        const crashed = tasks.some(
          (t) =>
            t.status === 'active' &&
            t.pipeline?.enabled &&
            Object.values(t.pipeline.phases).some((p) => p?.status === 'in_progress'),
        );
        if (crashed) useModalStore.getState().open('crashRecovery');
      } catch (err) {
        console.error('[cortx] Failed to load SQLite data:', err);
      }
    })();
    useSettingsStore.getState().loadSettings();
    useContextPackStore.getState().loadState();
    useContextPackStore.getState().loadMcpServers();
  }, []);
}
