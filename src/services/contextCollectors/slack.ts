import type { ContextItem, ContextSourceConfig } from '../../types/contextPack';

export async function collectSlack(
  config: ContextSourceConfig,
  keywords: string[]
): Promise<ContextItem[]> {
  if (!config.token) return [];

  const items: ContextItem[] = [];

  // Search messages by keywords
  const query = keywords.join(' OR ');
  if (!query) return [];

  try {
    const resp = await fetch(
      `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&sort=timestamp&count=10`,
      {
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!resp.ok) return [];
    const data = await resp.json();

    if (!data.ok) {
      console.warn('Slack API error:', data.error);
      return [];
    }

    for (const match of data.messages?.matches || []) {
      items.push({
        id: `slack-${match.ts}-${match.channel?.id || ''}`,
        sourceType: 'slack',
        title: truncate(stripSlackFormatting(match.text), 80),
        url: match.permalink || '',
        summary: `#${match.channel?.name || 'unknown'} · ${match.username || 'unknown'}`,
        timestamp: new Date(parseFloat(match.ts) * 1000).toISOString(),
        isNew: false,
        category: 'auto',
        metadata: {
          channel: match.channel?.name || '',
          username: match.username || '',
        },
      });
    }
  } catch {
    // skip
  }

  // If specific channel is configured, also fetch recent messages
  if (config.slackChannel) {
    try {
      const resp = await fetch(
        `https://slack.com/api/conversations.history?channel=${config.slackChannel}&limit=20`,
        {
          headers: {
            Authorization: `Bearer ${config.token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.ok) {
          for (const msg of data.messages || []) {
            // Filter by keywords
            const text = msg.text?.toLowerCase() || '';
            const matches = keywords.some((k) => text.includes(k.toLowerCase()));
            if (!matches) continue;

            const id = `slack-ch-${msg.ts}`;
            if (items.some((i) => i.id === id)) continue;

            items.push({
              id,
              sourceType: 'slack',
              title: truncate(stripSlackFormatting(msg.text), 80),
              url: '',
              summary: `Channel message`,
              timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
              isNew: false,
              category: 'auto',
              metadata: { channel: config.slackChannel },
            });
          }
        }
      }
    } catch {
      // skip
    }
  }

  return items;
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
