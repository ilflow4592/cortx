import { describe, it, expect } from 'vitest';
import { buildCollectSources } from '../../../src/components/context/collectSourceBuilder';
import type { ContextSourceConfig } from '../../../src/types/contextPack';
import type { McpServerStatus } from '../../../src/stores/mcpStore';

function mcp(serviceType: string, status: 'ready' | 'connecting' | 'error' = 'ready'): McpServerStatus {
  return { name: serviceType, status, serviceType, env: {} } as McpServerStatus;
}

function source(type: ContextSourceConfig['type'], extras: Partial<ContextSourceConfig> = {}): ContextSourceConfig {
  return { type, enabled: true, token: 'tok', owner: 'o', repo: 'r', ...extras };
}

describe('buildCollectSources', () => {
  it('체크된 MCP 타입만 포함 (GitHub 미체크 시 GitHub 미포함)', () => {
    const result = buildCollectSources({
      searchResources: new Set(['notion']),
      mcpServers: [mcp('notion'), mcp('github')],
      existingSources: [],
    });
    expect(result.map((s) => s.type)).toEqual(['notion']);
  });

  it('MCP 미지원이지만 settings 소스가 있고 체크된 타입은 포함', () => {
    const result = buildCollectSources({
      searchResources: new Set(['github']),
      mcpServers: [], // GitHub MCP 없음
      existingSources: [source('github', { owner: 'foo', repo: 'bar' })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('github');
    expect(result[0].owner).toBe('foo');
  });

  it('settings 소스가 있어도 체크박스 미체크면 제외 (회귀 방지)', () => {
    // 이전 버그: existingSources의 GitHub이 searchResources 체크 무시하고 추가됨
    const result = buildCollectSources({
      searchResources: new Set(['notion']), // GitHub 체크 안 됨
      mcpServers: [mcp('notion')],
      existingSources: [source('github')], // settings에는 GitHub 있음
    });
    expect(result.map((s) => s.type)).toEqual(['notion']);
  });

  it('MCP 서버 ready 아니면 스킵 (settings 소스 폴백 안 함)', () => {
    const result = buildCollectSources({
      searchResources: new Set(['notion']),
      mcpServers: [mcp('notion', 'connecting')],
      existingSources: [],
    });
    expect(result).toEqual([]);
  });

  it('MCP + settings 동일 타입이면 MCP 우선 (중복 제거)', () => {
    const result = buildCollectSources({
      searchResources: new Set(['notion']),
      mcpServers: [mcp('notion')],
      existingSources: [source('notion')],
    });
    expect(result).toHaveLength(1);
    expect(result[0].token).toBe(''); // MCP 경로 (token 빈 값)
  });

  it("'other' 타입은 스킵", () => {
    const result = buildCollectSources({
      searchResources: new Set(['other']),
      mcpServers: [],
      existingSources: [],
    });
    expect(result).toEqual([]);
  });

  it('projectOwner/Repo가 settings owner/repo를 override', () => {
    const result = buildCollectSources({
      searchResources: new Set(['github']),
      mcpServers: [mcp('github')],
      existingSources: [source('github', { owner: 'old-owner', repo: 'old-repo' })],
      projectOwner: 'new-owner',
      projectRepo: 'new-repo',
    });
    expect(result[0].owner).toBe('new-owner');
    expect(result[0].repo).toBe('new-repo');
  });
});
