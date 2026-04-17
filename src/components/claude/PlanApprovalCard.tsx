import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CheckCircle2, Pencil } from 'lucide-react';
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
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

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

  const requestModification = () => {
    // 카드 숨기기만. 사용자가 채팅 입력창에 수정 요청을 자유롭게 타이핑 →
    // 기존 메시지 send 플로우가 Claude 에게 전달 → Claude 가 수정된 계획 제출.
    const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
    if (t?.pipeline?.enabled) {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: { ...t.pipeline, pendingPlanApproval: undefined },
      });
    }
    setDismissed(true);
  };

  return (
    <div
      style={{
        margin: '16px',
        padding: '16px',
        border: '1px solid var(--accent)',
        borderRadius: 8,
        background: 'var(--accent-bg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <CheckCircle2 size={16} color="var(--accent-bright)" strokeWidth={2} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-bright)' }}>
          계획 승인 대기 중 (Plan Mode)
        </span>
      </div>

      <div
        style={{
          fontSize: 12,
          color: 'var(--fg-dim)',
          marginBottom: 12,
        }}
      >
        Claude 가 아래 계획을 제출했습니다. 승인 시 bypass 모드로 재스폰되어 구현을 시작합니다.
        {planFilePath && <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 11 }}>{planFilePath}</div>}
      </div>

      <div
        style={{
          padding: '12px',
          background: 'var(--bg-surface)',
          borderRadius: 4,
          maxHeight: 400,
          overflowY: 'auto',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{plan}</Markdown>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <button
          onClick={requestModification}
          disabled={busy}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: 'var(--bg-surface)',
            color: 'var(--fg-dim)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Pencil size={12} />
          수정 요청
        </button>
        <button
          onClick={approve}
          disabled={busy}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: 'var(--accent-bright)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: 4,
            cursor: busy ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <CheckCircle2 size={12} />
          {busy ? '진행 중...' : '승인 후 구현 시작'}
        </button>
      </div>
    </div>
  );
}
