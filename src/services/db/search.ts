import { getDb } from './connection';

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
