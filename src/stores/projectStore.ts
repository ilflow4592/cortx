import { create } from 'zustand';
import type { Project } from '../types/project';

const COLORS = ['#818cf8', '#34d399', '#eab308', '#f87171', '#c084fc', '#67e8f9', '#fb923c', '#a78bfa'];

interface ProjectState {
  projects: Project[];
  addProject: (name: string, localPath: string, githubOwner: string, githubRepo: string) => string;
  removeProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  loadProjects: (projects: Project[]) => void;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],

  addProject: (name, localPath, githubOwner, githubRepo) => {
    const id = genId();
    const colorIndex = get().projects.length % COLORS.length;
    const project: Project = {
      id, name, localPath, githubOwner, githubRepo,
      color: COLORS[colorIndex],
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ projects: [...s.projects, project] }));
    return id;
  },

  removeProject: (id) => set((s) => ({
    projects: s.projects.filter((p) => p.id !== id),
  })),

  updateProject: (id, updates) => set((s) => ({
    projects: s.projects.map((p) => p.id === id ? { ...p, ...updates } : p),
  })),

  loadProjects: (projects) => set({ projects }),
}));
