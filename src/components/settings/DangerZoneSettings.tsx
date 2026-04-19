/**
 * Danger Zone — 앱 전체 초기화. 두 단계 확인 후 SQLite + localStorage + store 리셋 + reload.
 */
import { useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { logger } from '../../utils/logger';

async function resetSqlite(): Promise<void> {
  const { getDb } = await import('../../services/db');
  const d = await getDb();
  // 외래키 순서 고려 없이 flat DELETE — schema 단순 (tasks/projects/app_state + telemetry).
  // 존재하지 않는 테이블은 skip.
  const tables = ['tasks', 'projects', 'app_state', 'telemetry_events'];
  for (const t of tables) {
    try {
      await d.execute(`DELETE FROM ${t}`);
    } catch (err) {
      logger.warn(`[reset] DELETE FROM ${t} 실패 (무시):`, err);
    }
  }
}

function clearCortxLocalStorage(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('cortx-')) keys.push(k);
  }
  for (const k of keys) localStorage.removeItem(k);
}

export function DangerZoneSettings() {
  const [stage, setStage] = useState<'idle' | 'confirm1' | 'confirm2' | 'running'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setStage('running');
    setError(null);
    try {
      await resetSqlite();
      clearCortxLocalStorage();
      // 확정 반영 — store 복원 없이 페이지 재로드로 클린 초기화.
      window.location.reload();
    } catch (err) {
      setError(String(err));
      setStage('idle');
    }
  };

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' }}>앱 초기화</h3>
        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
          모든 태스크, 프로젝트, 컨텍스트 이력, 설정을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
        </p>
      </div>

      <div
        style={{
          padding: 14,
          borderRadius: 8,
          border: '1px solid rgba(239,68,68,0.3)',
          background: 'rgba(239,68,68,0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <AlertTriangle size={18} color="#ef4444" strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>삭제되는 항목</div>
            <ul
              style={{
                fontSize: 11,
                color: 'var(--fg-secondary)',
                lineHeight: 1.8,
                paddingLeft: 18,
                margin: 0,
              }}
            >
              <li>태스크 (파이프라인 상태, 채팅, 중단 기록 포함)</li>
              <li>프로젝트 연결</li>
              <li>Context Pack / 수집 이력 / 스냅샷</li>
              <li>사용자 설정 (테마, 언어, MCP, 텔레메트리 등)</li>
            </ul>
          </div>
        </div>

        {error && (
          <div
            style={{
              fontSize: 11,
              color: '#ef4444',
              padding: 8,
              background: 'rgba(239,68,68,0.1)',
              borderRadius: 4,
            }}
          >
            초기화 실패: {error}
          </div>
        )}

        {stage === 'idle' && (
          <button
            onClick={() => setStage('confirm1')}
            style={{
              alignSelf: 'flex-start',
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 500,
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.4)',
              color: '#ef4444',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'inherit',
            }}
          >
            <RotateCcw size={13} strokeWidth={1.5} /> 앱 초기화
          </button>
        )}

        {stage === 'confirm1' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--fg-primary)' }}>정말 모든 데이터를 삭제하시겠습니까?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setStage('idle')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: 'none',
                  border: '1px solid var(--fg-dim)',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                취소
              </button>
              <button
                onClick={() => setStage('confirm2')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: '#ef4444',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                계속
              </button>
            </div>
          </div>
        )}

        {stage === 'confirm2' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--fg-primary)' }}>
              마지막 확인 — 되돌릴 수 없습니다. 초기화 후 앱이 자동으로 재시작됩니다.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setStage('idle')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: 'none',
                  border: '1px solid var(--fg-dim)',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                취소
              </button>
              <button
                onClick={handleReset}
                style={{
                  padding: '6px 14px',
                  borderRadius: 5,
                  fontSize: 11,
                  background: '#ef4444',
                  border: '1px solid #ef4444',
                  color: 'white',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: 500,
                }}
              >
                초기화 실행
              </button>
            </div>
          </div>
        )}

        {stage === 'running' && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>초기화 중...</div>}
      </div>
    </div>
  );
}
