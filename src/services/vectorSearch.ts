/**
 * @module vectorSearch
 * 로컬 벡터 검색 엔진.
 * Ollama(임베딩 생성) + Qdrant(벡터 DB)를 사용하여 100% 로컬에서 실행된다.
 * 컨텍스트 아이템(Slack 메시지, GitHub 이슈, Notion 페이지 등)을 벡터로 저장하고,
 * 시맨틱 유사도 기반으로 관련 컨텍스트를 검색한다.
 * 또한 KeyBERT 스타일의 키워드 추출 기능도 제공한다.
 */

const OLLAMA_URL = 'http://localhost:11434';
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION = 'cortx_context';
const EMBED_MODEL = 'nomic-embed-text';
/** nomic-embed-text 모델의 출력 벡터 차원 수 */
const EMBED_DIMS = 768;

// ── Ollama Embedding ──

/**
 * Ollama를 통해 텍스트의 임베딩 벡터를 생성한다.
 * @param text - 임베딩할 텍스트
 * @returns 768차원 float 벡터
 */
async function embed(text: string): Promise<number[]> {
  const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!resp.ok) throw new Error(`Ollama embed failed: ${resp.status}`);
  const data = await resp.json();
  return data.embeddings?.[0] || data.embedding || [];
}

// ── Qdrant ──

/** Qdrant 컬렉션이 없으면 생성한다 (idempotent) */
async function ensureCollection(): Promise<void> {
  const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (resp.ok) return;

  // 컬렉션 생성 — Cosine 유사도 사용
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: EMBED_DIMS, distance: 'Cosine' },
    }),
  });
}

// ── Public API ──

/** 벡터 DB에 저장/검색되는 컨텍스트 아이템 */
export interface VectorItem {
  id: string;
  taskId: string;
  sourceType: string;
  title: string;
  content: string;
  url: string;
  timestamp: string;
}

/**
 * Store a context item as a vector in Qdrant.
 * Embedding is generated locally via Ollama.
 */
export async function storeContext(item: VectorItem): Promise<void> {
  await ensureCollection();
  const vector = await embed(`${item.title} ${item.content}`);
  if (vector.length === 0) return;

  // Qdrant는 numeric ID가 필요하므로 string ID를 해시 변환
  const pointId = Math.abs(hashCode(item.id));

  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [
        {
          id: pointId,
          vector,
          payload: {
            itemId: item.id,
            taskId: item.taskId,
            sourceType: item.sourceType,
            title: item.title,
            content: item.content,
            url: item.url,
            timestamp: item.timestamp,
          },
        },
      ],
    }),
  });
}

/**
 * 여러 컨텍스트 아이템을 일괄 저장한다.
 * 임베딩 실패한 아이템은 건너뛴다.
 * @param items - 저장할 VectorItem 배열
 */
export async function storeContextBatch(items: VectorItem[]): Promise<void> {
  if (items.length === 0) return;
  await ensureCollection();

  // 각 아이템을 순차적으로 임베딩 (Ollama는 concurrent 요청에 약함)
  const points = [];
  for (const item of items) {
    try {
      const vector = await embed(`${item.title} ${item.content}`);
      if (vector.length === 0) continue;
      points.push({
        id: Math.abs(hashCode(item.id)),
        vector,
        payload: {
          itemId: item.id,
          taskId: item.taskId,
          sourceType: item.sourceType,
          title: item.title,
          content: item.content,
          url: item.url,
          timestamp: item.timestamp,
        },
      });
    } catch {
      // Skip items that fail to embed
    }
  }

  if (points.length === 0) return;

  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
}

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
  let ollama = false;
  let qdrant = false;

  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    ollama = resp.ok;
  } catch {
    /* not running */
  }

  try {
    const resp = await fetch(`${QDRANT_URL}/collections`);
    qdrant = resp.ok;
  } catch {
    /* not running */
  }

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

/** Cosine similarity between two vectors. Returns 0 if either norm is zero. */
function cosineSim(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

/** Java-style hashCode — string을 numeric ID로 변환 (Qdrant point ID용) */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
