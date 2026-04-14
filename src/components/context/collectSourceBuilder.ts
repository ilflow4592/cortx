/**
 * Context pack 수집 시 MCP 서버에서 토큰/좌표를 추출해 소스 목록을 만든다.
 *
 * 기존 `handleCollect`에 75줄로 인라인돼 있던 로직 — 순수 함수로 격리해 테스트
 * 가능 · 새 MCP 서비스 추가 시 이 파일만 수정하면 됨.
 */
import type { ContextSourceConfig, ContextSourceType } from '../../types/contextPack';
import type { McpServerStatus } from '../../stores/mcpStore';

/** MCP env 변수에서 서비스별 토큰 추출 — 없으면 빈 문자열 */
function extractToken(resType: string, env: Record<string, string>): string {
  if (resType === 'github') {
    return env.GITHUB_TOKEN || env.GITHUB_PERSONAL_ACCESS_TOKEN || '';
  }
  if (resType === 'notion') {
    let token = env.NOTION_API_KEY || '';
    if (!token && env.OPENAPI_MCP_HEADERS) {
      try {
        const headers = JSON.parse(env.OPENAPI_MCP_HEADERS);
        token = (headers.Authorization || headers.authorization || '').replace(/^Bearer\s+/i, '');
      } catch {
        /* ignore */
      }
    }
    if (!token) {
      token = Object.values(env).find((v) => v.startsWith('ntn_') || v.startsWith('secret_')) || '';
    }
    return token;
  }
  if (resType === 'slack') {
    return env.SLACK_BOT_TOKEN || env.SLACK_TOKEN || Object.values(env).find((v) => v.startsWith('xoxb-')) || '';
  }
  return '';
}

export interface BuildSourcesParams {
  searchResources: Set<string>;
  mcpServers: McpServerStatus[];
  existingSources: ContextSourceConfig[];
  projectOwner?: string;
  projectRepo?: string;
}

/**
 * MCP ready 서버를 기반으로 수집용 소스 배열 생성.
 *
 * - MCP 소스가 우선 — 같은 타입의 settings 소스는 스킵
 * - `token`은 빈 문자열로 둬 collectAll 내부에서 MCP 경로 선택
 * - settings 소스의 `slackChannel` · `notionDatabaseId`는 유지
 */
export function buildCollectSources(params: BuildSourcesParams): ContextSourceConfig[] {
  const { searchResources, mcpServers, existingSources, projectOwner, projectRepo } = params;

  const mcpSources: ContextSourceConfig[] = [];
  for (const resType of searchResources) {
    if (resType === 'other') continue;
    const server = mcpServers.find((s) => s.serviceType === resType && s.status === 'ready');
    if (!server) continue;

    // 토큰 추출은 시맨틱만 — 실제 수집에선 MCP를 쓰므로 참고용
    extractToken(resType, server.env || {});

    const settingsSource = existingSources.find((s) => s.type === resType);
    const owner = projectOwner || settingsSource?.owner || '';
    const repo = projectRepo || settingsSource?.repo || '';

    mcpSources.push({
      type: resType as ContextSourceType,
      enabled: true,
      token: '',
      owner,
      repo,
      ...(settingsSource?.slackChannel ? { slackChannel: settingsSource.slackChannel } : {}),
      ...(settingsSource?.notionDatabaseId ? { notionDatabaseId: settingsSource.notionDatabaseId } : {}),
    });
  }

  // MCP 미지원 타입만 settings 소스에서 보강
  const mergedTypes = new Set<string>(mcpSources.map((s) => s.type));
  return [...mcpSources, ...existingSources.filter((s) => !mergedTypes.has(s.type))];
}
