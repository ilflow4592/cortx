let storeInstance: Awaited<ReturnType<typeof import('@tauri-apps/plugin-store')['load']>> | null = null;

async function getStore() {
  if (!storeInstance) {
    const { load } = await import('@tauri-apps/plugin-store');
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
    localStorage.setItem(`cortx-${key}`, JSON.stringify(value));
  }
}

export async function loadData<T>(key: string): Promise<T | null> {
  try {
    const store = await getStore();
    const val = await store.get<T>(key);
    return val ?? null;
  } catch {
    const raw = localStorage.getItem(`cortx-${key}`);
    if (raw) {
      try { return JSON.parse(raw); } catch { return null; }
    }
    return null;
  }
}
