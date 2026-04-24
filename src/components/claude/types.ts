export type GuardrailMarkType = 'secret_masked' | 'q_trimmed' | 'confirmation_added' | 'canary_blocked';

export interface GuardrailMark {
  type: GuardrailMarkType;
  detail?: string;
}

export type RawEventKind =
  | 'tool_use'
  | 'tool_result'
  | 'thinking'
  | 'assistant'
  | 'system'
  | 'result'
  | 'error'
  | 'content_block_delta'
  | 'plain'
  | 'unknown';

export type ViolationSeverity = 'critical' | 'high' | 'medium';

export interface ViolationInfo {
  /** 위반 카테고리 — UI 툴팁 & 하이라이트 결정 */
  category: 'dangerous_command' | 'sensitive_file_access' | 'workspace_boundary_violation' | 'network_exfil';
  severity: ViolationSeverity;
  description: string;
  /** 위반 대상 상세 (예: 경로, 명령 스니펫) */
  detail?: string;
}

export interface RawEvent {
  kind: RawEventKind;
  raw: string;
  parsed?: unknown;
  timestamp: number;
  /** 하네스 가드가 감지한 규칙 위반들 — UI 에서 빨간 하이라이트 + hover 툴팁 */
  violations?: ViolationInfo[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  content: string;
  toolName?: string;
  /** activity 메시지의 시작 시각 (epoch ms). UI 에서 경과 초 표시용. */
  startedAt?: number;
  /** 이 메시지에 적용된 guardrail 후처리 — UI에 배지로 표시 */
  guardrailMarks?: GuardrailMark[];
  /** 이 턴 동안 Claude CLI가 emit한 stream-json 원본 이벤트들 (확장 로그 뷰용) */
  rawEvents?: RawEvent[];
}

export interface SlashCommand {
  name: string;
  description: string;
  source: string;
}

export interface ClaudeChatProps {
  taskId: string;
  cwd: string;
  onSwitchTab?: (tab: string) => void;
}
