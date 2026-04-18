/**
 * Review Queue — "지금 해야 할 일" 중심 뷰.
 * GuardrailsSettings.tsx 에서 추출. Context Pack injection + critical 이벤트
 * 24h 이내 항목을 severity 순으로 정렬. dismiss 처리 내장.
 */
import { useEffect, useMemo, useState } from 'react';
import type { GuardrailEvent } from '../../services/guardrailEventBus';
import { isDismissed, dismiss, subscribeDismiss } from '../../services/guardrailDismissStore';
import { scanForInjection } from '../../services/contextSanitizer';
import { useContextPackStore } from '../../stores/contextPackStore';
import { useTaskStore } from '../../stores/taskStore';

interface ReviewItem {
  id: string;
  kind: 'critical_event' | 'context_injection' | 'canary_leak';
  title: string;
  subtitle: string;
  severity: 'critical' | 'high' | 'medium';
  action?: { label: string; onClick: () => void };
}

function severityRank(s: 'critical' | 'high' | 'medium' | 'low'): number {
  return s === 'critical' ? 4 : s === 'high' ? 3 : s === 'medium' ? 2 : 1;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d
    .getSeconds()
    .toString()
    .padStart(2, '0')}`;
}

export function ReviewQueue({ liveEvents }: { liveEvents: GuardrailEvent[] }) {
  const tasks = useTaskStore((s) => s.tasks);
  const contextItems = useContextPackStore((s) => s.items);
  const [dismissVersion, setDismissVersion] = useState(0);

  useEffect(() => {
    return subscribeDismiss(() => setDismissVersion((n) => n + 1));
  }, []);

  const items = useMemo<ReviewItem[]>(() => {
    void dismissVersion;
    const out: ReviewItem[] = [];

    for (const [taskId, packItems] of Object.entries(contextItems)) {
      const task = tasks.find((t) => t.id === taskId);
      for (const item of packItems || []) {
        const fullText = item.metadata?.fullText;
        if (!fullText) continue;
        const findings = scanForInjection(fullText);
        if (findings.length === 0) continue;
        const worst = findings.reduce(
          (max, f) => (severityRank(f.severity) > severityRank(max) ? f.severity : max),
          'low' as 'low' | 'medium' | 'high',
        );
        const id = `ctx:${taskId}:${item.id}`;
        if (isDismissed(id)) continue;
        out.push({
          id,
          kind: 'context_injection',
          title: `Context Pack 주입 의심 — ${item.title}`,
          subtitle: `[${task?.title || taskId}] ${item.sourceType} · ${findings.length}건 (${worst})`,
          severity: worst === 'high' ? 'high' : worst === 'medium' ? 'medium' : 'medium',
          action: {
            label: '제거',
            onClick: () => {
              useContextPackStore.getState().removeItem(taskId, item.id);
              dismiss(id);
            },
          },
        });
      }
    }

    // eslint-disable-next-line react-hooks/purity -- 시간 기준은 매번 현재 기준으로 재계산 필요
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const e of liveEvents) {
      const id = `evt:${e.id}`;
      if (isDismissed(id)) continue;
      if (new Date(e.timestamp).getTime() < cutoff) continue;

      if (e.name === 'canary_leak_detected') {
        out.push({
          id,
          kind: 'canary_leak',
          title: 'Prompt Injection 성공 — Canary 유출 감지',
          subtitle: `Task ${e.taskId || '(unknown)'} · ${formatTime(e.timestamp)} — 세션 초기화 권장`,
          severity: 'critical',
          action: { label: '확인 완료', onClick: () => dismiss(id) },
        });
      } else if (e.name === 'dangerous_command_detected') {
        const severities = (e.data?.severities as string[]) || [];
        if (!severities.includes('critical')) continue;
        const patterns = ((e.data?.patterns as string[]) || []).join(', ');
        out.push({
          id,
          kind: 'critical_event',
          title: 'Critical 명령 감지',
          subtitle: `Task ${e.taskId || '(unknown)'} · ${patterns}`,
          severity: 'critical',
          action: { label: '확인 완료', onClick: () => dismiss(id) },
        });
      }
    }

    out.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    return out;
  }, [liveEvents, contextItems, tasks, dismissVersion]);

  return (
    <div
      style={{
        marginTop: 24,
        padding: 12,
        border: `1px solid ${items.length > 0 ? '#ef4444' : 'var(--border-strong)'}`,
        borderRadius: 6,
        background: items.length > 0 ? 'rgba(239,68,68,0.04)' : 'transparent',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: items.length > 0 ? '#ef4444' : 'var(--fg-primary)' }}>
          ⚠ 확인 필요
        </span>
        <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
          ({items.length > 0 ? `${items.length}건` : '정상'})
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>
          현재 조치가 필요한 guardrail 이벤트 없음. 모든 Context Pack 항목 깨끗함.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((it) => {
            const color = it.severity === 'critical' ? '#dc2626' : it.severity === 'high' ? '#ef4444' : '#f59e0b';
            return (
              <div
                key={it.id}
                style={{
                  padding: '8px 10px',
                  border: `1px solid ${color}`,
                  borderRadius: 4,
                  background: 'var(--bg-app)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 2 }}>{it.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{it.subtitle}</div>
                </div>
                {it.action && (
                  <button
                    onClick={it.action.onClick}
                    style={{
                      padding: '4px 10px',
                      background: 'var(--bg-surface-hover)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 4,
                      color: 'var(--fg-primary)',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    {it.action.label}
                  </button>
                )}
                <button
                  onClick={() => dismiss(it.id)}
                  title="이 항목 무시"
                  style={{
                    padding: '4px 8px',
                    background: 'none',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 4,
                    color: 'var(--fg-muted)',
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
