#!/bin/bash
set -e

echo ""
echo "  🧠 Cortx Setup"
echo "  ─────────────────────────"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

check() { command -v "$1" &>/dev/null; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; }
step()  { echo -e "\n  ${GREEN}→${NC} $1"; }

# ── 1. Homebrew ──
if ! check brew; then
  step "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ok "Homebrew installed"
else
  ok "Homebrew"
fi

# ── 2. Node.js ──
if ! check node || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  step "Installing Node.js 22..."
  if check nvm; then
    nvm install 22 && nvm use 22
  else
    brew install node@22
    export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
  fi
  ok "Node.js $(node -v)"
else
  ok "Node.js $(node -v)"
fi

# ── 3. Rust ──
if ! check rustc; then
  step "Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source "$HOME/.cargo/env"
  ok "Rust $(rustc --version | cut -d' ' -f2)"
else
  ok "Rust $(rustc --version | cut -d' ' -f2)"
fi

# ── 4. Ollama (optional but recommended) ──
if ! check ollama; then
  step "Installing Ollama (for semantic search)..."
  brew install ollama
  ok "Ollama installed"
else
  ok "Ollama"
fi

# Pull embedding model
step "Pulling embedding model..."
ollama pull nomic-embed-text 2>/dev/null && ok "nomic-embed-text model" || warn "Could not pull model (start Ollama first: ollama serve)"

# ── 5. Qdrant (optional) ──
if check docker; then
  if ! docker ps 2>/dev/null | grep -q qdrant; then
    step "Starting Qdrant (vector DB)..."
    docker run -d --name cortx-qdrant -p 6333:6333 qdrant/qdrant 2>/dev/null || docker start cortx-qdrant 2>/dev/null
    ok "Qdrant running on :6333"
  else
    ok "Qdrant already running"
  fi
else
  warn "Docker not found — Qdrant (semantic search) will not be available"
  echo "       Install Docker: brew install --cask docker"
fi

# ── 6. Claude CLI (optional) ──
if check claude; then
  ok "Claude CLI"
else
  warn "Claude CLI not found — Claude Code tab will not work"
  echo "       Install: npm install -g @anthropic-ai/claude-code"
fi

# ── 7. Install npm dependencies ──
step "Installing dependencies..."
npm install
ok "npm dependencies"

# ── 8. Build ──
echo ""
read -p "  Build the app now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  step "Building Cortx..."
  source "$HOME/.cargo/env" 2>/dev/null
  npx tauri build
  echo ""
  echo -e "  ${GREEN}✓ Build complete!${NC}"
  echo ""
  echo "  App:  src-tauri/target/release/bundle/macos/cortx.app"
  echo "  DMG:  src-tauri/target/release/bundle/dmg/cortx_*.dmg"
  echo ""
  echo "  Run:  open src-tauri/target/release/bundle/macos/cortx.app"
else
  echo ""
  echo "  To build later:  npm run tauri build"
  echo "  To develop:      npm run tauri dev"
fi

echo ""
echo -e "  ${GREEN}🧠 Cortx is ready!${NC}"
echo ""
echo "  Quick start:"
echo "    npm run tauri dev     # Development mode"
echo "    ollama serve          # Start Ollama (if not running)"
echo ""
