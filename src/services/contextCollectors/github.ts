import { invoke } from '@tauri-apps/api/core';
import type { ContextItem, ContextSourceConfig } from '../../types/contextPack';

export async function collectGitHub(
  config: ContextSourceConfig,
  keywords: string[],
  branchName: string
): Promise<ContextItem[]> {
  console.log('[cortx:github] config:', { owner: config.owner, repo: config.repo, token: config.token ? 'yes' : 'no', keywords, branchName });
  if (!config.owner || !config.repo) {
    console.log('[cortx:github] skipped: no owner/repo');
    return [];
  }

  // If token provided, use direct API. Otherwise try gh CLI.
  if (config.token) {
    console.log('[cortx:github] using direct API');
    return collectWithToken(config, keywords, branchName);
  }
  console.log('[cortx:github] using gh CLI fallback');
  return collectWithGhCli(config.owner, config.repo, keywords, branchName);
}

// ── Direct GitHub API (with token) ──

async function collectWithToken(
  config: ContextSourceConfig,
  keywords: string[],
  branchName: string
): Promise<ContextItem[]> {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
  };

  const items: ContextItem[] = [];

  // 1. Search issues/PRs by keywords + branch
  const queries = [
    ...keywords.map((k) => `${k} repo:${config.owner}/${config.repo}`),
    branchName ? `${branchName} repo:${config.owner}/${config.repo}` : '',
  ].filter(Boolean);

  for (const q of queries.slice(0, 3)) {
    try {
      const resp = await fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=5`,
        { headers }
      );
      if (!resp.ok) continue;
      const data = await resp.json();

      for (const issue of data.items || []) {
        if (items.some((i) => i.url === issue.html_url)) continue;
        items.push({
          id: `gh-issue-${issue.id}`,
          sourceType: 'github',
          title: `${issue.pull_request ? 'PR' : 'Issue'} #${issue.number}: ${issue.title}`,
          url: issue.html_url,
          summary: issue.body?.slice(0, 200) || '',
          timestamp: issue.updated_at,
          isNew: false,
          category: 'auto',
          metadata: {
            state: issue.state,
            number: String(issue.number),
            comments: String(issue.comments),
            type: issue.pull_request ? 'pr' : 'issue',
          },
        });
      }
    } catch {
      // skip failed queries
    }
  }

  // 2. Recent commits on branch
  if (branchName) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/commits?sha=${encodeURIComponent(branchName)}&per_page=5`,
        { headers }
      );
      if (resp.ok) {
        const commits = await resp.json();
        for (const commit of commits) {
          items.push({
            id: `gh-commit-${commit.sha.slice(0, 7)}`,
            sourceType: 'github',
            title: `Commit: ${commit.commit.message.split('\n')[0]}`,
            url: commit.html_url,
            summary: `by ${commit.commit.author?.name || 'unknown'}`,
            timestamp: commit.commit.author?.date || '',
            isNew: false,
            category: 'linked',
            metadata: { sha: commit.sha.slice(0, 7) },
          });
        }
      }
    } catch {
      // skip
    }
  }

  // 3. PR reviews/comments
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/pulls?state=open&sort=updated&per_page=10`,
      { headers }
    );
    if (resp.ok) {
      const prs = await resp.json();
      const relatedPrs = prs.filter(
        (pr: { head: { ref: string }; title: string }) =>
          pr.head.ref === branchName ||
          keywords.some((k) => pr.title.toLowerCase().includes(k.toLowerCase()))
      );
      for (const pr of relatedPrs.slice(0, 3)) {
        const commentsResp = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/pulls/${pr.number}/comments?per_page=5&sort=updated&direction=desc`,
          { headers }
        );
        if (commentsResp.ok) {
          const comments = await commentsResp.json();
          for (const comment of comments) {
            items.push({
              id: `gh-review-${comment.id}`,
              sourceType: 'github',
              title: `Review on PR #${pr.number}`,
              url: comment.html_url,
              summary: comment.body?.slice(0, 150) || '',
              timestamp: comment.updated_at,
              isNew: false,
              category: 'linked',
              metadata: { prNumber: String(pr.number) },
            });
          }
        }
      }
    }
  } catch {
    // skip
  }

  return items;
}

// ── gh CLI fallback (no token needed) ──

async function ghApi(endpoint: string): Promise<unknown | null> {
  try {
    const escaped = endpoint.replace(/'/g, "'\\''");
    const cmd = `gh api '${escaped}' 2>/dev/null`;
    console.log('[cortx:ghApi] cmd:', cmd);
    const result = await invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
      cwd: '/',
      command: cmd,
    });
    console.log('[cortx:ghApi] success:', result.success, 'output length:', result.output?.length, 'error:', result.error?.slice(0, 100));
    if (result.success && result.output.trim()) {
      return JSON.parse(result.output);
    }
  } catch (err) {
    console.warn('[cortx:ghApi] failed:', err);
  }
  return null;
}

async function collectWithGhCli(
  owner: string,
  repo: string,
  keywords: string[],
  branchName: string
): Promise<ContextItem[]> {
  const items: ContextItem[] = [];

  // 1. Search issues/PRs
  const queries = [
    ...keywords.map((k) => `${k} repo:${owner}/${repo}`),
    branchName ? `${branchName} repo:${owner}/${repo}` : '',
  ].filter(Boolean);

  for (const q of queries.slice(0, 3)) {
    const data = await ghApi(`search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=5`) as { items?: Array<Record<string, unknown>> } | null;
    if (!data?.items) continue;
    for (const issue of data.items) {
      const htmlUrl = issue.html_url as string;
      if (items.some((i) => i.url === htmlUrl)) continue;
      items.push({
        id: `gh-issue-${issue.id}`,
        sourceType: 'github',
        title: `${issue.pull_request ? 'PR' : 'Issue'} #${issue.number}: ${issue.title}`,
        url: htmlUrl,
        summary: ((issue.body as string) || '').slice(0, 200),
        timestamp: issue.updated_at as string,
        isNew: false,
        category: 'auto',
        metadata: {
          state: issue.state as string,
          number: String(issue.number),
          comments: String(issue.comments),
          type: issue.pull_request ? 'pr' : 'issue',
        },
      });
    }
  }

  // 2. Recent commits on branch
  if (branchName) {
    const commits = await ghApi(`repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branchName)}&per_page=5`) as Array<Record<string, unknown>> | null;
    if (Array.isArray(commits)) {
      for (const c of commits) {
        const commit = c.commit as Record<string, unknown>;
        const author = commit.author as Record<string, string>;
        items.push({
          id: `gh-commit-${(c.sha as string).slice(0, 7)}`,
          sourceType: 'github',
          title: `Commit: ${(commit.message as string).split('\n')[0]}`,
          url: c.html_url as string,
          summary: `by ${author?.name || 'unknown'}`,
          timestamp: author?.date || '',
          isNew: false,
          category: 'linked',
          metadata: { sha: (c.sha as string).slice(0, 7) },
        });
      }
    }
  }

  // 3. Open PRs related to branch/keywords
  const prs = await ghApi(`repos/${owner}/${repo}/pulls?state=open&sort=updated&per_page=10`) as Array<Record<string, unknown>> | null;
  if (Array.isArray(prs)) {
    const relatedPrs = prs.filter((pr) => {
      const head = pr.head as Record<string, string>;
      return head.ref === branchName ||
        keywords.some((k) => (pr.title as string).toLowerCase().includes(k.toLowerCase()));
    });
    for (const pr of relatedPrs.slice(0, 3)) {
      const comments = await ghApi(`repos/${owner}/${repo}/pulls/${pr.number}/comments?per_page=5&sort=updated&direction=desc`) as Array<Record<string, unknown>> | null;
      if (!Array.isArray(comments)) continue;
      for (const comment of comments) {
        items.push({
          id: `gh-review-${comment.id}`,
          sourceType: 'github',
          title: `Review on PR #${pr.number}`,
          url: comment.html_url as string,
          summary: ((comment.body as string) || '').slice(0, 150),
          timestamp: comment.updated_at as string,
          isNew: false,
          category: 'linked',
          metadata: { prNumber: String(pr.number) },
        });
      }
    }
  }

  return items;
}
