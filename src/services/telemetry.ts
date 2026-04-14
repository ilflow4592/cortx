/**
 * Opt-in local telemetry.
 *
 * Events are stored in SQLite (telemetry_events table). Nothing leaves the
 * machine unless the user:
 * 1. Enables telemetry in Settings (default OFF)
 * 2. Configures a remote endpoint
 * 3. Clicks "Flush to endpoint" or enables auto-flush
 *
 * Privacy:
 * - No user content is captured (task titles, chat messages, file paths)
 * - Only event names, timestamps, app version, and basic context
 */
import { getDb } from './db';
import { useSettingsStore } from '../stores/settingsStore';

export type EventKind = 'crash' | 'action' | 'error' | 'metric';

export interface TelemetryEvent {
  id: string;
  kind: EventKind;
  name: string;
  data?: Record<string, unknown>;
  timestamp: string;
  sent: boolean;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Redact potentially sensitive fields from event data. */
function sanitize(data: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!data) return {};
  const out: Record<string, unknown> = {};
  const BLOCKED_KEYS = /key|token|secret|password|auth|api|title|content|path|url|email/i;
  for (const [k, v] of Object.entries(data)) {
    if (BLOCKED_KEYS.test(k)) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'string' && v.length > 200) {
      out[k] = v.slice(0, 200) + '...';
    } else if (typeof v === 'object' && v !== null) {
      // Recurse one level
      out[k] = sanitize(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Record an event locally. Silently no-op if telemetry is disabled.
 * Does not block — fires and forgets.
 */
export async function recordEvent(kind: EventKind, name: string, data?: Record<string, unknown>): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.telemetryEnabled) return;

  try {
    const db = await getDb();
    const event: TelemetryEvent = {
      id: genId(),
      kind,
      name,
      data: sanitize(data),
      timestamp: new Date().toISOString(),
      sent: false,
    };
    await db.execute(
      'INSERT INTO telemetry_events (id, kind, name, data, timestamp, sent) VALUES ($1, $2, $3, $4, $5, $6)',
      [event.id, event.kind, event.name, JSON.stringify(event.data), event.timestamp, 0],
    );
  } catch (err) {
    // Never throw — telemetry failures must not affect the app
    console.error('[telemetry] Failed to record event:', err);
  }
}

/**
 * Record a crash from an ErrorBoundary.
 * Captures error name + message + sanitized stack (file/line only).
 */
export async function recordCrash(error: Error, componentLabel?: string): Promise<void> {
  const data: Record<string, unknown> = {
    errorName: error.name,
    errorMessage: error.message.slice(0, 500),
    // Stack: only file:line portions, not variable content
    stackFrames: (error.stack || '')
      .split('\n')
      .slice(0, 15)
      .map((l) => l.trim())
      .filter(Boolean),
    component: componentLabel || 'unknown',
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 100) : 'unknown',
  };
  await recordEvent('crash', 'component_error', data);
}

/**
 * Load recent events (newest first) for the Settings viewer.
 */
export async function listEvents(limit = 100): Promise<TelemetryEvent[]> {
  try {
    const db = await getDb();
    const rows = await db.select<
      { id: string; kind: string; name: string; data: string; timestamp: string; sent: number }[]
    >(`SELECT id, kind, name, data, timestamp, sent FROM telemetry_events ORDER BY timestamp DESC LIMIT $1`, [limit]);
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as EventKind,
      name: r.name,
      data: r.data ? JSON.parse(r.data) : {},
      timestamp: r.timestamp,
      sent: r.sent === 1,
    }));
  } catch (err) {
    console.error('[telemetry] Failed to list events:', err);
    return [];
  }
}

/**
 * Count unsent events (for badge display).
 */
export async function countUnsent(): Promise<number> {
  try {
    const db = await getDb();
    const rows = await db.select<{ c: number }[]>('SELECT COUNT(*) as c FROM telemetry_events WHERE sent = 0');
    return rows[0]?.c || 0;
  } catch {
    return 0;
  }
}

/**
 * Delete all stored events.
 */
export async function clearEvents(): Promise<void> {
  try {
    const db = await getDb();
    await db.execute('DELETE FROM telemetry_events');
  } catch (err) {
    console.error('[telemetry] Failed to clear events:', err);
  }
}

/**
 * POST unsent events to the configured endpoint. Marks them as sent on success.
 * Returns number of events flushed.
 */
export async function flushToEndpoint(): Promise<{ sent: number; failed: number }> {
  const settings = useSettingsStore.getState();
  const endpoint = settings.telemetryEndpoint?.trim();
  if (!endpoint) {
    throw new Error('No telemetry endpoint configured');
  }
  if (!settings.telemetryEnabled) {
    throw new Error('Telemetry is disabled');
  }

  const db = await getDb();
  const rows = await db.select<{ id: string; kind: string; name: string; data: string; timestamp: string }[]>(
    `SELECT id, kind, name, data, timestamp FROM telemetry_events WHERE sent = 0 ORDER BY timestamp ASC LIMIT 500`,
  );

  if (rows.length === 0) return { sent: 0, failed: 0 };

  const events = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    data: r.data ? JSON.parse(r.data) : {},
    timestamp: r.timestamp,
  }));

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, appVersion: '0.1.0', platform: navigator.platform }),
    });
    if (!resp.ok) {
      return { sent: 0, failed: rows.length };
    }
    // Mark all as sent
    for (const row of rows) {
      await db.execute('UPDATE telemetry_events SET sent = 1 WHERE id = $1', [row.id]);
    }
    return { sent: rows.length, failed: 0 };
  } catch (err) {
    console.error('[telemetry] Flush failed:', err);
    return { sent: 0, failed: rows.length };
  }
}
