// Ollama Embedding + Qdrant Vector DB
// Runs 100% locally — zero cost

const OLLAMA_URL = 'http://localhost:11434';
const QDRANT_URL = 'http://localhost:6333';
const COLLECTION = 'cortx_context';
const EMBED_MODEL = 'nomic-embed-text';
const EMBED_DIMS = 768;

// ── Ollama Embedding ──

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

async function ensureCollection(): Promise<void> {
  // Check if collection exists
  const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (resp.ok) return;

  // Create collection
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: EMBED_DIMS, distance: 'Cosine' },
    }),
  });
}

// ── Public API ──

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

  // Use hash of id as numeric point id
  const pointId = Math.abs(hashCode(item.id));

  await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{
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
      }],
    }),
  });
}

/**
 * Store multiple context items in batch.
 */
export async function storeContextBatch(items: VectorItem[]): Promise<void> {
  if (items.length === 0) return;
  await ensureCollection();

  // Embed all items
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
 * Search for similar context items.
 * Returns top N most relevant items for the given query.
 */
export async function searchContext(query: string, limit = 10, taskId?: string): Promise<VectorItem[]> {
  await ensureCollection();
  const vector = await embed(query);
  if (vector.length === 0) return [];

  const filter = taskId ? {
    must: [{ key: 'taskId', match: { value: taskId } }],
  } : undefined;

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
 * Search across ALL tasks for similar context (cross-task knowledge).
 */
export async function searchGlobalContext(query: string, limit = 5): Promise<VectorItem[]> {
  return searchContext(query, limit);
}

/**
 * Check if Ollama + Qdrant are available.
 */
export async function checkVectorServices(): Promise<{ ollama: boolean; qdrant: boolean }> {
  let ollama = false;
  let qdrant = false;

  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    ollama = resp.ok;
  } catch { /* not running */ }

  try {
    const resp = await fetch(`${QDRANT_URL}/collections`);
    qdrant = resp.ok;
  } catch { /* not running */ }

  return { ollama, qdrant };
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
