<p align="center">
  <img src="docs/logo.png" alt="Cortx" width="120" />
</p>

<h1 align="center">Cortx</h1>

<p align="center">
  <strong>Your brain can't hold 5 contexts at once. Cortx can.</strong><br/>
  A desktop app that turns Claude Code into a task-centric development workflow.
</p>

<p align="center">
  <a href="https://github.com/ilflow4592/cortx/releases/latest"><strong>Download</strong></a> &nbsp;·&nbsp;
  macOS (ARM/Intel) &nbsp;·&nbsp; Windows &nbsp;·&nbsp; Linux
</p>

---

## How It Works

Cortx wraps the `claude` CLI and gives each task an isolated environment. You manage multiple AI-assisted development tasks in parallel — no branch switching, no session bleed.

### Workflow: From Ticket to PR

```
1. Create Task           2. Attach Context         3. Run Pipeline
   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
   │ + New Task    │         │ Context Pack │         │ /pipeline:   │
   │ Branch: feat/ │   →     │ Notion page  │   →     │  dev-task    │
   │ BE-1234       │         │ Slack thread │         │              │
   │               │         │ GitHub issue │         │ Grill-me Q&A │
   └──────────────┘         └──────────────┘         └──────────────┘
                                                            │
   6. Review Loop          5. Commit & PR            4. Implement
   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
   │ CI review    │         │ /git:commit  │         │ /pipeline:   │
   │ bot comments │   ←     │ /git:pr      │   ←     │  dev-implement│
   │ auto-fix     │         │              │         │              │
   │ re-push      │         │ User confirm │         │ Code + Test  │
   └──────────────┘         └──────────────┘         └──────────────┘
```

### Step-by-Step Usage

**Step 1: Create a Project and Task**

Open Cortx, register your git repository as a Project, then create a Task. Each task automatically gets:

- An isolated git worktree (`.worktrees/<branch-name>/`)
- Its own Claude Code session
- A dedicated terminal

**Step 2: Build a Context Pack**

Switch to the **Context Pack** tab and attach your task specification:

- **Notion** — paste a Notion page URL or search via MCP
- **Slack** — pull relevant thread messages via MCP
- **GitHub** — attach issues or PR discussions
- **Pin** — drag & drop any local file

The Context Pack is injected into Claude's prompt when the pipeline starts, so Claude understands your task without manual copy-pasting.

**Step 3: Run `/pipeline:dev-task` (Grill-me)**

Type `/pipeline:dev-task` in the Claude tab or click **Run Pipeline** in the sidebar. Claude will:

1. Read your Context Pack
2. Load project conventions (`.ai/docs/`, `ARCHITECTURE.md`)
3. Explore the codebase for relevant files
4. Ask clarifying questions one-by-one (**Grill-me** — business decisions only, not technical details it can figure out from code)

Answer the questions. When done, type "끝" or "done".

**Step 4: Run `/pipeline:dev-implement`**

Claude creates a development plan, then implements:

1. Writes code following your project conventions
2. Runs tests
3. Asks for your confirmation before commit

**Step 5: Commit & Create PR**

Use `/git:commit` for conventional commit messages and `/git:pr` for PR creation with your `.github/PULL_REQUEST_TEMPLATE.md`.

Both commands require user confirmation before executing.

**Step 6: Review Loop (`/pipeline:dev-review-loop`)**

After push, your CI runs Claude-based PR review. Then:

1. Cortx collects the review comments
2. Classifies each: Accept / Partial / Acknowledge / Reject
3. Fixes code and replies to comments
4. Asks for your confirmation before commit & push
5. Repeats until the CI review approves

The pipeline dashboard tracks progress through all phases in real time.

---

## Features

| Feature                     | Description                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- |
| **Task = Worktree**         | Each task gets an isolated `.worktrees/<slug>` directory                         |
| **Claude Code Integration** | Uses your existing Claude CLI subscription (OAuth or API key)                    |
| **Pipeline Workflow**       | Grill-me → Dev Plan → Implement → Commit/PR → Review, with real-time dashboard   |
| **Multi-task Parallelism**  | Run pipelines on multiple tasks simultaneously                                   |
| **Context Pack**            | Auto-collect from GitHub, Slack, Notion via MCP; drag & drop files               |
| **Built-in Terminal**       | xterm.js + Rust PTY, starts in worktree, one per task                            |
| **Session Persistence**     | Claude `--resume` session IDs survive app restarts                               |
| **Multi-window**            | Pop out any task to its own window                                               |
| **Command Palette**         | Quick navigation and command execution (⌘K)                                      |
| **Cost Dashboard**          | Track API token usage and cost per task                                          |
| **Diff Viewer**             | Visual git diff with inline change highlighting                                  |
| **Changes View**            | Stage/unstage files, review diffs before commit                                  |
| **MCP Server Manager**      | Discover, add, toggle, and configure MCP servers per project                     |
| **Project Scan**            | Auto-detect tech stack, docs quality, and language histogram on project creation |
| **Slash Command Builder**   | Visual editor for creating and editing pipeline slash commands                   |
| **Auto Updater**            | In-app update checking with signed releases                                      |
| **Crash Recovery**          | Automatic session recovery dialog after unexpected crashes                       |
| **Worktree Cleanup**        | Bulk cleanup of stale worktrees and branches                                     |
| **Daily Report**            | Focus time, interrupt stats, focus ratio                                         |
| **i18n**                    | Korean / English                                                                 |

## Quick Start

```bash
git clone https://github.com/ilflow4592/cortx.git
cd cortx
./setup.sh
```

### What `setup.sh` installs automatically

- Homebrew, Node.js 22, Rust (via rustup)
- Ollama + `nomic-embed-text` embedding model
- Qdrant container (if Docker is already installed)
- npm dependencies
- Cortx `.dmg` build (optional)

### Manual prerequisites

**Claude CLI** (required):

```bash
npm install -g @anthropic-ai/claude-code
claude login
```

**Docker Desktop** (optional — for Qdrant semantic search):

```bash
brew install --cask docker
open -a Docker
```

After installing, re-run `./setup.sh` to finish setup.

## Architecture

```
Frontend (React + TypeScript)                 Backend (Rust + Tauri 2)
├── components/                               ├── lib.rs           — app builder + graceful shutdown
│   ├── claude/        — chat UI + session    ├── pty.rs           — PTY manager (terminal + Claude CLI)
│   │   ├── ChatInput, ChatMessageList        ├── types.rs         — shared structs
│   │   ├── claudeEventProcessor.ts           └── commands/
│   │   └── pipelineMarkers.ts                    ├── claude/      — CLI spawn + streaming
│   ├── context/       — Context Pack UI          │   ├── spawn.rs     — process lifecycle
│   │   ├── ContextPack, ContextItemCard          │   ├── pty_proxy.rs — PTY bridge
│   │   ├── SearchResourcesGrid                   │   ├── slash.rs     — slash command resolution
│   │   └── useFileDropHandler.ts                 │   └── window.rs    — multi-window
│   ├── sidebar/       — task list + pipeline     ├── scan/        — project scanning
│   │   ├── TaskRow, ProjectGroup                 │   ├── tech_stack.rs — manifest detection
│   │   └── usePipelineRunner.ts                  │   ├── grader.rs    — docs quality grading
│   ├── cost-dashboard/ — API cost tracking       │   ├── scaffold.rs  — auto-fill templates
│   ├── diff-viewer/    — git diff display        │   └── fallback.rs  — file tree fallback
│   ├── changes-view/   — staging UI              ├── mcp/         — MCP server management
│   ├── mcp-manager/    — MCP config UI           │   ├── discovery.rs · mutate.rs
│   ├── command-palette/ — ⌘K navigation          │   ├── toggle.rs   · json_io.rs
│   ├── slash-builder/  — command editor          ├── git.rs       — worktree + diff
│   ├── settings/       — app preferences         ├── oauth.rs     — Claude OAuth callback
│   ├── right-panel/    — dashboard + tabs        ├── shell.rs     — shell exec + cortx.yaml
│   └── main-panel/     — task header + tabs      ├── secrets.rs   — credential management
│                                                 └── notion_api.rs — Notion API proxy
├── stores/ (9 Zustand stores)
│   ├── taskStore       — tasks + worktrees
│   ├── projectStore    — projects + scan status
│   ├── contextPackStore — context items
│   ├── settingsStore   — user preferences
│   ├── mcpStore        — MCP server state
│   ├── modalStore      — centralized modal state
│   ├── layoutStore     — panel sizes + visibility
│   ├── scanStatusStore — project scan progress
│   └── contextHistoryStore — search history
│
├── services/
│   ├── contextCollection.ts  — unified context gathering
│   ├── contextSources/       — GitHub, Slack, Notion collectors
│   ├── db/                   — SQLite via better-sqlite3
│   ├── vector-search/        — Ollama + Qdrant semantic search
│   ├── persistence.ts        — localStorage debounced save
│   ├── updater.ts            — auto-update service
│   ├── secrets.ts            — credential management
│   └── task-export/          — JSON/Markdown export
│
├── hooks/
│   ├── useInitialLoad.ts     — app startup sequence
│   ├── useStorePersistence.ts — save-on-change
│   ├── useGlobalShortcuts.ts  — keyboard shortcuts
│   ├── usePipelineConfig.ts   — pipeline settings
│   └── useProjectScan.ts     — scan orchestration
│
└── types/
    └── generated/ (13 types)  ← auto-generated by ts-rs
```

**Key design decisions:**

- `/pipeline:dev-task` typed in chat and the "Run Pipeline" button both call the same `runPipeline()` utility
- Message cache is module-level so task switching does not lose streaming state
- Slash commands resolve from `.claude/commands/**.md` (project first, then global)
- Pipeline phases are tracked via `[PIPELINE:phase:status]` markers Claude emits in its text output
- Modal state centralized in `useModalStore` — no props drilling
- Large components (>300 lines) decomposed into subdirectories with `api.ts`, `types.ts`, `parse.ts` pattern
- All Tauri API imports use dynamic `import()` to avoid webview initialization issues

## Pipeline Skills

| Command                     | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| `/pipeline:dev-task`        | Grill-me Q&A + dev plan writing              |
| `/pipeline:dev-implement`   | Plan → implementation → tests → commit/PR    |
| `/pipeline:dev-review-loop` | CI review response → fix → re-push loop      |
| `/pipeline:dev-resume`      | Resume an interrupted pipeline               |
| `/pipeline:pr-review-fu`    | Track review resolution + incremental review |
| `/git:commit`               | Conventional commit + auto push              |
| `/git:pr`                   | PR creation with template                    |

Skills live in `.claude/commands/pipeline/*.md` and resolve at runtime with `$ARGUMENTS`, `{TASK_ID}`, `{TASK_NAME}` substitution.

## Development

```bash
npm run tauri dev      # dev mode
npm run tauri build    # production build (.dmg / .msi / .deb)
npm run lint           # ESLint
npm run format         # Prettier
npm run test           # Vitest (28 test files)
cd src-tauri && cargo test --lib  # Rust tests (39 tests) + ts-rs type export
```

## Tech Stack

| Layer      | Tech                                |
| ---------- | ----------------------------------- |
| Framework  | Tauri 2                             |
| Frontend   | React 18 + TypeScript 6 + Vite 8    |
| Style      | Tailwind CSS v4                     |
| State      | Zustand 5                           |
| Storage    | localStorage (debounced persist)    |
| Terminal   | xterm.js 6 + Rust `portable-pty`    |
| Claude     | Claude CLI via PTY (stream-json)    |
| Type Sync  | ts-rs (Rust → TypeScript, 13 types) |
| Embeddings | Ollama (`nomic-embed-text`)         |
| Vector DB  | Qdrant                              |
| Testing    | Vitest + Cargo test                 |

## Optional Services

| Service     | Purpose                                    | Required? |
| ----------- | ------------------------------------------ | --------- |
| Claude CLI  | Claude Code integration                    | Yes       |
| Ollama      | Local embeddings for semantic search       | No        |
| Qdrant      | Vector DB for cross-task knowledge         | No        |
| MCP servers | Context collection (GitHub, Notion, Slack) | No        |
| Docker      | Required for Qdrant                        | No        |

## License

MIT
