/**
 * Modal state store — App.tsx의 15개 useState 중 모달 관련 14개를 대체.
 *
 * 컴포넌트에서 직접 open/close를 호출 가능해 props drilling 감소.
 * Escape 키로 최상위 모달만 닫는 우선순위 스택은 `closeTopmost()`에 모아둔다.
 */
import { create } from 'zustand';

/** 데이터 없이 단순 on/off 토글되는 모달들 */
type SimpleModal =
  | 'newProject'
  | 'settings'
  | 'report'
  | 'onboarding'
  | 'crashRecovery'
  | 'costDashboard'
  | 'worktreeCleanup'
  | 'mcpManager'
  | 'slashBuilder'
  | 'updateChecker'
  | 'commandPalette';

interface ModalState {
  // ─ Simple boolean modals ─
  newProject: boolean;
  settings: boolean;
  report: boolean;
  onboarding: boolean;
  crashRecovery: boolean;
  costDashboard: boolean;
  worktreeCleanup: boolean;
  mcpManager: boolean;
  slashBuilder: boolean;
  updateChecker: boolean;
  commandPalette: boolean;

  // ─ Data-carrying modals ─
  newTask: { open: boolean; projectId?: string };
  editProjectId: string | null;
  pipelineConfigEditor: { path: string; name: string } | null;

  // ─ Actions ─
  open: (name: SimpleModal) => void;
  close: (name: SimpleModal) => void;
  toggleCommandPalette: () => void;
  openNewTask: (projectId?: string) => void;
  closeNewTask: () => void;
  openEditProject: (projectId: string) => void;
  closeEditProject: () => void;
  openPipelineEditor: (path: string, name: string) => void;
  closePipelineEditor: () => void;
  /** 온보딩 완료 — localStorage 마킹까지 포함 */
  completeOnboarding: () => void;

  /**
   * Escape 키 핸들러. 최상위 모달(가장 나중에 열린 개념) 한 개만 닫고 `true` 반환.
   * 우선순위는 기존 App.tsx 동작을 그대로 이식한다.
   */
  closeTopmost: () => boolean;
}

const ONBOARDED_KEY = 'cortx-onboarded';

/** 초기 state — 테스트에서 `resetModalState()`로 재사용 가능. 필드 추가 시 여기만 수정하면 됨. */
export const MODAL_INITIAL_STATE = {
  newProject: false,
  settings: false,
  report: false,
  // onboarding 기본값은 localStorage 기반 — 테스트는 별도 override 가능
  onboarding: false,
  crashRecovery: false,
  costDashboard: false,
  worktreeCleanup: false,
  mcpManager: false,
  slashBuilder: false,
  updateChecker: false,
  commandPalette: false,
  newTask: { open: false, projectId: undefined } as { open: boolean; projectId?: string },
  editProjectId: null as string | null,
  pipelineConfigEditor: null as { path: string; name: string } | null,
} as const;

export const useModalStore = create<ModalState>((set, get) => ({
  ...MODAL_INITIAL_STATE,
  // onboarding만 런타임 결정 — 이전에 완료하지 않았으면 true
  onboarding: !localStorage.getItem(ONBOARDED_KEY),

  open: (name) => set({ [name]: true } as Pick<ModalState, SimpleModal>),
  close: (name) => set({ [name]: false } as Pick<ModalState, SimpleModal>),
  toggleCommandPalette: () => set((s) => ({ commandPalette: !s.commandPalette })),

  openNewTask: (projectId) => set({ newTask: { open: true, projectId } }),
  closeNewTask: () => set({ newTask: { open: false, projectId: undefined } }),

  openEditProject: (projectId) => set({ editProjectId: projectId }),
  closeEditProject: () => set({ editProjectId: null }),

  openPipelineEditor: (path, name) => set({ pipelineConfigEditor: { path, name } }),
  closePipelineEditor: () => set({ pipelineConfigEditor: null }),

  completeOnboarding: () => {
    localStorage.setItem(ONBOARDED_KEY, '1');
    set({ onboarding: false });
  },

  closeTopmost: () => {
    const s = get();
    // 우선순위: 최근 열린 것부터 닫는다 (기존 App.tsx의 if-else 체인과 동일)
    if (s.editProjectId) {
      set({ editProjectId: null });
      return true;
    }
    if (s.report) {
      set({ report: false });
      return true;
    }
    if (s.settings) {
      set({ settings: false });
      return true;
    }
    if (s.newProject) {
      set({ newProject: false });
      return true;
    }
    if (s.newTask.open) {
      set({ newTask: { open: false, projectId: undefined } });
      return true;
    }
    if (s.onboarding) {
      localStorage.setItem(ONBOARDED_KEY, '1');
      set({ onboarding: false });
      return true;
    }
    return false;
  },
}));
