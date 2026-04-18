import { useState, useRef, useEffect } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import { useTaskStore } from '../../stores/taskStore';
import type { PipelinePhase, PipelinePhaseEntry } from '../../types/task';
import { messageCache, sessionCache, loadingCache } from '../../utils/chatState';
import { runPipeline, fetchPinUrl } from '../../utils/pipelineExec';
import type { Message, SlashCommand } from './types';
import { handleBuiltinCommand } from './builtinCommands';
import { parsePipelineMarkers, applyPipelineMarkerUpdates } from './pipelineMarkers';
import { ClaudeEventProcessor } from './claudeEventProcessor';
import { applyPhaseTransitionOnUserInput } from './pipelinePhaseTransitions';
import { isCounterQuestion, wrapCounterQuestion } from './counterQuestionGuard';
import { resetViolations } from './violationTracker';
import { usePipelineRunnerStore } from '../../stores/pipelineRunnerStore';
import { recordEvent } from '../../services/telemetry';
import { recordAndPublish } from '../../services/guardrailEventBus';
import { checkTokenBudget, formatBudgetWarning } from './tokenBudget';
import { sendNotification } from '../../utils/notification';
import { getOrCreateCanary, buildCanaryDirective, clearCanary } from './canaryGuard';
import { clearAllowlist } from './dangerousCommandAlert';
import { serializeContextItems } from './_contextSerialize';
import { resolveSlashCommand } from './_slashResolver';
import { PIPELINE_TRACKING_DIRECTIVE, CORTX_CONTEXT_PACK_MODE_DIRECTIVE } from './_pipelineDirective';
import { applyCounterQuestionPostGuard, applySecretCanaryPostGuard } from './_postResponseGuards';

// Tauri API 동적 import 래퍼 (CLAUDE.md 규칙 + quality gate 훅).
// 호출 지점마다 `import()`를 반복하지 않도록 모듈 내부에서만 재사용.
type UnlistenFn = () => void;
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}
async function listen<T>(event: string, handler: (ev: { payload: T }) => void): Promise<UnlistenFn> {
  const mod = await import('@tauri-apps/api/event');
  return mod.listen<T>(event, handler);
}

const EMPTY_ARR: never[] = [];

const CORTX_DESCRIPTIONS: Record<string, string> = {
  'pipeline:dev-task': 'Grill-me + 개발 계획서 작성',
  'pipeline:dev-implement': '개발 계획 수립 + 구현 + 테스트 + 커밋/PR',
  'pipeline:dev-resume': '중단된 파이프라인 재개',
};

export interface UseClaudeSessionReturn {
  messages: Message[];
  loading: boolean;
  error: string;
  input: string;
  setInput: (val: string) => void;
  setError: (val: string) => void;
  slashCommands: SlashCommand[];
  handleSend: () => Promise<void>;
  handleStop: () => void;
  handleClearMessages: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  endRef: React.RefObject<HTMLDivElement | null>;
  contextFileCount: number;
  contextTotalCount: number;
}

export function useClaudeSession(
  taskId: string,
  cwd: string,
  onSwitchTab?: (tab: string) => void,
): UseClaudeSessionReturn {
  const [messages, setMessagesRaw] = useState<Message[]>(() => messageCache.get(taskId) || []);
  const setMessages: typeof setMessagesRaw = (action) => {
    setMessagesRaw((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      messagesRef.current = next;
      messageCache.set(taskId, next);
      return next;
    });
  };

  const [input, setInput] = useState('');
  const [loading, setLoadingRaw] = useState(() => loadingCache.get(taskId) || false);
  const setLoading = (val: boolean) => {
    loadingCache.set(taskId, val);
    setLoadingRaw(val);
  };
  const [error, setError] = useState('');
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);

  const contextItemsRaw = useContextPackStore((s) => s.items[taskId]);
  const contextItems = contextItemsRaw || EMPTY_ARR;

  const endRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentReqIdRef = useRef<string>('');
  const claudeSessionIdRef = useRef<string>(sessionCache.get(taskId) || '');
  const messagesRef = useRef<Message[]>([]);

  useEffect(() => {
    // unmount 후 setState 호출 방지 — cwd 변경/탭 전환 시 경주 조건 차단
    let cancelled = false;
    invoke<SlashCommand[]>('list_slash_commands', { projectCwd: cwd || null })
      .then((cmds) => {
        if (cancelled) return;
        setSlashCommands(
          cmds.map((cmd) =>
            CORTX_DESCRIPTIONS[cmd.name] ? { ...cmd, description: CORTX_DESCRIPTIONS[cmd.name] } : cmd,
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    return () => {
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  // Sync from messageCache + loadingCache for background-running pipelines
  useEffect(() => {
    const interval = setInterval(() => {
      const cached = messageCache.get(taskId);
      if (cached && cached.length > 0 && cached.length > messages.length) {
        const filtered = cached.filter((m) => m.content.trim());
        setMessagesRaw(filtered);
        messagesRef.current = filtered;
      }
      // Sync loading state from loadingCache (set by pipelineExec)
      const cachedLoading = loadingCache.get(taskId) || false;
      if (cachedLoading !== loading) {
        setLoadingRaw(cachedLoading);
      }
      // Also clear messages if cache was emptied (e.g. by Reset Selected)
      if ((!cached || cached.length === 0) && messages.length > 0) {
        setMessagesRaw([]);
        messagesRef.current = [];
      }
    }, 300);
    return () => clearInterval(interval);
  }, [taskId, messages.length, loading]);

  /**
   * 스트리밍 텍스트에서 파이프라인 마커를 파싱해 store에 적용하고, 마커가 제거된
   * 표시용 텍스트를 반환한다. 실제 파싱/적용 로직은 `pipelineMarkers.ts` 순수 함수.
   */
  const processPipelineMarkers = (text: string): string => {
    const { cleaned, updates } = parsePipelineMarkers(text);
    if (updates.length > 0) {
      applyPipelineMarkerUpdates(taskId, updates, () => messagesRef.current);
    }
    return cleaned;
  };

  // Built-in 커맨드 디스패처 — 실제 핸들러는 builtinCommands.ts에 위치
  const tryHandleBuiltinCommand = async (text: string): Promise<boolean> => {
    const cmd = text.slice(1).split(/\s+/)[0]?.toLowerCase();
    if (!cmd) return false;

    const msgId = Date.now().toString(36);
    const userMsg: Message = { id: msgId, role: 'user', content: text };
    const sysMsg = (content: string) => {
      setMessages((prev) => [...prev, userMsg, { id: `${msgId}-sys`, role: 'activity', content, toolName: `/${cmd}` }]);
    };

    return handleBuiltinCommand({
      taskId,
      cwd,
      cmd,
      slashCommands,
      loading,
      messagesRef,
      claudeSessionIdRef,
      currentReqIdRef,
      unlistenRefs,
      setMessages,
      setLoading,
      sysMsg,
      onSwitchTab,
    });
  };

  // Slash command → prompt 변환은 _slashResolver.ts 로 추출됨.

  const handleStop = () => {
    // ESC-like interrupt: kill current generation but keep conversation,
    // session, and pipeline state intact so the user can continue the thread.
    if (currentReqIdRef.current) {
      invoke('claude_stop', { id: currentReqIdRef.current }).catch(() => {});
    }
    // Also kill any Claude process associated with this task (covers runPipeline path
    // which doesn't populate currentReqIdRef)
    invoke('claude_stop_task', { taskId }).catch(() => {});
    unlistenRefs.current.forEach((fn) => fn());
    unlistenRefs.current = [];
    currentReqIdRef.current = '';
    // Drop the trailing activity spinner (e.g. "Using Edit…") if present;
    // keep all prior user/assistant messages.
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      return last?.role === 'activity' ? prev.slice(0, -1) : prev;
    });
    setLoading(false);
    resetViolations(taskId);
    clearCanary(taskId);
    clearAllowlist(taskId);
  };

  const handleClearMessages = () => {
    setMessages([]);
    setError('');
    claudeSessionIdRef.current = '';
    messageCache.delete(taskId);
    sessionCache.delete(taskId);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;

    setInput('');
    setError('');

    // Intercept built-in commands before sending to Claude
    if (text.startsWith('/')) {
      const handled = await tryHandleBuiltinCommand(text);
      if (handled) return;
    }

    // Pipeline commands → delegate to shared pipelineExec (same path as Run Pipeline button)
    // Set loading immediately so Stop button appears without waiting for interval sync.
    // pipelineExec also sets loadingCache at start and clears it on completion.
    if (text.startsWith('/pipeline:')) {
      setLoading(true);
      // sidebar와 동일한 running/asking 상태를 공유 — Run Pipeline 버튼 경로와
      // 채팅 입력 경로가 같은 UI 반응을 보이도록.
      const runnerStore = usePipelineRunnerStore.getState();
      runnerStore.setRunning(taskId);
      runPipeline(taskId, text, {
        onAsking: () => runnerStore.setAsking(taskId),
        onNotAsking: () => runnerStore.unsetAsking(taskId),
        onDone: () => runnerStore.setNotRunning(taskId),
      });
      return;
    }

    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(36), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    // 승인 입력 시 파이프라인 단계 자동 전환 (규칙 테이블 기반)
    applyPhaseTransitionOnUserInput({
      taskId,
      userText: text,
      getMessages: () => messagesRef.current,
    });

    // On resume: auto-fill pipeline args but skip skill resolution
    // On first message: full skill resolution
    let resolvedText: string;
    if (claudeSessionIdRef.current) {
      // Resume — just auto-fill args if pipeline command
      const parts = text.startsWith('/') ? text.slice(1).split(/\s+/) : [];
      const cmdName = parts[0] || '';
      let args = parts.slice(1).join(' ');
      if (cmdName.startsWith('pipeline:') && !args.trim()) {
        const t = useTaskStore.getState().tasks.find((t) => t.id === taskId);
        if (t) args = `${t.branchName || ''} ${t.title || ''}`.trim();
      }
      resolvedText = args ? `/${cmdName} ${args}` : text;
    } else {
      resolvedText = await resolveSlashCommand(text, taskId, cwd);
    }

    // Harness: grill_me 중 역질문 감지 → 메시지 래핑으로 Claude 응답 제약
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    const isGrillMe = task?.pipeline?.phases?.grill_me?.status === 'in_progress';
    if (isGrillMe && isCounterQuestion(text)) {
      resolvedText = wrapCounterQuestion(resolvedText);
    }

    const reqId = `claude-${taskId}-${Date.now()}`;
    currentReqIdRef.current = reqId;

    try {
      const activityId = `${reqId}-activity`;
      const processor = new ClaudeEventProcessor({
        taskId,
        reqId,
        activityId,
        cwd,
        setMessages,
        setError,
        claudeSessionIdRef,
        processMarkers: processPipelineMarkers,
      });

      const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
        processor.process(event.payload);
      });
      unlistenRefs.current.push(unData);

      const donePromise = new Promise<void>((resolve) => {
        listen(`claude-done-${reqId}`, () => {
          resolve();
        }).then((un) => unlistenRefs.current.push(un));
      });

      // Sync session from cache (background execution may have set it)
      if (!claudeSessionIdRef.current && sessionCache.has(taskId)) {
        claudeSessionIdRef.current = sessionCache.get(taskId)!;
      }
      const hasExistingSession = !!claudeSessionIdRef.current;
      const isPipeline = text.startsWith('/pipeline:');

      let contextSummary = '';
      let contextFiles: string[] = [];

      // Pipeline tracking directive — always send for pipeline commands (even on resume)
      if (isPipeline) {
        contextSummary = PIPELINE_TRACKING_DIRECTIVE;
        // Canary: prompt injection 감지용 honeypot 토큰 삽입
        contextSummary += '\n' + buildCanaryDirective(getOrCreateCanary(taskId));
      }

      // Only send full context on first message (no existing session)
      if (!hasExistingSession) {
        // Fetch content for pinned HTTP URLs that don't have fullText yet
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
        if (pinFetches.length > 0) await Promise.all(pinFetches);

        const nonFileItems = contextItems.filter(
          (item) => !item.url || item.url.startsWith('http') || item.sourceType !== 'pin',
        );
        const itemsSummary = serializeContextItems(nonFileItems, taskId);

        if (isPipeline && contextItems.length > 0) {
          contextSummary += CORTX_CONTEXT_PACK_MODE_DIRECTIVE;
        }

        if (itemsSummary) {
          contextSummary = contextSummary ? `${contextSummary}\n\n---\n\n${itemsSummary}` : itemsSummary;
        }

        contextFiles = contextItems.filter((item) => item.url && !item.url.startsWith('http')).map((item) => item.url);

        // Pre-inject project-context.md into system prompt so Claude can skip codebase re-discovery.
        // cortx 스캐너가 생성한 파일로, 이미 규칙 문서·기술 스택·SOT가 요약되어 있음.
        if (isPipeline && cwd) {
          const ctxFile = `${cwd}/.cortx/project-context.md`;
          try {
            const { exists } = await import('@tauri-apps/plugin-fs');
            if (await exists(ctxFile)) {
              contextFiles.push(ctxFile);
            }
          } catch {
            /* skip — fs 플러그인 로드 실패 or 파일 미존재 */
          }
        }

        // Show loaded context items before Claude starts
        if (isPipeline && contextItems.length > 0) {
          const sourceIcons: Record<string, string> = {
            github: 'GitHub',
            slack: 'Slack',
            notion: 'Notion',
            pin: 'Pin',
          };
          const lines = contextItems.map((item) => {
            const src = sourceIcons[item.sourceType] || item.sourceType;
            return `  [${src}] ${item.title}`;
          });
          const contextLoadMsg = `Loading Context Pack (${contextItems.length} items)\n${lines.join('\n')}`;
          const ctxMsgId = `${reqId}-context-load`;
          setMessages((prev) => [
            ...prev,
            { id: ctxMsgId, role: 'activity', content: contextLoadMsg, toolName: 'Context Pack' },
          ]);
        }
      }

      // Pipeline state init + timer (always, even on resume)
      if (isPipeline) {
        const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
        if (currentTask && !currentTask.pipeline?.enabled) {
          const defaultPhases: Record<PipelinePhase, PipelinePhaseEntry> = {
            grill_me: { status: 'in_progress', startedAt: new Date().toISOString() },
            save: { status: 'pending' },
            dev_plan: { status: 'pending' },
            implement: { status: 'pending' },
            commit_pr: { status: 'pending' },
            review_loop: { status: 'pending' },
            done: { status: 'pending' },
          };
          useTaskStore.getState().updateTask(taskId, {
            pipeline: { enabled: true, phases: defaultPhases },
          });
        }
        const taskNow = useTaskStore.getState().tasks.find((t) => t.id === taskId);
        if (taskNow && (taskNow.status === 'waiting' || taskNow.status === 'paused')) {
          useTaskStore.getState().startTask(taskId);
        }
      }

      // Select model based on pipeline phase — Sonnet for implementation, Opus for planning
      let selectedModel: string | null = null;
      if (isPipeline) {
        const currentPipeline = useTaskStore.getState().tasks.find((t) => t.id === taskId)?.pipeline;
        if (currentPipeline?.phases?.implement?.status === 'in_progress') {
          selectedModel = 'claude-sonnet-4-6'; // Implementation: Sonnet (cost-effective)
        }
        // Grill-me, Dev Plan, Review: Opus (default)
      }

      // Token budget 사전 체크 — 초과 시 경고 (차단 아님)
      const budgetCheck = checkTokenBudget([resolvedText, contextSummary]);
      if (budgetCheck.overBudget) {
        const warning = formatBudgetWarning(budgetCheck);
        void recordAndPublish('token_budget_exceeded', {
          taskId,
          estimatedTokens: budgetCheck.estimatedTokens,
          limit: budgetCheck.limit,
        });
        sendNotification('Cortx — 토큰 한도 초과', warning);
        setError(`⚠️ ${warning}`);
      }

      // Audit log — 모든 spawn 기록 (pipeline/일반 구분, resume 여부 등)
      void recordEvent('action', 'claude_spawn', {
        reqId,
        taskId,
        model: selectedModel ?? 'default',
        isPipeline,
        isResume: !!claudeSessionIdRef.current,
        messageLength: resolvedText.length,
        contextSummaryLength: contextSummary.length,
        contextFileCount: contextFiles.length,
        phase: task?.pipeline?.phases && isGrillMe ? 'grill_me' : undefined,
      });

      await invoke('claude_spawn', {
        id: reqId,
        cwd: cwd || '/',
        message: resolvedText,
        contextFiles: contextFiles.length > 0 ? contextFiles : null,
        contextSummary: contextSummary || null,
        allowAllTools: text.startsWith('/') || null,
        sessionId: claudeSessionIdRef.current || sessionCache.get(taskId) || null,
        model: selectedModel,
      });

      await donePromise;

      if (isGrillMe && processor.hasContent()) {
        applyCounterQuestionPostGuard({ taskId, userText: text, messagesRef, setMessages });
      }

      if (processor.hasContent()) {
        applySecretCanaryPostGuard({ taskId, messagesRef, setMessages });
      }

      if (!processor.hasContent()) {
        setError('No response from Claude. Make sure `claude` CLI is installed and authenticated.');
      }
    } catch (err) {
      setError(`Failed: ${err}`);
    } finally {
      // Strip any lingering activity/tool-use indicators so the UI
      // (ClaudeChat treats trailing activity as "still busy") flips to Send.
      setMessages((prev) => prev.filter((m) => m.role !== 'activity'));
      setLoading(false);
    }
  };

  const contextFileCount = contextItems.filter((i) => i.url && !i.url.startsWith('http')).length;
  const contextTotalCount = contextItems.length;

  return {
    messages,
    loading,
    error,
    input,
    setInput,
    setError,
    slashCommands,
    handleSend,
    handleStop,
    handleClearMessages,
    inputRef,
    endRef,
    contextFileCount,
    contextTotalCount,
  };
}
