/**
 * Search Resource Registry — 새 MCP 검색 소스를 추가하려면 여기에 한 줄만 추가.
 * 다른 파일 수정 불필요.
 */

export interface SearchResourceEntry {
  /** UI 카테고리 */
  category: 'services' | 'research';
  /** UI 표시 이름 */
  label: string;
  /** 마우스 호버 시 표시되는 설명 */
  description: string;
  /** Claude CLI에 보낼 검색 프롬프트 (keywordList가 삽입됨) */
  prompt: string;
  /** Claude CLI --allowedTools 패턴 */
  allowedTools: string;
}

/**
 * 레지스트리에 있는 MCP 서버만 SEARCH RESOURCES에 표시됩니다.
 * 키는 MCP 서버 이름과 매칭됩니다 (소문자 포함 여부로 판별).
 *
 * 새 MCP 추가 예시:
 *   jira: { category: 'services', label: 'Jira', description: 'Jira 이슈 검색', prompt: '...', allowedTools: "'mcp__jira__*'" },
 */
export const SEARCH_MCP_REGISTRY: Record<string, SearchResourceEntry> = {
  // ── Services (외부 플랫폼 데이터) ──
  github: {
    category: 'services',
    label: 'Github',
    description: 'GitHub 이슈, PR, 코드 검색',
    prompt: '', // GitHub은 gh CLI로 직접 수집 (이 프롬프트 미사용)
    allowedTools: '',
  },
  notion: {
    category: 'services',
    label: 'Notion',
    description: 'Notion 페이지 및 데이터베이스 검색',
    prompt:
      'Search Notion for: {keywords}. For each result that is a project or epic page, also list its child pages. Return ONLY a JSON array (no markdown): [{"title":"","url":"","id":"","parent":""}]. Max 15 results. If none: []',
    allowedTools: "'mcp__notion__*'",
  },
  slack: {
    category: 'services',
    label: 'Slack',
    description: 'Slack 채널 메시지 및 스레드 검색',
    prompt:
      'Search Slack for: {keywords}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":"","channel":""}]. Max 10 results. If none: []',
    allowedTools: "'mcp__slack__*'",
  },
  obsidian: {
    category: 'services',
    label: 'Obsidian',
    description: 'Obsidian vault 노트 검색',
    prompt:
      'Search Obsidian vault for notes related to: {keywords}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":""}]. url should be the file path. Max 10 results. If none: []',
    allowedTools: "'mcp__obsidian__*'",
  },

  // ── Research (검색/분석 도구) ──
  context7: {
    category: 'research',
    label: 'context7',
    description: '라이브러리/프레임워크 공식 문서 검색',
    prompt:
      'Search library documentation for: {keywords}. First resolve the library ID, then query its docs. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":""}]. Max 10 results. If none: []',
    allowedTools: "'mcp__context7__*'",
  },
  tavily: {
    category: 'research',
    label: 'tavily',
    description: '웹 검색 (기술 블로그, Stack Overflow 등)',
    prompt:
      'Web search for: {keywords}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":""}]. Max 10 results. If none: []',
    allowedTools: "'mcp__tavily__*'",
  },
  secall: {
    category: 'research',
    label: 'secall',
    description: '이전 AI 세션 히스토리 검색',
    prompt:
      'Search previous AI session history for: {keywords}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":""}]. Max 10 results. If none: []',
    allowedTools: "'mcp__secall__*'",
  },
  serena: {
    category: 'research',
    label: 'serena',
    description: '코드베이스 심볼 분석 및 검색',
    prompt:
      'Search codebase symbols related to: {keywords}. Return ONLY a JSON array (no markdown): [{"title":"","url":"","summary":""}]. Max 10 results. If none: []',
    allowedTools: "'mcp__serena__*'",
  },
};

/** 레지스트리에 등록된 모든 서비스 타입 키 */
export const REGISTERED_SERVICE_TYPES = Object.keys(SEARCH_MCP_REGISTRY);

/** MCP 서버 이름으로 서비스 타입 감지. 레지스트리에 없으면 'other' */
export function detectServiceType(name: string): string {
  const n = name.toLowerCase();
  for (const key of REGISTERED_SERVICE_TYPES) {
    if (n.includes(key)) return key;
  }
  return 'other';
}

/** 레지스트리에 있는 서비스인지 확인 */
export function isSearchableService(serviceType: string): boolean {
  return serviceType in SEARCH_MCP_REGISTRY;
}
