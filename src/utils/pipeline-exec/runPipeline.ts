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
import type { PipelinePhase, PipelinePhaseEntry } from '../../types/task';
import { invoke, listen } from './tauri';
import { fetchPinUrl } from './fetchPinUrl';
import type { PipelineCallbacks } from './types';

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

  // Add user message + show loading indicator (green dot "Claude is thinking...")
  const msgs: { id: string; role: 'user' | 'assistant' | 'activity'; content: string; toolName?: string }[] = [];
  msgs.push({ id: `${reqId}-user`, role: 'user', content: command });
  messageCache.set(taskId, [...msgs]);
  loadingCache.set(taskId, true);

  // Resolve slash command from .claude/commands/ files.
  // 주의: 더블쿼트 안에서 `~`는 확장되지 않으므로 `$HOME`로 치환해 shell이 풀도록 한다.
  // 이 fallback이 깨지면 Claude CLI가 슬래시 명령을 받아 Skill 툴로 스킬을 로드하게 되고,
  // 스킬 로드 + 내부 실행이 한 tool_use 안에서 네스티드되어 "Using Skill..." 상태로 수분간
  // 멈춘 것처럼 보인다. Project-local → $HOME 순으로 조회한다.
  let resolvedPrompt = `${command} ${args}`;
  const cmdName = command.slice(1);
  const skillKey = cmdName.replace(/:/g, '/') + '.md';
  const skillBases = [`${cwd}/.claude/commands`, '$HOME/.claude/commands'];
  for (const base of skillBases) {
    try {
      const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: '/',
        command: `cat "${base}/${skillKey}" 2>/dev/null`,
      });
      if (result.success && result.output.trim()) {
        let prompt = result.output;
        prompt = prompt.replace(/\$ARGUMENTS/g, args);
        prompt = prompt.replace(/\{TASK_ID\}/g, branch);
        prompt = prompt.replace(/\{TASK_NAME\}/g, title);
        resolvedPrompt = prompt;
        break;
      }
    } catch {
      /* continue */
    }
  }

  // Build context pack data
  const contextItems = useContextPackStore.getState().items[taskId] || [];
  let contextFiles: string[] = [];
  if (contextItems.length > 0) {
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

  // Strip pipeline markers from display text
  const stripMarkers = (text: string) => text.replace(/\[PIPELINE:[^\]]*\]/g, '').trimStart();

  // Parse pipeline markers and update task store
  const parsePipelineMarkers = (text: string): string => {
    let cleaned = text;
    const markerRegex = /\[PIPELINE:(\w+):(\w+)(?::([^\]]*))?\]/g;
    let match;
    while ((match = markerRegex.exec(text)) !== null) {
      const [fullMatch, phase, status, memo] = match;
      const PHASE_KEYS = new Set(['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done']);
      const VALID_STATUSES = new Set(['in_progress', 'done', 'skipped', 'pending']);
      if (PHASE_KEYS.has(phase) && VALID_STATUSES.has(status)) {
        const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
        if (t?.pipeline?.enabled) {
          const phases = { ...t.pipeline.phases };
          const entry = { ...(phases[phase as PipelinePhase] || {}) } as PipelinePhaseEntry;
          entry.status = status as PipelinePhaseEntry['status'];
          if (status === 'in_progress') entry.startedAt = new Date().toISOString();
          if (status === 'done' || status === 'skipped') entry.completedAt = new Date().toISOString();
          if (memo) entry.memo = memo;
          phases[phase as PipelinePhase] = entry;

          // Save dev plan
          if (phase === 'dev_plan' && status === 'done') {
            const cached = messageCache.get(taskId) || [];
            const planText = cached
              .filter((m) => m.role === 'assistant')
              .map((m) => m.content)
              .join('\n\n---\n\n');
            useTaskStore
              .getState()
              .updateTask(taskId, { pipeline: { ...t.pipeline, phases, devPlan: planText || t.pipeline.devPlan } });
          } else {
            useTaskStore.getState().updateTask(taskId, { pipeline: { ...t.pipeline, phases } });
          }

          if (status === 'done') {
            try {
              if ('Notification' in window && Notification.permission === 'granted') {
                const PHASE_NAMES: Record<string, string> = {
                  grill_me: 'Grill-me',
                  save: 'Save',
                  dev_plan: 'Dev Plan',
                  implement: 'Implement',
                  commit_pr: 'PR',
                  review_loop: 'Review',
                  done: 'Done',
                };
                new Notification('Cortx Pipeline', { body: `${PHASE_NAMES[phase] || phase} completed` });
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      cleaned = cleaned.replace(fullMatch, '');
    }
    return cleaned;
  };

  // Streaming handler — writes to messageCache
  let turnCounter = 0;
  let currentResponse = '';
  let currentMsgId = '';
  const activityId = `${reqId}-activity`;

  type Msg = { id: string; role: 'user' | 'assistant' | 'activity'; content: string; toolName?: string };
  // Streaming 시 Asking 상태 트래킹. donePromise보다 먼저 UI 반영.
  let isAskingNow = false;
  const updateCache = (updater: (cached: Msg[]) => Msg[]) => {
    // loadingCache stays true throughout the pipeline so the Stop button
    // remains visible. The "Claude is thinking..." indicator is hidden
    // automatically in ChatMessageList when any assistant/activity message exists.
    const cached = messageCache.get(taskId) || [];
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
    if (shouldBeAsking && !isAskingNow) {
      isAskingNow = true;
      callbacks?.onAsking?.();
    } else if (!shouldBeAsking && isAskingNow) {
      isAskingNow = false;
      callbacks?.onNotAsking?.();
    }
  };

  const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
    const currentTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    if (!currentTask?.pipeline?.enabled) return;

    try {
      const evt = JSON.parse(event.payload);

      if (evt.type === 'system' && evt.subtype === 'init' && evt.session_id) {
        sessionCache.set(taskId, evt.session_id);
      }

      if (evt.type === 'assistant' && evt.message?.content) {
        const textBlocks = (evt.message.content as Array<{ type: string; text?: string }>)
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { text?: string }) => b.text || '');
        const toolBlocks = (evt.message.content as Array<{ type: string; name?: string }>).filter(
          (b: { type: string }) => b.type === 'tool_use',
        );

        if (textBlocks.length > 0) {
          const newText = textBlocks.join('');
          if (!currentMsgId) {
            turnCounter++;
            currentMsgId = `${reqId}-turn-${turnCounter}`;
            currentResponse = parsePipelineMarkers(stripMarkers(newText));
          } else {
            currentResponse = parsePipelineMarkers(stripMarkers(currentResponse + newText));
          }
          if (currentResponse.trim()) {
            const msgId = currentMsgId;
            updateCache((cached) => {
              const filtered = cached.filter((m) => m.id !== activityId);
              const idx = filtered.findIndex((m) => m.id === msgId);
              if (idx >= 0) {
                filtered[idx] = { ...filtered[idx], content: currentResponse };
                return [...filtered];
              }
              return [...filtered, { id: msgId, role: 'assistant' as const, content: currentResponse }];
            });
          }
        }

        if (toolBlocks.length > 0) {
          currentMsgId = '';
          const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');
          updateCache((cached) => {
            const filtered = cached.filter((m) => m.id !== activityId);
            return [...filtered, { id: activityId, role: 'activity' as const, content: `Using ${toolLabel}...` }];
          });
        }
      } else if (evt.type === 'content_block_delta' && evt.delta?.text) {
        currentResponse = parsePipelineMarkers(stripMarkers(currentResponse + evt.delta.text));
        if (!currentMsgId) {
          turnCounter++;
          currentMsgId = `${reqId}-turn-${turnCounter}`;
        }
        if (currentResponse.trim()) {
          const msgId = currentMsgId;
          updateCache((cached) => {
            const filtered = cached.filter((m) => m.id !== activityId);
            const idx = filtered.findIndex((m) => m.id === msgId);
            if (idx >= 0) {
              filtered[idx] = { ...filtered[idx], content: currentResponse };
              return [...filtered];
            }
            return [...filtered, { id: msgId, role: 'assistant' as const, content: currentResponse }];
          });
        }
      }

      // Track token usage
      if (evt.type === 'result' && evt.usage) {
        const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
        if (t?.pipeline?.enabled) {
          const inTok = evt.usage.input_tokens || 0;
          const outTok = evt.usage.output_tokens || 0;
          const cost = evt.total_cost_usd || 0;
          const phases = { ...t.pipeline.phases };
          const PHASE_ORDER: PipelinePhase[] = [
            'grill_me',
            'save',
            'dev_plan',
            'implement',
            'commit_pr',
            'review_loop',
            'done',
          ];
          const activePhase = PHASE_ORDER.find((p) => phases[p]?.status === 'in_progress');
          if (activePhase) {
            const entry = { ...phases[activePhase] };
            entry.inputTokens = (entry.inputTokens || 0) + inTok;
            entry.outputTokens = (entry.outputTokens || 0) + outTok;
            entry.costUsd = (entry.costUsd || 0) + cost;
            phases[activePhase] = entry;
            useTaskStore.getState().updateTask(taskId, { pipeline: { ...t.pipeline, phases } });
          }
        }
      }
    } catch {
      /* not JSON */
    }
  });

  const donePromise = new Promise<void>((resolve) => {
    listen(`claude-done-${reqId}`, () => resolve());
  });

  // Pre-load project-context.md so Claude doesn't need a separate Read tool call
  // Saves 1 tool round-trip (~2-3s) per pipeline invocation. The scanner output
  // already contains full CLAUDE.md/AGENTS.md bodies since the embed refactor.
  let projectContextMd = '';
  if (cwd) {
    try {
      const ctxRes = await invoke<{ success: boolean; output: string }>('run_shell_command', {
        cwd: '/',
        command: `cat "${cwd}/.cortx/project-context.md" 2>/dev/null`,
      });
      if (ctxRes.success && ctxRes.output.trim()) {
        projectContextMd = ctxRes.output;
      }
    } catch {
      /* no project-context.md yet, skill falls back to fresh exploration */
    }
  }

  // Build context summary
  const summaryParts = [
    '## CORTX_PIPELINE_TRACKING',
    'You are running inside the Cortx app. To update the pipeline dashboard, emit phase markers in your text output.',
    'Format: [PIPELINE:phase:status] or [PIPELINE:phase:status:memo]',
    'Valid phases: grill_me, save, dev_plan, implement, commit_pr, review_loop, done',
    'Valid statuses: in_progress, done, skipped',
    'Examples:',
    '- When starting grill-me: emit [PIPELINE:grill_me:in_progress]',
    '- When grill-me is complete: emit [PIPELINE:grill_me:done]',
    '- When dev plan starts: emit [PIPELINE:dev_plan:in_progress]',
    '- When commit/PR is done: emit [PIPELINE:commit_pr:done]',
    '- IMPORTANT: You MUST emit these markers. The dashboard will NOT update without them.',
    '',
    '## CORTX_RULES (MUST FOLLOW)',
    '- Cortx does NOT use Obsidian. NEVER mention "Obsidian" in your responses. Never read/write dev-plan.md, _dashboard.md, or _pipeline-state.json.',
    '- The "Save" phase (internal key: save) is NOT Obsidian save — it just means finalize/summarize the grill-me outcome in memory.',
    '- Do NOT re-explore the codebase if you already explored it in this session. Use previous context.',
    '- NEVER run git commit, git push, or gh pr create without asking the user first.',
    '- After implementation, ask "커밋하시겠습니까?" and STOP. Do not commit until user says yes.',
    '- After commit+push, ask "PR을 생성할까요?" and STOP. Do not create PR until user says yes.',
    '- NEVER skip tests. Run tests and fix failures until ALL tests pass before asking to commit.',
    '- 한국어로만 대화합니다.',
    '- Grill-me questions MUST use Q1., Q2., Q3. format (NOT "질문 1:" or "질문1:"). Always end with ?.',
    '- Grill-me 첫 질문(**Q1.**) 출력 전까지 Grep/Glob/Read/Bash 호출 금지. project-context.md와 Context Pack fullText만 사용.',
    '- Context Pack에 Notion/Slack/GitHub fullText가 있으면 해당 MCP 도구 재호출 금지 (mcp__notion__*, mcp__slack__*, mcp__github__*).',
  ];

  if (projectContextMd) {
    summaryParts.push('', '---', '', '## CORTX_PROJECT_CONTEXT (pre-loaded)');
    summaryParts.push('project-context.md가 이미 아래에 포함돼 있습니다. 같은 파일을 Read 도구로 다시 읽지 마세요.');
    summaryParts.push('Tech Stack, Rule Files, 임베드된 CLAUDE.md/AGENTS.md 본문이 모두 포함됨.');
    summaryParts.push('', projectContextMd);
  }

  if (contextItems.length > 0) {
    summaryParts.push('', '---', '', '## CORTX_CONTEXT_PACK_MODE');
    summaryParts.push('This pipeline was invoked from the Cortx app with Context Pack data.');
    summaryParts.push(
      'Use the Context Pack data provided below as the task specification. Do NOT look for or reference any external dev-plan file.',
    );
    summaryParts.push(
      'Skip external file lookups (dev-plan.md, _pipeline-state.json, anything Obsidian-flavored) — the Context Pack IS your source of truth.',
    );
    summaryParts.push('If a dev-plan is needed, generate it from the Context Pack data.');
    const sourceLabels: Record<string, string> = { github: 'GitHub', slack: 'Slack', notion: 'Notion', pin: 'Pinned' };
    const bySource: Record<string, typeof contextItems> = {};
    for (const item of contextItems) {
      const key = item.sourceType || 'other';
      (bySource[key] ??= []).push(item);
    }
    for (const [source, items] of Object.entries(bySource)) {
      const label = sourceLabels[source] || source;
      const lines = items.map((item) => {
        const parts = [`- **${item.title}**`];
        if (item.summary && item.summary !== 'Pinned') parts.push(`  ${item.summary}`);
        const hasFullText = !!item.metadata?.fullText;
        // fullText가 있으면 URL은 감춤 — Claude가 원본 URL을 보고 MCP로 재조회하는 유인 제거
        if (item.url && item.url.startsWith('http') && !hasFullText) parts.push(`  ${item.url}`);
        if (hasFullText) {
          parts.push(`\n<!-- 본문 이미 포함됨 — ${label} MCP로 재조회 금지 -->\n${item.metadata!.fullText}`);
        }
        return parts.join('\n');
      });
      summaryParts.push('', `## ${label}`, ...lines);
    }
  }

  const contextSummary = summaryParts.join('\n');

  // Select model based on pipeline phase
  const currentPipeline = useTaskStore.getState().tasks.find((t) => t.id === taskId)?.pipeline;
  const selectedModel = currentPipeline?.phases?.implement?.status === 'in_progress' ? 'claude-sonnet-4-6' : null;
  // Opus 사용 경로(selectedModel == null → pty가 opus로 기본 승격)에서만 effort 낮춤.
  // Sonnet은 기존 동작 유지.
  const selectedEffort = selectedModel === null ? 'medium' : null;

  // grill-me / save / dev-plan 단계에서 소스별 MCP 도구를 조건부 차단한다.
  // 로직: "fullText가 이미 있는 소스만 차단". fullText가 없는 소스는 Claude가 필요 시
  // MCP로 fetch 폴백을 탈 수 있게 허용 — eager fetch 실패 / MCP 미연결 케이스 커버.
  //
  // 예: Notion Pin에 fullText가 있으면 mcp__notion__* 차단 (재조회 낭비 제거).
  //     fullText가 없으면 mcp__notion__* 허용 (Claude가 한 번 fetch해서 진행).
  const GRILLME_PHASES: ReadonlyArray<string> = ['grill_me', 'save', 'dev_plan'];
  const phases = currentPipeline?.phases;
  const activePhase = phases
    ? (Object.keys(phases) as Array<keyof typeof phases>).find((p) => phases[p]?.status === 'in_progress')
    : undefined;

  let disallowedTools: string[] | null = null;
  if (activePhase && GRILLME_PHASES.includes(activePhase as string)) {
    const hasUnfetched = (pattern: RegExp) =>
      contextItems.some((i) => i.url && pattern.test(i.url) && !i.metadata?.fullText);
    const tools: string[] = [];
    if (!hasUnfetched(/notion\.(so|site)/)) tools.push('mcp__notion__*');
    if (!hasUnfetched(/slack\.com/)) tools.push('mcp__slack__*');
    if (!hasUnfetched(/github\.com\/[^/]+\/[^/]+\/(issues|pull)\//)) tools.push('mcp__github__*');
    disallowedTools = tools.length > 0 ? tools : null;
  }

  void recordEvent('action', 'claude_spawn', {
    reqId,
    taskId,
    via: 'runPipeline',
    isPipeline: true,
    isResume: false,
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
    sessionId: null,
    model: selectedModel,
    effort: selectedEffort,
    disallowedTools,
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
  if (finalAsking && !isAskingNow) {
    callbacks?.onAsking?.();
  } else if (!finalAsking && isAskingNow) {
    callbacks?.onNotAsking?.();
  }

  loadingCache.set(taskId, false);
  recordEvent('action', 'pipeline.done', { command });
  callbacks?.onDone?.();
}

function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.endsWith('?') || t.endsWith('\uff1f')) return true;
  if (
    /(?:할까요|인가요|있나요|될까요|맞나요|괜찮을까요|건가요|하시나요|싶습니다|드릴까요|어떤가요|좋을까요|주세요|해줘)\s*[.?\uff1f]?\s*$/.test(
      t,
    )
  )
    return true;
  if (
    /(?:please confirm|what do you think|should we|would you|do you want|can you|is that correct|right\?|agree\?)\s*[.?]?\s*$/i.test(
      t,
    )
  )
    return true;
  const tail = t.slice(-200);
  // dev-task.md의 표준 질문 포맷: **Q1.** {질문}?
  if (/\*\*Q\d+\.\*\*/.test(tail)) return true;
  if (/(?:Q\d+[.:)]|질문\s*\d+\s*[:.)]).+[?\uff1f]/.test(tail)) return true;
  return false;
}
