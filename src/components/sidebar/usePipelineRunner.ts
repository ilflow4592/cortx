import { useState, useEffect } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { runPipeline } from '../../utils/pipelineExec';

/**
 * Pipeline runner hook — wraps runPipeline() with UI state tracking
 * (runningPipelines, askingTasks) for Sidebar display.
 */
export function usePipelineRunner() {
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [askingTasks, setAskingTasks] = useState<Set<string>>(new Set());

  const tasks = useTaskStore((s) => s.tasks);

  const runPipelineForTask = (taskId: string, command: string) => {
    setRunningPipelines((prev) => new Set(prev).add(taskId));

    runPipeline(taskId, command, {
      onAsking: () => {
        setAskingTasks((prev) => new Set(prev).add(taskId));
        const task = tasks.find((t) => t.id === taskId);
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Cortx', { body: `${task?.title} — 사용자 입력이 필요합니다` });
          }
        } catch {
          /* ignore */
        }
      },
      onDone: () => {
        setRunningPipelines((prev) => {
          const n = new Set(prev);
          n.delete(taskId);
          return n;
        });
      },
    });
  };

  // Clean up stale running state
  useEffect(() => {
    const interval = setInterval(() => {
      const toRemove: string[] = [];
      runningPipelines.forEach((taskId) => {
        const task = tasks.find((t) => t.id === taskId);
        if (!task || task.status === 'waiting' || task.status === 'done') {
          toRemove.push(taskId);
        }
      });
      if (toRemove.length > 0) {
        setRunningPipelines((prev) => {
          const n = new Set(prev);
          toRemove.forEach((id) => n.delete(id));
          return n;
        });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [runningPipelines, tasks]);

  const runSelectedPipelines = (selectedTasks: Set<string>, onDone: () => void) => {
    const selected = [...selectedTasks].filter((id) => tasks.some((t) => t.id === id && t.status !== 'done'));
    selected.forEach((id) => useTaskStore.getState().updateTask(id, { elapsedSeconds: 0 }));
    selected.forEach((id) => runPipelineForTask(id, '/pipeline:dev-task'));
    onDone();
  };

  return {
    runningPipelines,
    setRunningPipelines,
    askingTasks,
    setAskingTasks,
    runPipelineForTask,
    runSelectedPipelines,
  };
}
