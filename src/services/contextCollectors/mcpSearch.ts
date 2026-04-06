import { invoke } from '@tauri-apps/api/core';
import type { ContextItem, ContextSourceType } from '../../types/contextPack';

/**
 * Search GitHub using gh CLI directly (fast, no token/API usage).
 * Falls back to Claude CLI + MCP only for Notion/Slack.
 */
export interface McpCollectResult {
  items: ContextItem[];
  tokenUsage?: { input: number; output: number };
}

export async function collectViaMcp(
  serviceType: 'github' | 'notion' | 'slack',
  keywords: string[],
  cwd: string,
  extra?: { owner?: string; repo?: string; model?: string }
): Promise<McpCollectResult> {
  if (keywords.length === 0) return { items: [] };

  if (serviceType === 'github') {
    const items = await collectGitHubViaCli(keywords, extra?.owner, extra?.repo);
    return { items };
  }

  return collectViaClaudeCli(serviceType, keywords, extra?.model);
}

// ── GitHub: gh CLI (instant, no tokens) ──

async function runShell(command: string): Promise<{ success: boolean; output: string; error: string }> {
  return invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
    cwd: '/',
    command,
  });
}

async function collectGitHubViaCli(
  keywords: string[],
  owner?: string,
  repo?: string,
): Promise<ContextItem[]> {
  const items: ContextItem[] = [];
  const repoFlag = owner && repo ? `--repo ${owner}/${repo}` : '';

  for (const kw of keywords.slice(0, 3)) {
    // Search PRs and Issues in parallel
    const [prResult, issueResult] = await Promise.all([
      runShell(`gh search prs ${repoFlag} ${shellEscape(kw)} --limit 5 --json title,url,number,state,updatedAt,body 2>/dev/null`),
      runShell(`gh search issues ${repoFlag} ${shellEscape(kw)} --limit 5 --json title,url,number,state,updatedAt,body 2>/dev/null`),
    ]);

    for (const { result, type } of [
      { result: prResult, type: 'pr' },
      { result: issueResult, type: 'issue' },
    ]) {
      if (!result.output?.trim()) continue;
      try {
        const parsed = JSON.parse(result.output) as Array<Record<string, string>>;
        for (const item of parsed) {
          const url = item.url || '';
          if (items.some((i) => i.url === url)) continue;
          items.push({
            id: `gh-${type}-${item.number}`,
            sourceType: 'github',
            title: `${type === 'pr' ? 'PR' : 'Issue'} #${item.number}: ${item.title}`,
            url,
            summary: (item.body || '').slice(0, 200),
            timestamp: item.updatedAt || new Date().toISOString(),
            isNew: false,
            category: 'auto',
            metadata: { type, state: item.state || '', number: String(item.number) },
          });
        }
      } catch { /* parse error */ }
    }
  }

  return items;
}

// ── Notion/Slack: Claude CLI + MCP (uses API tokens but necessary) ──

async function collectViaClaudeCli(
  serviceType: 'notion' | 'slack',
  keywords: string[],
  model?: string,
): Promise<McpCollectResult> {
  const keywordList = keywords.slice(0, 2).join(', ');

  const prompts: Record<string, string> = {
    notion: `Search Notion for: ${keywordList}. For each result that is a project or epic page, also list its child pages (tasks, sub-items). Return ONLY a JSON array (no markdown): [{"title":"","url":"","id":"","parent":""}]. parent is the parent page title if it's a child item, empty string otherwise. Max 15 results. If none: []`,
    slack: `Search Slack for: ${keywordList}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":"","channel":""}]. Max 10 results. If none: []`,
  };

  const prompt = prompts[serviceType];
  if (!prompt) return { items: [] };

  try {
    const modelFlag = model ? `--model ${model}` : '';
    const cmd = `claude -p ${shellEscape(prompt)} ${modelFlag} --max-turns 10 --allowedTools 'mcp__notion__*' 'mcp__slack__*' Bash`;
    const result = await runShell(cmd);

    if (!result.output?.trim()) return { items: [] };

    const output = result.output.trim();
    const stderr = result.error || '';

    // Parse token usage from stderr (Claude CLI outputs usage info)
    let tokenUsage: { input: number; output: number } | undefined;
    // Estimate tokens from prompt/response length (~4 chars per token)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    tokenUsage = { input: inputTokens, output: outputTokens };

    // Try to parse actual usage from stderr if available
    const usageMatch = stderr.match(/input[:\s]+(\d+).*output[:\s]+(\d+)/i);
    if (usageMatch) {
      tokenUsage = { input: parseInt(usageMatch[1]), output: parseInt(usageMatch[2]) };
    }
    console.log('[cortx:mcp:' + serviceType + '] raw output:', JSON.stringify(output.slice(0, 500)));
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('[cortx:mcp:' + serviceType + '] no JSON array found in output');
      return { items: [], tokenUsage };
    }
    console.log('[cortx:mcp:' + serviceType + '] matched JSON:', jsonMatch[0].slice(0, 200));

    let parsed: Array<Record<string, string>>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      // Fallback: extract title/url manually
      const titles = [...output.matchAll(/"title"\s*:\s*"([^"]*?)"/g)].map(m => m[1]);
      const urls = [...output.matchAll(/"url"\s*:\s*"([^"]*?)"/g)].map(m => m[1]);
      parsed = titles.map((t, i) => ({ title: t, url: urls[i] || '' }));
    }
    if (!Array.isArray(parsed)) return { items: [], tokenUsage };

    const sourceTypeMap: Record<string, ContextSourceType> = { notion: 'notion', slack: 'slack' };

    const items = parsed.map((item, i) => ({
      id: `mcp-${serviceType}-${item.id || i}`,
      sourceType: sourceTypeMap[serviceType],
      title: item.parent ? `↳ ${item.title}` : (item.title || 'Untitled'),
      url: item.url || '',
      summary: item.parent ? `${item.parent}` : (item.summary || ''),
      timestamp: item.lastEdited || item.timestamp || new Date().toISOString(),
      isNew: false,
      category: 'auto' as const,
      metadata: {
        source: 'mcp',
        ...(item.parent ? { parent: item.parent } : {}),
        ...(item.channel ? { channel: item.channel } : {}),
      },
    }));
    return { items, tokenUsage };
  } catch (err) {
    console.warn(`[cortx] MCP search failed for ${serviceType}:`, err);
    return { items: [] };
  }
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
