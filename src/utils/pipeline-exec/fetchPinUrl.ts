import { runShell } from './runShell';

/**
 * Fetch content from a pinned HTTP URL using the best available method:
 * - GitHub URLs → gh CLI (fast, no token cost)
 * - Notion URLs → Claude CLI + MCP notion-fetch (accurate, uses tokens)
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
    if (url.includes('notion.so') || url.includes('notion.site')) {
      const prompt = `Fetch the full content of this Notion page and return it as plain text. No JSON wrapping, no markdown code blocks — just the page content: ${url}`;
      const escaped = prompt.replace(/'/g, "'\\''");
      const result = await runShell(
        `claude -p '${escaped}' --max-turns 3 --allowedTools 'mcp__notion__*' --model claude-haiku-4-5-20251001 2>/dev/null`,
      );
      if (result.success && result.output.trim()) return result.output.trim();
    }

    // Slack: use Claude CLI + MCP
    if (url.includes('slack.com')) {
      const prompt = `Fetch the content of this Slack message/thread and return it as plain text: ${url}`;
      const escaped = prompt.replace(/'/g, "'\\''");
      const result = await runShell(
        `claude -p '${escaped}' --max-turns 3 --allowedTools 'mcp__slack__*' --model claude-haiku-4-5-20251001 2>/dev/null`,
      );
      if (result.success && result.output.trim()) return result.output.trim();
    }

    // Fallback: curl for public URLs
    const result = await runShell(`curl -sL --max-time 15 "${url}" | head -c 50000`);
    if (result.success && result.output.trim()) return result.output.trim();
  } catch {
    /* fetch failed */
  }
  return null;
}
