/**
 * @module vector-search/store
 * Qdrant HTTP CRUD — 컬렉션 관리 + 벡터 아이템 저장.
 */

import { embed, hashCode, EMBED_DIMS } from './embedding';

export const QDRANT_URL = 'http://localhost:6333';
export const COLLECTION = 'cortx_context';

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

/** Qdrant 컬렉션이 없으면 생성한다 (idempotent) */
export async function ensureCollection(): Promise<void> {
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

/** Qdrant 서비스 가용성 확인 */
export async function checkQdrant(): Promise<boolean> {
  try {
    const resp = await fetch(`${QDRANT_URL}/collections`);
    return resp.ok;
  } catch {
    return false;
  }
}
