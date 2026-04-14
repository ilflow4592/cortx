/**
 * Filtered project list group — selecting a project activates its first task.
 * Renders nothing when the filtered list is empty.
 */
import { Command } from 'cmdk';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { PaletteItem } from './PaletteItem';

interface Props {
  heading: string;
  projects: Project[];
  tasks: Task[];
  onPickFirstTask: (taskId: string) => void;
  run: (fn: () => void) => void;
}

export function ProjectsSection({ heading, projects, tasks, onPickFirstTask, run }: Props) {
  if (projects.length === 0) return null;

  return (
    <Command.Group heading={heading}>
      {projects.map((project) => (
        <PaletteItem
          key={project.id}
          icon={
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: project.color,
                display: 'inline-block',
              }}
            />
          }
          label={project.name}
          hint={project.localPath || project.githubRepo}
          keywords={[project.name, project.githubRepo, project.githubOwner]}
          onSelect={() =>
            run(() => {
              const firstTask = tasks.find((t) => t.projectId === project.id);
              if (firstTask) onPickFirstTask(firstTask.id);
            })
          }
        />
      ))}
    </Command.Group>
  );
}
