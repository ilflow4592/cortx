/**
 * Claude CLI stream-json 이벤트 프로세서.
 *
 * `useClaudeSession.handleSend`의 이벤트 파싱 블록(~130줄)을 별도 클래스로 이관.
 * 내부적으로 `currentMsgId` · `turnCounter` · `response` 누적 상태를 보관해
 * 훅 closure의 지역 변수 관리를 대체한다.
 */
import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import { sessionCache } from '../../utils/chatState';
import { useTaskStore } from '../../stores/taskStore';
import { PHASE_KEYS, PHASE_ORDER } from '../../constants/pipeline';
import type { Message } from './types';

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
}

interface ClaudeSystemEvent {
  type: 'system';
  subtype?: string;
  session_id?: string;
}
interface ClaudeAssistantEvent {
  type: 'assistant';
  message?: { content?: ContentBlock[] };
}
interface ClaudeDeltaEvent {
  type: 'content_block_delta';
  delta?: { text?: string };
}
interface ClaudeErrorEvent {
  type: 'error';
  content?: string;
}
interface ClaudeResultEvent {
  type: 'result';
  result?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  total_cost_usd?: number;
}

type ClaudeEvent =
  | ClaudeSystemEvent
  | ClaudeAssistantEvent
  | ClaudeDeltaEvent
  | ClaudeErrorEvent
  | ClaudeResultEvent
  | { type: string };

export interface ClaudeEventProcessorContext {
  taskId: string;
  reqId: string;
  activityId: string;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setError: (msg: string) => void;
  claudeSessionIdRef: MutableRefObject<string>;
  /** 파이프라인 마커를 파싱·적용하고 cleaned 텍스트 반환 (훅 어댑터) */
  processMarkers: (text: string) => string;
}

/**
 * 라인 단위 스트리밍 이벤트 프로세서. 각 라인에 대해 `process(line)` 호출.
 *
 * JSON 파싱 실패 시 plain text로 취급 (Claude CLI가 보장하지 않는 경로).
 * 도구 사용 블록이 등장하면 turn을 리셋해 다음 텍스트가 새 메시지로 들어간다.
 */
export class ClaudeEventProcessor {
  private currentMsgId = '';
  private turnCounter = 0;
  private response = '';
  private ctx: ClaudeEventProcessorContext;

  constructor(ctx: ClaudeEventProcessorContext) {
    this.ctx = ctx;
  }

  process(line: string): void {
    try {
      const evt = JSON.parse(line) as ClaudeEvent;
      this.dispatch(evt);
    } catch {
      this.handlePlainText(line);
    }
  }

  /** Claude가 어떤 실질적 응답(텍스트 또는 tool 출력)도 돌려주지 않았는지 검사 */
  hasContent(): boolean {
    return this.response.trim().length > 0;
  }

  private dispatch(evt: ClaudeEvent): void {
    switch (evt.type) {
      case 'system':
        this.handleSystem(evt as ClaudeSystemEvent);
        return;
      case 'assistant':
        this.handleAssistant(evt as ClaudeAssistantEvent);
        return;
      case 'content_block_delta':
        this.handleDelta((evt as ClaudeDeltaEvent).delta?.text || '');
        return;
      case 'error':
        this.ctx.setError((evt as ClaudeErrorEvent).content || 'Unknown error from Claude CLI');
        return;
      case 'result':
        this.handleResult(evt as ClaudeResultEvent);
        return;
    }
  }

  private handleSystem(evt: ClaudeSystemEvent): void {
    if (evt.subtype === 'init' && evt.session_id) {
      this.ctx.claudeSessionIdRef.current = evt.session_id;
      sessionCache.set(this.ctx.taskId, evt.session_id);
    }
  }

  private handleAssistant(evt: ClaudeAssistantEvent): void {
    const blocks = evt.message?.content || [];
    const textBlocks = blocks.filter((b) => b.type === 'text').map((b) => b.text || '');
    const toolBlocks = blocks.filter((b) => b.type === 'tool_use');

    if (textBlocks.length > 0) {
      const newText = textBlocks.join('');
      if (!this.currentMsgId) {
        this.turnCounter++;
        this.currentMsgId = `${this.ctx.reqId}-turn-${this.turnCounter}`;
        this.response = this.ctx.processMarkers(newText).trimStart();
      } else {
        this.response = this.ctx.processMarkers(this.response + newText).trimStart();
      }
      this.commitAssistantTurn();
    }

    if (toolBlocks.length > 0) {
      // 도구 블록 이후의 텍스트는 새 턴으로 분리
      this.currentMsgId = '';
      const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');
      this.ctx.setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== this.ctx.activityId);
        return [
          ...filtered,
          { id: this.ctx.activityId, role: 'activity', content: `Using ${toolLabel}...`, toolName: toolLabel },
        ];
      });
    }
  }

  private handleDelta(text: string): void {
    if (!text) return;
    this.response = this.ctx.processMarkers(this.response + text).trimStart();
    if (!this.currentMsgId) {
      this.turnCounter++;
      this.currentMsgId = `${this.ctx.reqId}-turn-${this.turnCounter}`;
    }
    this.commitAssistantTurn();
  }

  private handleResult(evt: ClaudeResultEvent): void {
    // 최종 result가 누적된 response와 다르면 별도 메시지로 추가 (중복 방지)
    if (evt.result) {
      const resultText = this.ctx.processMarkers(evt.result).trim();
      if (resultText && resultText !== this.response.trim()) {
        this.turnCounter++;
        const resultId = `${this.ctx.reqId}-result`;
        this.response = resultText;
        const content = this.response;
        this.ctx.setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== this.ctx.activityId);
          return [...filtered, { id: resultId, role: 'assistant', content }];
        });
      }
    }

    // 현재 활성 파이프라인 단계에 토큰 사용량 누적
    if (evt.usage) {
      const task = useTaskStore.getState().tasks.find((t) => t.id === this.ctx.taskId);
      if (!task?.pipeline?.enabled) return;
      const inTok = evt.usage.input_tokens || 0;
      const outTok = evt.usage.output_tokens || 0;
      const cost = evt.total_cost_usd || 0;
      const activePhase = PHASE_ORDER.find(
        (p) => PHASE_KEYS.has(p) && task.pipeline!.phases[p]?.status === 'in_progress',
      );
      if (!activePhase) return;
      const phases = { ...task.pipeline.phases };
      const entry = { ...phases[activePhase] };
      entry.inputTokens = (entry.inputTokens || 0) + inTok;
      entry.outputTokens = (entry.outputTokens || 0) + outTok;
      entry.costUsd = (entry.costUsd || 0) + cost;
      phases[activePhase] = entry;
      useTaskStore.getState().updateTask(this.ctx.taskId, {
        pipeline: { ...task.pipeline, phases },
      });
    }
  }

  private handlePlainText(line: string): void {
    this.response = this.ctx.processMarkers(this.response + line + '\n');
    if (!this.currentMsgId) {
      this.turnCounter++;
      this.currentMsgId = `${this.ctx.reqId}-turn-${this.turnCounter}`;
    }
    const msgId = this.currentMsgId;
    const content = this.response;
    this.ctx.setMessages((prev) => {
      const existing = prev.find((m) => m.id === msgId);
      if (existing) {
        return prev.map((m) => (m.id === msgId ? { ...m, content } : m));
      }
      return [...prev, { id: msgId, role: 'assistant', content }];
    });
  }

  private commitAssistantTurn(): void {
    const msgId = this.currentMsgId;
    const content = this.response;
    const activityId = this.ctx.activityId;
    this.ctx.setMessages((prev) => {
      const existing = prev.find((m) => m.id === msgId);
      if (existing) {
        return prev.map((m) => (m.id === msgId ? { ...m, content } : m));
      }
      const filtered = prev.filter((m) => m.id !== activityId);
      return [...filtered, { id: msgId, role: 'assistant', content }];
    });
  }
}
