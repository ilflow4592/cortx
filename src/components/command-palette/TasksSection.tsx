/**
 * Filtered task list group — clicking a task makes it active.
 * Renders nothing when the filtered list is empty so the parent can keep
 * its slot in the section ordering.
 */
import { Command } from 'cmdk';
import { Circle } from 'lucide-react';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { PaletteItem } from './PaletteItem';

interface Props {
  heading: string;
  tasks: Task[];
  projects: Project[];
  onPick: (taskId: string) => void;
  run: (fn: () => void) => void;
}

function dotColorFor(status: Task['status']): string {
  if (status === 'active') return '#34d399';
  if (status === 'paused') return '#eab308';
  if (status === 'done') return 'var(--accent)';
  return 'var(--fg-dim)';
}

export function TasksSection({ heading, tasks, projects, onPick, run }: Props) {
  if (tasks.length === 0) return null;

  return (
    <Command.Group heading={heading}>
      {tasks.map((task) => {
        const project = projects.find((p) => p.id === task.projectId);
        return (
          <PaletteItem
            key={task.id}
            icon={<Circle size={10} fill={dotColorFor(task.status)} stroke="none" />}
            label={task.title}
            hint={project?.name || (task.branchName ? task.branchName : undefined)}
            keywords={[task.title, task.branchName, project?.name || '']}
            onSelect={() => run(() => onPick(task.id))}
          />
        );
      })}
    </Command.Group>
  );
}
