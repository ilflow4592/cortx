/**
 * @module persistence
 * 데이터 영속화 계층.
 * Tauri plugin-store를 1차 저장소로 사용하고, 실패 시 localStorage로 자동 fallback한다.
 * NOTE: Tauri API는 반드시 dynamic import로 불러와야 한다 (webview 초기화 이슈 방지).
 */

/** Singleton — 한 번만 로드하고 재사용 */
let storeInstance: Awaited<ReturnType<typeof import('@tauri-apps/plugin-store')['load']>> | null = null;

/** Tauri plugin-store 인스턴스를 lazy-load로 가져온다 (dynamic import 필수) */
async function getStore() {
  if (!storeInstance) {
    const { load } = await import('@tauri-apps/plugin-store');
    storeInstance = await load('cortx-data.json');
  }
  return storeInstance;
}

/**
 * 데이터를 key-value로 저장한다.
 * Tauri store 실패 시 localStorage로 fallback.
 * @param key - 저장 키 (localStorage에서는 'cortx-' prefix 자동 추가)
 * @param value - 저장할 값 (JSON 직렬화 가능해야 함)
 */
export async function saveData(key: string, value: unknown): Promise<void> {
  try {
    const store = await getStore();
    await store.set(key, value);
    await store.save();
  } catch {
    // Tauri store 사용 불가 시 localStorage fallback
    localStorage.setItem(`cortx-${key}`, JSON.stringify(value));
  }
}

/**
 * 저장된 데이터를 읽어온다.
 * Tauri store 실패 시 localStorage에서 읽기 시도.
 * @param key - 읽을 키
 * @returns 저장된 값, 없으면 null
 */
export async function loadData<T>(key: string): Promise<T | null> {
  try {
    const store = await getStore();
    const val = await store.get<T>(key);
    return val ?? null;
  } catch {
    // Tauri store 사용 불가 시 localStorage fallback
    const raw = localStorage.getItem(`cortx-${key}`);
    if (raw) {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return null;
  }
}
