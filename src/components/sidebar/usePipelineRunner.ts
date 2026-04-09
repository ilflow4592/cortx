import { useState, useEffect } from 'react';
import { useTaskStore } from '../../stores/taskStore';
import { messageCache, sessionCache, pendingCommands } from '../../utils/chatState';

/**
 * Pipeline runner hook — delegates execution to ClaudeChat's useClaudeSession
 * via pendingCommands, ensuring both Run Pipeline button and chat input go
 * through the exact same code path.
 */
export function usePipelineRunner() {
  const [runningPipelines, setRunningPipelines] = useState<Set<string>>(new Set());
  const [askingTasks, setAskingTasks] = useState<Set<string>>(new Set());

  const tasks = useTaskStore((s) => s.tasks);

  const runPipelineForTask = (taskId: string, command: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    setRunningPipelines((prev) => new Set(prev).add(taskId));

    // Clear previous messages and session — fresh start
    messageCache.delete(taskId);
    sessionCache.delete(taskId);

    // Reset timer + set active
    useTaskStore.getState().updateTask(taskId, { elapsedSeconds: 0, status: 'active' as const });

    // Select this task so ClaudeChat mounts for it
    useTaskStore.getState().setActiveTask(taskId);

    // Queue the command — ClaudeChat's useClaudeSession will pick it up and execute
    pendingCommands.set(taskId, command);
  };

  // Track running state by watching pipeline/loading status
  useEffect(() => {
    const interval = setInterval(() => {
      const toRemove: string[] = [];
      runningPipelines.forEach((taskId) => {
        const task = tasks.find((t) => t.id === taskId);
        // Pipeline finished: task went back to waiting, or pipeline disabled, or no longer loading
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

      // Detect question-asking state from messageCache
      runningPipelines.forEach((taskId) => {
        const msgs = messageCache.get(taskId) || [];
        const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant && isQuestion(lastAssistant.content)) {
          setAskingTasks((prev) => {
            if (prev.has(taskId)) return prev;
            try {
              if ('Notification' in window && Notification.permission === 'granted') {
                const task = tasks.find((t) => t.id === taskId);
                new Notification('Cortx', { body: `${task?.title} — 사용자 입력이 필요합니다` });
              }
            } catch {
              /* ignore */
            }
            return new Set(prev).add(taskId);
          });
        }
      });
    }, 2000);
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

function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith('?') || t.endsWith('\uff1f')) return true;
  if (
    /(?:할까요|인가요|있나요|될까요|맞나요|괜찮을까요|건가요|하시나요|싶습니다|드릴까요|어떤가요|좋을까요|주세요|해줘)\s*[.?\uff1f]?\s*$/.test(
      t,
    )
  )
    return true;
  if (
    /(?:please confirm|what do you think|should we|would you|do you want|can you|is that correct|right\?|agree\?)\s*[.?]?\s*$/i.test(
      t,
    )
  )
    return true;
  const tail = t.slice(-200);
  if (/(?:Q\d+[.:)]|질문\s*\d+\s*[:.)]).+[?\uff1f]/.test(tail)) return true;
  return false;
}
