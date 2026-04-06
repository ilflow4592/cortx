# Cortx

> Your brain can't hold 5 contexts at once. Cortx can.

Context switching manager for developers. Each task gets its own isolated worktree, terminal, AI chat, and context pack.

## Features

- **Task = Worktree** — Git worktree isolation per task. Switch tasks without branch conflicts.
- **Built-in Terminal** — PTY terminal per task, starts in the worktree directory.
- **Claude Code** — Claude CLI integration using your subscription. No API credits needed.
- **AI Chat (BYOK)** — Claude/OpenAI/Ollama with your own API key.
- **Context Pack** — Auto-collect from GitHub, Slack, Notion. Drag & drop files. Delta detection on resume.
- **Semantic Search** — Ollama + Qdrant vector DB for cross-task knowledge retrieval.
- **3-Layer Tasks** — Focus Slots / Batch Queue / Reactive Stream.
- **Interrupt Log** — Track pause reasons, duration, and patterns.
- **Daily Report** — Focus time, interrupt stats, and focus ratio.
- **Global Shortcuts** — Cmd+Shift+P (pause), Cmd+Shift+R (resume), Cmd+1-9 (switch).

## Quick Start

```bash
git clone https://github.com/ilflow4592/cortx.git
cd cortx
./setup.sh
```

The setup script installs everything automatically:
- Node.js, Rust, Ollama, Qdrant
- npm dependencies
- Builds the .dmg

## Development

> If you just installed Rust for the first time, restart your terminal or run `source ~/.cargo/env` before proceeding.

```bash
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Output: `src-tauri/target/release/bundle/macos/cortx.app`

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | Tauri v2 |
| Frontend | React 18 + TypeScript + Vite |
| Style | Tailwind CSS v4 + CSS variables |
| State | Zustand |
| Storage | tauri-plugin-store (JSON) |
| Terminal | xterm.js + Rust PTY |
| Embeddings | Ollama (nomic-embed-text) |
| Vector DB | Qdrant |
| AI | Claude CLI / BYOK API |

## Optional Services

| Service | Purpose | Required? |
|---------|---------|-----------|
| Ollama | Local embeddings for semantic search | No (keyword fallback) |
| Qdrant | Vector DB for cross-task knowledge | No (works without) |
| Claude CLI | Claude Code tab | No (use Chat tab instead) |

```bash
# Start optional services
ollama serve
docker run -d -p 6333:6333 qdrant/qdrant
```

## License

MIT
