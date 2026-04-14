/**
 * @module task-export/json
 * Task ↔ JSON roundtrip export/import.
 */

import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { save, open } from './dialog';
import { buildDefaultPath } from './paths';

export const EXPORT_FORMAT_VERSION = 1;

export interface TaskExportJson {
  format: 'cortx-task-export';
  version: number;
  exportedAt: string;
  tasks: Task[];
  projects: Project[]; // projects referenced by tasks (for context on import)
}

export interface ImportResult {
  importedTasks: number;
  importedProjects: number;
  skipped: number;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Serialize tasks + their referenced projects into a versioned JSON payload.
 * Only projects referenced by the exported tasks are included.
 */
export function tasksToJson(tasks: Task[], projects: Project[]): string {
  const referencedProjectIds = new Set(tasks.map((t) => t.projectId).filter(Boolean));
  const referencedProjects = projects.filter((p) => referencedProjectIds.has(p.id));
  const payload: TaskExportJson = {
    format: 'cortx-task-export',
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    tasks,
    projects: referencedProjects,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Prompt the user for a save location and write the task as Cortx JSON.
 * @returns true if saved, false if cancelled
 */
export async function exportTaskAsJson(task: Task): Promise<boolean> {
  const projects = useProjectStore.getState().projects;
  const project = task.projectId ? projects.find((p) => p.id === task.projectId) || null : null;
  const json = tasksToJson([task], projects);
  const filePath = await save({
    defaultPath: buildDefaultPath(task, project, 'cortx.json'),
    filters: [{ name: 'Cortx Task', extensions: ['json'] }],
  });
  if (!filePath) return false;
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, json);
    return true;
  } catch (err) {
    console.error('[cortx] JSON export failed:', err);
    throw err;
  }
}

/**
 * Prompt the user to select a Cortx task export JSON and import its tasks/projects.
 * Colliding task IDs are reassigned. Imported tasks start in 'waiting' state.
 * @returns Import counts, or null if user cancelled
 */
export async function importTasksFromJson(): Promise<ImportResult | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'Cortx Task', extensions: ['json'] }],
  });
  if (!selected || typeof selected !== 'string') return null;

  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const content = await readTextFile(selected);
  const data: TaskExportJson = JSON.parse(content);

  if (data.format !== 'cortx-task-export') {
    throw new Error('Invalid file format — not a Cortx task export');
  }
  if (data.version > EXPORT_FORMAT_VERSION) {
    throw new Error(`Unsupported version ${data.version} (max ${EXPORT_FORMAT_VERSION})`);
  }

  const taskStore = useTaskStore.getState();
  const projectStore = useProjectStore.getState();
  const existingTaskIds = new Set(taskStore.tasks.map((t) => t.id));
  const existingProjectIds = new Set(projectStore.projects.map((p) => p.id));

  let importedProjects = 0;
  for (const project of data.projects || []) {
    if (existingProjectIds.has(project.id)) continue;
    projectStore.loadProjects([...projectStore.projects, project]);
    importedProjects++;
  }

  // Re-read projects after potential additions (loadProjects replaces entire state)
  const updatedProjects = useProjectStore.getState().projects;

  let importedTasks = 0;
  const skipped = 0;
  const newTasks: Task[] = [...taskStore.tasks];
  for (const task of data.tasks || []) {
    // If task ID collides, generate a new one
    let id = task.id;
    if (existingTaskIds.has(id)) {
      id = genId();
    }
    // Ensure project still exists — otherwise clear the reference
    const projectId =
      task.projectId && updatedProjects.find((p) => p.id === task.projectId) ? task.projectId : undefined;
    newTasks.push({
      ...task,
      id,
      projectId,
      // Imported tasks start as waiting, not resume their old status
      status: 'waiting',
      worktreePath: '', // Worktree path from source machine is irrelevant
      updatedAt: new Date().toISOString(),
      createdAt: task.createdAt || new Date().toISOString(),
    });
    importedTasks++;
  }
  taskStore.loadTasks(newTasks, taskStore.activeTaskId);

  return { importedTasks, importedProjects, skipped };
}
