/**
 * @module contextCollectors/github
 * GitHub 컨텍스트 수집기.
 * Issues, PRs, commits, review comments를 키워드/브랜치 기반으로 수집한다.
 * GitHub API 토큰이 있으면 REST API를 직접 호출하고,
 * 없으면 gh CLI를 통해 인증된 요청을 보낸다 (fallback).
 */

import type { ContextItem, ContextSourceConfig } from '../../../types/contextPack';
import { collectWithToken } from './direct';
import { collectWithGhCli } from './cli';

export { ghApi } from './api';

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
  if (!config.owner || !config.repo) return [];
  // 토큰 있으면 직접 API, 없으면 gh CLI fallback
  if (config.token) return collectWithToken(config, keywords, branchName);
  return collectWithGhCli(config.owner, config.repo, keywords, branchName);
}
