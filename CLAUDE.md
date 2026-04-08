# Cortx — Development Rules

Cortx is a Tauri 2 desktop app (React + TypeScript frontend, Rust backend) for AI-powered developer task management.

## Architecture Overview

```
Frontend (React/TS)          Backend (Rust/Tauri)
├── components/              ├── lib.rs    — Tauri commands (git, shell, OAuth, MCP)
├── stores/ (Zustand)        └── pty.rs    — PTY management (terminal + Claude CLI)
├── services/ (AI, OAuth)
├── hooks/
└── types/

Communication: invoke() for commands, listen()/emit() for streaming events
```

## Data Migration (CRITICAL)

When adding new fields to Task or Project types:

1. **ALWAYS add defaults in `loadTasks` / `loadProjects`** in the respective store
2. **ALWAYS use `Array.isArray()` check** for array fields before accessing `.map`, `.length`, etc.
3. **NEVER assume stored data has all fields** — old data in localStorage may be missing new fields
4. **Test with cleared storage** after schema changes: `localStorage.clear()` in browser console

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
- Prefer `useCallback` for event handlers passed as props to prevent unnecessary re-renders
- Keep components under ~300 lines; extract sub-components when exceeding this

## TypeScript

- Strict mode is enabled — do not use `any` or `// @ts-ignore`
- All types go in `src/types/` — do not define interfaces inline in components
- Use `type` imports for type-only references: `import type { Task } from '../types/task'`

## Rust / Tauri Backend

- All `#[tauri::command]` functions must have `///` doc comments explaining purpose and parameters
- Use `map_err(|e| e.to_string())` for error propagation to frontend
- Shell commands go through `zsh -l -c` for login shell environment
- Temporary files: set permissions to 0o600, clean up in all code paths (success + error)
- Avoid `unsafe` blocks — use `nix` crate for signal operations when possible

## Security

- Never store credentials in component state (visible in DevTools)
- Escape all user inputs before shell execution (branch names, file paths)
- Validate branch names: `/^[a-zA-Z0-9\/_.-]+$/`

## Pipeline Skills

Pipeline skills live in `.claude/commands/pipeline/*.md` as standard Claude Code slash commands.
The app resolves `/pipeline:dev-task` → `.claude/commands/pipeline/dev-task.md` at runtime,
replacing `{TASK_ID}`, `{TASK_NAME}`, `$ARGUMENTS` placeholders with current task context.
