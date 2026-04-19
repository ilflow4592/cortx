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
import { useContextHistoryStore } from '../stores/contextHistoryStore';
import { useMcpStore } from '../stores/mcpStore';
import { useModalStore } from '../stores/modalStore';
import { migrateFromLocalStorageIfNeeded, loadAllProjects, loadAllTasks } from '../services/db';
import { migrateSourceTokensToKeychain } from '../services/secrets';
import { logger } from '../utils/logger';

export function useInitialLoad(): void {
  useEffect(() => {
    (async () => {
      try {
        await migrateFromLocalStorageIfNeeded();
        const projects = await loadAllProjects();
        if (projects.length) useProjectStore.getState().loadProjects(projects);
        const { tasks, activeTaskId } = await loadAllTasks();
        if (tasks.length) useTaskStore.getState().loadTasks(tasks, activeTaskId);

        // 고아 per-task 데이터 GC — 과거 삭제된 태스크의 context pack/history 정리.
        // (이전 버전의 removeTask 가 이 정리를 안 했을 때 쌓인 localStorage 잔재)
        const validIds = new Set(tasks.map((t) => t.id));
        const pack = useContextPackStore.getState();
        const hist = useContextHistoryStore.getState();
        const orphanIds = new Set<string>();
        for (const id of Object.keys(pack.items)) if (!validIds.has(id)) orphanIds.add(id);
        for (const id of Object.keys(pack.keywords)) if (!validIds.has(id)) orphanIds.add(id);
        for (const id of Object.keys(pack.lastCollectedAt)) if (!validIds.has(id)) orphanIds.add(id);
        for (const id of Object.keys(hist.snapshots)) if (!validIds.has(id)) orphanIds.add(id);
        for (const id of Object.keys(hist.collectHistory)) if (!validIds.has(id)) orphanIds.add(id);
        for (const id of Object.keys(hist.deltaItems)) if (!validIds.has(id)) orphanIds.add(id);
        for (const id of orphanIds) {
          pack.purgeTask(id);
          hist.purgeTask(id);
        }

        // active + pipeline in_progress인 task가 있으면 이전 실행이 중단된 것 — recovery 다이얼로그
        const crashed = tasks.some(
          (t) =>
            t.status === 'active' &&
            t.pipeline?.enabled &&
            Object.values(t.pipeline.phases).some((p) => p?.status === 'in_progress'),
        );
        if (crashed) useModalStore.getState().open('crashRecovery');
      } catch (err) {
        logger.error('[cortx] Failed to load SQLite data:', err);
      }
    })();
    useSettingsStore.getState().loadSettings();
    useContextPackStore.getState().loadState();
    useContextHistoryStore.getState().loadState();
    useMcpStore.getState().load();

    // Context Source localStorage 토큰 → Keychain 1회 이관 (backward-compat).
    // Keychain 미지원/실패 시 기존 토큰 유지 — 수집 경로가 fallback으로 동작.
    void (async () => {
      try {
        const store = useContextPackStore.getState();
        if (store.sources.some((s) => s.token && s.token.trim())) {
          const migrated = await migrateSourceTokensToKeychain(store.sources);
          store.setSources(migrated);
        }
      } catch (err) {
        logger.warn('[cortx] Context source token migration skipped:', err);
      }
    })();
  }, []);
}
