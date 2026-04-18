/**
 * @module task-export/markdown
 * Task → Markdown 변환 + Markdown 파일 저장.
 */

import { useProjectStore } from '../../stores/projectStore';
import { PHASE_NAMES, PHASE_ORDER } from '../../constants/pipeline';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { save } from './dialog';
import { buildDefaultPath } from './paths';
import { logger } from '../../utils/logger';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Render a Task as human-readable Markdown.
 * Includes metadata, memo, pipeline (with phase table + totals), interrupts, and chat history.
 */
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

/**
 * Prompt the user for a save location and write the task as Markdown.
 * @returns true if saved, false if cancelled
 */
export async function exportTaskAsMarkdown(task: Task): Promise<boolean> {
  const project = task.projectId
    ? useProjectStore.getState().projects.find((p) => p.id === task.projectId) || null
    : null;
  const markdown = taskToMarkdown(task, project);
  const filePath = await save({
    defaultPath: buildDefaultPath(task, project, 'md'),
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (!filePath) return false;
  try {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    await writeTextFile(filePath, markdown);
    return true;
  } catch (err) {
    logger.error('[cortx] Markdown export failed:', err);
    throw err;
  }
}
