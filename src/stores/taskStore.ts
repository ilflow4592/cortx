import { create } from 'zustand';
import type { Task, TaskStatus, TaskLayer, ChatMessage, InterruptEntry, InterruptReason } from '../types/task';

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

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  activeTaskId: null,

  addTask: (title, repoPath, branchName, extras) => {
    const id = genId();
    const task: Task = {
      id, title, status: 'waiting', layer: 'focus',
      branchName, worktreePath: '', repoPath, memo: '',
      elapsedSeconds: 0, chatHistory: [], interrupts: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      ...extras,
    };
    set((s) => ({ tasks: [...s.tasks, task] }));
    return id;
  },

  removeTask: (id) => set((s) => ({
    tasks: s.tasks.filter((t) => t.id !== id),
    activeTaskId: s.activeTaskId === id ? null : s.activeTaskId,
  })),

  updateTask: (id, updates) => set((s) => ({
    tasks: s.tasks.map((t) => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t),
  })),

  selectTask: (id) => set({ activeTaskId: id }),

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

  setActiveTask: (id) => {
    const target = get().tasks.find((t) => t.id === id);
    if (!target) return;
    if (target.status === 'waiting') set({ activeTaskId: id });
    else get().startTask(id);
  },

  setTaskStatus: (id, status, memo) => set((s) => ({
    tasks: s.tasks.map((t) => t.id === id
      ? { ...t, status, memo: memo !== undefined ? memo : t.memo, updatedAt: new Date().toISOString() }
      : t),
    activeTaskId: status === 'done' && s.activeTaskId === id ? null : s.activeTaskId,
  })),

  pauseWithReason: (id, reason, memo) => {
    const entry: InterruptEntry = {
      id: genId(), pausedAt: new Date().toISOString(), resumedAt: null,
      reason, memo, durationSeconds: 0,
    };
    set((s) => ({
      tasks: s.tasks.map((t) => t.id === id
        ? { ...t, status: 'paused' as TaskStatus, memo, interrupts: [...(t.interrupts || []), entry], updatedAt: new Date().toISOString() }
        : t),
    }));
  },

  resumeTask: (id) => {
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        const interrupts = [...(t.interrupts || [])];
        const last = interrupts[interrupts.length - 1];
        if (last && !last.resumedAt) {
          const dur = Math.floor((Date.now() - new Date(last.pausedAt).getTime()) / 1000);
          interrupts[interrupts.length - 1] = { ...last, resumedAt: new Date().toISOString(), durationSeconds: dur };
        }
        return { ...t, status: 'active' as TaskStatus, interrupts, updatedAt: new Date().toISOString() };
      }),
    }));
  },

  setTaskLayer: (id, layer) => set((s) => ({
    tasks: s.tasks.map((t) => t.id === id ? { ...t, layer, updatedAt: new Date().toISOString() } : t),
  })),

  addChatMessage: (taskId, message) => set((s) => ({
    tasks: s.tasks.map((t) => t.id === taskId
      ? { ...t, chatHistory: [...t.chatHistory, message], updatedAt: new Date().toISOString() }
      : t),
  })),

  incrementTimer: (id) => set((s) => ({
    tasks: s.tasks.map((t) => t.id === id ? { ...t, elapsedSeconds: t.elapsedSeconds + 1 } : t),
  })),

  loadTasks: (tasks, activeTaskId) => {
    // Migrate: ensure ALL fields exist with defaults
    const migrated = tasks.map((t) => ({
      id: t.id || genId(),
      title: t.title || '',
      status: t.status || 'waiting' as TaskStatus,
      layer: t.layer || 'focus' as TaskLayer,
      projectId: t.projectId || undefined,
      branchName: t.branchName || '',
      worktreePath: t.worktreePath || '',
      repoPath: t.repoPath || '',
      memo: t.memo || '',
      elapsedSeconds: t.elapsedSeconds || 0,
      chatHistory: Array.isArray(t.chatHistory) ? t.chatHistory : [],
      interrupts: Array.isArray(t.interrupts) ? t.interrupts : [],
      modelOverride: t.modelOverride || undefined,
      pipeline: t.pipeline || undefined,
      createdAt: t.createdAt || new Date().toISOString(),
      updatedAt: t.updatedAt || new Date().toISOString(),
    }));
    set({ tasks: migrated, activeTaskId });
  },
}));
