<p align="center">
  <img src="docs/logo.png" alt="Cortx" width="120" />
</p>

<h1 align="center">Cortx</h1>

<p align="center">
  <strong>Your brain can't hold 5 contexts at once. Cortx can.</strong><br/>
  A desktop app that turns Claude Code into a task-centric development workflow.
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

- **Task = Worktree** — Each task gets an isolated `.worktrees/<slug>` directory
- **Claude Code integration** — Uses your existing Claude CLI subscription (OAuth or API key), no extra billing
- **Pipeline workflow** — Grill-me → Dev Plan → Implement → Commit/PR → Review, with real-time dashboard
- **Multi-task parallelism** — Run pipelines on multiple tasks simultaneously
- **Context Pack** — Auto-collect from GitHub, Slack, Notion via MCP; drag & drop files
- **Built-in terminal** — xterm.js + Rust PTY, starts in worktree, one per task
- **Session persistence** — Claude `--resume` session IDs survive app restarts
- **Multi-window** — Pop out any task to its own window
- **Daily Report** — Focus time, interrupt stats, focus ratio
- **i18n** — Korean / English

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
│   │   execution
│   ├── chatState.ts    — per-task message
│   │   cache (survives component remount)
│   └── terminalState.ts
└── types/
```

**Key design decisions:**

- `/pipeline:dev-task` typed in chat and the "Run Pipeline" button both call the same `runPipeline()` utility
- Message cache is module-level so task switching does not lose streaming state
- Slash commands resolve from `.claude/commands/**.md` (project first, then global)
- Pipeline phases are tracked via `[PIPELINE:phase:status]` markers Claude emits in its text output

## Pipeline Skills

| Command | Purpose |
|---------|---------|
| `/pipeline:dev-task` | Grill-me Q&A + dev plan writing |
| `/pipeline:dev-implement` | Plan → implementation → tests → commit/PR |
| `/pipeline:dev-review-loop` | CI review response → fix → re-push loop |
| `/pipeline:dev-resume` | Resume an interrupted pipeline |
| `/git:commit` | Conventional commit + auto push |
| `/git:pr` | PR creation with template |

Skills live in `.claude/commands/pipeline/*.md` and resolve at runtime with `$ARGUMENTS`, `{TASK_ID}`, `{TASK_NAME}` substitution.

## Development

```bash
npm run tauri dev      # dev mode
npm run tauri build    # production build (.dmg)
npm run lint           # ESLint
npm run format         # Prettier
npm run test           # Vitest
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Tauri 2 |
| Frontend | React 18 + TypeScript + Vite |
| Style | Tailwind CSS v4 + global CSS |
| State | Zustand |
| Storage | localStorage (debounced persist) |
| Terminal | xterm.js + Rust `portable-pty` |
| Claude | Claude CLI via PTY (stream-json) |
| Embeddings | Ollama (`nomic-embed-text`) |
| Vector DB | Qdrant |
| Testing | Vitest + @testing-library/react |

## Optional Services

| Service | Purpose | Required? |
|---------|---------|-----------|
| Claude CLI | Claude Code integration | Yes |
| Ollama | Local embeddings for semantic search | No |
| Qdrant | Vector DB for cross-task knowledge | No |
| MCP servers | Context collection (GitHub, Notion, Slack) | No |

## License

MIT
