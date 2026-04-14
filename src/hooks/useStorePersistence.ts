/**
 * Task / Project Zustand 변경을 SQLite에 영속화하는 훅.
 *
 * App.tsx에서 250줄 차지하던 useEffect를 단일 hook으로 분리. 마운트 1회만
 * subscribe하며 unmount 시 cleanup + pending flush 수행.
 *
 * Task 저장은 500ms 디바운스 — 타이머 1초 tick으로 인한 write 폭주 방지.
 * Project 저장은 JSON 비교로 변경 감지 (updatedAt 같은 dedicated marker 없음).
 */
import { useEffect } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { upsertTask, deleteTask, setActiveTaskId, upsertProject, deleteProject } from '../services/db';

const TASK_SAVE_DEBOUNCE_MS = 500;

export function useStorePersistence(): void {
  useEffect(() => {
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    const flushTask = (taskId: string) => {
      const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
      if (task) upsertTask(task).catch(() => {});
    };
    const scheduleTaskSave = (taskId: string) => {
      const existing = pending.get(taskId);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(() => {
        pending.delete(taskId);
        flushTask(taskId);
      }, TASK_SAVE_DEBOUNCE_MS);
      pending.set(taskId, handle);
    };

    let prevTasks = useTaskStore.getState().tasks;
    let prevActiveId = useTaskStore.getState().activeTaskId;
    let prevProjects = useProjectStore.getState().projects;
    // project hash 캐시 — 매 변경마다 prev/curr 양쪽 stringify하던 비용을 절반으로
    const projectHashCache = new Map<string, string>(prevProjects.map((p) => [p.id, JSON.stringify(p)]));

    const unsubTasks = useTaskStore.subscribe((s) => {
      for (const t of s.tasks) {
        const prev = prevTasks.find((p) => p.id === t.id);
        if (!prev || prev.updatedAt !== t.updatedAt) {
          scheduleTaskSave(t.id);
        }
      }
      for (const p of prevTasks) {
        if (!s.tasks.find((t) => t.id === p.id)) {
          deleteTask(p.id).catch(() => {});
        }
      }
      if (s.activeTaskId !== prevActiveId) {
        prevActiveId = s.activeTaskId;
        setActiveTaskId(s.activeTaskId).catch(() => {});
      }
      prevTasks = s.tasks;
    });

    const unsubProjects = useProjectStore.subscribe((s) => {
      // 캐시된 prev hash와 신규 hash만 비교 — 매 tick마다 같은 prev 객체 재직렬화 회피
      const liveIds = new Set<string>();
      for (const p of s.projects) {
        liveIds.add(p.id);
        const nextHash = JSON.stringify(p);
        if (projectHashCache.get(p.id) !== nextHash) {
          upsertProject(p).catch(() => {});
          projectHashCache.set(p.id, nextHash);
        }
      }
      for (const p of prevProjects) {
        if (!liveIds.has(p.id)) {
          deleteProject(p.id).catch(() => {});
          projectHashCache.delete(p.id);
        }
      }
      prevProjects = s.projects;
    });

    return () => {
      unsubTasks();
      unsubProjects();
      // unmount 시 pending 디바운스 즉시 flush — 데이터 손실 방지
      pending.forEach((handle, id) => {
        clearTimeout(handle);
        flushTask(id);
      });
      pending.clear();
    };
  }, []);
}
