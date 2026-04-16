/**
 * Pipeline runner UI 상태 스토어.
 *
 * Sidebar "Run Pipeline" 버튼과 ClaudeChat 채팅 입력 경로 모두
 * 같은 running/asking 상태를 보여줘야 함 → 이전엔 usePipelineRunner
 * 훅 내부 useState였는데 채팅 경로가 이 훅을 거치지 않음 → 상태 분기.
 *
 * 메모리 전용. 앱 재시작 시 초기화됨.
 */
import { create } from 'zustand';

interface PipelineRunnerState {
  runningPipelines: Set<string>;
  askingTasks: Set<string>;

  setRunning: (taskId: string) => void;
  setNotRunning: (taskId: string) => void;
  setAsking: (taskId: string) => void;
  unsetAsking: (taskId: string) => void;

  isRunning: (taskId: string) => boolean;
  isAsking: (taskId: string) => boolean;
}

export const usePipelineRunnerStore = create<PipelineRunnerState>((set, get) => ({
  runningPipelines: new Set<string>(),
  askingTasks: new Set<string>(),

  setRunning: (taskId) =>
    set((s) => {
      if (s.runningPipelines.has(taskId)) return s;
      const next = new Set(s.runningPipelines);
      next.add(taskId);
      // 새 실행 시작 시 이전 Asking 상태도 초기화
      const nextAsking = new Set(s.askingTasks);
      nextAsking.delete(taskId);
      return { runningPipelines: next, askingTasks: nextAsking };
    }),

  setNotRunning: (taskId) =>
    set((s) => {
      if (!s.runningPipelines.has(taskId)) return s;
      const next = new Set(s.runningPipelines);
      next.delete(taskId);
      return { runningPipelines: next };
    }),

  setAsking: (taskId) =>
    set((s) => {
      if (s.askingTasks.has(taskId)) return s;
      const next = new Set(s.askingTasks);
      next.add(taskId);
      return { askingTasks: next };
    }),

  unsetAsking: (taskId) =>
    set((s) => {
      if (!s.askingTasks.has(taskId)) return s;
      const next = new Set(s.askingTasks);
      next.delete(taskId);
      return { askingTasks: next };
    }),

  isRunning: (taskId) => get().runningPipelines.has(taskId),
  isAsking: (taskId) => get().askingTasks.has(taskId),
}));
