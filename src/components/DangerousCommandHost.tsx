/**
 * 앱 루트에 마운트되어 dangerousCommandQueue를 구독.
 * 위험 명령 요청 들어오면 DangerousCommandDialog 렌더.
 */
import { useEffect, useState } from 'react';
import {
  subscribeDangerQueue,
  resolveDangerDecision,
  type DangerRequest,
  type DangerChoice,
} from './claude/dangerousCommandQueue';
import { allowPatternInSession } from './claude/dangerousCommandAlert';
import { DangerousCommandDialog } from './DangerousCommandDialog';

export function DangerousCommandHost() {
  const [req, setReq] = useState<DangerRequest | null>(null);

  useEffect(() => {
    return subscribeDangerQueue(setReq);
  }, []);

  if (!req) return null;

  const handleDecide = (choice: DangerChoice) => {
    if (choice === 'allow_session') {
      // 현재 매치된 패턴 전부 세션 allowlist에 추가
      for (const m of req.matches) {
        allowPatternInSession(req.taskId, m.pattern);
      }
    }
    resolveDangerDecision(req.id, choice);
  };

  return (
    <DangerousCommandDialog taskId={req.taskId} command={req.command} matches={req.matches} onDecide={handleDecide} />
  );
}
