-- Cortx initial SQLite schema

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    local_path TEXT NOT NULL DEFAULT '',
    github_owner TEXT NOT NULL DEFAULT '',
    github_repo TEXT NOT NULL DEFAULT '',
    base_branch TEXT NOT NULL DEFAULT 'main',
    slack_channels TEXT NOT NULL DEFAULT '[]',  -- JSON array
    color TEXT NOT NULL DEFAULT '#818cf8',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting',
    layer TEXT NOT NULL DEFAULT 'focus',
    project_id TEXT,
    branch_name TEXT NOT NULL DEFAULT '',
    worktree_path TEXT NOT NULL DEFAULT '',
    repo_path TEXT NOT NULL DEFAULT '',
    memo TEXT NOT NULL DEFAULT '',
    elapsed_seconds INTEGER NOT NULL DEFAULT 0,
    model_override TEXT,           -- JSON
    pipeline TEXT,                  -- JSON (PipelineState)
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at DESC);

CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    role TEXT NOT NULL,             -- 'user' | 'assistant'
    content TEXT NOT NULL,
    model TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_task ON chat_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(task_id, timestamp);

CREATE TABLE IF NOT EXISTS interrupts (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    paused_at TEXT NOT NULL,
    resumed_at TEXT,
    reason TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interrupts_task ON interrupts(task_id);

-- Single-row settings table for active task tracking
CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
