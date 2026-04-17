export type GuardrailMarkType = 'secret_masked' | 'q_trimmed' | 'confirmation_added' | 'canary_blocked';

export interface GuardrailMark {
  type: GuardrailMarkType;
  detail?: string;
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
