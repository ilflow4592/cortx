/**
 * @module contextCollectors/mcpSearch
 * MCP(Model Context Protocol) 기반 컨텍스트 수집기.
 * GitHub는 gh CLI로 직접 수집하고 (빠르고 토큰 불필요),
 * Notion/Slack은 Claude CLI + MCP 서버를 통해 수집한다 (AI가 MCP 도구를 호출).
 *
 * GitHub: gh CLI -> JSON 파싱 (토큰 소모 없음)
 * Notion/Slack: Claude CLI -> MCP 서버 -> JSON 파싱 (토큰 소모 있음)
 */

import type { ContextItem } from '../../types/contextPack';
import { SEARCH_MCP_REGISTRY } from '../../config/searchResources';
import { parseClaudeOutput, parseTokenUsage, toContextItems } from './mcpSearch/parse';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

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
  serviceType: string,
  keywords: string[],
  _cwd: string,
  extra?: { owner?: string; repo?: string; model?: string },
): Promise<McpCollectResult> {
  if (keywords.length === 0) return { items: [] };

  if (serviceType === 'github') {
    const items = await collectGitHubViaCli(keywords, extra?.owner, extra?.repo);
    return { items };
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
async function collectViaClaudeCli(serviceType: string, keywords: string[], model?: string): Promise<McpCollectResult> {
  const keywordList = keywords.slice(0, 2).join(', ');
  const entry = SEARCH_MCP_REGISTRY[serviceType];

  const prompt = entry?.prompt?.replace('{keywords}', keywordList);
  if (!prompt) return { items: [] };
  const allowedTools = entry?.allowedTools || `'mcp__${serviceType}__*'`;

  try {
    const modelFlag = model ? `--model ${model}` : '';
    const cmd = `claude -p ${shellEscape(prompt)} ${modelFlag} --max-turns 10 --allowedTools ${allowedTools} Bash`;
    const result = await runShell(cmd);

    if (!result.output?.trim()) return { items: [] };

    const output = result.output.trim();
    const stderr = result.error || '';

    // 토큰 사용량 추정 (정확한 값이 없으면 ~4chars/token으로 추정)
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    let tokenUsage: { input: number; output: number } | undefined = {
      input: inputTokens,
      output: outputTokens,
    };

    // stderr에서 실제 사용량을 파싱할 수 있으면 추정값을 덮어씀
    const actualUsage = parseTokenUsage(stderr);
    if (actualUsage) tokenUsage = actualUsage;

    const parsed = parseClaudeOutput(output);
    if (!parsed) {
      console.warn('[cortx:mcp:' + serviceType + '] no JSON array found in output');
      return { items: [], tokenUsage };
    }

    const items = toContextItems(parsed, serviceType);
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
