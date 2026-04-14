/**
 * SQLite data access layer.
 *
 * Wraps tauri-plugin-sql with typed accessors for tasks, projects, chat messages,
 * and interrupts. The store layer (taskStore, projectStore) calls these functions
 * to persist state. Loads from localStorage on first run for migration.
 */
import type { Task, ChatMessage, InterruptEntry } from '../types/task';
import type { Project, ProjectMetadata } from '../types/project';

// `@tauri-apps/plugin-sql`의 Database 인스턴스 타입 — 정적 import 없이 typeof 추론.
// CLAUDE.md 규칙: Tauri API는 반드시 동적 import. 프로젝트 품질 게이트도 이를 강제한다.
type DbHandle = Awaited<ReturnType<typeof import('@tauri-apps/plugin-sql')['default']['load']>>;

let db: DbHandle | null = null;

export async function getDb(): Promise<DbHandle> {
  if (!db) {
    const { default: SqlDatabase } = await import('@tauri-apps/plugin-sql');
    db = await SqlDatabase.load('sqlite:cortx.db');
  }
  return db;
}

/**
 * 안전한 JSON.parse — 실패 시 fallback 반환하고 콘솔에 경고.
 * DB에 손상된 JSON이 있어도 loadAll* 전체가 throw되지 않도록 개별 row 단위로 보호한다.
 */
function safeJsonParse<T>(raw: string | null | undefined, fallback: T, context?: string): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    if (context) console.warn(`[db] JSON.parse failed (${context}):`, err);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// Projects
// ─────────────────────────────────────────────────────────────

interface ProjectRow {
  id: string;
  name: string;
  local_path: string;
  github_owner: string;
  github_repo: string;
  base_branch: string;
  slack_channels: string;
  color: string;
  created_at: string;
  metadata: string | null;
}

function rowToProject(row: ProjectRow): Project {
  const metadata = safeJsonParse<ProjectMetadata | undefined>(row.metadata, undefined, `project.metadata ${row.id}`);
  const slackChannels = safeJsonParse<string[]>(row.slack_channels, [], `project.slackChannels ${row.id}`);
  return {
    id: row.id,
    name: row.name,
    localPath: row.local_path,
    githubOwner: row.github_owner,
    githubRepo: row.github_repo,
    baseBranch: row.base_branch,
    slackChannels: Array.isArray(slackChannels) ? slackChannels : [],
    color: row.color,
    createdAt: row.created_at,
    metadata,
  };
}

export async function loadAllProjects(): Promise<Project[]> {
  const d = await getDb();
  const rows = await d.select<ProjectRow[]>('SELECT * FROM projects ORDER BY created_at ASC');
  return rows.map(rowToProject);
}

export async function upsertProject(p: Project): Promise<void> {
  const d = await getDb();
  await d.execute(
    `INSERT INTO projects (id, name, local_path, github_owner, github_repo, base_branch, slack_channels, color, created_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       local_path = excluded.local_path,
       github_owner = excluded.github_owner,
       github_repo = excluded.github_repo,
       base_branch = excluded.base_branch,
       slack_channels = excluded.slack_channels,
       color = excluded.color,
       metadata = excluded.metadata`,
    [
      p.id,
      p.name,
      p.localPath,
      p.githubOwner,
      p.githubRepo,
      p.baseBranch,
      JSON.stringify(p.slackChannels || []),
      p.color,
      p.createdAt,
      p.metadata ? JSON.stringify(p.metadata) : null,
    ],
  );
}

export async function deleteProject(id: string): Promise<void> {
  const d = await getDb();
  await d.execute('DELETE FROM projects WHERE id = $1', [id]);
}

// ─────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────

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

function rowToTask(row: TaskRow, chatHistory: ChatMessage[], interrupts: InterruptEntry[]): Task {
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

// ─────────────────────────────────────────────────────────────
// Full-text search
// ─────────────────────────────────────────────────────────────

export interface SearchHit {
  kind: 'task' | 'message';
  taskId: string;
  messageId: string;
  title: string;    // task title (for 'task' kind) or empty (for 'message')
  snippet: string;  // highlighted snippet from FTS5 snippet() function
}

interface SearchRow {
  kind: string;
  task_id: string;
  message_id: string;
  title: string;
  snippet: string;
}

/**
 * Search across all tasks and chat messages using SQLite FTS5.
 * Returns up to `limit` hits, ordered by relevance.
 * Supports prefix matching (appends *) and basic FTS5 syntax.
 */
export async function searchAll(query: string, limit = 50): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const d = await getDb();

  // Escape quotes and wrap each word with prefix wildcard for incremental search
  const ftsQuery = trimmed
    .split(/\s+/)
    .map((w) => w.replace(/"/g, '""'))
    .map((w) => `"${w}"*`)
    .join(' ');

  try {
    const rows = await d.select<SearchRow[]>(
      `SELECT kind, task_id, message_id, title,
              snippet(search_index, 4, '<mark>', '</mark>', '...', 20) AS snippet
       FROM search_index
       WHERE search_index MATCH $1
       ORDER BY rank
       LIMIT $2`,
      [ftsQuery, limit],
    );
    return rows.map((r) => ({
      kind: r.kind as 'task' | 'message',
      taskId: r.task_id,
      messageId: r.message_id,
      title: r.title,
      snippet: r.snippet,
    }));
  } catch (err) {
    console.error('[cortx] FTS search failed:', err);
    return [];
  }
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

// ─────────────────────────────────────────────────────────────
// Migration from localStorage (one-time)
// ─────────────────────────────────────────────────────────────

const MIGRATION_KEY = 'cortx-migrated-to-sqlite';

export async function migrateFromLocalStorageIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    // Load from old localStorage keys
    const tasksRaw = localStorage.getItem('cortx-tasks');
    const projectsRaw = localStorage.getItem('cortx-projects');

    if (projectsRaw) {
      const data = JSON.parse(projectsRaw);
      const projects: Project[] = Array.isArray(data) ? data : data?.projects || [];
      for (const p of projects) {
        await upsertProject({
          id: p.id,
          name: p.name || '',
          localPath: p.localPath || '',
          githubOwner: p.githubOwner || '',
          githubRepo: p.githubRepo || '',
          baseBranch: p.baseBranch || 'main',
          slackChannels: Array.isArray(p.slackChannels) ? p.slackChannels : [],
          color: p.color || '#818cf8',
          createdAt: p.createdAt || new Date().toISOString(),
        });
      }
    }

    if (tasksRaw) {
      const data = JSON.parse(tasksRaw);
      const tasks: Task[] = data?.tasks || [];
      for (const t of tasks) {
        await upsertTask({
          id: t.id,
          title: t.title || '',
          status: t.status || 'waiting',
          layer: t.layer || 'focus',
          projectId: t.projectId,
          branchName: t.branchName || '',
          worktreePath: t.worktreePath || '',
          repoPath: t.repoPath || '',
          memo: t.memo || '',
          elapsedSeconds: t.elapsedSeconds || 0,
          chatHistory: Array.isArray(t.chatHistory) ? t.chatHistory : [],
          interrupts: Array.isArray(t.interrupts) ? t.interrupts : [],
          modelOverride: t.modelOverride,
          pipeline: t.pipeline,
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString(),
        });
      }
      if (data?.activeTaskId) {
        await setActiveTaskId(data.activeTaskId);
      }
    }

    localStorage.setItem(MIGRATION_KEY, '1');
  } catch (err) {
    console.error('[cortx] Migration from localStorage failed:', err);
  }
}
