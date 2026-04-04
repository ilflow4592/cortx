import { load } from '@tauri-apps/plugin-store';

let storeInstance: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!storeInstance) {
    storeInstance = await load('cortx-data.json');
  }
  return storeInstance;
}

export async function saveData(key: string, value: unknown): Promise<void> {
  try {
    const store = await getStore();
    await store.set(key, value);
    await store.save();
  } catch {
    // Fallback to localStorage (browser dev mode)
    localStorage.setItem(`cortx-${key}`, JSON.stringify(value));
  }
}

export async function loadData<T>(key: string): Promise<T | null> {
  try {
    const store = await getStore();
    const val = await store.get<T>(key);
    return val ?? null;
  } catch {
    // Fallback to localStorage
    const raw = localStorage.getItem(`cortx-${key}`);
    if (raw) {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return null;
  }
}
