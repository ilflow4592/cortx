import type { ContextItem, ContextSourceConfig } from '../../types/contextPack';

export async function collectSlack(
  config: ContextSourceConfig,
  keywords: string[],
  channelIds?: string[]
): Promise<ContextItem[]> {
  if (!config.token) return [];

  const items: ContextItem[] = [];
  const headers = {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };

  // 1. Collect from specific channels (project-linked)
  const channels = [...(channelIds || [])];
  if (config.slackChannel) channels.push(config.slackChannel);

  const uniqueChannels = [...new Set(channels.filter(Boolean))];

  for (const channelId of uniqueChannels) {
    try {
      const resp = await fetch(
        `https://slack.com/api/conversations.history?channel=${channelId}&limit=30`,
        { headers }
      );
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data.ok) continue;

      // Get channel name
      let channelName = channelId;
      try {
        const infoResp = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, { headers });
        const infoData = await infoResp.json();
        if (infoData.ok) channelName = infoData.channel?.name || channelId;
      } catch { /* use ID as fallback */ }

      for (const msg of data.messages || []) {
        const text = stripSlackFormatting(msg.text || '');
        if (!text.trim()) continue;

        items.push({
          id: `slack-ch-${channelId}-${msg.ts}`,
          sourceType: 'slack',
          title: truncate(text, 80),
          url: '',
          summary: `#${channelName} · ${formatTimestamp(msg.ts)}`,
          timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          isNew: false,
          category: 'auto',
          metadata: {
            channel: channelName,
            channelId,
            fullText: text,
            username: msg.user || '',
          },
        });
      }
    } catch { /* skip */ }
  }

  // 2. Keyword search (fallback)
  if (keywords.length > 0 && uniqueChannels.length === 0) {
    const query = keywords.join(' OR ');
    try {
      const resp = await fetch(
        `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&sort=timestamp&count=10`,
        { headers }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.ok) {
          for (const match of data.messages?.matches || []) {
            items.push({
              id: `slack-search-${match.ts}`,
              sourceType: 'slack',
              title: truncate(stripSlackFormatting(match.text), 80),
              url: match.permalink || '',
              summary: `#${match.channel?.name || 'unknown'} · ${match.username || 'unknown'}`,
              timestamp: new Date(parseFloat(match.ts) * 1000).toISOString(),
              isNew: false,
              category: 'auto',
              metadata: {
                channel: match.channel?.name || '',
                fullText: stripSlackFormatting(match.text),
              },
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  return items;
}

// AI relevance filter — called after collection
export async function filterByRelevance(
  items: ContextItem[],
  taskTitle: string,
  callAI: (prompt: string) => Promise<string>
): Promise<ContextItem[]> {
  if (items.length === 0) return [];

  const messageList = items.slice(0, 30).map((item, i) =>
    `[${i}] ${item.metadata?.fullText || item.title}`
  ).join('\n');

  const prompt = `You are filtering Slack messages for relevance to a developer's task.

Task: "${taskTitle}"

Messages:
${messageList}

Return ONLY the indices of messages relevant to this task, as comma-separated numbers (e.g. "0,3,7").
If none are relevant, return "none".
Be selective — only include truly relevant messages.`;

  try {
    const response = await callAI(prompt);
    const cleaned = response.trim().toLowerCase();

    if (cleaned === 'none' || cleaned === '') return [];

    const indices = cleaned.split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n >= 0 && n < items.length);

    return indices.map(i => items[i]);
  } catch {
    // If AI filtering fails, return all items
    return items;
  }
}

function stripSlackFormatting(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, '@user')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<([^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<([^>]+)>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function formatTimestamp(ts: string): string {
  const date = new Date(parseFloat(ts) * 1000);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
