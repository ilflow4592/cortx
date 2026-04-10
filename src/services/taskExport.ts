/**
 * Task export/import utilities.
 * Supports Markdown (human-readable, read-only) and JSON (roundtrip).
 */
import { save, open } from '@tauri-apps/plugin-dialog';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { PHASE_NAMES, PHASE_ORDER } from '../constants/pipeline';
import type { Task } from '../types/task';
import type { Project } from '../types/project';

const EXPORT_FORMAT_VERSION = 1;

interface TaskExportJson {
  format: 'cortx-task-export';
  version: number;
  exportedAt: string;
  tasks: Task[];
  projects: Project[]; // projects referenced by tasks (for context on import)
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\uac00-\ud7af]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ─────────────────────────────────────────────────────────────
// Markdown export (human-readable)
// ─────────────────────────────────────────────────────────────

export function taskToMarkdown(task: Task, project: Project | null): string {
  const lines: string[] = [];
  lines.push(`# ${task.title}`);
  lines.push('');
  lines.push('## Metadata');
  lines.push('');
  lines.push(`- **Status**: ${task.status}`);
  lines.push(`- **Layer**: ${task.layer}`);
  if (project) lines.push(`- **Project**: ${project.name}`);
  if (task.branchName) lines.push(`- **Branch**: \`${task.branchName}\``);
  if (task.worktreePath) lines.push(`- **Worktree**: \`${task.worktreePath}\``);
  if (task.repoPath) lines.push(`- **Repo**: \`${task.repoPath}\``);
  lines.push(`- **Elapsed**: ${formatDuration(task.elapsedSeconds)}`);
  lines.push(`- **Created**: ${task.createdAt}`);
  lines.push(`- **Updated**: ${task.updatedAt}`);
  if (task.memo) {
    lines.push('');
    lines.push('## Memo');
    lines.push('');
    lines.push(task.memo);
  }

  // Pipeline
  if (task.pipeline?.enabled) {
    lines.push('');
    lines.push('## Pipeline');
    lines.push('');
    lines.push('| Phase | Status | Input | Output | Cost |');
    lines.push('|---|---|---|---|---|');
    let totalIn = 0,
      totalOut = 0,
      totalCost = 0;
    for (const p of PHASE_ORDER) {
      const e = task.pipeline.phases[p];
      if (!e) continue;
      const inT = e.inputTokens || 0;
      const outT = e.outputTokens || 0;
      const cost = e.costUsd || 0;
      totalIn += inT;
      totalOut += outT;
      totalCost += cost;
      lines.push(
        `| ${PHASE_NAMES[p]} | ${e.status} | ${inT.toLocaleString()} | ${outT.toLocaleString()} | $${cost.toFixed(4)} |`,
      );
    }
    lines.push(
      `| **Total** | | **${totalIn.toLocaleString()}** | **${totalOut.toLocaleString()}** | **$${totalCost.toFixed(4)}** |`,
    );
    if (task.pipeline.prUrl) {
      lines.push('');
      lines.push(`- **PR**: ${task.pipeline.prUrl}`);
    }
    if (task.pipeline.devPlan) {
      lines.push('');
      lines.push('### Dev Plan');
      lines.push('');
      lines.push(task.pipeline.devPlan);
    }
  }

  // Interrupts
  if (task.interrupts && task.interrupts.length > 0) {
    lines.push('');
    lines.push('## Interrupts');
    lines.push('');
    for (const i of task.interrupts) {
      const dur = i.durationSeconds ? ` (${formatDuration(i.durationSeconds)})` : '';
      lines.push(`- **${i.reason}** at ${i.pausedAt}${dur} — ${i.memo || ''}`);
    }
  }

  // Chat history
  if (task.chatHistory && task.chatHistory.length > 0) {
    lines.push('');
    lines.push('## Chat History');
    lines.push('');
    for (const msg of task.chatHistory) {
      const who = msg.role === 'user' ? '**You**' : `**Claude${msg.model ? ` (${msg.model})` : ''}**`;
      lines.push(`### ${who} — ${msg.timestamp}`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────
// JSON export (roundtrip)
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// File save dialogs
// ─────────────────────────────────────────────────────────────

export async function exportTaskAsMarkdown(task: Task): Promise<boolean> {
  const project = task.projectId
    ? useProjectStore.getState().projects.find((p) => p.id === task.projectId) || null
    : null;
  const markdown = taskToMarkdown(task, project);
  const defaultName = `${slugify(task.title) || 'task'}.md`;
  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (!filePath) return false;
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, markdown);
    return true;
  } catch (err) {
    console.error('[cortx] Markdown export failed:', err);
    throw err;
  }
}

export async function exportTaskAsJson(task: Task): Promise<boolean> {
  const projects = useProjectStore.getState().projects;
  const json = tasksToJson([task], projects);
  const defaultName = `${slugify(task.title) || 'task'}.cortx.json`;
  const filePath = await save({
    defaultPath: defaultName,
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

// ─────────────────────────────────────────────────────────────
// Import
// ─────────────────────────────────────────────────────────────

export interface ImportResult {
  importedTasks: number;
  importedProjects: number;
  skipped: number;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

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
