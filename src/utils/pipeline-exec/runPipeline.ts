/**
 * Pipeline execution core — shared between Run Pipeline button (Sidebar) and
 * /pipeline:dev-task chat input (ClaudeChat). Both entry points call runPipeline()
 * which handles claude_spawn, streaming, messageCache, and pipeline state.
 */
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import { useContextPackStore } from '../../stores/contextPackStore';
import { messageCache, sessionCache, loadingCache } from '../chatState';
import { recordEvent } from '../../services/telemetry';
import { invoke, listen } from './tauri';
import { fetchPinUrl } from './fetchPinUrl';
import type { PipelineCallbacks } from './types';
import { isQuestion as sharedIsQuestion } from './_shared';
import { applyPhaseTransition } from './_phaseTransitions';
import { buildContextSummary } from './_contextBuilder';
import { createStreamState, handleClaudeDataEvent } from './_streamHandler';
import { resolveSkillPrompt } from './_skillResolver';
import { buildDevImplementPrefix } from './_devImplementPrefix';
import { computeSpawnPermissions } from './_toolPermissions';

export async function runPipeline(taskId: string, command: string, callbacks?: PipelineCallbacks) {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!task) return;

  const proj = task.projectId ? useProjectStore.getState().projects.find((p) => p.id === task.projectId) : null;

  const branch = task.branchName || '';
  const title = task.title || '';
  const cwd = task.worktreePath || task.repoPath || proj?.localPath || '';

  const args = `${branch} ${title}`.trim();
  const reqId = `claude-${taskId}-${Date.now()}`;

  callbacks?.onRunning?.();
  recordEvent('action', 'pipeline.start', { command, hasProject: !!proj });

  // /pipeline:dev-task = 새 파이프라인 시작 → 메시지/세션/상태 모두 fresh reset
  // /pipeline:dev-implement, dev-resume, dev-review-loop, pr-review-fu 등 =
  //   기존 파이프라인의 다음 단계 → 메시지/세션 유지 (Claude가 --resume으로 이어가도록)
  const isFreshStart = command === '/pipeline:dev-task' || command.startsWith('/pipeline:dev-task ');

  // Auto-handover: 이전 Claude 프로세스가 아직 살아있다면 (이전 /pipeline:* 가
  // MCP teardown 중이거나 donePromise가 resolve 안 된 상태) 강제로 kill해 UI 잠금 해제.
  // claude_stop_task는 해당 task의 모든 Claude 프로세스 종료, 프로세스 없으면 no-op.
  try {
    await invoke('claude_stop_task', { taskId });
  } catch {
    /* 이전 프로세스 없음 — 정상 */
  }

  // claude_stop_task는 SIGTERM만 보내고 즉시 반환한다. Claude CLI는 종료 전에
  // MCP 클라이언트 teardown / 세션 상태 디스크 flush 를 수행 — 이게 끝나기 전에
  // 새 --resume 을 띄우면 첫 시도가 불완전한 세션 상태로 시작해 hang 될 수 있다
  // (실측: ESC 로 kill → 재입력하면 두 번째 시도는 성공). 500ms 여유를 두어
  // Claude CLI 측 정리 대기. 기존 프로세스가 없었다면 사실상 no-op 비용.
  if (!isFreshStart) {
    await new Promise((r) => setTimeout(r, 500));
  }

  if (isFreshStart) {
    messageCache.delete(taskId);
    sessionCache.delete(taskId);
    useTaskStore.getState().updateTask(taskId, { elapsedSeconds: 0, status: 'active' as const });
  } else {
    useTaskStore.getState().updateTask(taskId, { status: 'active' as const });
  }

  // Initialize pipeline state.
  if (isFreshStart || !task.pipeline?.enabled) {
    useTaskStore.getState().updateTask(taskId, {
      pipeline: {
        enabled: true,
        phases: {
          grill_me: { status: isFreshStart ? 'in_progress' : 'pending', startedAt: new Date().toISOString() },
          save: { status: 'pending' },
          dev_plan: { status: 'pending' },
          implement: { status: 'pending' },
          commit_pr: { status: 'pending' },
          review_loop: { status: 'pending' },
          done: { status: 'pending' },
        },
      },
    });
  }

  // Phase 전환 적용 (선제적) — 공유 유틸로 추출. isRetry 감지되면 resolvedPrompt
  // 앞에 재시작 지시를 prepend 해 --resume partial state 혼란 복구.
  const { isRetry } = applyPhaseTransition(taskId, command);

  // Add user message + show loading indicator (green dot "Claude is thinking...")
  // Fresh start에서는 messageCache가 비어있고, continuation(/pipeline:dev-implement 등)에서는
  // 이전 대화가 남아있어 새 user msg를 **append** 한다.
  // (예전 코드는 무조건 빈 배열로 시작해 continuation 시 grill-me 대화가 사라졌음)
  type Msg = { id: string; role: 'user' | 'assistant' | 'activity'; content: string; toolName?: string };
  const prevMsgs: Msg[] = isFreshStart ? [] : (messageCache.get(taskId) || []).filter((m) => m.role !== 'activity');
  const msgs: Msg[] = [...prevMsgs, { id: `${reqId}-user`, role: 'user', content: command }];
  messageCache.set(taskId, [...msgs]);
  loadingCache.set(taskId, true);

  let resolvedPrompt = await resolveSkillPrompt({ command, args, branch, title, cwd });
  const cmdName = command.slice(1);

  // 재시도 감지 시 Claude 에게 "이전 시도 중단" 을 명시. 그렇지 않으면 Claude
  // 가 --resume 으로 partial state(예: 미완료 tool_use)를 이어받아 계획서를
  // 건너뛰고 이미 하던 작업을 계속하려는 혼란을 보인다.
  if (isRetry) {
    resolvedPrompt =
      `⚠️ [재시작 알림] 이전 /${cmdName} 시도는 도중에 중단됐습니다. 이전 partial response / 미완료 tool_use 는 무시하고, **처음부터** 이 스킬을 실행하세요. 이미 시작한 작업을 이어가지 말고, Step 1 (계획서 템플릿) 부터 새로 출력합니다.\n\n---\n\n` +
      resolvedPrompt;
  }

  if (command.startsWith('/pipeline:dev-implement') && !isFreshStart) {
    const prefix = await buildDevImplementPrefix(prevMsgs, cwd);
    if (prefix) {
      resolvedPrompt = prefix + `---\n\n` + resolvedPrompt;
    }
  }

  // Build context pack data
  const contextItems = useContextPackStore.getState().items[taskId] || [];
  let contextFiles: string[] = [];
  if (contextItems.length > 0) {
    // Context Pack 로딩 activity는 fresh start에서만 표시. Continuation은 이미
    // 이전 세션에 주입됨 — 다시 보여주면 사용자가 "또 로드되나?" 혼동.
    if (isFreshStart) {
      const sourceIcons: Record<string, string> = { github: 'GitHub', slack: 'Slack', notion: 'Notion', pin: 'Pin' };
      const lines = contextItems.map((item) => {
        const src = sourceIcons[item.sourceType] || item.sourceType;
        return `  [${src}] ${item.title}`;
      });
      msgs.push({
        id: `${reqId}-context-load`,
        role: 'activity',
        content: `Loading Context Pack (${contextItems.length} items)\n${lines.join('\n')}`,
      });
    }
    contextFiles = contextItems.filter((item) => item.url && !item.url.startsWith('http')).map((item) => item.url);

    // Lazy fetch 폴백 — Pin 추가 시점의 eager fetch(addPinWithFetch)가
    // 아직 완료되지 않았거나 실패했을 때만 동작. 파이프라인 시작을 과도하게
    // 블로킹하지 않도록 2초 상한 설정 — 타임아웃되면 fullText 없이 진행되고
    // CORTX_RULES/dev-task.md가 Claude의 재조회를 차단한다.
    const pinFetches = contextItems
      .filter(
        (item) => item.sourceType === 'pin' && item.url && item.url.startsWith('http') && !item.metadata?.fullText,
      )
      .map(async (item) => {
        const content = await fetchPinUrl(item.url);
        if (content) {
          item.metadata = { ...item.metadata, fullText: content };
        }
      });
    if (pinFetches.length > 0) {
      await Promise.race([Promise.all(pinFetches), new Promise<void>((r) => setTimeout(r, 2000))]);
    }
  }
  messageCache.set(taskId, [...msgs]);

  // Streaming handler — _streamHandler.ts 로 추출. state closure 는 여기서 소유.
  const streamState = createStreamState(reqId);
  const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
    handleClaudeDataEvent(event.payload, streamState, { taskId, reqId, callbacks });
  });

  const donePromise = new Promise<void>((resolve) => {
    listen(`claude-done-${reqId}`, () => resolve());
  });

  // Context summary — CORTX_PIPELINE_TRACKING + (fresh start 일 때) RULES +
  // project-context.md + Context Pack fullText. 공유 유틸로 추출 (_contextBuilder.ts).
  const contextSummary = await buildContextSummary(cwd, isFreshStart, contextItems);

  const currentPipeline = useTaskStore.getState().tasks.find((t) => t.id === taskId)?.pipeline;
  const { selectedModel, selectedEffort, disallowedTools, permissionMode, bashTimeoutMs } = computeSpawnPermissions(
    currentPipeline,
    contextItems,
  );

  // Continuation 시 이전 Claude 세션을 --resume 으로 이어 grill-me 컨텍스트 보존.
  // 세션이 캐시에 없으면(앱 재시작 등) null → 새 세션. 사용자가 직접 이전 대화를
  // 다시 올릴 수 없으므로 여기서 누락되면 Claude가 컨텍스트를 잃는다.
  const resumeSessionId = !isFreshStart ? sessionCache.get(taskId) || null : null;

  void recordEvent('action', 'claude_spawn', {
    reqId,
    taskId,
    via: 'runPipeline',
    isPipeline: true,
    isResume: !!resumeSessionId,
    messageLength: resolvedPrompt.length,
    contextSummaryLength: contextSummary.length,
    contextFileCount: contextFiles.length,
  });

  await invoke('claude_spawn', {
    id: reqId,
    cwd: cwd || '/',
    message: resolvedPrompt,
    contextFiles: contextFiles.length > 0 ? contextFiles : null,
    contextSummary,
    allowAllTools: true,
    sessionId: resumeSessionId,
    model: selectedModel,
    effort: selectedEffort,
    disallowedTools,
    // 파이프라인 호출은 프로젝트/글로벌 MCP 서버 자동 로딩 금지. 존재하지 않는
    // sequential-thinking.js 나 npm 다운로드 중인 apidog 등 죽은 MCP handshake
    // 대기로 첫 tool 호출이 수 분 hang 되는 재현 케이스 제거.
    disableProjectMcp: true,
    // grill_me/save/dev_plan 단계에서 Bash tool 기본 타임아웃 30초로 단축.
    // runaway find/grep/rg 가 워크트리 전체 스캔으로 수 분 hang 되는 걸 CLI
    // 레벨에서 차단. 구현(implement) 단계는 빌드·테스트가 길 수 있어 기본값 유지.
    bashTimeoutMs,
    permissionMode,
  });

  await donePromise;
  unData();

  // Process exited — strip any lingering activity/tool-use indicators so the
  // UI (which treats trailing activity as "still busy") can flip to Send.
  const finalMsgs = (messageCache.get(taskId) || []).filter((m) => m.role !== 'activity');
  messageCache.set(taskId, finalMsgs);

  // Process exited — 최종 asking 상태 재확인 (activity 스트립 후 기준).
  const lastAssistant = [...finalMsgs].reverse().find((m) => m.role === 'assistant');
  const finalAsking = !!lastAssistant && isQuestion(lastAssistant.content);
  if (finalAsking && !streamState.isAskingNow) {
    callbacks?.onAsking?.();
  } else if (!finalAsking && streamState.isAskingNow) {
    callbacks?.onNotAsking?.();
  }

  loadingCache.set(taskId, false);
  recordEvent('action', 'pipeline.done', { command });
  callbacks?.onDone?.();
}

// isQuestion 은 공유 유틸로 이동 (_shared.ts) — runCustomPipeline 도 동일 로직 사용
const isQuestion = sharedIsQuestion;
