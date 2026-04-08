/**
 * Project Store — 프로젝트 상태 관리
 *
 * GitHub 저장소와 1:1 대응하는 프로젝트를 관리한다.
 * 각 프로젝트에는 로컬 경로, GitHub owner/repo, base branch, Slack 채널 등의 정보가 있다.
 * Task는 하나의 Project에 속하며, projectId로 연결된다.
 *
 * Persistence: 외부 subscriber가 store 변경을 감지하여 localStorage에 저장.
 */
import { create } from 'zustand';
import type { Project } from '../types/project';

/** 프로젝트 카드에 표시될 색상 팔레트. 순서대로 순환 할당 */
const COLORS = ['#818cf8', '#34d399', '#eab308', '#f87171', '#c084fc', '#67e8f9', '#fb923c', '#a78bfa'];

/** 프로젝트 스토어의 상태(state)와 액션(action) 정의 */
interface ProjectState {
  projects: Project[];
  addProject: (name: string, localPath: string, githubOwner: string, githubRepo: string) => string;
  removeProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  loadProjects: (projects: Project[]) => void;
}

/** Generate a short unique ID using base-36 timestamp + random suffix */
function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],

  // 색상은 현재 프로젝트 수를 기준으로 COLORS 팔레트에서 순환 할당
  addProject: (name, localPath, githubOwner, githubRepo) => {
    const id = genId();
    const colorIndex = get().projects.length % COLORS.length;
    const project: Project = {
      id, name, localPath, githubOwner, githubRepo,
      baseBranch: 'main',
      slackChannels: [],
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

  /**
   * localStorage에서 읽은 raw 데이터를 현재 스키마로 마이그레이션하여 로드.
   * 새 필드 추가 시 반드시 여기에 기본값을 지정해야 함 (CLAUDE.md 참조).
   */
  loadProjects: (projects) => {
    // Migrate: ensure ALL fields exist with defaults
    const migrated = projects.map((p) => ({
      id: p.id || genId(),
      name: p.name || '',
      localPath: p.localPath || '',
      githubOwner: p.githubOwner || '',
      githubRepo: p.githubRepo || '',
      baseBranch: p.baseBranch || 'main',
      slackChannels: Array.isArray(p.slackChannels) ? p.slackChannels : [],
      color: p.color || '#818cf8',
      createdAt: p.createdAt || new Date().toISOString(),
    }));
    set({ projects: migrated });
  },
}));
