import { invoke } from '@tauri-apps/api/core';
import type { ContextItem, ContextSourceConfig } from '../../types/contextPack';

export async function collectNotion(
  config: ContextSourceConfig,
  keywords: string[],
  taskTitle?: string
): Promise<ContextItem[]> {
  if (!config.token) return [];

  const items: ContextItem[] = [];
  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };

  // 1. Search by keywords
  for (const keyword of keywords.slice(0, 3)) {
    try {
      const resp = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: keyword,
          sort: { direction: 'descending', timestamp: 'last_edited_time' },
          page_size: 5,
        }),
      });

      if (!resp.ok) continue;
      const data = await resp.json();

      for (const result of data.results || []) {
        const id = `notion-${result.id}`;
        if (items.some((i) => i.id === id)) continue;

        const title = extractNotionTitle(result);
        const url = result.url || '';
        const lastEdited = result.last_edited_time || '';

        items.push({
          id,
          sourceType: 'notion',
          title: title || 'Untitled',
          url,
          summary: `${result.object === 'database' ? 'Database' : 'Page'} · edited ${formatRelativeTime(lastEdited)}`,
          timestamp: lastEdited,
          isNew: false,
          category: 'auto',
          metadata: {
            objectType: result.object,
            notionId: result.id,
          },
        });
      }
    } catch {
      // skip
    }
  }

  // 2. If database ID is configured, query it
  if (config.notionDatabaseId) {
    try {
      const resp = await fetch(
        `https://api.notion.com/v1/databases/${config.notionDatabaseId}/query`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
            page_size: 10,
          }),
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        for (const page of data.results || []) {
          const title = extractNotionTitle(page);
          const matchesKeyword = keywords.some(
            (k) => title.toLowerCase().includes(k.toLowerCase())
          );
          if (!matchesKeyword) continue;

          const id = `notion-db-${page.id}`;
          if (items.some((i) => i.id === id)) continue;

          items.push({
            id,
            sourceType: 'notion',
            title: title || 'Untitled',
            url: page.url || '',
            summary: `From database · edited ${formatRelativeTime(page.last_edited_time)}`,
            timestamp: page.last_edited_time || '',
            isNew: false,
            category: 'linked',
            metadata: { notionId: page.id },
          });
        }
      }
    } catch {
      // skip
    }
  }

  // AI relevance filter — remove unrelated results before fetching full content
  if (taskTitle && items.length > 2) {
    const callAI = async (prompt: string): Promise<string> => {
      try {
        const tmpFile = `/tmp/cortx-notion-filter-${Date.now()}.txt`;
        const b64 = btoa(unescape(encodeURIComponent(prompt)));
        await invoke<{ success: boolean }>('run_shell_command', {
          cwd: '/',
          command: `echo '${b64}' | base64 -d > '${tmpFile}'`,
        });
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: `cat '${tmpFile}' | claude -p - --model claude-haiku-4-5-20251001 2>/dev/null; rm -f '${tmpFile}'`,
        });
        return result.success ? result.output.trim() : '';
      } catch { return ''; }
    };

    const filtered = await filterNotionByRelevance(items, taskTitle, callAI);
    // Fetch fullText only for filtered items
    for (const item of filtered) {
      if (!item.metadata?.fullText && item.metadata?.notionId) {
        item.metadata.fullText = await fetchNotionPageContent(item.metadata.notionId, headers);
      }
    }
    return filtered;
  }

  return items;
}

async function fetchNotionPageContent(pageId: string, headers: Record<string, string>): Promise<string> {
  try {
    const resp = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
      headers,
    });
    if (!resp.ok) return '';
    const data = await resp.json();

    const texts: string[] = [];
    for (const block of data.results || []) {
      const richTexts = block[block.type]?.rich_text as Array<{ plain_text: string }> | undefined;
      if (richTexts) {
        const line = richTexts.map((t) => t.plain_text).join('');
        if (line) texts.push(line);
      }
      // Handle child_page, child_database titles
      if (block.type === 'child_page') {
        texts.push(`[Page] ${block.child_page?.title || ''}`);
      }
      if (block.type === 'child_database') {
        texts.push(`[Database] ${block.child_database?.title || ''}`);
      }
    }
    return texts.join('\n');
  } catch {
    return '';
  }
}

// AI relevance filter — remove unrelated results
export async function filterNotionByRelevance(
  items: ContextItem[],
  taskTitle: string,
  callAI: (prompt: string) => Promise<string>
): Promise<ContextItem[]> {
  if (items.length <= 2) return items;

  const itemList = items.map((item, i) =>
    `[${i}] ${item.title}`
  ).join('\n');

  const prompt = `You are filtering Notion search results for relevance to a developer's task.

Task: "${taskTitle}"

Search results:
${itemList}

Return ONLY the indices of items directly relevant to this task, as comma-separated numbers (e.g. "0,3").
If none are relevant, return "none".
Be very selective — only include items that are clearly about this specific task or directly needed to implement it.`;

  try {
    const response = await callAI(prompt);
    const cleaned = response.trim().toLowerCase();

    if (cleaned === 'none' || cleaned === '') return [];

    const indices = cleaned.split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 0 && n < items.length);

    return indices.length > 0 ? indices.map(i => items[i]) : items;
  } catch {
    return items;
  }
}

function extractNotionTitle(obj: Record<string, unknown>): string {
  const props = obj.properties as Record<string, { title?: { plain_text: string }[]; type?: string }> | undefined;
  if (!props) return '';

  for (const val of Object.values(props)) {
    if (val?.type === 'title' && val.title?.[0]?.plain_text) {
      return val.title[0].plain_text;
    }
  }
  return '';
}

function formatRelativeTime(iso: string): string {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
