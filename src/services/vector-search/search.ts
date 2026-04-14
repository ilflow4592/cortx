/**
 * @module vector-search/search
 * 시맨틱 검색 + KeyBERT 스타일 키워드 추출.
 */

import { embed, cosineSim, checkOllama } from './embedding';
import { ensureCollection, checkQdrant, QDRANT_URL, COLLECTION, type VectorItem } from './store';

/**
 * 쿼리와 유사한 컨텍스트 아이템을 검색한다.
 * @param query - 검색 쿼리 텍스트
 * @param limit - 최대 결과 수 (기본 10)
 * @param taskId - 특정 태스크로 필터링 (미지정 시 전체 검색)
 * @returns 유사도 순으로 정렬된 VectorItem 배열
 */
export async function searchContext(query: string, limit = 10, taskId?: string): Promise<VectorItem[]> {
  await ensureCollection();
  const vector = await embed(query);
  if (vector.length === 0) return [];

  // taskId가 있으면 해당 태스크의 컨텍스트만 필터링
  const filter = taskId
    ? {
        must: [{ key: 'taskId', match: { value: taskId } }],
      }
    : undefined;

  const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      filter,
    }),
  });

  if (!resp.ok) return [];
  const data = await resp.json();

  return (data.result || []).map((hit: { payload: Record<string, string>; score: number }) => ({
    id: hit.payload.itemId,
    taskId: hit.payload.taskId,
    sourceType: hit.payload.sourceType,
    title: hit.payload.title,
    content: hit.payload.content,
    url: hit.payload.url,
    timestamp: hit.payload.timestamp,
    score: hit.score,
  }));
}

/**
 * 모든 태스크를 대상으로 유사 컨텍스트를 검색한다 (cross-task 지식 공유).
 * @param query - 검색 쿼리
 * @param limit - 최대 결과 수 (기본 5)
 */
export async function searchGlobalContext(query: string, limit = 5): Promise<VectorItem[]> {
  return searchContext(query, limit);
}

/**
 * Ollama와 Qdrant 서비스의 가용성을 확인한다.
 * 벡터 검색 기능 활성화 여부를 판단하는 데 사용.
 * @returns 각 서비스의 실행 상태
 */
export async function checkVectorServices(): Promise<{ ollama: boolean; qdrant: boolean }> {
  const [ollama, qdrant] = await Promise.all([checkOllama(), checkQdrant()]);
  return { ollama, qdrant };
}

/**
 * KeyBERT 스타일 키워드 추출.
 * 텍스트에서 후보 구문을 정규식으로 추출한 뒤,
 * 쿼리와의 cosine 유사도가 높은 상위 N개를 반환한다.
 * Ollama가 불가능하면 정규식 추출 결과만 반환 (graceful degradation).
 * @param query - 기준 쿼리 (태스크 제목 등)
 * @param texts - 키워드를 추출할 원본 텍스트 배열
 * @param topN - 반환할 최대 키워드 수 (기본 10)
 * @returns 유사도 순으로 정렬된 키워드/구문 배열
 */
export async function extractKeywords(query: string, texts: string[], topN = 10): Promise<string[]> {
  if (texts.length === 0) return [];

  // 정규식으로 의미 있는 후보 구문을 추출
  const candidates = new Set<string>();
  for (const text of texts) {
    // Jira 스타일 티켓 ID: BE-1390, FE-123
    const tickets = text.match(/[A-Z]{2,}-\d+/g);
    if (tickets) tickets.forEach((t) => candidates.add(t));
    // Git 브랜치 패턴: feat/xxx, fix/xxx
    const branches = text.match(/(?:feat|fix|hotfix|chore|refactor)\/[^\s,)]+/g);
    if (branches) branches.forEach((b) => candidates.add(b));
    // PR 참조: #1234
    const prs = text.match(/#(\d{3,})/g);
    if (prs) prs.forEach((p) => candidates.add(p));
    // 2~4단어 명사구 (한국어 + 영어)
    const phrases = text.match(/[\w가-힣]{2,}(?:\s[\w가-힣]{2,}){1,3}/g);
    if (phrases)
      phrases.forEach((p) => {
        if (p.length >= 4 && p.length <= 50) candidates.add(p.trim());
      });
  }

  const candidateList = [...candidates];
  if (candidateList.length === 0) return [];

  try {
    // Embed query
    const queryVec = await embed(query);
    if (queryVec.length === 0) return [];

    // 후보를 최대 50개까지 임베딩하여 쿼리와 유사도 계산
    const scored: { phrase: string; score: number }[] = [];
    for (const phrase of candidateList.slice(0, 50)) {
      try {
        const vec = await embed(phrase);
        if (vec.length === 0) continue;
        const score = cosineSim(queryVec, vec);
        scored.push({ phrase, score });
      } catch {
        /* skip */
      }
    }

    // Sort by similarity, return top N
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN).map((s) => s.phrase);
  } catch {
    // Ollama not available — fallback to regex-only
    return candidateList.slice(0, topN);
  }
}
