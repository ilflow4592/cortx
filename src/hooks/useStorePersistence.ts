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
import {
  upsertTask,
  deleteTask,
  setActiveTaskId,
  upsertProject,
  deleteProject,
} from '../services/db';

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
      // prevProjects를 갱신하지 않으면 매 store 변경마다 전체 프로젝트가 중복 upsert됨 (I/O 폭주)
      for (const p of s.projects) {
        const prev = prevProjects.find((x) => x.id === p.id);
        if (!prev || JSON.stringify(prev) !== JSON.stringify(p)) {
          upsertProject(p).catch(() => {});
        }
      }
      for (const p of prevProjects) {
        if (!s.projects.find((x) => x.id === p.id)) {
          deleteProject(p.id).catch(() => {});
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
