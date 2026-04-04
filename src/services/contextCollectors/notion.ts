import type { ContextItem, ContextSourceConfig } from '../../types/contextPack';

export async function collectNotion(
  config: ContextSourceConfig,
  keywords: string[]
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

  return items;
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
