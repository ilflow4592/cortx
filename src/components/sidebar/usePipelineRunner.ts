import { useEffect } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { usePipelineRunnerStore } from '../../stores/pipelineRunnerStore';
import { runPipeline } from '../../utils/pipelineExec';
import type { Task } from '../../types/task';

/**
 * A task's pipeline is considered "started" once any phase has moved past
 * `pending`. The in-memory `runningPipelines` Set only tracks the current
 * process, but Claude sessions can be long-lived and the app may restart
 * while a phase is in_progress — the persistent pipeline state is the
 * authoritative signal that work is underway.
 */
function hasStartedPipeline(t: Task | undefined): boolean {
  if (!t?.pipeline?.enabled) return false;
  return Object.values(t.pipeline.phases).some((p) => p.status !== 'pending');
}

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
    // 제외: done 상태, 이미 in-memory 실행 중, 이미 파이프라인이 시작된(phase !== pending) task.
    const selected = [...selectedTasks].filter((id) => {
      if (runningPipelines.has(id)) return false;
      const t = tasks.find((x) => x.id === id);
      if (!t || t.status === 'done') return false;
      if (hasStartedPipeline(t)) return false;
      return true;
    });
    selected.forEach((id) => useTaskStore.getState().updateTask(id, { elapsedSeconds: 0 }));
    selected.forEach((id) => runPipelineForTask(id, '/pipeline:dev-task'));
    onDone();
  };

  /** 선택된 task 중 실제 Run 가능한(= 실행 중 아닌 + done 아닌 + 파이프라인 미시작) 개수 */
  const countRunnable = (selectedTasks: Set<string>): number => {
    let count = 0;
    selectedTasks.forEach((id) => {
      if (runningPipelines.has(id)) return;
      const t = tasks.find((x) => x.id === id);
      if (!t || t.status === 'done') return;
      if (hasStartedPipeline(t)) return;
      count++;
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
