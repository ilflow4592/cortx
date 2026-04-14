/**
 * Active-task action group — Run Pipeline, Stop Claude, Pause/Resume,
 * Mark Done, Open in New Window. Renders nothing when no item matches.
 *
 * Item visibility checks the search query directly via the shared keyword
 * matcher; we do not gate the whole section on `search` so the parent can
 * keep its slot in the section ordering.
 */
import { Command } from 'cmdk';
import {
  CheckCircle2,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Task } from '../../types/task';
import { useTaskStore } from '../../stores/taskStore';
import { runPipeline } from '../../utils/pipelineExec';
import { messageCache, sessionCache, loadingCache } from '../../utils/chatState';
import { matchesLabelOrKeywords } from './search';
import { PaletteItem } from './PaletteItem';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

interface Props {
  activeTask: Task;
  search: string;
  pauseWithReason: ReturnType<typeof useTaskStore.getState>['pauseWithReason'];
  resumeTask: ReturnType<typeof useTaskStore.getState>['resumeTask'];
  setTaskStatus: ReturnType<typeof useTaskStore.getState>['setTaskStatus'];
  run: (fn: () => void) => void;
}

export function CurrentTaskSection({
  activeTask,
  search,
  pauseWithReason,
  resumeTask,
  setTaskStatus,
  run,
}: Props) {
  const matchCurrent = (label: string, keywords: string[] = []) =>
    matchesLabelOrKeywords(search, label, keywords);

  const items: ReactNode[] = [];

  if (matchCurrent('Run Pipeline (/pipeline:dev-task)', ['run', 'pipeline', 'dev-task', 'start'])) {
    items.push(
      <PaletteItem
        key="run-pipeline"
        icon={<Play size={14} color="#34d399" strokeWidth={1.5} />}
        label="Run Pipeline (/pipeline:dev-task)"
        onSelect={() =>
          run(() => {
            runPipeline(activeTask.id, '/pipeline:dev-task');
          })
        }
      />,
    );
  }

  if (
    loadingCache.get(activeTask.id) &&
    matchCurrent('Stop Claude Process (kill running pipeline)', ['stop', 'kill', 'abort', 'cancel'])
  ) {
    items.push(
      <PaletteItem
        key="stop-claude"
        icon={<Square size={14} color="#ef4444" strokeWidth={1.5} fill="#ef4444" />}
        label="Stop Claude Process (kill running pipeline)"
        onSelect={() =>
          run(() => {
            invoke('claude_stop_task', { taskId: activeTask.id }).catch(() => {});
            messageCache.delete(activeTask.id);
            sessionCache.delete(activeTask.id);
            loadingCache.delete(activeTask.id);
            useTaskStore.getState().updateTask(activeTask.id, {
              status: 'waiting',
              pipeline: undefined,
              elapsedSeconds: 0,
            });
          })
        }
      />,
    );
  }

  if (activeTask.status === 'active' && matchCurrent('Pause Current Task (timer only)', ['pause', 'timer'])) {
    items.push(
      <PaletteItem
        key="pause-task"
        icon={<Pause size={14} color="#eab308" strokeWidth={1.5} />}
        label="Pause Current Task (timer only)"
        hint="⌘⇧P"
        onSelect={() =>
          run(() => pauseWithReason(activeTask.id, 'other', 'Paused via command palette'))
        }
      />,
    );
  }

  if (activeTask.status === 'paused' && matchCurrent('Resume Current Task', ['resume', 'continue'])) {
    items.push(
      <PaletteItem
        key="resume-task"
        icon={<RotateCcw size={14} color="#34d399" strokeWidth={1.5} />}
        label="Resume Current Task"
        hint="⌘⇧R"
        onSelect={() => run(() => resumeTask(activeTask.id))}
      />,
    );
  }

  if (activeTask.status !== 'done' && matchCurrent('Mark as Done', ['done', 'complete', 'finish'])) {
    items.push(
      <PaletteItem
        key="mark-done"
        icon={<CheckCircle2 size={14} color="var(--accent)" strokeWidth={1.5} />}
        label="Mark as Done"
        onSelect={() => run(() => setTaskStatus(activeTask.id, 'done'))}
      />,
    );
  }

  if (matchCurrent('Open in New Window', ['window', 'popout', 'new', 'open'])) {
    items.push(
      <PaletteItem
        key="popout-window"
        icon={<ExternalLink size={14} color="var(--indigo)" strokeWidth={1.5} />}
        label="Open in New Window"
        onSelect={() =>
          run(() => {
            invoke('open_task_window', {
              taskId: activeTask.id,
              taskTitle: activeTask.title,
            }).catch((err) => alert(`Failed to open window: ${err}`));
          })
        }
      />,
    );
  }

  if (items.length === 0) return null;

  return (
    <Command.Group heading={`Current Task: ${activeTask.title}`}>{items}</Command.Group>
  );
}
