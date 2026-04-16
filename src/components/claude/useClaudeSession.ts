import { useState, useRef, useEffect } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import { useTaskStore } from '../../stores/taskStore';
import type { ContextItem } from '../../types/contextPack';
import type { PipelinePhase, PipelinePhaseEntry } from '../../types/task';
import { messageCache, sessionCache, loadingCache } from '../../utils/chatState';
import { runPipeline, fetchPinUrl } from '../../utils/pipelineExec';
import type { Message, SlashCommand } from './types';
import { handleBuiltinCommand } from './builtinCommands';
import { parsePipelineMarkers, applyPipelineMarkerUpdates } from './pipelineMarkers';
import { ClaudeEventProcessor } from './claudeEventProcessor';
import { applyPhaseTransitionOnUserInput } from './pipelinePhaseTransitions';
import {
  isCounterQuestion,
  wrapCounterQuestion,
  applyCounterQuestionGuard,
  extractHighestQNumber,
} from './counterQuestionGuard';
import { recordViolation, resetViolations } from './violationTracker';
import { sanitizeExternalContent } from '../../services/contextSanitizer';
import { recordEvent } from '../../services/telemetry';
import { recordAndPublish } from '../../services/guardrailEventBus';
import { scanForSecrets } from './secretScanner';
import { checkTokenBudget, formatBudgetWarning } from './tokenBudget';
import { sendNotification } from '../../utils/notification';
import { getOrCreateCanary, buildCanaryDirective, detectCanaryLeak, maskCanary, clearCanary } from './canaryGuard';
import { clearAllowlist } from './dangerousCommandAlert';

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

function serializeContextItems(items: ContextItem[], taskId?: string): string {
  if (items.length === 0) return '';

  const sections: string[] = [];
  const bySource: Record<string, ContextItem[]> = {};

  for (const item of items) {
    const key = item.sourceType;
    if (!bySource[key]) bySource[key] = [];
    bySource[key].push(item);
  }

  const sourceLabels: Record<string, string> = {
    github: 'GitHub',
    slack: 'Slack',
    notion: 'Notion',
    pin: 'Pinned',
  };

  for (const [source, sourceItems] of Object.entries(bySource)) {
    const label = sourceLabels[source] || source;
    const lines = sourceItems.map((item) => {
      const parts = [`- **${item.title}**`];
      if (item.summary && item.summary !== 'Pinned') parts.push(`  ${item.summary}`);
      if (item.url && item.url.startsWith('http')) parts.push(`  ${item.url}`);
      if (item.metadata?.fullText) {
        // Indirect injection 방어: 외부 콘텐츠를 trust boundary로 감싸고 패턴 스캔
        const { wrapped, findings } = sanitizeExternalContent(item.metadata.fullText, source);
        if (findings.length > 0) {
          void recordAndPublish('context_injection_detected', {
            source,
            taskId,
            patternCount: findings.length,
            severities: findings.map((f) => f.severity),
          });
        }
        parts.push(`\n${wrapped}`);
      }
      return parts.join('\n');
    });
    sections.push(`## ${label}\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}

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

  const resolveSlashCommand = async (text: string): Promise<string> => {
    if (!text.startsWith('/')) return text;

    const parts = text.slice(1).split(/\s+/);
    const cmdName = parts[0];
    let args = parts.slice(1).join(' ');

    // Auto-fill pipeline args from current task
    const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    if (cmdName.startsWith('pipeline:') && currentTask) {
      const branch = currentTask.branchName || '';
      const title = currentTask.title || '';
      if (!args.trim()) {
        args = `${branch} ${title}`.trim();
      }
    }

    // Resolve skill from .claude/commands/ files
    const skillKey = cmdName.replace(/:/g, '/');
    const filePath = skillKey + '.md';
    for (const base of [`${cwd}/.claude/commands`, '~/.claude/commands']) {
      try {
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: `cat "${base}/${filePath}" 2>/dev/null`,
        });
        if (result.success && result.output.trim()) {
          let prompt = result.output;
          prompt = prompt.replace(/\$ARGUMENTS/g, args);
          if (currentTask) {
            prompt = prompt.replace(/\{TASK_ID\}/g, currentTask.branchName || '');
            prompt = prompt.replace(/\{TASK_NAME\}/g, currentTask.title || '');
          }
          return prompt;
        }
      } catch {
        /* continue */
      }
    }

    return text;
  };

  const handleStop = () => {
    // Stop current response — kill process + unlisten + remove activity + reset task status
    if (currentReqIdRef.current) {
      invoke('claude_stop', { id: currentReqIdRef.current }).catch(() => {});
    }
    // Also kill any Claude process associated with this task (covers runPipeline path
    // which doesn't populate currentReqIdRef)
    invoke('claude_stop_task', { taskId }).catch(() => {});
    unlistenRefs.current.forEach((fn) => fn());
    unlistenRefs.current = [];
    setMessages([]);
    messageCache.set(taskId, []);
    loadingCache.delete(taskId);
    sessionCache.delete(taskId);
    claudeSessionIdRef.current = '';
    setLoading(false);
    resetViolations(taskId);
    clearCanary(taskId);
    clearAllowlist(taskId);
    // Reset task status to waiting, clear pipeline, and reset timer
    useTaskStore.getState().updateTask(taskId, { status: 'waiting', pipeline: undefined, elapsedSeconds: 0 });
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
      runPipeline(taskId, text);
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
      resolvedText = await resolveSlashCommand(text);
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
        contextSummary = [
          '## CORTX_PIPELINE_TRACKING',
          'You are running inside the Cortx app. To update the pipeline dashboard, emit phase markers in your text output.',
          'Format: [PIPELINE:phase:status] or [PIPELINE:phase:status:memo]',
          'Valid phases: grill_me, obsidian_save, dev_plan, implement, commit_pr, review_loop, done',
          'Valid statuses: in_progress, done, skipped',
          'Examples:',
          '  [PIPELINE:dev_plan:in_progress]',
          '  [PIPELINE:implement:done:빌드 성공, 4개 파일 변경]',
          '  [PIPELINE:commit_pr:done:PR #4920]',
          'Emit a marker at the START and END of each phase. These markers are parsed by the app and hidden from the user.',
          'Also emit [PIPELINE:complexity:Simple] or Medium/Complex when determined.',
          'Also emit [PIPELINE:pr:NUMBER:URL] when PR is created.',
          '',
          '## Phase transition rules:',
          '- When user approves dev plan ("y"): emit [PIPELINE:dev_plan:done] then [PIPELINE:implement:in_progress]',
          '- When implementation is complete: emit [PIPELINE:implement:done] then [PIPELINE:commit_pr:in_progress]',
          '- When commit/PR is done: emit [PIPELINE:commit_pr:done]',
          '- IMPORTANT: You MUST emit these markers. The dashboard will NOT update without them.',
          '',
          '## CORTX_RULES (MUST FOLLOW)',
          '- Do NOT update Obsidian _dashboard.md or _pipeline-state.json.',
          '- Do NOT search for dev-plan.md files. Obsidian is not used.',
          '- Do NOT re-explore the codebase if you already explored it in this session. Use previous context.',
          '- NEVER run git commit, git push, or gh pr create without asking the user first.',
          '- After implementation, ask "커밋하시겠습니까?" and STOP. Do not commit until user says yes.',
          '- After commit+push, ask "PR을 생성할까요?" and STOP. Do not create PR until user says yes.',
          '- NEVER skip tests. Run tests and fix failures until ALL tests pass before asking to commit.',
          '- 한국어로만 대화합니다.',
          '- Grill-me questions MUST use Q1., Q2., Q3. format (NOT "질문 1:" or "질문1:"). Always end with ?.',
          '',
          '## ⛔ COUNTER-QUESTION RULE (CRITICAL — NEVER SKIP)',
          '- When user asks YOU a question instead of answering (e.g. "너는 어떻게 생각해?", "왜?", "다른 방법은?"):',
          '  1. Answer their question with reasoning',
          '  2. MUST ask "이 방향으로 진행할까요?" — NEVER skip this confirmation',
          '  3. Wait for user approval before moving to next Q number',
          '  4. If user gives more input, incorporate and re-confirm',
          '  5. NEVER output a new Q number until user explicitly approves',
          '- Violating this rule invalidates the entire Grill-me session.',
        ].join('\n');

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
          contextSummary +=
            '\n\n---\n\n## CORTX_CONTEXT_PACK_MODE\n' +
            'This pipeline was invoked from the Cortx app with Context Pack data.\n' +
            'Use the Context Pack data provided below as the task specification instead of reading from Obsidian dev-plan.\n' +
            'Skip Obsidian file lookups (dev-plan.md, _pipeline-state.json) — the Context Pack IS your source of truth.\n' +
            'If a dev-plan is needed, generate it from the Context Pack data.';
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
            obsidian_save: { status: 'pending' },
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

      // Code-level guard: grill_me 중 역질문 응답에서 premature Q번호 제거 + 확인 삽입
      if (isGrillMe && processor.hasContent()) {
        const allMsgs = messagesRef.current;
        const assistantMsgs = allMsgs.filter((m) => m.role === 'assistant');
        const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
        if (lastAssistant) {
          const prevMsgs = assistantMsgs.slice(0, -1);
          const currentQNumber = prevMsgs.reduce((max, m) => Math.max(max, extractHighestQNumber(m.content)), 0);
          const guardResult = applyCounterQuestionGuard({
            userText: text,
            responseText: lastAssistant.content,
            currentQNumber,
          });
          if (guardResult) {
            const targetId = lastAssistant.id;
            const markType = guardResult.violationType === 'premature_q' ? 'q_trimmed' : 'confirmation_added';
            setMessages((prev) =>
              prev.map((m) =>
                m.id === targetId
                  ? {
                      ...m,
                      content: guardResult.correctedText,
                      guardrailMarks: [
                        ...(m.guardrailMarks || []),
                        { type: markType, detail: guardResult.violationDetail },
                      ],
                    }
                  : m,
              ),
            );
            // 위반 기록 + anomaly 감지 (3회 이상 시 UI 알림)
            recordViolation({
              taskId,
              violationType: guardResult.violationType,
              violationDetail: guardResult.violationDetail,
            });
          }
        }
      }

      // Secret scanner + Canary: 응답에 API key/token/canary 있으면 마스킹
      if (processor.hasContent()) {
        const allMsgs = messagesRef.current;
        const assistantMsgs = allMsgs.filter((m) => m.role === 'assistant');
        const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
        if (lastAssistant) {
          let content = lastAssistant.content;
          const newMarks: { type: 'canary_blocked' | 'secret_masked'; detail?: string }[] = [];

          // Canary leak 검출 (prompt injection 성공 신호)
          if (detectCanaryLeak(content, taskId)) {
            content = maskCanary(content, taskId);
            newMarks.push({ type: 'canary_blocked' });
            void recordAndPublish('canary_leak_detected', { taskId });
            sendNotification(
              'Cortx — Prompt Injection 감지',
              'Claude가 내부 canary 토큰을 유출했습니다. 응답이 차단되었습니다.',
            );
          }

          // Secret/마커 마스킹
          const scan = scanForSecrets(content);
          if (scan.found) {
            content = scan.masked;
            newMarks.push({ type: 'secret_masked', detail: scan.matches.map((x) => x.type).join(', ') });
            void recordAndPublish('secret_leak_masked', {
              taskId,
              types: scan.matches.map((x) => x.type),
              count: scan.matches.length,
            });
          }

          if (newMarks.length > 0) {
            const targetId = lastAssistant.id;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === targetId ? { ...m, content, guardrailMarks: [...(m.guardrailMarks || []), ...newMarks] } : m,
              ),
            );
          }
        }
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
