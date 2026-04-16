/**
 * Guardrails dashboard — 현재 guardrail 작동 상태 가시화.
 *
 * telemetry 이벤트를 읽어 최근 위반/탐지를 요약.
 * Opt-in telemetry가 꺼져 있으면 안내 메시지 표시.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, AlertTriangle, Key, Terminal, FileLock2, RefreshCw } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { listEvents, type TelemetryEvent } from '../../services/telemetry';

interface EventCounts {
  total: number;
  last24h: number;
  byName: Record<string, number>;
}

const GUARDRAIL_EVENT_NAMES = [
  'counter_question_violation',
  'context_injection_detected',
  'secret_leak_masked',
  'dangerous_command_detected',
  'token_budget_exceeded',
  'canary_leak_detected',
] as const;

const EVENT_META: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  counter_question_violation: { label: '역질문 처리 위반', icon: AlertTriangle, color: '#f59e0b' },
  context_injection_detected: { label: 'Prompt Injection 패턴', icon: Shield, color: '#f59e0b' },
  secret_leak_masked: { label: 'Secret 유출 마스킹', icon: Key, color: '#ef4444' },
  dangerous_command_detected: { label: '위험 명령 감지', icon: Terminal, color: '#ef4444' },
  token_budget_exceeded: { label: '토큰 예산 초과', icon: FileLock2, color: '#f59e0b' },
  canary_leak_detected: { label: 'Canary 유출 (Injection 성공)', icon: Shield, color: '#dc2626' },
};

export function GuardrailsSettings() {
  const telemetryEnabled = useSettingsStore((s) => s.telemetryEnabled);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listEvents(500);
      const filtered = all.filter((e) =>
        GUARDRAIL_EVENT_NAMES.includes(e.name as (typeof GUARDRAIL_EVENT_NAMES)[number]),
      );
      setEvents(filtered);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo<EventCounts>(() => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const byName: Record<string, number> = {};
    let last24h = 0;
    for (const e of events) {
      byName[e.name] = (byName[e.name] || 0) + 1;
      if (now - new Date(e.timestamp).getTime() < DAY) last24h++;
    }
    return { total: events.length, last24h, byName };
  }, [events]);

  if (!telemetryEnabled) {
    return (
      <div style={{ padding: 20, color: 'var(--fg-muted)', fontSize: 13 }}>
        <Shield size={32} color="var(--fg-dim)" style={{ marginBottom: 12 }} />
        <div style={{ marginBottom: 8, color: 'var(--fg-primary)', fontWeight: 600 }}>Guardrail 대시보드</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          Guardrail 이벤트를 보려면 <strong>Telemetry</strong> 탭에서 로컬 텔레메트리를 활성화하세요. 모든 이벤트는 로컬
          SQLite에만 저장되며 외부로 전송되지 않습니다 (원격 엔드포인트 설정 전까지).
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Shield size={18} color="var(--accent-bright)" />
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--fg-primary)' }}>Guardrail 활동</h3>
        <button
          onClick={load}
          disabled={loading}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            padding: '4px 8px',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
          }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <SummaryCard label="총 이벤트" value={counts.total} />
        <SummaryCard label="최근 24시간" value={counts.last24h} highlight={counts.last24h > 0} />
      </div>

      {/* 카테고리별 */}
      <div style={{ marginBottom: 8, fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>카테고리</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {GUARDRAIL_EVENT_NAMES.map((name) => {
          const meta = EVENT_META[name];
          const count = counts.byName[name] || 0;
          const Icon = meta.icon;
          return (
            <div
              key={name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                border: '1px solid var(--border-strong)',
                borderRadius: 6,
                background: count > 0 ? 'rgba(239,68,68,0.04)' : 'transparent',
              }}
            >
              <Icon size={14} color={count > 0 ? meta.color : 'var(--fg-dim)'} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-primary)' }}>{meta.label}</span>
              <span
                style={{
                  fontSize: 11,
                  color: count > 0 ? meta.color : 'var(--fg-muted)',
                  fontWeight: 600,
                  fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
                }}
              >
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {/* 최근 이벤트 */}
      <div style={{ marginTop: 20, marginBottom: 8, fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>
        최근 이벤트 (최대 20개)
      </div>
      {events.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--fg-faint)', padding: 10 }}>
          감지된 이벤트 없음 — guardrail이 조용한 건 좋은 소식입니다.
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto', fontSize: 11, fontFamily: "'Fira Code', monospace" }}>
          {events.slice(0, 20).map((e) => (
            <div
              key={e.id}
              style={{
                padding: '4px 0',
                borderBottom: '1px solid var(--border-muted)',
                display: 'flex',
                gap: 8,
              }}
            >
              <span style={{ color: 'var(--fg-dim)' }}>{formatTime(e.timestamp)}</span>
              <span style={{ color: EVENT_META[e.name]?.color || 'var(--fg-muted)' }}>
                {EVENT_META[e.name]?.label || e.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      style={{
        padding: '10px 12px',
        border: '1px solid var(--border-strong)',
        borderRadius: 6,
        background: highlight ? 'rgba(239,68,68,0.06)' : 'var(--bg-chip)',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: highlight ? '#ef4444' : 'var(--fg-primary)' }}>{value}</div>
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d
    .getSeconds()
    .toString()
    .padStart(2, '0')}`;
}
