/**
 * @module vector-search/embedding
 * Ollama를 통한 텍스트 임베딩 API 래퍼 + 벡터 유틸리티.
 */

const OLLAMA_URL = 'http://localhost:11434';
export const EMBED_MODEL = 'nomic-embed-text';
/** nomic-embed-text 모델의 출력 벡터 차원 수 */
export const EMBED_DIMS = 768;

/**
 * Ollama를 통해 텍스트의 임베딩 벡터를 생성한다.
 * @param text - 임베딩할 텍스트
 * @returns 768차원 float 벡터
 */
export async function embed(text: string): Promise<number[]> {
  const resp = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!resp.ok) throw new Error(`Ollama embed failed: ${resp.status}`);
  const data = await resp.json();
  return data.embeddings?.[0] || data.embedding || [];
}

/** Ollama API 가용성 확인 */
export async function checkOllama(): Promise<boolean> {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    return resp.ok;
  } catch {
    return false;
  }
}

/** Cosine similarity between two vectors. Returns 0 if either norm is zero. */
export function cosineSim(a: number[], b: number[]): number {
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
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
