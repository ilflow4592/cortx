# Changelog

All notable changes to Cortx are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-04

아키텍처·성능·DX 전반의 대규모 리팩터링 시리즈 (55 commits).

### Added

- **프로젝트 스캔** — 신규 프로젝트 생성 시 기술 스택·문서 품질·언어 히스토그램을 자동 수집해 Claude 컨텍스트로 주입 (`src-tauri/src/commands/scan/`).
- **ts-rs 자동 타입 생성** — Rust `#[derive(TS)]`에서 12개 타입(Task, Project, MCP, SlashCommand 등)을 `src/types/generated/`로 export. 수동 TS 싱크 제거.
- **도메인 폴더 컨벤션** — `api.ts` / `types.ts` / `parse.ts` 패턴. 25+ 대형 컴포넌트 적용.
- **Husky + lint-staged + Dependabot** — 커밋 시 스테이징 파일만 prettier/eslint 자동 처리, 주간 의존성 PR (npm/cargo/github-actions).
- **Prettier 전역 적용** — `.prettierignore`로 ts-rs 생성물 제외, 나머지 자동 포맷.
- **테스트 202개** (vitest) + **38개** (cargo). 추출한 순수 함수 + store 회귀 안전망.

### Changed

- **번들 사이즈 70% 감소** (1078 KB → 326 KB main chunk).
  - `React.lazy` + Suspense로 13개 모달 분할
  - Monaco/xterm/cmdk/tauri 등 vendor manualChunks
  - Terminal은 "ever active" 패턴으로 PTY 상태 유지하며 lazy-load
- **App.tsx 대폭 축소** — modal/layout state → Zustand 스토어로 이전. 250줄 persistence useEffect → `useStorePersistence` 훅. 초기 로드 → `useInitialLoad` 훅.
- **대형 컴포넌트/모듈 분해** (25+):
  - `SlashCommandBuilder` (930줄) · `McpServerManager` (753줄) · `ContextPack` · `CommandPalette` · `Sidebar` · `DiffViewer` · `UpdateChecker` · `RightPanel` · `DashboardTab` · `NewTaskModal` · `ChangesView` · `PipelineConfigEditor` · `CostDashboard` · `Chat` · `CrashRecoveryDialog` · `McpStatusBar` 등
  - Rust: `pty.rs` / `scan.rs` (993줄) / `mcp.rs` (475줄) / `claude.rs` / `lib.rs`를 concern별 서브모듈로 분할
- **index.css** (1985줄) → `styles/*.css` 20개 도메인 파일로 분할.
- **PTY Claude 스폰** — Builder 패턴 + RAII 임시파일로 이어 붙인 파라미터 체인 제거.
- **Context 수집 파이프라인** — `collectAll`을 `runPhase1`/`runPhase2GitHub`/`filterByVectorSearch`/`rankByKeywordMatch` 순수 함수로 분해.
- **i18n 로케일 타입** — `Translations` 타입으로 `as const` literal 제약 우회. 다국어 추가 시 value literal mismatch 에러 해결.

### Fixed

- **정적 Tauri import 전면 제거** — 11개 잔존 케이스를 동적 `import()`로 변환 (webview init 중 깨짐 방지). quality-gate 훅이 신규 도입 차단.
- **`INEFFECTIVE_DYNAMIC_IMPORT` 경고 0건** — vite build 깔끔.
- **PIPELINE:pr:NUMBER 마커** — 정규식 value 그룹이 숫자를 거부하던 버그 수정.
- **프로젝트 해시 캐시** — `useStorePersistence`에서 매 tick 동일 prev 객체를 재직렬화하던 2x 비용 절반으로.
- **보안 하드닝** — 임시 파일 0o600 권한, 성공/실패 모두 정리. 브랜치 이름 화이트리스트 (`/^[a-zA-Z0-9\/_.-]+$/`).
- **Claude CLI 배너 중복** — 초기 fit()/resize 타이밍 개선으로 spam 제거.
- **파이프라인 Asking 뱃지** — 오래 남던 상태 정리 + 느린 Notion AI 필터 제거.

### Removed

- `tauri-plugin-store` 사용 — localStorage로 단일화 (초기화 이슈).
- `console.log` 디버그 10개 잔존물.
- 모든 `any` 타입 + `// @ts-ignore`.
- `useRef`로 렌더링에 영향 주던 값 (→ `useState`).

### Internal

- CI: lint / format:check / build / test / clippy / cargo fmt / cargo test 전부 커버.
- Caveat: i18n `en.ts`가 literal source of truth — 새 키는 en 먼저 추가.
- TROUBLESHOOTING.md / `src/types/generated/README.md` 문서 추가.
