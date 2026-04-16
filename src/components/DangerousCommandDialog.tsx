/**
 * HITL (Human-in-the-loop) 다이얼로그 — Claude가 critical severity
 * 파괴적 명령을 실행하려 할 때 사용자 결정을 받는다.
 *
 * 실제 명령 실행 차단은 Claude CLI 내부라 app에서 하드 블록 불가능.
 * 대신 즉각 Stop 호출 옵션 제공 + 사용자가 "계속"/"세션 무시" 선택 가능.
 */
import { AlertTriangle, Square, Play, ShieldOff } from 'lucide-react';
import { ModalBackdrop } from './common/ModalBackdrop';
import type { DangerousCommandMatch } from './claude/dangerousCommandGuard';

export type DangerChoice = 'stop' | 'continue' | 'allow_session';

interface Props {
  taskId: string;
  command: string;
  matches: DangerousCommandMatch[];
  onDecide: (choice: DangerChoice) => void;
}

export function DangerousCommandDialog({ command, matches, onDecide }: Props) {
  const worst = matches.reduce(
    (acc, m) => (severityRank(m.severity) > severityRank(acc.severity) ? m : acc),
    matches[0],
  );
  const color = worst.severity === 'critical' ? '#dc2626' : worst.severity === 'high' ? '#ef4444' : '#f59e0b';

  return (
    <ModalBackdrop onClose={() => onDecide('stop')} dialogStyle={{ width: 520 }} ariaLabel="Dangerous command detected">
      <div className="modal-header" style={{ borderBottom: `2px solid ${color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} color={color} />
          <h2 style={{ color, margin: 0 }}>위험 명령 감지</h2>
        </div>
        <button className="modal-close" onClick={() => onDecide('stop')}>
          ×
        </button>
      </div>

      <div className="modal-body">
        <div style={{ fontSize: 13, marginBottom: 12, color: 'var(--fg-primary)' }}>
          Claude가 실행하려는 명령이 <strong style={{ color }}>{worst.severity}</strong> 심각도로 분류되었습니다.
        </div>

        <div
          style={{
            background: 'var(--bg-app)',
            border: '1px solid var(--border-strong)',
            borderRadius: 6,
            padding: '8px 12px',
            fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--fg-secondary)',
            wordBreak: 'break-all',
            marginBottom: 12,
            maxHeight: 120,
            overflow: 'auto',
          }}
        >
          {command}
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginBottom: 6, fontWeight: 600 }}>감지된 패턴</div>
          {matches.map((m, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--fg-secondary)', marginLeft: 8 }}>
              • {m.description} <span style={{ color: 'var(--fg-faint)', fontSize: 10 }}>({m.pattern})</span>
            </div>
          ))}
        </div>

        <div
          style={{
            fontSize: 11,
            color: 'var(--fg-muted)',
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 4,
            padding: '6px 10px',
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          ⚠️ Cortx는 Claude CLI 내부 실행을 차단할 수 없습니다. <strong>Stop</strong>을 누르면 현재 세션이 즉시
          종료됩니다. <strong>Continue</strong>는 경고를 무시하고 진행합니다.
        </div>

        <div className="modal-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn"
            style={{ background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => onDecide('stop')}
          >
            <Square size={12} fill="#fff" /> Stop Session
          </button>
          <button
            className="btn btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => onDecide('allow_session')}
            title="이 패턴을 이 세션에서 계속 허용"
          >
            <ShieldOff size={12} /> 이 패턴 세션 무시
          </button>
          <button
            className="btn"
            style={{
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={() => onDecide('continue')}
          >
            <Play size={12} /> Continue
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

function severityRank(s: 'critical' | 'high' | 'medium'): number {
  return s === 'critical' ? 3 : s === 'high' ? 2 : 1;
}
