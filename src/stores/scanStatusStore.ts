/**
 * Scan Status Store — 어떤 프로젝트가 현재 스캔 중인지 추적.
 *
 * triggerProjectScan 호출 시 해당 id를 `scanning`에 추가하고,
 * `project-scan-done-{id}` 또는 `project-scan-error-{id}` 이벤트 수신 시 제거한다.
 * 최소 표시 시간(MIN_DISPLAY_MS)을 강제해 사용자가 스피너를 확실히 볼 수 있도록 한다.
 */
import { create } from 'zustand';

const MIN_DISPLAY_MS = 600;

interface ScanStatusState {
  scanning: Set<string>;
  startedAt: Map<string, number>;
  start: (projectId: string) => void;
  finish: (projectId: string) => void;
}

export const useScanStatusStore = create<ScanStatusState>((set, get) => ({
  scanning: new Set(),
  startedAt: new Map(),
  start: (projectId) =>
    set((s) => {
      if (s.scanning.has(projectId)) return s;
      const scanning = new Set(s.scanning);
      scanning.add(projectId);
      const startedAt = new Map(s.startedAt);
      startedAt.set(projectId, Date.now());
      return { scanning, startedAt };
    }),
  finish: (projectId) => {
    const started = get().startedAt.get(projectId) ?? 0;
    const elapsed = Date.now() - started;
    const doFinish = () => {
      set((s) => {
        if (!s.scanning.has(projectId)) return s;
        const scanning = new Set(s.scanning);
        scanning.delete(projectId);
        const startedAt = new Map(s.startedAt);
        startedAt.delete(projectId);
        return { scanning, startedAt };
      });
    };
    if (elapsed >= MIN_DISPLAY_MS) {
      doFinish();
    } else {
      setTimeout(doFinish, MIN_DISPLAY_MS - elapsed);
    }
  },
}));

/** 프로젝트가 스캔 중인지 구독하는 훅 */
export function useIsScanning(projectId: string): boolean {
  return useScanStatusStore((s) => s.scanning.has(projectId));
}
