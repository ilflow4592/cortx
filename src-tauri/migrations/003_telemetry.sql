-- Telemetry events log (local, opt-in)

CREATE TABLE IF NOT EXISTS telemetry_events (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,          -- 'crash' | 'action' | 'error' | 'metric'
    name TEXT NOT NULL,          -- specific event name
    data TEXT,                    -- JSON payload
    timestamp TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_telemetry_kind ON telemetry_events(kind);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_sent ON telemetry_events(sent);
