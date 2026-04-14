/**
 * @module contextCollectors/github
 * GitHub 컨텍스트 수집기.
 * Issues, PRs, commits, review comments를 키워드/브랜치 기반으로 수집한다.
 * GitHub API 토큰이 있으면 REST API를 직접 호출하고,
 * 없으면 gh CLI를 통해 인증된 요청을 보낸다 (fallback).
 */

import type { ContextItem, ContextSourceConfig } from '../../types/contextPack';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

/**
 * GitHub에서 태스크 관련 컨텍스트를 수집한다.
 * @param config - GitHub owner/repo 및 API 토큰 설정
 * @param keywords - 검색 키워드 (태스크에서 추출)
 * @param branchName - 현재 작업 브랜치 (관련 PR/commit 검색에 사용)
 * @returns 수집된 GitHub 아이템 (issues, PRs, commits, review comments)
 */
export async function collectGitHub(
  config: ContextSourceConfig,
  keywords: string[],
  branchName: string,
): Promise<ContextItem[]> {
  console.log('[cortx:github] config:', {
    owner: config.owner,
    repo: config.repo,
    token: config.token ? 'yes' : 'no',
    keywords,
    branchName,
  });
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

// ── Direct GitHub REST API (토큰 있을 때) ──

/** GitHub REST API를 직접 호출하여 issues, commits, PR reviews를 수집 */
async function collectWithToken(
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

// ── gh CLI fallback (토큰 없을 때 — gh CLI의 인증 정보 사용) ──

/**
 * gh CLI를 통해 GitHub API를 호출한다.
 * Tauri의 run_shell_command로 shell에서 실행.
 * @param endpoint - GitHub API endpoint (e.g., "repos/owner/repo/commits")
 * @returns 파싱된 JSON 응답, 실패 시 null
 */
async function ghApi(endpoint: string): Promise<unknown | null> {
  try {
    const escaped = endpoint.replace(/'/g, "'\\''");
    const cmd = `gh api '${escaped}' 2>/dev/null`;
    console.log('[cortx:ghApi] cmd:', cmd);
    const result = await invoke<{ success: boolean; output: string; error: string }>('run_shell_command', {
      cwd: '/',
      command: cmd,
    });
    console.log(
      '[cortx:ghApi] success:',
      result.success,
      'output length:',
      result.output?.length,
      'error:',
      result.error?.slice(0, 100),
    );
    if (result.success && result.output.trim()) {
      return JSON.parse(result.output);
    }
  } catch (err) {
    console.warn('[cortx:ghApi] failed:', err);
  }
  return null;
}

/** gh CLI를 사용하여 GitHub 컨텍스트 수집 (collectWithToken과 동일한 구조) */
async function collectWithGhCli(
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
