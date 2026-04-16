import { useEffect } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { usePipelineRunnerStore } from '../../stores/pipelineRunnerStore';
import { runPipeline } from '../../utils/pipelineExec';

/**
 * Pipeline runner hook — wraps runPipeline() with UI state tracking.
 * 실제 상태는 usePipelineRunnerStore(Zustand)에 보관. 채팅 입력 경로도
 * 같은 store를 업데이트하므로 Sidebar 배지가 일관되게 표시됨.
 */
export function usePipelineRunner() {
  const runningPipelines = usePipelineRunnerStore((s) => s.runningPipelines);
  const askingTasks = usePipelineRunnerStore((s) => s.askingTasks);
  const tasks = useTaskStore((s) => s.tasks);

  const runPipelineForTask = (taskId: string, command: string) => {
    const store = usePipelineRunnerStore.getState();
    store.setRunning(taskId);

    runPipeline(taskId, command, {
      onAsking: () => {
        usePipelineRunnerStore.getState().setAsking(taskId);
        const task = tasks.find((t) => t.id === taskId);
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Cortx', { body: `${task?.title} — 사용자 입력이 필요합니다` });
          }
        } catch {
          /* ignore */
        }
      },
      onNotAsking: () => {
        usePipelineRunnerStore.getState().unsetAsking(taskId);
      },
      onDone: () => {
        usePipelineRunnerStore.getState().setNotRunning(taskId);
      },
    });
  };

  // Clean up stale running state
  useEffect(() => {
    const interval = setInterval(() => {
      const store = usePipelineRunnerStore.getState();
      store.runningPipelines.forEach((taskId) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || task.status === 'waiting' || task.status === 'done') {
          store.setNotRunning(taskId);
        }
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [tasks]);

  const runSelectedPipelines = (selectedTasks: Set<string>, onDone: () => void) => {
    // done 상태 제외 + 이미 파이프라인 돌고 있는 task 제외 (중복 실행 방지)
    const selected = [...selectedTasks].filter(
      (id) => !runningPipelines.has(id) && tasks.some((t) => t.id === id && t.status !== 'done'),
    );
    selected.forEach((id) => useTaskStore.getState().updateTask(id, { elapsedSeconds: 0 }));
    selected.forEach((id) => runPipelineForTask(id, '/pipeline:dev-task'));
    onDone();
  };

  /** 선택된 task 중 실제 Run 가능한(= 실행 중 아닌 + done 아닌) 개수 계산 */
  const countRunnable = (selectedTasks: Set<string>): number => {
    let count = 0;
    selectedTasks.forEach((id) => {
      if (runningPipelines.has(id)) return;
      const t = tasks.find((x) => x.id === id);
      if (t && t.status !== 'done') count++;
    });
    return count;
  };

  return {
    runningPipelines,
    askingTasks,
    runPipelineForTask,
    runSelectedPipelines,
    countRunnable,
  };
}
