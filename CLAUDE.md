# Cortx — Development Rules

Cortx is a Tauri 2 desktop app (React + TypeScript frontend, Rust backend) for AI-powered developer task management.

## Architecture Overview

```
Frontend (React/TS)              Backend (Rust/Tauri)
├── components/                  ├── lib.rs                — Tauri command 등록
│   ├── <feature>/              ├── pty.rs                — PTY + Claude CLI (Builder 패턴)
│   │   └── api.ts (invoke 래퍼) │   └── (SecureTempFile, ClaudeCommand, spawn_and_stream)
│   └── <feature>/types.ts       ├── commands/
├── stores/ (Zustand)            │   ├── scan/             — 프로젝트 스캔 (5개 서브모듈)
├── services/ (AI, OAuth, db)    │   │   ├── grader.rs     — 문서 등급
├── hooks/                        │   │   ├── tech_stack.rs — 매니페스트 감지
└── types/                        │   │   ├── scaffold.rs   — auto-fill 템플릿
    └── generated/ ← ts-rs       │   │   ├── fallback.rs   — 파일 트리
                                  │   │   └── time_utils.rs — ISO 8601
                                  │   └── mcp/             — MCP 서버 관리 (4개 서브모듈)
                                  │       ├── discovery.rs · mutate.rs
                                  │       ├── toggle.rs    · json_io.rs
                                  └── types.rs             — 공용 결과 타입

Communication: invoke() for commands, listen()/emit() for streaming events
```

## 도메인 폴더 컨벤션

큰 컴포넌트(>300줄)는 같은 이름의 서브디렉토리로 분해. 패턴:

```
components/<feature>/
├── api.ts          — Tauri invoke 래퍼 (동적 import 내장)
├── types.ts        — 도메인 타입 (또는 ts-rs re-export)
├── parse.ts        — 순수 파싱 함수 (테스트 가능)
├── format.ts       — 표시 포맷 헬퍼
├── buttons.tsx     — 공용 버튼 변형
└── <Component>.tsx — 메인 + 서브컴포넌트
```

기존 적용 사례: `slash-builder/`, `mcp-manager/`, `cost-dashboard/`,
`worktree-cleanup/`, `diff-viewer/`, `changes-view/`, `project-settings/`,
`main-panel/`, `command-palette/`, `context/`, `claude/`

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

권장 패턴: 도메인 폴더의 `api.ts`에 invoke 래퍼를 두고 호출 사이트는 일반
함수처럼 사용. quality-gate 훅이 정적 import를 자동 차단한다.

```ts
// components/<feature>/api.ts
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}
export async function listFoo(): Promise<Foo[]> {
  return invoke('list_foo');
}
```

## Code Splitting (Lazy Loading)

큰 모달/패널은 `React.lazy` + `Suspense`로 분리해 main bundle 감소:

```tsx
const HeavyModal = lazy(() => import('./HeavyModal').then((m) => ({ default: m.HeavyModal })));

// 사용 — 조건부 렌더링 + Suspense 경계
{showModal && (
  <Suspense fallback={null}>
    <HeavyModal onClose={...} />
  </Suspense>
)}
```

상시 마운트가 필요한 컴포넌트(예: Terminal PTY 유지)는 "ever active" 패턴:

```tsx
const [terminalEverActive, setTerminalEverActive] = useState(false);
useEffect(() => {
  if (activeTab === 'terminal') setTerminalEverActive(true);
}, [activeTab]);

{terminalEverActive && (
  <div style={{ display: activeTab === 'terminal' ? 'contents' : 'none' }}>
    <Suspense fallback={...}><TerminalView /></Suspense>
  </div>
)}
```

`vite.config.ts`의 `manualChunks`로 vendor를 별도 chunk로 분리: monaco,
xterm, tauri, react-vendor, zustand, cmdk, lucide.

## Type Sync (Rust ↔ TS)

Backend 데이터 타입은 `ts-rs`로 자동 생성. 수동 동기화 금지.

```rust
#[derive(Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/types/generated/")]
#[serde(rename_all = "camelCase")]
pub struct Foo {
    pub bar: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub baz: Option<String>,
    #[ts(type = "number")]  // u64 → number (bigint 회피)
    pub count: u64,
}
```

재생성: `cd src-tauri && cargo test --lib` (테스트 실행 시 자동 export).

생성된 타입은 frontend에서 `import type` re-export:
```ts
export type { Foo } from '../../types/generated/Foo';
```

현재 ts-rs 적용 타입 12개 (목록은 `src/types/generated/` 참조).

## React Patterns

- ErrorBoundary in main.tsx catches crashes and shows error message instead of black screen
- No `useRef` for values that affect rendering — use `useState` instead
- Timer uses `getState()` to avoid re-render dependency
- Prefer `useCallback` for event handlers passed as props to prevent unnecessary re-renders
- Keep components under ~300 lines; extract sub-components when exceeding this
- Modal state는 `useModalStore`로 중앙화 — props drilling 대신 store 직접 접근
  (자식 컴포넌트가 `useModalStore.getState().open('foo')` 호출)
- 큰 useEffect는 hook으로 추출: `useInitialLoad`, `useStorePersistence`,
  `useFileDropHandler`, `useMcpFileWatcher` 등 도메인별로 분리

## TypeScript

- Strict mode is enabled — do not use `any` or `// @ts-ignore`
- All types go in `src/types/` — do not define interfaces inline in components
- Use `type` imports for type-only references: `import type { Task } from '../types/task'`
- Backend-shared types: ts-rs 자동 생성 (`src/types/generated/`) 우선 사용

## Testing

- TS: `npm test` (vitest, jsdom). 순수 함수는 `tests/components/<feature>/`에
  소스 경로 미러링하며 추가
- Rust: `cd src-tauri && cargo test --lib`. 모듈 내 `#[cfg(test)]`로 인라인 작성
- 추출된 순수 함수는 반드시 테스트 동반 — 회귀 안전망 유지
- ts-rs export 검증도 `cargo test`로 자동 — 타입 변경 시 빌드 깨짐

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
