/**
 * @module contextCollectors/github/direct
 * Direct GitHub REST API 호출 (토큰 있을 때) — issues/PRs/commits/review comments 수집.
 */

import type { ContextItem, ContextSourceConfig } from '../../../types/contextPack';

/** GitHub REST API를 직접 호출하여 issues, commits, PR reviews를 수집 */
export async function collectWithToken(
  config: ContextSourceConfig,
  keywords: string[],
  branchName: string,
): Promise<ContextItem[]> {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
  };

  const items: ContextItem[] = [];

  // 1. 키워드 + 브랜치명으로 issues/PRs 검색 (최대 3개 쿼리)
  const queries = [
    ...keywords.map((k) => `${k} repo:${config.owner}/${config.repo}`),
    branchName ? `${branchName} repo:${config.owner}/${config.repo}` : '',
  ].filter(Boolean);

  for (const q of queries.slice(0, 3)) {
    try {
      const resp = await fetch(
        `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=updated&per_page=5`,
        { headers },
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

  // 2. 현재 브랜치의 최근 커밋 5개 수집
  if (branchName) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/commits?sha=${encodeURIComponent(branchName)}&per_page=5`,
        { headers },
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

  // 3. 현재 브랜치/키워드와 관련된 오픈 PR의 리뷰 코멘트 수집
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/pulls?state=open&sort=updated&per_page=10`,
      { headers },
    );
    if (resp.ok) {
      const prs = await resp.json();
      // 브랜치명 또는 키워드가 제목에 포함된 PR만 필터링
      const relatedPrs = prs.filter(
        (pr: { head: { ref: string }; title: string }) =>
          pr.head.ref === branchName || keywords.some((k) => pr.title.toLowerCase().includes(k.toLowerCase())),
      );
      for (const pr of relatedPrs.slice(0, 3)) {
        const commentsResp = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/pulls/${pr.number}/comments?per_page=5&sort=updated&direction=desc`,
          { headers },
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
