/**
 * @module contextCollectors/mcpSearch
 * MCP(Model Context Protocol) 기반 컨텍스트 수집기.
 * GitHub는 gh CLI로 직접 수집하고 (빠르고 토큰 불필요),
 * Notion/Slack은 Claude CLI + MCP 서버를 통해 수집한다 (AI가 MCP 도구를 호출).
 *
 * GitHub: gh CLI -> JSON 파싱 (토큰 소모 없음)
 * Notion/Slack: Claude CLI -> MCP 서버 -> JSON 파싱 (토큰 소모 있음)
 */

import { invoke } from '@tauri-apps/api/core';
import type { ContextItem, ContextSourceType } from '../../types/contextPack';

/** MCP 수집 결과 — 아이템 목록 + 토큰 사용량 (Claude CLI 경유 시) */
export interface McpCollectResult {
  items: ContextItem[];
  tokenUsage?: { input: number; output: number };
}

/**
 * 서비스 타입에 따라 적절한 수집 방법을 선택하여 컨텍스트를 수집한다.
 * @param serviceType - 수집 대상 서비스
 * @param keywords - 검색 키워드
 * @param cwd - 현재 작업 디렉토리 (미사용, 향후 확장용)
 * @param extra - GitHub owner/repo, Claude CLI 모델 등 추가 옵션
 */
export async function collectViaMcp(
  serviceType: 'github' | 'notion' | 'slack' | 'obsidian',
  keywords: string[],
  _cwd: string,
  extra?: { owner?: string; repo?: string; model?: string },
): Promise<McpCollectResult> {
  if (keywords.length === 0) return { items: [] };

  if (serviceType === 'github') {
    const items = await collectGitHubViaCli(keywords, extra?.owner, extra?.repo);
    return { items };
  }

  if (serviceType === 'obsidian') {
    return collectViaClaudeCli('obsidian', keywords, extra?.model);
  }

  return collectViaClaudeCli(serviceType, keywords, extra?.model);
}

// ── GitHub: gh CLI (즉시 실행, 토큰 소모 없음) ──

/** Tauri 백엔드를 통해 shell 명령어를 실행한다 */
async function runShell(command: string): Promise<{ success: boolean; output: string; error: string }> {
  return invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
    cwd: '/',
    command,
  });
}

/** gh CLI의 search 명령어로 PR과 Issue를 병렬 검색한다 (키워드당 최대 5개) */
async function collectGitHubViaCli(keywords: string[], owner?: string, repo?: string): Promise<ContextItem[]> {
  const items: ContextItem[] = [];
  const repoFlag = owner && repo ? `--repo ${owner}/${repo}` : '';

  for (const kw of keywords.slice(0, 3)) {
    // Search PRs and Issues in parallel
    const [prResult, issueResult] = await Promise.all([
      runShell(
        `gh search prs ${repoFlag} ${shellEscape(kw)} --limit 5 --json title,url,number,state,updatedAt,body 2>/dev/null`,
      ),
      runShell(
        `gh search issues ${repoFlag} ${shellEscape(kw)} --limit 5 --json title,url,number,state,updatedAt,body 2>/dev/null`,
      ),
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
      } catch {
        /* parse error */
      }
    }
  }

  return items;
}

// ── Notion/Slack: Claude CLI + MCP (AI가 MCP 도구를 호출하여 검색) ──

/**
 * Claude CLI를 통해 Notion/Slack MCP 서버에 검색을 요청한다.
 * Claude가 MCP 도구를 호출하고, 결과를 JSON 배열로 반환하도록 프롬프트한다.
 * 토큰 사용량을 stderr에서 추출하여 함께 반환.
 */
async function collectViaClaudeCli(
  serviceType: 'notion' | 'slack' | 'obsidian',
  keywords: string[],
  model?: string,
): Promise<McpCollectResult> {
  const keywordList = keywords.slice(0, 2).join(', ');

  const prompts: Record<string, string> = {
    notion: `Search Notion for: ${keywordList}. For each result that is a project or epic page, also list its child pages (tasks, sub-items). Return ONLY a JSON array (no markdown): [{"title":"","url":"","id":"","parent":""}]. parent is the parent page title if it's a child item, empty string otherwise. Max 15 results. If none: []`,
    slack: `Search Slack for: ${keywordList}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":"","channel":""}]. Max 10 results. If none: []`,
    obsidian: `Search Obsidian vault for notes related to: ${keywordList}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":""}]. url should be the file path. summary is the first 200 chars of the note. Max 10 results. If none: []`,
  };

  const allowedToolsMap: Record<string, string> = {
    notion: "'mcp__notion__*'",
    slack: "'mcp__slack__*'",
    obsidian: "'mcp__obsidian__*'",
  };

  const prompt = prompts[serviceType];
  if (!prompt) return { items: [] };

  try {
    const modelFlag = model ? `--model ${model}` : '';
    const allowedTools = allowedToolsMap[serviceType] || `'mcp__${serviceType}__*'`;
    const cmd = `claude -p ${shellEscape(prompt)} ${modelFlag} --max-turns 10 --allowedTools ${allowedTools} Bash`;
    const result = await runShell(cmd);

    if (!result.output?.trim()) return { items: [] };

    const output = result.output.trim();
    const stderr = result.error || '';

    // 토큰 사용량 추정 (정확한 값이 없으면 ~4chars/token으로 추정)
    let tokenUsage: { input: number; output: number } | undefined;
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    tokenUsage = { input: inputTokens, output: outputTokens };

    // stderr에서 실제 사용량을 파싱할 수 있으면 추정값을 덮어씀
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
      const titles = [...output.matchAll(/"title"\s*:\s*"([^"]*?)"/g)].map((m) => m[1]);
      const urls = [...output.matchAll(/"url"\s*:\s*"([^"]*?)"/g)].map((m) => m[1]);
      parsed = titles.map((t, i) => ({ title: t, url: urls[i] || '' }));
    }
    if (!Array.isArray(parsed)) return { items: [], tokenUsage };

    const sourceTypeMap: Record<string, ContextSourceType> = { notion: 'notion', slack: 'slack', obsidian: 'pin' };

    const items = parsed.map((item, i) => ({
      id: `mcp-${serviceType}-${item.id || i}`,
      sourceType: sourceTypeMap[serviceType],
      title: item.parent ? `↳ ${item.title}` : item.title || 'Untitled',
      url: item.url || '',
      summary: item.parent ? `${item.parent}` : item.summary || '',
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

/** Shell injection 방지를 위한 single-quote 이스케이프 */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
