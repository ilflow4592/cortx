/**
 * @module contextCollectors/github/cli
 * gh CLI fallback (토큰 없을 때 — gh CLI의 인증 정보 사용).
 * collectWithToken과 동일한 구조로 issues/PRs/commits/review comments를 수집.
 */

import type { ContextItem } from '../../../types/contextPack';
import { ghApi } from './api';

/** gh CLI를 사용하여 GitHub 컨텍스트 수집 (collectWithToken과 동일한 구조) */
export async function collectWithGhCli(
  owner: string,
  repo: string,
  keywords: string[],
  branchName: string,
): Promise<ContextItem[]> {
  const items: ContextItem[] = [];

  // 1. Search issues/PRs
  const queries = [
    ...keywords.map((k) => `${k} repo:${owner}/${repo}`),
    branchName ? `${branchName} repo:${owner}/${repo}` : '',
  ].filter(Boolean);

  for (const q of queries.slice(0, 3)) {
    const data = (await ghApi(`search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=5`)) as {
      items?: Array<Record<string, unknown>>;
    } | null;
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
    const commits = (await ghApi(
      `repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branchName)}&per_page=5`,
    )) as Array<Record<string, unknown>> | null;
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
  const prs = (await ghApi(`repos/${owner}/${repo}/pulls?state=open&sort=updated&per_page=10`)) as Array<
    Record<string, unknown>
  > | null;
  if (Array.isArray(prs)) {
    const relatedPrs = prs.filter((pr) => {
      const head = pr.head as Record<string, string>;
      return (
        head.ref === branchName || keywords.some((k) => (pr.title as string).toLowerCase().includes(k.toLowerCase()))
      );
    });
    for (const pr of relatedPrs.slice(0, 3)) {
      const comments = (await ghApi(
        `repos/${owner}/${repo}/pulls/${pr.number}/comments?per_page=5&sort=updated&direction=desc`,
      )) as Array<Record<string, unknown>> | null;
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
