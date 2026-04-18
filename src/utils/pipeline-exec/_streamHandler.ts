/**
 * Claude CLI 스트림 (claude-data-{reqId}) 이벤트 핸들러. runPipeline 에서 추출.
 *
 * 처리 이벤트:
 *  - system/init → sessionCache 저장
 *  - assistant.text → messageCache 누적 + 마커 파싱/stripping
 *  - assistant.tool_use → activity 메시지 + ExitPlanMode 감지 (plan mode)
 *  - content_block_delta → 스트리밍 중 텍스트 증분
 *  - result → 토큰 사용량 집계 (활성 phase 에 귀속)
 *
 * Asking 상태: 마지막 assistant 메시지가 질문형이면 callbacks.onAsking 트리거.
 */
import { useTaskStore } from '../../stores/taskStore';
import { messageCache, sessionCache } from '../chatState';
import type { PipelinePhase } from '../../types/task';
import { formatToolActivity, type ContentBlock } from '../../components/claude/claudeEventProcessor';
import { stripMarkers, isQuestion, BUILTIN_PHASE_KEYS } from './_shared';
import { applyMarkerToStore } from './_phaseTransitions';
import type { PipelineCallbacks } from './types';

export type Msg = {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  content: string;
  toolName?: string;
  startedAt?: number;
};

const PHASE_ORDER: PipelinePhase[] = ['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done'];

/**
 * 텍스트 내 [PIPELINE:xxx] 마커를 파싱해 store 에 적용 + stripping.
 * builtin phase 만 허용 (커스텀 파이프라인은 다른 경로).
 */
function parseBuiltinMarkers(taskId: string, text: string): string {
  let cleaned = text;
  const markerRegex = /\[PIPELINE:(\w+):(\w+)(?::([^\]]*))?\]/g;
  const VALID_STATUSES = new Set(['in_progress', 'done', 'skipped', 'pending']);
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    const [fullMatch, phase, status, memo] = match;
    if (BUILTIN_PHASE_KEYS.has(phase) && VALID_STATUSES.has(status)) {
      applyMarkerToStore(taskId, phase, status as 'in_progress' | 'done' | 'skipped' | 'pending', memo);
    }
    cleaned = cleaned.replace(fullMatch, '');
  }
  return cleaned;
}

export interface StreamHandlerOptions {
  taskId: string;
  reqId: string;
  callbacks?: PipelineCallbacks;
}

/**
 * claude-data listener payload 1개 처리. runPipeline 측 listen() 콜백에서 호출.
 *
 * 상태 추적용 closure 변수들 (turnCounter, currentResponse, currentMsgId,
 * isAskingNow) 은 호출자가 `createStreamState()` 로 생성해 전달.
 */
export interface StreamState {
  turnCounter: number;
  currentResponse: string;
  currentMsgId: string;
  isAskingNow: boolean;
  readonly activityId: string;
}

export function createStreamState(reqId: string): StreamState {
  return {
    turnCounter: 0,
    currentResponse: '',
    currentMsgId: '',
    isAskingNow: false,
    activityId: `${reqId}-activity`,
  };
}

/**
 * messageCache 를 업데이트하면서 asking 상태도 함께 동기.
 * loadingCache 는 파이프라인 전체 수명 동안 true 유지 (Stop 버튼 가시성).
 */
function updateCacheAndAsking(
  taskId: string,
  state: StreamState,
  callbacks: PipelineCallbacks | undefined,
  updater: (cached: Msg[]) => Msg[],
): void {
  const cached = (messageCache.get(taskId) || []) as Msg[];
  const next = updater(cached);
  messageCache.set(taskId, next);

  // 마지막 assistant 메시지가 질문으로 끝나면 Asking, 아니면 해제.
  // activity 메시지(tool_use 중)가 있으면 아직 작업 중 → asking 해제.
  const hasTrailingActivity = next.some((m) => m.role === 'activity');
  const lastAssistant = [...next].reverse().find((m) => m.role === 'assistant');
  const shouldBeAsking =
    !hasTrailingActivity &&
    !!lastAssistant &&
    lastAssistant.content.trim().length > 0 &&
    isQuestion(lastAssistant.content);
  if (shouldBeAsking && !state.isAskingNow) {
    state.isAskingNow = true;
    callbacks?.onAsking?.();
  } else if (!shouldBeAsking && state.isAskingNow) {
    state.isAskingNow = false;
    callbacks?.onNotAsking?.();
  }
}

/** ExitPlanMode tool_use 블록 처리 — Plan mode 완료 시 승인 카드에 쓸 데이터 저장 */
function handleExitPlanMode(
  taskId: string,
  toolBlocks: Array<{ type: string; name?: string; input?: { plan?: string; planFilePath?: string } }>,
): void {
  const exitPlanBlock = toolBlocks.find((b) => b.name === 'ExitPlanMode');
  if (!exitPlanBlock?.input?.plan) return;
  const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
  if (!t?.pipeline?.enabled) return;
  useTaskStore.getState().updateTask(taskId, {
    pipeline: {
      ...t.pipeline,
      pendingPlanApproval: {
        plan: exitPlanBlock.input.plan,
        planFilePath: exitPlanBlock.input.planFilePath,
        createdAt: new Date().toISOString(),
      },
    },
  });
}

/** result 이벤트에서 토큰/비용 집계 → 현재 활성 phase 에 귀속 */
function trackTokenUsage(
  taskId: string,
  evt: { usage?: { input_tokens?: number; output_tokens?: number }; total_cost_usd?: number },
): void {
  if (!evt.usage) return;
  const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
  if (!t?.pipeline?.enabled) return;
  const inTok = evt.usage.input_tokens || 0;
  const outTok = evt.usage.output_tokens || 0;
  const cost = evt.total_cost_usd || 0;
  const phases = { ...t.pipeline.phases };
  const activePhase = PHASE_ORDER.find((p) => phases[p]?.status === 'in_progress');
  if (!activePhase) return;
  const entry = { ...phases[activePhase] };
  entry.inputTokens = (entry.inputTokens || 0) + inTok;
  entry.outputTokens = (entry.outputTokens || 0) + outTok;
  entry.costUsd = (entry.costUsd || 0) + cost;
  phases[activePhase] = entry;
  useTaskStore.getState().updateTask(taskId, { pipeline: { ...t.pipeline, phases } });
}

/**
 * claude-data 이벤트 1개 처리 (파이프라인 활성 태스크에서만 동작).
 * 호출 예: `listen(channel, (event) => handleClaudeDataEvent(event.payload, state, opts))`
 */
export function handleClaudeDataEvent(payload: string, state: StreamState, opts: StreamHandlerOptions): void {
  const { taskId, reqId, callbacks } = opts;
  const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!currentTask?.pipeline?.enabled) return;

  let evt;
  try {
    evt = JSON.parse(payload);
  } catch {
    return; // not JSON
  }

  // system.init — 세션 ID 기록 (다음 continuation --resume 용)
  if (evt.type === 'system' && evt.subtype === 'init' && evt.session_id) {
    sessionCache.set(taskId, evt.session_id);
  }

  if (evt.type === 'assistant' && evt.message?.content) {
    const textBlocks = (evt.message.content as Array<{ type: string; text?: string }>)
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '');
    const toolBlocks = (
      evt.message.content as Array<{ type: string; name?: string; input?: { plan?: string; planFilePath?: string } }>
    ).filter((b) => b.type === 'tool_use');

    if (textBlocks.length > 0) {
      const newText = textBlocks.join('');
      if (!state.currentMsgId) {
        state.turnCounter++;
        state.currentMsgId = `${reqId}-turn-${state.turnCounter}`;
        state.currentResponse = parseBuiltinMarkers(taskId, stripMarkers(newText));
      } else {
        state.currentResponse = parseBuiltinMarkers(taskId, stripMarkers(state.currentResponse + newText));
      }
      if (state.currentResponse.trim()) {
        const msgId = state.currentMsgId;
        const responseText = state.currentResponse;
        updateCacheAndAsking(taskId, state, callbacks, (cached) => {
          const filtered = cached.filter((m) => m.id !== state.activityId);
          const idx = filtered.findIndex((m) => m.id === msgId);
          if (idx >= 0) {
            filtered[idx] = { ...filtered[idx], content: responseText };
            return [...filtered];
          }
          return [...filtered, { id: msgId, role: 'assistant' as const, content: responseText }];
        });
      }
    }

    if (toolBlocks.length > 0) {
      state.currentMsgId = '';
      handleExitPlanMode(taskId, toolBlocks);
      const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');
      const content = formatToolActivity(toolBlocks as unknown as ContentBlock[], toolLabel, null);
      const now = Date.now();
      updateCacheAndAsking(taskId, state, callbacks, (cached) => {
        const filtered = cached.filter((m) => m.id !== state.activityId);
        return [
          ...filtered,
          { id: state.activityId, role: 'activity' as const, content, toolName: toolLabel, startedAt: now },
        ];
      });
    }
  } else if (evt.type === 'content_block_delta' && evt.delta?.text) {
    state.currentResponse = parseBuiltinMarkers(taskId, stripMarkers(state.currentResponse + evt.delta.text));
    if (!state.currentMsgId) {
      state.turnCounter++;
      state.currentMsgId = `${reqId}-turn-${state.turnCounter}`;
    }
    if (state.currentResponse.trim()) {
      const msgId = state.currentMsgId;
      const responseText = state.currentResponse;
      updateCacheAndAsking(taskId, state, callbacks, (cached) => {
        const filtered = cached.filter((m) => m.id !== state.activityId);
        const idx = filtered.findIndex((m) => m.id === msgId);
        if (idx >= 0) {
          filtered[idx] = { ...filtered[idx], content: responseText };
          return [...filtered];
        }
        return [...filtered, { id: msgId, role: 'assistant' as const, content: responseText }];
      });
    }
  }

  if (evt.type === 'result') {
    trackTokenUsage(taskId, evt);
  }
}
