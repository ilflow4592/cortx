/**
 * Guardrails dashboard — 현재 guardrail 작동 상태 가시화.
 *
 * telemetry 이벤트를 읽어 최근 위반/탐지를 요약.
 * Opt-in telemetry가 꺼져 있으면 안내 메시지 표시.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, AlertTriangle, Key, Terminal, FileLock2, RefreshCw, Globe, FolderLock, Radio } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { listEvents, type TelemetryEvent } from '../../services/telemetry';
import { subscribeGuardrailEvents, getRecentEvents, type GuardrailEvent } from '../../services/guardrailEventBus';
import { GuardrailTestPanel } from './_GuardrailTestPanel';
import { ReviewQueue } from './_ReviewQueue';

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
  'sensitive_file_access',
  'workspace_boundary_violation',
  'network_exfil_detected',
] as const;

const EVENT_META: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  counter_question_violation: { label: '역질문 처리 위반', icon: AlertTriangle, color: '#f59e0b' },
  context_injection_detected: { label: 'Prompt Injection 패턴', icon: Shield, color: '#f59e0b' },
  secret_leak_masked: { label: 'Secret 유출 마스킹', icon: Key, color: '#ef4444' },
  dangerous_command_detected: { label: '위험 명령 감지', icon: Terminal, color: '#ef4444' },
  token_budget_exceeded: { label: '토큰 예산 초과', icon: FileLock2, color: '#f59e0b' },
  canary_leak_detected: { label: 'Canary 유출 (Injection 성공)', icon: Shield, color: '#dc2626' },
  sensitive_file_access: { label: '민감 파일 접근', icon: FolderLock, color: '#ef4444' },
  workspace_boundary_violation: { label: '워크스페이스 이탈', icon: FolderLock, color: '#f59e0b' },
  network_exfil_detected: { label: '외부 네트워크 호출', icon: Globe, color: '#f59e0b' },
};

export function GuardrailsSettings() {
  const telemetryEnabled = useSettingsStore((s) => s.telemetryEnabled);
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [liveEvents, setLiveEvents] = useState<GuardrailEvent[]>(() => getRecentEvents(100));
  const [loading, setLoading] = useState(false);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Live event subscription — 실시간 업데이트 (polling 불필요)
  useEffect(() => {
    return subscribeGuardrailEvents((event) => {
      setLiveEvents((prev) => [event, ...prev].slice(0, 100));
      setPulseId(event.id);
      // 0.5초 후 pulse 해제 (시각적 피드백)
      setTimeout(() => setPulseId((id) => (id === event.id ? null : id)), 500);
    });
  }, []);

  // DB 이벤트 + Live bus 이벤트 합산 — ID 기준 중복 제거
  const counts = useMemo<EventCounts>(() => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const byName: Record<string, number> = {};
    const seenIds = new Set<string>();
    let last24h = 0;
    let total = 0;

    // DB 이벤트 (영구 기록)
    for (const e of events) {
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      byName[e.name] = (byName[e.name] || 0) + 1;
      total++;
      if (now - new Date(e.timestamp).getTime() < DAY) last24h++;
    }
    // Live bus 이벤트 (세션 메모리) — telemetry OFF일 때도 집계
    for (const e of liveEvents) {
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      byName[e.name] = (byName[e.name] || 0) + 1;
      total++;
      if (now - new Date(e.timestamp).getTime() < DAY) last24h++;
    }
    return { total, last24h, byName };
  }, [events, liveEvents]);

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

      {/* 실시간 feed */}
      <div
        style={{
          marginBottom: 16,
          padding: 10,
          border: `1px solid ${liveEvents.length > 0 ? 'var(--accent-bright)' : 'var(--border-strong)'}`,
          borderRadius: 6,
          background: 'rgba(90,165,165,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Radio
            size={12}
            color={pulseId ? '#10b981' : 'var(--fg-muted)'}
            style={{ animation: pulseId ? 'pulse 0.5s' : undefined }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-primary)' }}>Live Feed</span>
          <span style={{ fontSize: 10, color: 'var(--fg-muted)', marginLeft: 'auto' }}>
            {liveEvents.length}건 (세션 기준)
          </span>
        </div>
        {liveEvents.length === 0 ? (
          <div style={{ fontSize: 10, color: 'var(--fg-faint)', padding: '4px 0' }}>
            Guardrail 이벤트 대기 중... 앱 사용 시 여기 실시간으로 표시됩니다.
          </div>
        ) : (
          <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 10, fontFamily: "'Fira Code', monospace" }}>
            {liveEvents.slice(0, 20).map((e) => {
              const isExpanded = expandedId === e.id;
              return (
                <div key={e.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : e.id)}
                    style={{
                      padding: '2px 4px',
                      background: pulseId === e.id ? 'rgba(16,185,129,0.15)' : 'transparent',
                      transition: 'background 0.4s ease',
                      display: 'flex',
                      gap: 6,
                      cursor: 'pointer',
                      border: 'none',
                      width: '100%',
                      textAlign: 'left',
                      font: 'inherit',
                      color: 'inherit',
                    }}
                  >
                    <span style={{ color: 'var(--fg-dim)' }}>{isExpanded ? '▼' : '▶'}</span>
                    <span style={{ color: 'var(--fg-dim)' }}>{formatTime(e.timestamp)}</span>
                    <span style={{ color: EVENT_META[e.name]?.color || 'var(--fg-muted)' }}>
                      {EVENT_META[e.name]?.label || e.name}
                    </span>
                  </button>
                  {isExpanded && e.data && (
                    <pre
                      style={{
                        margin: '4px 16px 8px',
                        padding: 8,
                        background: 'var(--bg-app)',
                        border: '1px solid var(--border-muted)',
                        borderRadius: 4,
                        fontSize: 10,
                        color: 'var(--fg-secondary)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        maxHeight: 200,
                        overflow: 'auto',
                      }}
                    >
                      {JSON.stringify(e.data, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
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

      {/* 최근 이벤트 (DB persist — telemetry opt-in 필요) */}
      <div style={{ marginTop: 20, marginBottom: 8, fontSize: 11, color: 'var(--fg-muted)', fontWeight: 600 }}>
        영구 이벤트 기록 (최대 20개)
      </div>
      {!telemetryEnabled ? (
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', padding: 10, lineHeight: 1.5 }}>
          영구 기록을 보려면 <strong>Telemetry</strong> 탭에서 로컬 텔레메트리를 활성화하세요.
          <br />
          (Live Feed는 telemetry 여부와 무관하게 작동합니다.)
        </div>
      ) : events.length === 0 ? (
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

      {/* Review Queue — 액션 필요 항목 */}
      <ReviewQueue liveEvents={liveEvents} />

      {/* Test Panel */}
      <GuardrailTestPanel />
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
