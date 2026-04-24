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
import { recordAndPublish } from '../../services/guardrailEventBus';
import { sendNotification } from '../../utils/notification';
import { scanDangerousCommand, extractBashCommand } from './dangerousCommandGuard';
import { isAllowedInSession } from './dangerousCommandAlert';
import { requestDangerDecision } from './dangerousCommandQueue';
import { scanSensitivePath, extractToolPaths, isPathOutsideWorkspace } from './fileAccessGuard';
import { scanNetworkExfil } from './networkExfilGuard';
import type { Message, RawEvent } from './types';
import { classifyEvent } from './rawEventFormatter';

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
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
  cwd: string;
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
  /** 다음 commit 시점에 Message에 첨부할 raw 이벤트 버퍼. 확장 로그 뷰에서 사용. */
  private pendingEvents: RawEvent[] = [];

  constructor(ctx: ClaudeEventProcessorContext) {
    this.ctx = ctx;
  }

  process(line: string): void {
    let parsed: unknown;
    let parseOk = true;
    try {
      parsed = JSON.parse(line);
    } catch {
      parseOk = false;
    }

    if (parseOk) {
      this.pendingEvents.push({
        kind: classifyEvent(parsed),
        raw: line,
        parsed,
        timestamp: Date.now(),
      });
      this.dispatch(parsed as ClaudeEvent);
    } else {
      this.pendingEvents.push({ kind: 'plain', raw: line, timestamp: Date.now() });
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
      // 빈 text 블록(`{type:'text', text:''}`) 은 commit 하지 않음 — 빈 assistant 메시지가
      // UI에 빈 row로 남는 문제 방지. tool_use 만 있는 이벤트에 섞여 오는 경우가 있음.
      if (newText) {
        if (!this.currentMsgId) {
          this.turnCounter++;
          this.currentMsgId = `${this.ctx.reqId}-turn-${this.turnCounter}`;
          this.response = this.ctx.processMarkers(newText).trimStart();
        } else {
          this.response = this.ctx.processMarkers(this.response + newText).trimStart();
        }
        this.commitAssistantTurn();
      }
    }

    if (toolBlocks.length > 0) {
      // 도구 블록 이후의 텍스트는 새 턴으로 분리
      this.currentMsgId = '';
      const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');

      // 민감 파일 경로 감지 — Read/Edit/Glob/Grep 등
      for (const block of toolBlocks) {
        const paths = extractToolPaths(block.name || '', block.input);
        for (const p of paths) {
          const sensitive = scanSensitivePath(p);
          if (sensitive.length > 0) {
            void recordAndPublish('sensitive_file_access', {
              taskId: this.ctx.taskId,
              tool: block.name,
              path: p,
              patterns: sensitive.map((s) => s.pattern),
              severities: sensitive.map((s) => s.severity),
            });
            if (sensitive.some((s) => s.severity === 'critical')) {
              sendNotification(
                'Cortx — 민감 파일 접근 감지',
                `Claude가 ${sensitive[0].description} 접근 시도. 터미널/로그 확인 필요.`,
              );
            }
          }
          // Workspace boundary check
          if (this.ctx.cwd && isPathOutsideWorkspace(p, this.ctx.cwd)) {
            void recordAndPublish('workspace_boundary_violation', {
              taskId: this.ctx.taskId,
              tool: block.name,
              path: p,
              cwd: this.ctx.cwd,
            });
          }
        }
      }

      // Network exfil 감지 — Bash 호출에서 외부 URL 검사
      for (const block of toolBlocks) {
        const cmd = extractBashCommand(block.name || '', block.input);
        if (!cmd) continue;
        const exfilMatches = scanNetworkExfil(cmd);
        if (exfilMatches.length > 0) {
          void recordAndPublish('network_exfil_detected', {
            taskId: this.ctx.taskId,
            hosts: exfilMatches.map((e) => e.host),
            tools: exfilMatches.map((e) => e.tool),
          });
        }
      }

      // 파괴적 명령 감지 — Bash tool_use에 대해 패턴 검사
      let dangerLabel: string | null = null;
      for (const block of toolBlocks) {
        const cmd = extractBashCommand(block.name || '', block.input);
        if (!cmd) continue;
        const matches = scanDangerousCommand(cmd);
        if (matches.length === 0) continue;

        // 세션 allowlist 체크 — 사용자가 이전에 허용한 패턴 필터링
        const newMatches = matches.filter((m) => !isAllowedInSession(this.ctx.taskId, m.pattern));
        if (newMatches.length === 0) continue;

        dangerLabel = newMatches[0].description;
        void recordAndPublish('dangerous_command_detected', {
          taskId: this.ctx.taskId,
          patterns: newMatches.map((m) => m.pattern),
          severities: newMatches.map((m) => m.severity),
        });

        // Critical → HITL 다이얼로그 (비동기, 스트리밍 블록 안 함)
        if (newMatches.some((m) => m.severity === 'critical')) {
          const taskId = this.ctx.taskId;
          void requestDangerDecision({ taskId, command: cmd, matches: newMatches }).then((choice) => {
            if (choice === 'stop') {
              // 사용자가 중지 선택 → Claude 프로세스 즉시 종료
              import('@tauri-apps/api/core').then((mod) => mod.invoke('claude_stop_task', { taskId })).catch(() => {});
            }
          });
          sendNotification('Cortx — 위험 명령 감지', `${newMatches[0].description} — 확인 필요`);
        }
      }

      // Activity 라벨 생성 — 가시성 위해 Bash/Read/Edit의 실제 인자를 요약 표시.
      // 사용자가 "Using Bash..." 앞에서 hang 했는지 파악 가능하도록.
      const displayContent = formatToolActivity(toolBlocks, toolLabel, dangerLabel);
      const startedAt = Date.now();
      this.ctx.setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== this.ctx.activityId);
        return [
          ...filtered,
          { id: this.ctx.activityId, role: 'activity', content: displayContent, toolName: toolLabel, startedAt },
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
        const events = this.pendingEvents;
        this.pendingEvents = [];
        this.ctx.setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== this.ctx.activityId);
          return [...filtered, { id: resultId, role: 'assistant', content, rawEvents: events }];
        });
      } else if (this.pendingEvents.length > 0 && this.currentMsgId) {
        // 동일 텍스트 → 새 메시지는 만들지 않지만, 누적된 result 이벤트는 마지막 메시지에 붙여 로그 확장 뷰에서 확인 가능하게.
        const events = this.pendingEvents;
        this.pendingEvents = [];
        const msgId = this.currentMsgId;
        this.ctx.setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, rawEvents: [...(m.rawEvents ?? []), ...events] } : m)),
        );
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
    const events = this.pendingEvents;
    this.pendingEvents = [];
    this.ctx.setMessages((prev) => {
      const existing = prev.find((m) => m.id === msgId);
      if (existing) {
        return prev.map((m) =>
          m.id === msgId ? { ...m, content, rawEvents: [...(m.rawEvents ?? []), ...events] } : m,
        );
      }
      return [...prev, { id: msgId, role: 'assistant', content, rawEvents: events }];
    });
  }

  private commitAssistantTurn(): void {
    const msgId = this.currentMsgId;
    const content = this.response;
    const activityId = this.ctx.activityId;
    const events = this.pendingEvents;
    this.pendingEvents = [];
    this.ctx.setMessages((prev) => {
      const existing = prev.find((m) => m.id === msgId);
      if (existing) {
        return prev.map((m) =>
          m.id === msgId ? { ...m, content, rawEvents: [...(m.rawEvents ?? []), ...events] } : m,
        );
      }
      const filtered = prev.filter((m) => m.id !== activityId);
      return [...filtered, { id: msgId, role: 'assistant', content, rawEvents: events }];
    });
  }
}

/**
 * Activity 라벨 생성. Bash/Read/Edit/Grep 의 핵심 인자를 요약해 표시.
 * 사용자가 "Using Bash..."에서 어느 명령이 걸렸는지 파악 가능하도록.
 */
export function formatToolActivity(toolBlocks: ContentBlock[], toolLabel: string, dangerLabel: string | null): string {
  const summaries: string[] = [];
  for (const block of toolBlocks) {
    const name = block.name || 'tool';
    const input = block.input as Record<string, unknown> | undefined;
    if (!input) {
      summaries.push(name);
      continue;
    }
    const command = typeof input.command === 'string' ? input.command : undefined;
    const filePath = typeof input.file_path === 'string' ? input.file_path : undefined;
    const path = typeof input.path === 'string' ? input.path : undefined;
    const pattern = typeof input.pattern === 'string' ? input.pattern : undefined;

    if (name === 'Bash' || name === 'bash') {
      summaries.push(command ? `Bash: ${truncate(command, 100)}` : 'Bash');
    } else if (name === 'Read') {
      summaries.push(filePath ? `Read ${shortPath(filePath)}` : 'Read');
    } else if (name === 'Edit' || name === 'Write') {
      summaries.push(filePath ? `${name} ${shortPath(filePath)}` : name);
    } else if (name === 'Glob') {
      summaries.push(pattern ? `Glob ${pattern}` : 'Glob');
    } else if (name === 'Grep') {
      summaries.push(pattern ? `Grep ${truncate(pattern, 60)}` : 'Grep');
    } else if (name === 'Agent') {
      const description = typeof input.description === 'string' ? input.description : undefined;
      summaries.push(description ? `Agent: ${truncate(description, 80)}` : 'Agent');
    } else {
      summaries.push(name);
    }

    // path fallback
    if (!filePath && path && !summaries[summaries.length - 1].includes(path)) {
      summaries[summaries.length - 1] = `${name} ${shortPath(path)}`;
    }
  }
  const body = summaries.join(', ');
  const prefix = dangerLabel ? `⚠️ Using ${body}... (${dangerLabel})` : `Using ${body}...`;
  // toolLabel fallback (summary가 비었을 때)
  return body ? prefix : `Using ${toolLabel}...`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function shortPath(p: string): string {
  // 프로젝트 내부 상대경로는 그대로, 절대경로는 마지막 2~3 segment만
  if (p.startsWith('/')) {
    const parts = p.split('/').filter(Boolean);
    if (parts.length > 3) return '…/' + parts.slice(-3).join('/');
  }
  return p;
}
