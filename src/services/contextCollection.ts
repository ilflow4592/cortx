/**
 * Context collection pipeline — Phase 1 (Notion/Slack/MCP) → keywords → Phase 2 (GitHub).
 *
 * contextPackStore.collectAll의 2-phase 로직을 분해해 추출한 서비스.
 * - Phase별 수집기는 AbortSignal과 progress 콜백만 받아 store 구조에 비의존
 * - Ollama 임베딩 기반 시맨틱 키워드·필터는 선택적: 미실행 시 graceful fallback
 * - 각 단위는 순수 함수에 가까워 테스트 시 collectors만 mock하면 됨
 */
import type { ContextItem, ContextSourceConfig, ContextSourceType } from '../types/contextPack';
import { collectSlack } from './contextCollectors/slack';
import { collectNotion } from './contextCollectors/notion';
import { collectViaMcp } from './contextCollectors/mcpSearch';
import { isSearchableService } from '../config/searchResources';
import { getNotionApiToken, getSlackBotToken } from './secrets';

/**
 * 서비스별 토큰을 Keychain에서 우선 조회. 실패 시 undefined.
 * GitHub은 `gh CLI`가 커버하므로 토큰 UI 없음 — 여기서도 제외.
 */
async function resolveKeychainToken(type: ContextSourceType): Promise<string | undefined> {
  if (type === 'slack') return getSlackBotToken();
  if (type === 'notion') return getNotionApiToken();
  return undefined;
}

export interface SourceResult {
  items: ContextItem[];
  tokenUsage?: { input: number; output: number };
}

export type ProgressStatus = 'pending' | 'collecting' | 'done' | 'error';

export type ProgressUpdater = (
  sourceIdx: number,
  patch: {
    status?: ProgressStatus;
    itemCount?: number;
    error?: string;
    tokenUsage?: { input: number; output: number };
  },
) => void;

export interface CollectOptions {
  branchName: string;
  slackChannels?: string[];
  taskTitle?: string;
  model?: string;
  /** 사용자 입력 키워드 */
  userKeywords: string[];
  abort: AbortSignal;
  /** enabled sources 기준 index — progress 매핑을 위함 */
  onProgress: ProgressUpdater;
}

/** 단일 소스 수집 — source.type에 따라 collector를 라우팅.
 *  토큰은 Keychain에서 우선 조회하고 source.token(legacy localStorage)은 fallback. */
async function collectSource(
  source: ContextSourceConfig,
  opts: Pick<CollectOptions, 'branchName' | 'slackChannels' | 'taskTitle' | 'model' | 'userKeywords'>,
): Promise<SourceResult> {
  const { userKeywords: kw, slackChannels, taskTitle, model } = opts;

  const keychainToken = await resolveKeychainToken(source.type);
  const effectiveToken = keychainToken || source.token;
  const src: ContextSourceConfig = { ...source, token: effectiveToken };

  if (src.type === 'slack') {
    if (src.token) return { items: await collectSlack(src, kw, slackChannels) };
    const r = await collectViaMcp('slack', kw, '', { model });
    return { items: r?.items || [], tokenUsage: r?.tokenUsage };
  }

  if (src.type === 'notion') {
    if (src.token) return { items: await collectNotion(src, kw, taskTitle) };
    // OAuth Notion MCP 경로: 통합 collector가 검색 + fullText fetch를 한 번에 수행
    // (이전엔 mcpSearch가 메타만 반환하고 본문은 파이프라인 시작 시 lazy fetch로 처리해
    //  Q1 도달 시간이 길었음). always-fetch 정책으로 dev-task가 즉시 활용 가능.
    const { collectNotion: collectNotionUnified } = await import('./contextSources/notion');
    const items = await collectNotionUnified({ keywords: kw, model });
    return { items };
  }

  if (src.type === 'github') {
    // GitHub은 gh CLI(collectViaMcp 내부) 단일 경로. 과거 REST PAT 분기는 제거됨.
    const r = await collectViaMcp('github', kw, '', { owner: src.owner, repo: src.repo, model });
    return { items: r?.items || [], tokenUsage: r?.tokenUsage };
  }

  if (isSearchableService(src.type)) {
    const r = await collectViaMcp(src.type, kw, '', { model });
    return { items: r?.items || [], tokenUsage: r?.tokenUsage };
  }

  return { items: [] };
}

/**
 * 주어진 소스 집합을 병렬 수집. 각 소스의 성공/실패는 progress로만 반영하고
 * 전체 파이프라인을 막지 않는다 (fulfilled/rejected 모두 핸들링).
 */
async function runParallelPhase(
  sources: ContextSourceConfig[],
  enabledSources: ContextSourceConfig[],
  opts: CollectOptions,
): Promise<ContextItem[]> {
  if (sources.length === 0) return [];

  const settled = await Promise.allSettled(
    sources.map(async (source) => {
      if (opts.abort.aborted) return { items: [] } as SourceResult;
      const result = await collectSource(source, opts);
      if (opts.abort.aborted) return { items: [] } as SourceResult;
      const idx = enabledSources.indexOf(source);
      opts.onProgress(idx, {
        status: 'done',
        itemCount: result.items.length,
        tokenUsage: result.tokenUsage,
      });
      return result;
    }),
  );

  const collected: ContextItem[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      collected.push(...r.value.items);
    } else {
      const idx = enabledSources.indexOf(sources[i]);
      opts.onProgress(idx, { status: 'error', error: String(r.reason) });
    }
  }
  return collected;
}

/** Notion/Slack/MCP 등 GitHub이 아닌 소스를 수집해 Phase 2의 키워드 풀로 사용 */
export async function runPhase1(
  sources: ContextSourceConfig[],
  enabledSources: ContextSourceConfig[],
  opts: CollectOptions,
): Promise<ContextItem[]> {
  const nonGithub = sources.filter((s) => s.type !== 'github');
  return runParallelPhase(nonGithub, enabledSources, opts);
}

/** Phase 1 결과 + 사용자 키워드로 GitHub 검색 */
export async function runPhase2GitHub(
  sources: ContextSourceConfig[],
  enabledSources: ContextSourceConfig[],
  githubKeywords: string[],
  opts: Omit<CollectOptions, 'userKeywords'>,
): Promise<ContextItem[]> {
  const github = sources.filter((s) => s.type === 'github');
  return runParallelPhase(github, enabledSources, { ...opts, userKeywords: githubKeywords });
}

/** Phase 1 결과 아이템의 제목/본문에서 JIRA 티켓·브랜치명·PR 번호를 정규식으로 추출 */
export function extractRegexKeywords(items: ContextItem[]): string[] {
  const keywords = new Set<string>();
  for (const item of items) {
    const text = `${item.title} ${item.summary}`;
    const tickets = text.match(/[A-Z]{2,}-\d+/g);
    if (tickets) tickets.forEach((t) => keywords.add(t));
    const branches = text.match(/(?:feat|fix|hotfix|chore|refactor)\/[^\s,)]+/g);
    if (branches) branches.forEach((b) => keywords.add(b));
    const prs = text.match(/#(\d{3,})/g);
    if (prs) prs.forEach((p) => keywords.add(p));
  }
  return [...keywords].slice(0, 10);
}

/** Ollama 임베딩 기반 시맨틱 키워드 — 실행 불가 시 빈 배열 반환 */
export async function extractSemanticKeywords(items: ContextItem[], query: string): Promise<string[]> {
  if (items.length === 0) return [];
  try {
    const vs = await import('./vectorSearch');
    const texts = items.map((item) => `${item.title} ${item.summary}`);
    return await vs.extractKeywords(query, texts, 5);
  } catch {
    return [];
  }
}

/** user + regex + semantic을 중복 제거하며 병합 — 입력 순서가 후순위 결정 */
export function mergeKeywords(user: string[], regex: string[], semantic: string[]): string[] {
  return [...new Set([...user, ...regex, ...semantic])];
}

/**
 * Ollama/Qdrant 벡터 DB에 저장 후 시맨틱 검색으로 상위 topK만 필터링.
 * - 아이템 10개 이하면 필터링 생략 (노이즈 vs 처리 비용 tradeoff)
 * - 벡터 DB 실패 시 원본 items 그대로 반환
 */
export async function filterByVectorSearch(
  items: ContextItem[],
  query: string,
  taskId: string,
  topK = 15,
): Promise<ContextItem[]> {
  try {
    const vs = await import('./vectorSearch');
    const vectorItems = items.map((item) => ({
      id: item.id,
      taskId,
      sourceType: item.sourceType,
      title: item.title,
      content: item.metadata?.fullText || item.summary || item.title,
      url: item.url,
      timestamp: item.timestamp,
    }));
    await vs.storeContextBatch(vectorItems);

    if (!query || items.length <= 10) return items;
    const searchResults = await vs.searchContext(query, topK, taskId);
    const relevantIds = new Set(searchResults.map((r) => r.id));
    const filtered = items.filter((item) => relevantIds.has(item.id));
    return filtered.length > 0 ? filtered : items;
  } catch {
    return items;
  }
}

/**
 * 키워드가 제목에 포함된 아이템을 앞으로 정렬 (간단한 relevance ranking).
 * 벡터 필터링과 독립적 — 두 단계를 조합해 순서와 선별을 함께 수행한다.
 */
export function rankByKeywordMatch(items: ContextItem[], keywords: string[]): ContextItem[] {
  if (keywords.length === 0) return items;
  const lowered = keywords.map((k) => k.toLowerCase());
  return [...items].sort((a, b) => {
    const aHit = lowered.some((k) => a.title.toLowerCase().includes(k)) ? 0 : 1;
    const bHit = lowered.some((k) => b.title.toLowerCase().includes(k)) ? 0 : 1;
    return aHit - bHit;
  });
}
