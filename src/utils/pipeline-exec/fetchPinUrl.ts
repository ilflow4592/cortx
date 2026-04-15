import { runShell } from './runShell';

const MCP_FETCH_TIMEOUT_SEC = 60;
const MCP_FETCH_MAX_TURNS = 6;

/** OAuth-기반 MCP를 Claude CLI 경유로 호출. 타임아웃·권한·턴 수 통일. */
async function runMcpFetch(opts: { url: string; promptHint: string; toolFilter: string }): Promise<string | null> {
  const prompt = `${opts.promptHint}\n\nURL: ${opts.url}`;
  const escaped = prompt.replace(/'/g, "'\\''");
  // stderr는 임시 로그 파일로 — 실패 시 디버그 가능. /tmp는 OS가 주기적으로 정리.
  const errPath = `/tmp/cortx-mcp-fetch-${Date.now().toString(36)}.err`;
  const cmd = [
    `timeout ${MCP_FETCH_TIMEOUT_SEC}`,
    'claude',
    '-p',
    `'${escaped}'`,
    '--max-turns',
    String(MCP_FETCH_MAX_TURNS),
    '--allowedTools',
    `'${opts.toolFilter}'`,
    '--permission-mode',
    'bypassPermissions',
    '--model',
    'claude-haiku-4-5-20251001',
    `2>${errPath}`,
  ].join(' ');
  const result = await runShell(cmd);
  if (result.success && result.output.trim()) return result.output.trim();
  return null;
}

/**
 * Fetch content from a pinned HTTP URL using the best available method:
 * - GitHub URLs → gh CLI (fast, no token cost)
 * - Notion URLs → Claude CLI + MCP notion-fetch (OAuth via Claude CLI)
 * - Slack URLs → Claude CLI + MCP slack tools
 * - Other URLs → curl (fast, public only)
 */
export async function fetchPinUrl(url: string): Promise<string | null> {
  try {
    // GitHub: issues, PRs, file contents
    const ghIssue = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (ghIssue) {
      const [, owner, repo, num] = ghIssue;
      const result = await runShell(
        `gh issue view ${num} -R ${owner}/${repo} --json title,body,comments --jq '"# " + .title + "\\n\\n" + .body + "\\n\\n" + ([.comments[] | "---\\n" + .body] | join("\\n"))'`,
      );
      if (result.success && result.output.trim()) return result.output.trim();
    }

    const ghPr = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (ghPr) {
      const [, owner, repo, num] = ghPr;
      const result = await runShell(
        `gh pr view ${num} -R ${owner}/${repo} --json title,body,comments --jq '"# " + .title + "\\n\\n" + .body + "\\n\\n" + ([.comments[] | "---\\n" + .body] | join("\\n"))'`,
      );
      if (result.success && result.output.trim()) return result.output.trim();
    }

    // Notion: use Claude CLI + MCP (AI fetches via notion-fetch tool)
    // OAuth Notion MCP에 OAuth 토큰이 Claude CLI 내부에 있어 cortx가 직접 API 호출 불가 →
    // Claude subprocess 경로 유지. 대신 플래그/프롬프트/타임아웃 강화로 실패율·hang 줄임.
    if (url.includes('notion.so') || url.includes('notion.site')) {
      const result = await runMcpFetch({
        url,
        promptHint:
          'Call mcp__notion__notion-fetch (or notion-search → notion-fetch) for this URL and return ONLY the page content as plain text. No JSON wrapping, no markdown code fences, no preamble.',
        toolFilter: 'mcp__notion__*',
      });
      if (result) return result;
    }

    // Slack: use Claude CLI + MCP
    if (url.includes('slack.com')) {
      const result = await runMcpFetch({
        url,
        promptHint:
          'Call mcp__slack__* tools to fetch this Slack message/thread and return ONLY the content as plain text. No JSON wrapping, no markdown code fences.',
        toolFilter: 'mcp__slack__*',
      });
      if (result) return result;
    }

    // Fallback: curl for public URLs
    const result = await runShell(`curl -sL --max-time 15 "${url}" | head -c 50000`);
    if (result.success && result.output.trim()) return result.output.trim();
  } catch {
    /* fetch failed */
  }
  return null;
}
