import { create } from 'zustand';
import type { Task, TaskStatus, ChatMessage } from '../types/task';

interface TaskState {
  tasks: Task[];
  activeTaskId: string | null;

  addTask: (title: string, repoPath: string, branchName: string) => void;
  removeTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  selectTask: (id: string) => void;
  startTask: (id: string) => void;
  setActiveTask: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus, memo?: string) => void;
  addChatMessage: (taskId: string, message: ChatMessage) => void;
  incrementTimer: (id: string) => void;
  loadTasks: (tasks: Task[], activeTaskId: string | null) => void;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  activeTaskId: null,

  addTask: (title, repoPath, branchName) => {
    const task: Task = {
      id: generateId(),
      title,
      status: 'waiting',
      branchName,
      worktreePath: '',
      repoPath,
      memo: '',
      elapsedSeconds: 0,
      chatHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({ tasks: [...state.tasks, task] }));
  },

  removeTask: (id) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      activeTaskId: state.activeTaskId === id ? null : state.activeTaskId,
    }));
  },

  updateTask: (id, updates) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      ),
    }));
  },

  // Select a task to view — does NOT change status or start timer
  selectTask: (id) => {
    set({ activeTaskId: id });
  },

  // Explicitly start a task — sets it to active and pauses current active
  startTask: (id) => {
    const { tasks } = get();
    const currentActive = tasks.find((t) => t.status === 'active');

    set((state) => ({
      activeTaskId: id,
      tasks: state.tasks.map((t) => {
        if (t.id === currentActive?.id && t.id !== id) {
          return { ...t, status: 'paused' as TaskStatus, updatedAt: new Date().toISOString() };
        }
        if (t.id === id && (t.status === 'waiting' || t.status === 'paused')) {
          return { ...t, status: 'active' as TaskStatus, updatedAt: new Date().toISOString() };
        }
        return t;
      }),
    }));
  },

  // Legacy: select + start in one call (used by Dock quick-switch for already-started tasks)
  setActiveTask: (id) => {
    const { tasks } = get();
    const target = tasks.find((t) => t.id === id);
    if (!target) return;

    // If task was already started (paused/active), switch to it
    // If waiting, just select it without starting
    if (target.status === 'waiting') {
      set({ activeTaskId: id });
    } else {
      get().startTask(id);
    }
  },

  setTaskStatus: (id, status, memo) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              memo: memo !== undefined ? memo : t.memo,
              updatedAt: new Date().toISOString(),
            }
          : t
      ),
      activeTaskId:
        status === 'done' && state.activeTaskId === id ? null : state.activeTaskId,
    }));
  },

  addChatMessage: (taskId, message) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, chatHistory: [...t.chatHistory, message], updatedAt: new Date().toISOString() }
          : t
      ),
    }));
  },

  incrementTimer: (id) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === id ? { ...t, elapsedSeconds: t.elapsedSeconds + 1 } : t
      ),
    }));
  },

  loadTasks: (tasks, activeTaskId) => {
    set({ tasks, activeTaskId });
  },
}));
