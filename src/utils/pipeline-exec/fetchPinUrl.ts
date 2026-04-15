import { runShell } from './runShell';

const MCP_FETCH_TIMEOUT_SEC = 60;
const MCP_FETCH_MAX_TURNS = 6;

/** OAuth-기반 MCP를 Claude CLI 경유로 호출. 타임아웃·권한·턴 수 통일. */
async function runMcpFetch(opts: { url: string; promptHint: string; toolFilter: string }): Promise<string | null> {
  const prompt = `${opts.promptHint}\n\nURL: ${opts.url}`;
  const escaped = prompt.replace(/'/g, "'\\''");
  // stderr는 임시 로그 파일로 — 실패 시 디버그 가능. /tmp는 OS가 주기적으로 정리.
  const errPath = `/tmp/cortx-mcp-fetch-${Date.now().toString(36)}.err`;
  // 콜드 스타트 단축 플래그 (Notion client.ts와 동일 기준)
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
    '--disable-slash-commands',
    '--no-session-persistence',
    '--exclude-dynamic-system-prompt-sections',
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

    // Notion: 통합 모듈 위임 (contextSources/notion). 이전엔 fetchPinUrl 안에
    // Notion MCP 호출 로직이 인라인돼 있었으나, 키워드 검색 경로(mcpSearch)와
    // 동일 호출을 중복 구현하던 것을 단일 모듈로 통합.
    // 인증 필요한 도메인이라 실패 시 curl 폴백은 의미 없음 → 명시적으로 null 반환.
    if (url.includes('notion.so') || url.includes('notion.site')) {
      const { fetchNotionFullText } = await import('../../services/contextSources/notion/fetch');
      return await fetchNotionFullText(url);
    }

    // Slack: use Claude CLI + MCP. 인증 필요 → curl 폴백 의미 없음.
    if (url.includes('slack.com')) {
      return await runMcpFetch({
        url,
        promptHint:
          'Call mcp__slack__* tools to fetch this Slack message/thread and return ONLY the content as plain text. No JSON wrapping, no markdown code fences.',
        toolFilter: 'mcp__slack__*',
      });
    }

    // Fallback: curl for public URLs
    const result = await runShell(`curl -sL --max-time 15 "${url}" | head -c 50000`);
    if (result.success && result.output.trim()) return result.output.trim();
  } catch {
    /* fetch failed */
  }
  return null;
}
