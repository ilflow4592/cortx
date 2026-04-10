-- Full-text search index across tasks and chat messages
-- Uses SQLite FTS5 with unicode61 tokenizer for Korean + English support

CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    kind,              -- 'task' | 'message'
    task_id UNINDEXED,
    message_id UNINDEXED,
    title,             -- task title (for task rows) or empty (for messages)
    content,           -- task memo+branch (tasks) or message content (messages)
    tokenize = 'unicode61'
);

-- Populate with existing data on first run
INSERT INTO search_index (kind, task_id, message_id, title, content)
SELECT 'task', id, '', title, COALESCE(memo, '') || ' ' || COALESCE(branch_name, '')
FROM tasks;

INSERT INTO search_index (kind, task_id, message_id, title, content)
SELECT 'message', task_id, id, '', content
FROM chat_messages;

-- Triggers to keep search_index in sync with tasks
CREATE TRIGGER IF NOT EXISTS tasks_ai AFTER INSERT ON tasks BEGIN
    INSERT INTO search_index (kind, task_id, message_id, title, content)
    VALUES ('task', new.id, '', new.title, COALESCE(new.memo, '') || ' ' || COALESCE(new.branch_name, ''));
END;

CREATE TRIGGER IF NOT EXISTS tasks_ad AFTER DELETE ON tasks BEGIN
    DELETE FROM search_index WHERE kind = 'task' AND task_id = old.id;
    DELETE FROM search_index WHERE kind = 'message' AND task_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS tasks_au AFTER UPDATE ON tasks BEGIN
    DELETE FROM search_index WHERE kind = 'task' AND task_id = old.id;
    INSERT INTO search_index (kind, task_id, message_id, title, content)
    VALUES ('task', new.id, '', new.title, COALESCE(new.memo, '') || ' ' || COALESCE(new.branch_name, ''));
END;

-- Triggers to keep search_index in sync with chat_messages
CREATE TRIGGER IF NOT EXISTS chat_ai AFTER INSERT ON chat_messages BEGIN
    INSERT INTO search_index (kind, task_id, message_id, title, content)
    VALUES ('message', new.task_id, new.id, '', new.content);
END;

CREATE TRIGGER IF NOT EXISTS chat_ad AFTER DELETE ON chat_messages BEGIN
    DELETE FROM search_index WHERE kind = 'message' AND message_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS chat_au AFTER UPDATE ON chat_messages BEGIN
    DELETE FROM search_index WHERE kind = 'message' AND message_id = old.id;
    INSERT INTO search_index (kind, task_id, message_id, title, content)
    VALUES ('message', new.task_id, new.id, '', new.content);
END;
