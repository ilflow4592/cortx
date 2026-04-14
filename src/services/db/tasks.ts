import type { Task, ChatMessage, InterruptEntry } from '../../types/task';
import { getDb, safeJsonParse } from './connection';

interface TaskRow {
  id: string;
  title: string;
  status: string;
  layer: string;
  project_id: string | null;
  branch_name: string;
  worktree_path: string;
  repo_path: string;
  memo: string;
  elapsed_seconds: number;
  model_override: string | null;
  pipeline: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToTask(row: TaskRow, chatHistory: ChatMessage[], interrupts: InterruptEntry[]): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status as Task['status'],
    layer: row.layer as Task['layer'],
    projectId: row.project_id || undefined,
    branchName: row.branch_name,
    worktreePath: row.worktree_path,
    repoPath: row.repo_path,
    memo: row.memo,
    elapsedSeconds: row.elapsed_seconds,
    chatHistory,
    interrupts,
    modelOverride: safeJsonParse<Task['modelOverride']>(row.model_override, undefined, `task.modelOverride ${row.id}`),
    pipeline: safeJsonParse<Task['pipeline']>(row.pipeline, undefined, `task.pipeline ${row.id}`),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ChatRow {
  id: string;
  task_id: string;
  role: string;
  content: string;
  model: string | null;
  timestamp: string;
}

interface InterruptRow {
  id: string;
  task_id: string;
  paused_at: string;
  resumed_at: string | null;
  reason: string;
  memo: string;
  duration_seconds: number;
}

export async function loadAllTasks(): Promise<{ tasks: Task[]; activeTaskId: string | null }> {
  const d = await getDb();
  const taskRows = await d.select<TaskRow[]>('SELECT * FROM tasks ORDER BY updated_at DESC');
  const chatRows = await d.select<ChatRow[]>('SELECT * FROM chat_messages ORDER BY timestamp ASC');
  const interruptRows = await d.select<InterruptRow[]>('SELECT * FROM interrupts ORDER BY paused_at ASC');

  const chatByTask = new Map<string, ChatMessage[]>();
  for (const r of chatRows) {
    const arr = chatByTask.get(r.task_id) || [];
    arr.push({
      id: r.id,
      role: r.role as ChatMessage['role'],
      content: r.content,
      model: r.model || undefined,
      timestamp: r.timestamp,
    });
    chatByTask.set(r.task_id, arr);
  }

  const intByTask = new Map<string, InterruptEntry[]>();
  for (const r of interruptRows) {
    const arr = intByTask.get(r.task_id) || [];
    arr.push({
      id: r.id,
      pausedAt: r.paused_at,
      resumedAt: r.resumed_at,
      reason: r.reason as InterruptEntry['reason'],
      memo: r.memo,
      durationSeconds: r.duration_seconds,
    });
    intByTask.set(r.task_id, arr);
  }

  const tasks = taskRows.map((row) => rowToTask(row, chatByTask.get(row.id) || [], intByTask.get(row.id) || []));

  const activeRows = await d.select<{ value: string }[]>('SELECT value FROM app_state WHERE key = $1', [
    'activeTaskId',
  ]);
  const activeTaskId = activeRows[0]?.value || null;

  return { tasks, activeTaskId };
}

/**
 * 태스크 upsert — 태스크 레코드 + chat_messages + interrupts를 **단일 트랜잭션**으로 처리한다.
 * DELETE 후 INSERT 사이에 크래시/동시 쓰기가 끼어들어 채팅 히스토리가 유실되는 경우를 방지.
 */
export async function upsertTask(t: Task): Promise<void> {
  const d = await getDb();
  try {
    await d.execute('BEGIN');
    await d.execute(
      `INSERT INTO tasks (id, title, status, layer, project_id, branch_name, worktree_path, repo_path, memo, elapsed_seconds, model_override, pipeline, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         status = excluded.status,
         layer = excluded.layer,
         project_id = excluded.project_id,
         branch_name = excluded.branch_name,
         worktree_path = excluded.worktree_path,
         repo_path = excluded.repo_path,
         memo = excluded.memo,
         elapsed_seconds = excluded.elapsed_seconds,
         model_override = excluded.model_override,
         pipeline = excluded.pipeline,
         updated_at = excluded.updated_at`,
      [
        t.id,
        t.title,
        t.status,
        t.layer,
        t.projectId || null,
        t.branchName,
        t.worktreePath,
        t.repoPath,
        t.memo,
        t.elapsedSeconds,
        t.modelOverride ? JSON.stringify(t.modelOverride) : null,
        t.pipeline ? JSON.stringify(t.pipeline) : null,
        t.createdAt,
        t.updatedAt,
      ],
    );

    // Replace chat messages and interrupts — inside transaction to avoid loss on crash
    await d.execute('DELETE FROM chat_messages WHERE task_id = $1', [t.id]);
    for (const m of t.chatHistory || []) {
      await d.execute(
        'INSERT INTO chat_messages (id, task_id, role, content, model, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
        [m.id, t.id, m.role, m.content, m.model || null, m.timestamp],
      );
    }

    await d.execute('DELETE FROM interrupts WHERE task_id = $1', [t.id]);
    for (const i of t.interrupts || []) {
      await d.execute(
        'INSERT INTO interrupts (id, task_id, paused_at, resumed_at, reason, memo, duration_seconds) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [i.id, t.id, i.pausedAt, i.resumedAt, i.reason, i.memo, i.durationSeconds],
      );
    }
    await d.execute('COMMIT');
  } catch (err) {
    try {
      await d.execute('ROLLBACK');
    } catch {
      /* rollback 실패는 무시 — 원본 에러가 중요 */
    }
    throw err;
  }
}

export async function deleteTask(id: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM tasks WHERE id = $1', [id]);
}

export async function setActiveTaskId(id: string | null): Promise<void> {
  const d = await getDb();
  if (id === null) {
    await d.execute('DELETE FROM app_state WHERE key = $1', ['activeTaskId']);
  } else {
    await d.execute(
      `INSERT INTO app_state (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['activeTaskId', id],
    );
  }
}
