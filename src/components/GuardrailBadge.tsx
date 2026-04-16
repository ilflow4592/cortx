/**
 * StatusBar 내 Guardrail 활동 배지.
 * - 최근 1분 이벤트 카운트 표시
 * - 새 이벤트 발생 시 pulse
 * - 클릭 → Settings 모달 Guardrails 탭 이동
 */
import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { subscribeGuardrailEvents, countEventsSince } from '../services/guardrailEventBus';
import { useModalStore } from '../stores/modalStore';

const WINDOW_MS = 60_000; // 1분

export function GuardrailBadge() {
  const [recentCount, setRecentCount] = useState(() => countEventsSince(WINDOW_MS));
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    // 실시간 구독
    const unsub = subscribeGuardrailEvents(() => {
      setRecentCount(countEventsSince(WINDOW_MS));
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    });

    // 1분마다 창 밖으로 빠진 이벤트 반영
    const interval = setInterval(() => {
      setRecentCount(countEventsSince(WINDOW_MS));
    }, 10_000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const active = recentCount > 0;
  const color = recentCount >= 5 ? '#ef4444' : recentCount >= 1 ? '#f59e0b' : 'var(--fg-dim)';

  return (
    <button
      type="button"
      onClick={() => useModalStore.getState().open('settings')}
      title={active ? `최근 1분간 guardrail ${recentCount}건` : 'Guardrails — 클릭해서 대시보드 열기'}
      style={{
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        transition: 'color 0.3s ease',
        animation: pulse ? 'guardrail-pulse 0.6s ease-out' : undefined,
      }}
    >
      <Shield size={11} />
      {active ? `🛡 ${recentCount}` : '🛡'}
    </button>
  );
}
