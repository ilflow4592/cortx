# Cortx

> Your brain can't hold 5 contexts at once. Cortx can.

A Tauri desktop app that turns Claude Code into a task-centric development workflow. Each task is an isolated git worktree with its own Claude session, terminal, and context pack — so you can run multiple AI-assisted tasks in parallel without branch conflicts or session bleed.

## What it does

Cortx wraps the `claude` CLI and gives each task:

- **An isolated git worktree** — no branch switching, no stash, no conflicts
- **A persistent Claude session** — resume conversations across app restarts
- **A dedicated PTY terminal** — starts in the worktree directory
- **A Context Pack** — GitHub issues/PRs, Slack threads, Notion pages, pinned files
- **A Pipeline dashboard** — track progress through Grill-me → Dev Plan → Implement → Commit/PR → Review phases

One-click "Run Pipeline" kicks off `/pipeline:dev-task` in the background across multiple tasks at once. Each pipeline emits markers that update the dashboard in real time.

## Architecture

```
Frontend (React + TypeScript)                Backend (Rust + Tauri 2)
├── components/                               ├── lib.rs       — app builder + graceful shutdown
│   ├── claude/  — chat UI + session hook     ├── pty.rs       — PTY manager (terminal + Claude CLI)
│   ├── sidebar/ — task list + pipeline       ├── types.rs     — shared structs
│   └── ...                                   └── commands/
├── stores/       — Zustand (tasks, projects, │     ├── git.rs     — worktree + diff
│                   settings, context)        │     ├── oauth.rs   — Claude OAuth callback
├── services/     — AI, OAuth, context        │     ├── mcp.rs     — MCP server discovery
│                   collectors (GH/Slack/     │     ├── shell.rs   — shell exec + cortx.yaml
│                   Notion/MCP)               │     └── claude.rs  — Claude CLI spawn + slash commands
├── utils/
│   ├── pipelineExec.ts — shared pipeline     Communication: invoke() + listen()/emit()
│   │   execution (used by both Sidebar
│   │   button and chat /pipeline:* input)
│   ├── chatState.ts    — per-task message
│   │   cache (survives component remount)
│   └── terminalState.ts
└── types/
```

**Key design decisions:**

- `/pipeline:dev-task` typed in chat and the "Run Pipeline" button both call the same `runPipeline()` utility, so background and foreground pipelines produce identical message structures.
- Message cache is module-level so task switching does not lose streaming state.
- Slash commands are resolved from `.claude/commands/**.md` (project first, then global) — built-in commands (`/mcp`, `/clear`, `/cost`, `/status`) are intercepted locally and never sent to Claude.
- Pipeline phases are tracked via `[PIPELINE:phase:status]` markers Claude emits in its text output.

## Features

- **Task = Worktree** — Each task gets an isolated `.worktrees/<slug>` directory
- **Claude Code integration** — Uses your existing Claude CLI subscription (OAuth or API key), no extra billing
- **Pipeline workflow** — Grill-me → Dev Plan → Implement → Commit/PR → Review, with dashboard tracking
- **Multi-task parallelism** — Run pipelines on multiple tasks simultaneously; Sidebar shows live status per task
- **Context Pack** — Auto-collect from GitHub, Slack, Notion via MCP; drag & drop files; delta detection on resume
- **Semantic search** — Optional Ollama + Qdrant for cross-task knowledge retrieval
- **3-Layer tasks** — Focus Slots / Batch Queue / Reactive Stream
- **Built-in terminal** — xterm.js + Rust PTY, starts in worktree, one per task
- **Session persistence** — Claude `--resume` session IDs survive app restarts
- **Interrupt log** — Track pause reasons, duration, patterns
- **Daily Report** — Focus time, interrupt stats, focus ratio
- **Global shortcuts** — `Cmd+Shift+P` pause, `Cmd+Shift+R` resume, `Cmd+1-9` switch

## Quick Start

```bash
git clone https://github.com/ilflow4592/cortx.git
cd cortx
./setup.sh
```

### What `setup.sh` installs automatically

- Homebrew
- Node.js 22
- Rust (via rustup)
- Ollama + `nomic-embed-text` embedding model
- Qdrant container (if Docker is already installed)
- npm dependencies
- Cortx `.dmg` build (optional — asks before building)

### What you need to install manually

Two things require manual installation because they need GUI setup or OAuth login:

**1. Docker Desktop** (required for Qdrant — semantic search)

```bash
brew install --cask docker
open -a Docker  # launch once to accept the license
```

**2. Claude CLI** (required for Claude Code integration)

```bash
npm install -g @anthropic-ai/claude-code
claude login  # opens browser for OAuth
```

After installing both, re-run `./setup.sh` — it will detect them and finish the Qdrant container setup.

## Development

> If you just installed Rust for the first time, restart your terminal or run `source ~/.cargo/env` first.

```bash
npm run tauri dev      # dev mode
npm run tauri build    # production build
npm run lint           # ESLint
npm run format         # Prettier
npm run test           # Vitest (store unit tests)
```

CI runs lint, format check, build, and `cargo clippy` on every PR — see `.github/workflows/ci.yml`.

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Tauri 2 |
| Frontend | React 18 + TypeScript + Vite |
| Style | Tailwind CSS v4 + global CSS |
| State | Zustand (tasks, projects, settings, context pack) |
| Storage | localStorage (debounced persist subscriber) |
| Terminal | xterm.js + Rust `portable-pty` |
| Claude | Claude CLI via PTY (stream-json output) |
| Embeddings | Ollama (`nomic-embed-text`) |
| Vector DB | Qdrant |
| Testing | Vitest + @testing-library/react |

## Pipeline Skills

Pipeline skills live in `.claude/commands/pipeline/*.md` as standard Claude Code slash commands:

- `/pipeline:dev-task` — Grill-me + dev plan writing
- `/pipeline:dev-implement` — Plan → implementation → tests → commit/PR
- `/pipeline:dev-resume` — Resume an interrupted pipeline

The app resolves `/pipeline:dev-task` → `.claude/commands/pipeline/dev-task.md` at runtime and substitutes `$ARGUMENTS`, `{TASK_ID}`, `{TASK_NAME}` placeholders.

## Optional Services

| Service | Purpose | Required? |
|---------|---------|-----------|
| Claude CLI | Claude Code integration | Yes |
| Ollama | Local embeddings for semantic search | No (keyword fallback) |
| Qdrant | Vector DB for cross-task knowledge | No |
| MCP servers | Context collection (GitHub, Notion, Slack) | No |

```bash
ollama serve
docker run -d -p 6333:6333 qdrant/qdrant
```

## License

MIT
