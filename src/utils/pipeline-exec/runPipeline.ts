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
