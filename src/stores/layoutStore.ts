/**
 * Layout state store — 사이드바/우측 패널 가시성과 너비 관리.
 *
 * App.tsx에서 4개 useState(showSidebar, sidebarWidth, showRightPanel, isResizing)를
 * 추출. 사이드바 리사이즈 중 transition을 끄려고 `isResizing`을 읽는
 * 컴포넌트가 있으므로 같은 store에 둔다.
 */
import { create } from 'zustand';

const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 260;

interface LayoutState {
  showSidebar: boolean;
  sidebarWidth: number;
  showRightPanel: boolean;
  /** 드래그 리사이즈 진행 중 — transition 비활성화 힌트 */
  isResizing: boolean;

  toggleSidebar: () => void;
  setShowSidebar: (v: boolean) => void;
  /** 드래그 중 호출 — MIN/MAX clamp 후 저장 */
  setSidebarWidth: (w: number) => void;
  toggleRightPanel: () => void;
  setShowRightPanel: (v: boolean) => void;
  setIsResizing: (v: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  showSidebar: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  showRightPanel: true,
  isResizing: false,

  toggleSidebar: () => set((s) => ({ showSidebar: !s.showSidebar })),
  setShowSidebar: (v) => set({ showSidebar: v }),
  setSidebarWidth: (w) =>
    set({ sidebarWidth: Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, w)) }),
  toggleRightPanel: () => set((s) => ({ showRightPanel: !s.showRightPanel })),
  setShowRightPanel: (v) => set({ showRightPanel: v }),
  setIsResizing: (v) => set({ isResizing: v }),
}));
