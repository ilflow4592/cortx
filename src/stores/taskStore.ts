/**
 * Task Store — 작업(Task) 상태 관리
 *
 * Cortx의 핵심 스토어. 작업 생성/삭제, 상태 전환(waiting → active → paused → done),
 * 타이머 카운트, 중단 기록(interrupt log), 채팅 기록을 관리한다.
 *
 * Persistence: 외부 subscriber가 store 변경을 감지하여 localStorage에 저장.
 * Migration: loadTasks()에서 localStorage의 이전 스키마 데이터를 현재 스키마로 마이그레이션.
 */
import { create } from 'zustand';
import type { Task, TaskStatus, TaskLayer, ChatMessage, InterruptEntry, InterruptReason } from '../types/task';
import { useContextPackStore } from './contextPackStore';
import { useContextHistoryStore } from './contextHistoryStore';

/** 작업 스토어의 상태(state)와 액션(action) 정의 */
interface TaskState {
  tasks: Task[];
  activeTaskId: string | null;

  addTask: (title: string, repoPath: string, branchName: string, extras?: Partial<Task>) => string;
  removeTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  selectTask: (id: string) => void;
  startTask: (id: string) => void;
  setActiveTask: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus, memo?: string) => void;
  pauseWithReason: (id: string, reason: InterruptReason, memo: string) => void;
  resumeTask: (id: string) => void;
  setTaskLayer: (id: string, layer: TaskLayer) => void;
  addChatMessage: (taskId: string, message: ChatMessage) => void;
  incrementTimer: (id: string) => void;
  loadTasks: (tasks: Task[], activeTaskId: string | null) => void;
}

/** Generate a short unique ID using base-36 timestamp + random suffix */
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** 초기 state — 테스트 reset + 신규 필드 추가 시 단일 진실 공급원 */
export const TASK_INITIAL_STATE: Pick<TaskState, 'tasks' | 'activeTaskId'> = {
  tasks: [],
  activeTaskId: null,
};

export const useTaskStore = create<TaskState>((set, get) => ({
  ...TASK_INITIAL_STATE,

  addTask: (title, repoPath, branchName, extras) => {
    const id = genId();
    const task: Task = {
      id,
      title,
      status: 'waiting',
      layer: 'focus',
      branchName,
      worktreePath: '',
      repoPath,
      memo: '',
      elapsedSeconds: 0,
      chatHistory: [],
      interrupts: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...extras,
    };
    set((s) => ({ tasks: [...s.tasks, task] }));
    return id;
  },

  removeTask: (id) => {
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
      activeTaskId: s.activeTaskId === id ? null : s.activeTaskId,
    }));
    // 연결된 per-task 데이터(context pack items/keywords/lastCollectedAt, history snapshots/collectHistory/deltaItems) 정리
    useContextPackStore.getState().purgeTask(id);
    useContextHistoryStore.getState().purgeTask(id);
  },

  updateTask: (id, updates) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)),
    })),

  selectTask: (id) => set({ activeTaskId: id }),

  // 단일 활성 작업 보장: 새 작업을 active로 전환하면서 기존 active 작업은 자동으로 paused 처리
  startTask: (id) => {
    const { tasks } = get();
    const currentActive = tasks.find((t) => t.status === 'active');
    set((s) => ({
      activeTaskId: id,
      tasks: s.tasks.map((t) => {
        if (t.id === currentActive?.id && t.id !== id)
          return { ...t, status: 'paused' as TaskStatus, updatedAt: new Date().toISOString() };
        if (t.id === id && (t.status === 'waiting' || t.status === 'paused'))
          return { ...t, status: 'active' as TaskStatus, updatedAt: new Date().toISOString() };
        return t;
      }),
    }));
  },

  // 활성 태스크를 전환. 다른 태스크의 status는 변경하지 않음 (병렬 실행 지원)
  setActiveTask: (id) => {
    set({ activeTaskId: id });
  },

  setTaskStatus: (id, status, memo) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? { ...t, status, memo: memo !== undefined ? memo : t.memo, updatedAt: new Date().toISOString() }
          : t,
      ),
      activeTaskId: status === 'done' && s.activeTaskId === id ? null : s.activeTaskId,
    })),

  // 중단 사유(reason)와 메모를 interrupt log에 기록하며 작업을 paused로 전환
  pauseWithReason: (id, reason, memo) => {
    const entry: InterruptEntry = {
      id: genId(),
      pausedAt: new Date().toISOString(),
      resumedAt: null,
      reason,
      memo,
      durationSeconds: 0,
    };
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'paused' as TaskStatus,
              memo,
              interrupts: [...(t.interrupts || []), entry],
              updatedAt: new Date().toISOString(),
            }
          : t,
      ),
    }));
  },

  // 마지막 interrupt entry의 resumedAt과 durationSeconds를 계산하여 기록한 뒤 active로 복귀
  resumeTask: (id) => {
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const interrupts = [...(t.interrupts || [])];
        const last = interrupts[interrupts.length - 1];
        // 아직 재개되지 않은 마지막 interrupt가 있으면 중단 시간을 계산
        if (last && !last.resumedAt) {
          const dur = Math.floor((Date.now() - new Date(last.pausedAt).getTime()) / 1000);
          interrupts[interrupts.length - 1] = { ...last, resumedAt: new Date().toISOString(), durationSeconds: dur };
        }
        return { ...t, status: 'active' as TaskStatus, interrupts, updatedAt: new Date().toISOString() };
      }),
    }));
  },

  setTaskLayer: (id, layer) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, layer, updatedAt: new Date().toISOString() } : t)),
    })),

  addChatMessage: (taskId, message) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, chatHistory: [...t.chatHistory, message], updatedAt: new Date().toISOString() } : t,
      ),
    })),

  // 외부 setInterval에서 1초마다 호출. updatedAt은 갱신하지 않아 persist 빈도를 줄임
  incrementTimer: (id) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, elapsedSeconds: t.elapsedSeconds + 1 } : t)),
    })),

  /**
   * localStorage에서 읽은 raw 데이터를 현재 스키마로 마이그레이션하여 로드.
   * 새 필드 추가 시 반드시 여기에 기본값을 지정해야 함 (CLAUDE.md 참조).
   */
  loadTasks: (tasks, activeTaskId) => {
    // Migrate: ensure ALL fields exist with defaults
    const migrated = tasks.map((t) => ({
      id: t.id || genId(),
      title: t.title || '',
      status: t.status || ('waiting' as TaskStatus),
      layer: t.layer || ('focus' as TaskLayer),
      projectId: t.projectId || undefined,
      branchName: t.branchName || '',
      worktreePath: t.worktreePath || '',
      repoPath: t.repoPath || '',
      memo: t.memo || '',
      elapsedSeconds: t.elapsedSeconds || 0,
      chatHistory: Array.isArray(t.chatHistory) ? t.chatHistory : [],
      interrupts: Array.isArray(t.interrupts) ? t.interrupts : [],
      // pipeline 마이그레이션: pipelineMode 누락 시 'builtin' 으로 간주 (기존 task 호환).
      // activeCustomPipeline 은 undefined 유지 (커스텀 모드 켜질 때만 초기화).
      pipeline: t.pipeline
        ? { ...t.pipeline, pipelineMode: t.pipeline.pipelineMode || ('builtin' as const) }
        : undefined,
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
    }));
    set({ tasks: migrated, activeTaskId });
  },
}));
