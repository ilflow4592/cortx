import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckCircle2 } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { runPipeline } from '../../utils/pipeline-exec/runPipeline';

interface PlanApprovalCardProps {
  taskId: string;
  plan: string;
  planFilePath?: string;
}

/**
 * Plan mode 에서 Claude 가 ExitPlanMode 로 제출한 계획을 표시하고 승인/수정 UI 를 제공.
 * 승인 시 synthetic `/pipeline:_approve-plan` 명령으로 재스폰 → bypassPermissions
 * 로 구현 단계 진입. 수정 요청 시 `isModifying` 을 true 로 두어 부모에서 input 에
 * 포커스하도록 한다 (현재는 단순히 카드를 dismiss 만 한다).
 */
export function PlanApprovalCard({ taskId, plan, planFilePath }: PlanApprovalCardProps) {
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    // pendingPlanApproval 을 먼저 비워 카드 중복 렌더 방지.
    const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
    if (t?.pipeline?.enabled) {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: { ...t.pipeline, pendingPlanApproval: undefined, devPlan: plan },
      });
    }
    try {
      await runPipeline(taskId, '/pipeline:_approve-plan');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* 계획 본문 — assistant 메시지와 동일한 구조/스타일로 채팅 흐름 안에 자연스럽게 렌더 */}
      <div className="msg">
        <div className="msg-avatar ai" aria-hidden="true">
          C
        </div>
        <div className="msg-body">
          <div className="msg-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>개발 계획 (Plan Mode)</span>
          </div>
          <div className="msg-text" style={{ wordBreak: 'break-word' }}>
            <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{plan}</Markdown>
          </div>
          {planFilePath && (
            <div
              style={{
                marginTop: 8,
                fontSize: 10,
                color: 'var(--fg-faint)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {planFilePath}
            </div>
          )}
        </div>
      </div>

      {/* 승인 바 — 본문과 분리된 단독 카드. 버튼만 남김 */}
      <div
        style={{
          margin: '12px 16px 16px',
          padding: '10px 14px',
          border: '1px solid var(--accent)',
          borderRadius: 8,
          background: 'var(--accent-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          승인 시 bypass 모드로 재스폰되어 구현을 시작합니다.
        </span>
        <button
          onClick={approve}
          disabled={busy}
          style={{
            padding: '7px 16px',
            fontSize: 12,
            background: 'var(--accent-bright)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: 6,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          <CheckCircle2 size={13} strokeWidth={2} />
          {busy ? '진행 중...' : '승인 후 구현 시작'}
        </button>
      </div>
    </>
  );
}
