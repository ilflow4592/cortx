# Cortx — Development Rules

## Data Migration (CRITICAL)

When adding new fields to Task or Project types:

1. **ALWAYS add defaults in `loadTasks` / `loadProjects`** in the respective store
2. **ALWAYS use `Array.isArray()` check** for array fields before accessing `.map`, `.length`, etc.
3. **NEVER assume stored data has all fields** — old data in localStorage may be missing new fields
4. **Test with cleared storage** after schema changes: `localStorage.clear()` in browser console

Example:
```ts
// In store's load function — enumerate ALL fields with defaults
loadTasks: (tasks) => {
  const migrated = tasks.map((t) => ({
    id: t.id || genId(),
    title: t.title || '',
    newField: t.newField || defaultValue,  // <-- always add this
    arrayField: Array.isArray(t.arrayField) ? t.arrayField : [],
  }));
  set({ tasks: migrated });
}
```

## Persistence

- Use `store.subscribe()` for saving, NOT `useEffect` with store data as dependency
- Debounce saves (300-500ms) to avoid write storms from timer updates
- `localStorage` only — no `tauri-plugin-store` (caused initialization issues)

## Tauri API Imports

- ALWAYS use dynamic `import()` for `@tauri-apps/api/*` and `@tauri-apps/plugin-*`
- NEVER use static top-level imports for Tauri APIs (breaks during webview initialization)
- Wrap all Tauri calls in `try-catch`

```ts
// ✅ Good
const { getCurrentWindow } = await import('@tauri-apps/api/window');

// ❌ Bad
import { getCurrentWindow } from '@tauri-apps/api/window';
```

## React Patterns

- ErrorBoundary in main.tsx catches crashes and shows error message instead of black screen
- No `useRef` for values that affect rendering — use `useState` instead
- Timer uses `getState()` to avoid re-render dependency
