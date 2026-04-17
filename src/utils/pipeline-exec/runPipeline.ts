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
import { formatToolActivity, type ContentBlock } from '../../components/claude/claudeEventProcessor';
import type { PipelineCallbacks } from './types';
import { stripMarkers as sharedStripMarkers, isQuestion as sharedIsQuestion, BUILTIN_PHASE_KEYS } from './_shared';

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

  // Command → phase 즉시 전환. Claude의 마커 emit을 기다리지 않고 앱이 먼저
  // 선행 phase를 done 처리하고 대응 phase를 in_progress 로 켠다. 사용자가
  // /pipeline:dev-implement 입력하면 PROGRESS 바에서 즉시 Dev Plan 스피너 돌아감.
  const phaseByCommand: Record<string, { done: string[]; activate: string }> = {
    '/pipeline:dev-implement': { done: ['grill_me', 'save'], activate: 'dev_plan' },
    // Plan 승인 후 재스폰 — dev_plan done 처리하고 implement 활성화.
    // Cortx 내부 전용 (사용자 입력 경로 아님).
    '/pipeline:_approve-plan': { done: ['grill_me', 'save', 'dev_plan'], activate: 'implement' },
    '/pipeline:dev-review-loop': {
      done: ['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr'],
      activate: 'review_loop',
    },
    '/pipeline:pr-review-fu': {
      done: ['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr'],
      activate: 'review_loop',
    },
  };
  const baseCmd = command.split(/\s+/)[0];
  const phaseTransition = phaseByCommand[baseCmd];
  // 재시도 감지: 활성화하려는 phase 가 이미 in_progress 이면 이전 시도가
  // 중단됐다는 뜻. Claude 세션에는 partial response + 미완료 tool_use 가
  // 남아있어 --resume 시 계획서 단계를 건너뛰고 구현을 이어가는 등 혼란을
  // 보인다. resolvedPrompt 앞에 재시작 지시를 prepend 해 복구.
  let isRetry = false;
  if (phaseTransition) {
    const t2 = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
    if (t2?.pipeline?.enabled) {
      const activateKey = phaseTransition.activate as keyof typeof t2.pipeline.phases;
      isRetry = t2.pipeline.phases[activateKey]?.status === 'in_progress';
      const now = new Date().toISOString();
      const phases = { ...t2.pipeline.phases };
      for (const p of phaseTransition.done) {
        const key = p as keyof typeof phases;
        if (phases[key] && phases[key].status !== 'done') {
          phases[key] = { ...phases[key], status: 'done', completedAt: now };
        }
      }
      phases[activateKey] = {
        ...(phases[activateKey] || {}),
        status: 'in_progress',
        startedAt: now,
      };
      useTaskStore.getState().updateTask(taskId, { pipeline: { ...t2.pipeline, phases } });
    }
  }

  // Add user message + show loading indicator (green dot "Claude is thinking...")
  // Fresh start에서는 messageCache가 비어있고, continuation(/pipeline:dev-implement 등)에서는
  // 이전 대화가 남아있어 새 user msg를 **append** 한다.
  // (예전 코드는 무조건 빈 배열로 시작해 continuation 시 grill-me 대화가 사라졌음)
  type Msg = { id: string; role: 'user' | 'assistant' | 'activity'; content: string; toolName?: string };
  const prevMsgs: Msg[] = isFreshStart ? [] : (messageCache.get(taskId) || []).filter((m) => m.role !== 'activity');
  const msgs: Msg[] = [...prevMsgs, { id: `${reqId}-user`, role: 'user', content: command }];
  messageCache.set(taskId, [...msgs]);
  loadingCache.set(taskId, true);

  // Resolve slash command.
  // 우선순위:
  //  1. /pipeline:* 계열은 **Cortx 바이너리 내장** 스킬 사용 (프로젝트/글로벌 무시).
  //     이유: 프로젝트·글로벌에 오래된 스킬(Obsidian 저장 등)이 있으면 Cortx 앱
  //     기대 동작과 어긋남. /pipeline:* 은 Cortx가 소유한 워크플로우이므로 항상
  //     내장 버전이 진실이다.
  //  2. 그 외(`/git:*`, `/sc:*` 등)는 project-local → $HOME 순 파일 조회.
  //     (`~`는 큰따옴표 안에서 확장되지 않으므로 `$HOME` 사용.)
  let resolvedPrompt = `${command} ${args}`;
  const cmdName = command.slice(1);
  const skillFileKey = cmdName.replace(/:/g, '/') + '.md';
  const skillLookupKey = cmdName.replace(/:/g, '/'); // 내장 조회는 .md 없이
  const substitute = (prompt: string): string =>
    prompt
      .replace(/\$ARGUMENTS/g, args)
      .replace(/\{TASK_ID\}/g, branch)
      .replace(/\{TASK_NAME\}/g, title);

  let builtinUsed = false;
  // 합성 명령 `/pipeline:_approve-plan` — 스킬 파일 없음. 승인 후 구현 진입을
  // 지시하는 인라인 프롬프트를 사용. 이전 Plan mode 세션에서 Claude 가
  // ExitPlanMode 로 제출한 계획은 `--resume` 으로 복원되므로 여기서는 "계획
  // 승인됐다, 구현 시작해라" 만 전달하면 된다.
  if (command.startsWith('/pipeline:_approve-plan')) {
    resolvedPrompt = [
      '✅ 사용자가 이전에 제출한 계획을 승인했습니다.',
      '이제 Plan mode 가 해제되어 Write/Edit 이 가능합니다.',
      '',
      '다음 순서로 진행:',
      '1. 먼저 [PIPELINE:dev_plan:done] 마커 출력',
      '2. 이어서 [PIPELINE:implement:in_progress] 마커 출력',
      '3. 승인된 계획대로 **바로 구현 시작**. 계획 재출력·재확인 금지.',
      '4. 각 단계별 파일 수정은 Edit/Write 로 직접 수행.',
      '5. 테스트 작성 + 실행까지 완료.',
      '6. 구현 완료 후 사용자에게 "커밋하시겠습니까?" 라고 물어보고 중단.',
      '',
      '⛔ prod 브랜치 관련 명령 일체 금지.',
      '⛔ 한국어로만 대화.',
    ].join('\n');
    builtinUsed = true;
  } else if (command.startsWith('/pipeline:')) {
    try {
      const builtin = await invoke<string | null>('get_builtin_pipeline_skill', { name: skillLookupKey });
      if (builtin && builtin.trim()) {
        resolvedPrompt = substitute(builtin);
        builtinUsed = true;
      }
    } catch {
      /* builtin 조회 실패 시 파일 fallback */
    }
  }

  if (!builtinUsed) {
    const skillBases = [`${cwd}/.claude/commands`, '$HOME/.claude/commands'];
    for (const base of skillBases) {
      try {
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: `cat "${base}/${skillFileKey}" 2>/dev/null`,
        });
        if (result.success && result.output.trim()) {
          resolvedPrompt = substitute(result.output);
          break;
        }
      } catch {
        /* continue */
      }
    }
  }

  // 재시도 감지 시 Claude 에게 "이전 시도 중단" 을 명시. 그렇지 않으면 Claude
  // 가 --resume 으로 partial state(예: 미완료 tool_use)를 이어받아 계획서를
  // 건너뛰고 이미 하던 작업을 계속하려는 혼란을 보인다.
  if (isRetry) {
    resolvedPrompt =
      `⚠️ [재시작 알림] 이전 /${cmdName} 시도는 도중에 중단됐습니다. 이전 partial response / 미완료 tool_use 는 무시하고, **처음부터** 이 스킬을 실행하세요. 이미 시작한 작업을 이어가지 말고, Step 1 (계획서 템플릿) 부터 새로 출력합니다.\n\n---\n\n` +
      resolvedPrompt;
  }

  // dev-implement 전용 주입 2종:
  //  1. Grill-me 최종 스펙 (마지막 어시스턴트 메시지) — 스펙 직접 가시화.
  //     --resume 이 전체 Q&A 를 세션에 복원하므로 전체 재주입은 컨텍스트 2배화 →
  //     마지막 요약 1개만 주입해 Claude 가 prompt 에서 바로 스펙을 본다.
  //  2. 소스 파일 경로 맵 (git ls-files 필터) — 디렉토리 구조 탐색 차단.
  //     스펙에서 지목된 클래스명(NexusCountryController, CountryService 등)을
  //     `ls` / `find` / `Glob` 호출 없이 이 맵에서 바로 Read 하도록 유도.
  if (command.startsWith('/pipeline:dev-implement') && !isFreshStart) {
    let prefix = '';

    const lastSpec = [...prevMsgs]
      .filter((m) => m.role === 'assistant' && m.content.trim() && !m.content.startsWith('/pipeline:'))
      .pop();

    if (lastSpec) {
      prefix +=
        `## 📋 GRILL-ME 스펙 요약 (Cortx 자동 주입 — 이전 단계에서 확정된 개발 스펙)\n\n` +
        `아래가 완전한 개발 스펙입니다. 이 내용만으로 개발 계획서를 작성하세요.\n` +
        `추가 코드베이스 탐색(Grep/Glob/Bash find/Agent) 없이 바로 계획서 템플릿을 작성합니다.\n\n` +
        lastSpec.content +
        `\n\n`;
    }

    if (cwd) {
      try {
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd,
          // 소스 파일만 필터 (node_modules/target/build 는 git ls-files 가 기본 제외).
          // 300라인 상한 — 800 은 컨텍스트 15k+ 토큰 추가 → API 호출당 수 분 지연.
          // test/mock/resource 경로 제외해 핵심 소스 우선 노출.
          command:
            'git ls-files 2>/dev/null | grep -E "\\.(java|kt|ts|tsx|py|rs|go|rb|scala)$" | grep -vE "(test|mock|resources|node_modules|generated)/" | head -300',
        });
        if (result.success && result.output.trim()) {
          prefix +=
            `## 📂 소스 파일 경로 맵 (Cortx pre-scan — git ls-files 상위 800)\n\n` +
            `위 스펙에서 지목된 클래스명(컨트롤러/서비스/DTO 등)을 이 목록에서 찾아 바로 Read 하세요.\n` +
            `**\`ls\` / \`find\` / \`Glob\` / 디렉토리 구조 확인 Bash 호출 금지** — 이미 전체 경로가 아래에 있습니다.\n\n` +
            '```\n' +
            result.output.trim() +
            '\n```\n\n';
        }
      } catch {
        /* git ls-files 실패 — skip, 스킬이 fallback */
      }
    }

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

  // Strip pipeline markers from display text — 공유 유틸 사용 (_shared.ts)
  const stripMarkers = sharedStripMarkers;

  // Parse pipeline markers and update task store (builtin phase 만 허용)
  const parsePipelineMarkers = (text: string): string => {
    let cleaned = text;
    const markerRegex = /\[PIPELINE:(\w+):(\w+)(?::([^\]]*))?\]/g;
    let match;
    while ((match = markerRegex.exec(text)) !== null) {
      const [fullMatch, phase, status, memo] = match;
      const VALID_STATUSES = new Set(['in_progress', 'done', 'skipped', 'pending']);
      if (BUILTIN_PHASE_KEYS.has(phase) && VALID_STATUSES.has(status)) {
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
          // ExitPlanMode 감지 — Plan mode 종료 시 Claude 가 계획을 제출하는 이벤트.
          // Headless 에선 auto-reject 되어 세션이 곧 종료. 계획 본문을 캐시에 저장해
          // 승인 UI 가 렌더할 수 있게 한다.
          const exitPlanBlock = (
            toolBlocks as Array<{ type: string; name?: string; input?: { plan?: string; planFilePath?: string } }>
          ).find((b) => b.name === 'ExitPlanMode');
          if (exitPlanBlock?.input?.plan) {
            const t = useTaskStore.getState().tasks.find((tt) => tt.id === taskId);
            if (t?.pipeline?.enabled) {
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
          }

          const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');
          const content = formatToolActivity(toolBlocks as ContentBlock[], toolLabel, null);
          const now = Date.now();
          updateCache((cached) => {
            const filtered = cached.filter((m) => m.id !== activityId);
            return [
              ...filtered,
              { id: activityId, role: 'activity' as const, content, toolName: toolLabel, startedAt: now },
            ];
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

  // Pre-load project-context.md so Claude doesn't need a separate Read tool call.
  // Continuation(--resume)일 때는 이미 이전 세션 시스템 프롬프트에 포함돼 있으므로
  // skip. 중복 주입 시 Claude 가 동일 17KB 를 재파싱해 TTFB 가 크게 늘어난다.
  let projectContextMd = '';
  if (cwd && isFreshStart) {
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

  // Build context summary.
  //
  // Fresh start(/pipeline:dev-task): 전체 컨텍스트 주입 (RULES + project-context.md +
  //   Context Pack fullText).
  // Continuation(/pipeline:dev-implement 등): --resume 이 이전 시스템 프롬프트와
  //   대화를 복원하므로 PIPELINE_TRACKING (phase 마커 리마인더)만 남기고 나머지는
  //   skip. 중복 주입 시 동일 17KB+ 블록을 Claude 가 재파싱해 TTFB 가 크게 늘어난다.
  const summaryParts: string[] = [
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
  ];

  if (isFreshStart) {
    summaryParts.push(
      '',
      '## CORTX_RULES (MUST FOLLOW)',
      '- Cortx stores state in memory/localStorage only. No external file writes. NEVER read/write dev-plan.md, _dashboard.md, _pipeline-state.json, or any vault/notes file.',
      '- The "Save" phase means: output the grill-me summary as chat text. Nothing is written to disk. Do not describe fake file writes.',
      '- Do NOT re-explore the codebase if you already explored it in this session. Use previous context.',
      '- NEVER run git commit, git push, or gh pr create without asking the user first.',
      '- After implementation, ask "커밋하시겠습니까?" and STOP. Do not commit until user says yes.',
      '- After commit+push, ask "PR을 생성할까요?" and STOP. Do not create PR until user says yes.',
      '- NEVER skip tests. Run tests and fix failures until ALL tests pass before asking to commit.',
      '- 한국어로만 대화합니다.',
      '- Grill-me questions MUST use Q1., Q2., Q3. format (NOT "질문 1:" or "질문1:"). Always end with ?.',
      '- Grill-me 첫 질문(**Q1.**) 출력 전까지 Grep/Glob/Read/Bash 호출 금지. project-context.md와 Context Pack fullText만 사용.',
      '- Context Pack에 Notion/Slack/GitHub fullText가 있으면 해당 MCP 도구 재호출 금지 (mcp__notion__*, mcp__slack__*, mcp__github__*).',
    );

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
        'Use the Context Pack data below as the task specification. Do NOT look for or reference any dev-plan file.',
      );
      summaryParts.push(
        'Skip all external file lookups (dev-plan.md, _pipeline-state.json, notes, vaults) — the Context Pack IS your source of truth.',
      );
      summaryParts.push('If a dev-plan is needed, generate it from the Context Pack data.');
      const sourceLabels: Record<string, string> = {
        github: 'GitHub',
        slack: 'Slack',
        notion: 'Notion',
        pin: 'Pinned',
      };
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
  }

  const contextSummary = summaryParts.join('\n');

  // Select model based on pipeline phase.
  // - grill_me / save: Opus (대화·요약 품질). effort=medium.
  // - dev_plan: Sonnet 4.6 (템플릿 채우기 + 기존 패턴 추종 작업. Opus max 는
  //   불필요하게 thinking 토큰 소모 — 체감 latency 수 배 증가).
  // - implement / review_loop: Sonnet (비용 효율).
  const currentPipeline = useTaskStore.getState().tasks.find((t) => t.id === taskId)?.pipeline;
  const activePhaseForModel = currentPipeline?.phases
    ? (['dev_plan', 'implement', 'review_loop'] as const).find(
        (p) => currentPipeline.phases[p]?.status === 'in_progress',
      )
    : undefined;
  const selectedModel = activePhaseForModel ? 'claude-sonnet-4-6' : null;
  // Opus·Sonnet 전부 effort=medium. Sonnet CLI 기본값이 high/xhigh 여서 extended
  // thinking 토큰이 수만 토큰 과소비되는 실측(Dev Plan 27K+). medium 으로 낮춰
  // 비용·지연 절감. 단계별 차등은 PHASE_EFFORT 상수로 조정 가능하게 분리했으나
  // 현재는 전 단계 동일.
  const selectedEffort = 'medium';

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
    // dev_plan/grill_me/save 단계 하드 차단 목록:
    // - Serena MCP: LSP 인덱싱 수 분, 첫 symbol 쿼리 hang.
    // - Glob/Grep: 모노레포 전체 스캔 시 수 분 소요. Read 로 충분.
    // - Task/Agent: subagent spawn 오버헤드 30초+ 가 실제 작업보다 큼.
    // - Bash(find/grep/rg/ag/ls -R/tree): Claude 가 Glob 차단을 shell 로
    //   우회해 `find -type f -name ...` 같은 워크트리 전체 스캔을 돌리는
    //   실측 케이스. 동일 목적이므로 Bash 레벨에서도 막음.
    // 일반 Bash (git status, ./gradlew 등) 는 여전히 허용.
    tools.push(
      'mcp__serena__*',
      'Glob',
      'Grep',
      'Task',
      'Agent',
      'Bash(find:*)',
      'Bash(grep:*)',
      'Bash(rg:*)',
      'Bash(ag:*)',
      'Bash(fd:*)',
      'Bash(tree:*)',
      'Bash(ls:*)',
    );
    disallowedTools = tools.length > 0 ? tools : null;
  }

  // Continuation 시 이전 Claude 세션을 --resume 으로 이어 grill-me 컨텍스트 보존.
  // 세션이 캐시에 없으면(앱 재시작 등) null → 새 세션. 사용자가 직접 이전 대화를
  // 다시 올릴 수 없으므로 여기서 누락되면 Claude가 컨텍스트를 잃는다.
  const resumeSessionId = !isFreshStart ? sessionCache.get(taskId) || null : null;

  // Permission mode — dev_plan 단계에서만 plan 모드 사용. Claude CLI 가 Write/Edit
  // 를 하드 차단하고 Claude 가 ExitPlanMode 로 계획 제출 후 세션 종료 (headless
  // 에선 auto-reject). Cortx 가 ExitPlanMode 이벤트 인식해 승인 카드 렌더.
  // 승인 후 재스폰은 bypassPermissions 로 --resume 하면서 구현 단계 진입.
  const permissionMode = activePhase === 'dev_plan' ? 'plan' : 'bypassPermissions';

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
    bashTimeoutMs: activePhase && GRILLME_PHASES.includes(activePhase as string) ? 30000 : null,
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
  if (finalAsking && !isAskingNow) {
    callbacks?.onAsking?.();
  } else if (!finalAsking && isAskingNow) {
    callbacks?.onNotAsking?.();
  }

  loadingCache.set(taskId, false);
  recordEvent('action', 'pipeline.done', { command });
  callbacks?.onDone?.();
}

// isQuestion 은 공유 유틸로 이동 (_shared.ts) — runCustomPipeline 도 동일 로직 사용
const isQuestion = sharedIsQuestion;
