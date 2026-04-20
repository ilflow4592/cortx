/**
 * 커스텀 파이프라인 실행 엔트리포인트.
 * runPipeline.ts (builtin) 과 공존하며, Task.pipeline.pipelineMode === 'custom' 이면
 * 상위 entry (runPipelineRouter) 에서 이쪽으로 라우팅.
 *
 * 동작:
 *   1. configId + source 로 파이프라인 로드
 *   2. activeCustomPipeline 런타임 상태 초기화
 *   3. phase 순차 실행:
 *      - 각 skill 순차 실행 (skill.kind 별 프롬프트 생성 → claude_spawn)
 *      - OUTPUT 마커 추출 → artifacts 업데이트
 *      - 다음 skill 의 {key} 치환
 *   4. auto=false phase 완료 시 사용자 승인 대기 (현재는 진행 멈춤)
 *
 * v1 scope:
 *   - 순차 실행만 (병렬 skill/agent 는 v2+)
 *   - 세션: Claude --resume 으로 동일 세션 공유 (shared contextMode). isolated 는 새 spawn.
 *   - 오류 처리: skill 실패 시 phase failed, 전체 중단 (재시도 없음)
 */
import { useTaskStore } from '../../stores/taskStore';
import { messageCache, sessionCache, loadingCache } from '../chatState';
import { recordEvent } from '../../services/telemetry';
import { readCustomPipeline } from '../../services/customPipelineStore';
import { readSkillBody } from '../../services/skillLibrary';
import { parseSkillFrontmatter } from './frontmatterParser';
import { extractOutputMarkers, substituteArtifacts } from './outputMarker';
import { buildAgentBlockPrompt } from './agentBlockTemplate';
import { isQuestion as sharedIsQuestion, stripMarkers as sharedStripMarkers } from './_shared';
import { invoke, listen } from './tauri';
import type { PipelineCallbacks } from './types';
import type {
  ActiveCustomPipeline,
  CustomPhase,
  CustomPhaseState,
  CustomPipelineConfig,
  CustomSkillRef,
  CustomSkillStatus,
} from '../../types/customPipeline';
import { logger } from '../logger';

type Msg = {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  content: string;
  toolName?: string;
  startedAt?: number;
};

function nowIso(): string {
  return new Date().toISOString();
}

function initState(taskId: string, cfg: CustomPipelineConfig): ActiveCustomPipeline {
  const phaseStates: Record<string, CustomPhaseState> = {};
  for (const phase of cfg.phases) {
    phaseStates[phase.id] = {
      status: 'pending',
      skillStates: {},
      startedAt: undefined,
    };
  }
  const active: ActiveCustomPipeline = {
    configId: cfg.id,
    source: cfg.source,
    currentPhaseIndex: 0,
    currentSkillIndex: 0,
    phaseStates,
    artifacts: {},
  };
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (task?.pipeline) {
    useTaskStore.getState().updateTask(taskId, {
      pipeline: { ...task.pipeline, enabled: true, pipelineMode: 'custom', activeCustomPipeline: active },
    });
  }
  return active;
}

function setPhaseState(taskId: string, phaseId: string, patch: Partial<CustomPhaseState>): void {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!task?.pipeline?.activeCustomPipeline) return;
  const active = task.pipeline.activeCustomPipeline;
  const existing = active.phaseStates[phaseId] || {
    status: 'pending' as CustomSkillStatus,
    skillStates: {},
  };
  const newState: ActiveCustomPipeline = {
    ...active,
    phaseStates: {
      ...active.phaseStates,
      [phaseId]: { ...existing, ...patch },
    },
  };
  useTaskStore.getState().updateTask(taskId, { pipeline: { ...task.pipeline, activeCustomPipeline: newState } });
}

function setSkillState(taskId: string, phaseId: string, skillIndex: number, status: CustomSkillStatus): void {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!task?.pipeline?.activeCustomPipeline) return;
  const active = task.pipeline.activeCustomPipeline;
  const phaseState = active.phaseStates[phaseId];
  if (!phaseState) return;
  const newPhaseState: CustomPhaseState = {
    ...phaseState,
    skillStates: { ...phaseState.skillStates, [skillIndex]: status },
  };
  const newActive: ActiveCustomPipeline = {
    ...active,
    phaseStates: { ...active.phaseStates, [phaseId]: newPhaseState },
    currentSkillIndex: skillIndex,
  };
  useTaskStore.getState().updateTask(taskId, { pipeline: { ...task.pipeline, activeCustomPipeline: newActive } });
}

function updateArtifacts(taskId: string, merged: Record<string, string>): void {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!task?.pipeline?.activeCustomPipeline) return;
  const active = task.pipeline.activeCustomPipeline;
  const newActive: ActiveCustomPipeline = {
    ...active,
    artifacts: { ...active.artifacts, ...merged },
  };
  useTaskStore.getState().updateTask(taskId, { pipeline: { ...task.pipeline, activeCustomPipeline: newActive } });
}

async function resolveSkillBody(skillRef: CustomSkillRef, cwd: string | undefined): Promise<string> {
  switch (skillRef.kind) {
    case 'builtin':
      return readSkillBody(skillRef.id, 'builtin', cwd);
    case 'project':
      return readSkillBody(skillRef.id, 'project', cwd);
    case 'user':
      return readSkillBody(skillRef.id, 'user', cwd);
    case 'agent':
      // agent 본문은 skillRef.prompt (사용자 입력). 기본값은 agentBlockTemplate 에서 생성.
      return skillRef.prompt || '';
  }
}

/**
 * Custom pipeline alias → Claude CLI model ID.
 * 사용자가 skill 에서 특정 모델을 명시 지정할 때만 사용. alias 가 없거나
 * "Opus" 인 경우 null → `--model` 플래그 생략 → CLI `/model` default 적용.
 * Sonnet/Haiku 는 명시 override 목적이라 model ID 를 고정해 둠. Anthropic 이
 * minor 버전 올리면 이 매핑을 갱신해야 함.
 */
function modelIdFromAlias(alias: string | undefined): string | null {
  switch (alias) {
    case 'Sonnet':
      return 'claude-sonnet-4-6';
    case 'Haiku':
      return 'claude-haiku-4-5';
    case 'Opus':
    default:
      return null;
  }
}

async function runSkill(
  taskId: string,
  cwd: string,
  phase: CustomPhase,
  skillRef: CustomSkillRef,
  skillIndex: number,
  callbacks: PipelineCallbacks | undefined,
): Promise<void> {
  const phaseId = phase.id;
  setSkillState(taskId, phaseId, skillIndex, 'in_progress');

  // 1) 본문 로드 + frontmatter 파싱
  let body = await resolveSkillBody(skillRef, cwd);
  const { frontmatter, body: bare } = parseSkillFrontmatter(body);
  body = bare;

  // 2) artifacts 치환 + agent 템플릿 적용
  const active = useTaskStore.getState().tasks.find((t) => t.id === taskId)?.pipeline?.activeCustomPipeline;
  const artifacts = active?.artifacts || {};
  let prompt: string;
  if (skillRef.kind === 'agent') {
    const agentPrompt = buildAgentBlockPrompt(skillRef, {
      phaseLabel: phase.label,
      artifacts,
    });
    prompt = agentPrompt;
  } else {
    const { result } = substituteArtifacts(body, artifacts);
    prompt = result;
  }

  // 3) spawn 옵션 결정
  const contextMode = frontmatter?.contextMode ?? 'shared';
  const resumeSessionId = contextMode === 'shared' ? sessionCache.get(taskId) || null : null;
  const modelOverride = modelIdFromAlias(phase.model);
  const reqId = `claude-${taskId}-${phaseId}-${skillIndex}-${Date.now()}`;

  // 4) user 메시지로 프롬프트 추가 (UI 반영)
  const msgs: Msg[] = [
    ...((messageCache.get(taskId) || []).filter((m) => m.role !== 'activity') as Msg[]),
    { id: `${reqId}-user`, role: 'user', content: `▸ ${phase.label} · skill ${skillIndex + 1}` },
  ];
  messageCache.set(taskId, msgs);
  loadingCache.set(taskId, true);

  // 5) 스트리밍 수신
  let assistantText = '';
  let currentMsgId = '';
  const activityId = `${reqId}-activity`;

  const unData = await listen<string>(`claude-data-${reqId}`, (event) => {
    try {
      const evt = JSON.parse(event.payload);

      if (evt.type === 'system' && evt.subtype === 'init' && evt.session_id) {
        if (contextMode === 'shared') sessionCache.set(taskId, evt.session_id);
      }

      if (evt.type === 'assistant' && evt.message?.content) {
        const textBlocks = (evt.message.content as Array<{ type: string; text?: string }>)
          .filter((b) => b.type === 'text')
          .map((b) => b.text || '');
        const toolBlocks = (evt.message.content as Array<{ type: string; name?: string }>).filter(
          (b) => b.type === 'tool_use',
        );

        if (textBlocks.length > 0) {
          const chunk = sharedStripMarkers(textBlocks.join(''));
          assistantText += chunk;
          if (!currentMsgId) currentMsgId = `${reqId}-turn-${Date.now()}`;
          const cached = messageCache.get(taskId) || [];
          const filtered = cached.filter((m) => m.id !== activityId);
          const idx = filtered.findIndex((m) => m.id === currentMsgId);
          if (idx >= 0) {
            filtered[idx] = { ...filtered[idx], content: assistantText };
            messageCache.set(taskId, [...filtered]);
          } else {
            messageCache.set(taskId, [
              ...filtered,
              { id: currentMsgId, role: 'assistant' as const, content: assistantText },
            ]);
          }
        }

        if (toolBlocks.length > 0) {
          currentMsgId = '';
          const toolLabel = toolBlocks.map((b) => b.name || 'tool').join(', ');
          const cached = messageCache.get(taskId) || [];
          const filtered = cached.filter((m) => m.id !== activityId);
          messageCache.set(taskId, [
            ...filtered,
            {
              id: activityId,
              role: 'activity' as const,
              content: `Using ${toolLabel}...`,
              toolName: toolLabel,
              startedAt: Date.now(),
            },
          ]);
        }
      }
    } catch {
      /* not JSON */
    }
  });

  const donePromise = new Promise<void>((resolve) => {
    listen(`claude-done-${reqId}`, () => resolve());
  });

  // 6) spawn 실제 호출
  const disallowed = phase.disallowedTools ?? null;
  try {
    await invoke('claude_spawn', {
      id: reqId,
      cwd,
      message: prompt,
      contextFiles: null,
      contextSummary: '',
      allowAllTools: true,
      sessionId: resumeSessionId,
      model: modelOverride,
      effort: phase.effort ?? 'medium',
      disallowedTools: disallowed,
      disableProjectMcp: true,
      bashTimeoutMs: null,
      permissionMode: phase.permissionMode ?? 'bypassPermissions',
    });
  } catch (err) {
    unData();
    setSkillState(taskId, phaseId, skillIndex, 'failed');
    throw err;
  }

  await donePromise;
  unData();

  // 7) activity 정리 + OUTPUT 마커 추출
  const finalMsgs = (messageCache.get(taskId) || []).filter((m) => m.role !== 'activity');
  messageCache.set(taskId, finalMsgs);

  const { artifacts: extracted, stripped } = extractOutputMarkers(assistantText);
  // OUTPUT 마커 누락 시 silent fallback: agent 블록은 outputKey 로 전체 응답 저장
  if (skillRef.kind === 'agent') {
    const outKey = skillRef.outputKey || 'agent_result';
    if (!extracted[outKey] && stripped.trim()) {
      extracted[outKey] = stripped.trim();
    }
  }
  if (Object.keys(extracted).length > 0) {
    updateArtifacts(taskId, extracted);
  }

  // asking 상태 체크 — 마지막 assistant 메시지가 질문형이면 사용자 승인 플로우 유도
  const lastAssistant = [...finalMsgs].reverse().find((m) => m.role === 'assistant');
  if (lastAssistant && sharedIsQuestion(lastAssistant.content)) {
    callbacks?.onAsking?.();
  }

  setSkillState(taskId, phaseId, skillIndex, 'done');
}

/**
 * 엔트리포인트. Task.pipeline.pipelineMode 가 'custom' 이어야 호출됨.
 *
 * configRef: { id, source } — 실행할 파이프라인 식별.
 */
export async function runCustomPipeline(
  taskId: string,
  configRef: { id: string; source: 'user' | 'project' },
  callbacks?: PipelineCallbacks,
): Promise<void> {
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  if (!task) return;
  const cwd = task.worktreePath || task.repoPath || '';
  if (!cwd) {
    logger.error('runCustomPipeline: no cwd for task', taskId);
    return;
  }

  callbacks?.onRunning?.();
  recordEvent('action', 'custom_pipeline.start', { configId: configRef.id, source: configRef.source });

  let cfg: CustomPipelineConfig;
  try {
    cfg = await readCustomPipeline(configRef.id, configRef.source, cwd);
  } catch (err) {
    logger.error('runCustomPipeline: failed to load config', err);
    callbacks?.onDone?.();
    return;
  }

  initState(taskId, cfg);
  useTaskStore.getState().updateTask(taskId, { elapsedSeconds: task.elapsedSeconds, status: 'active' as const });

  try {
    for (const [pi, phase] of cfg.phases.entries()) {
      setPhaseState(taskId, phase.id, { status: 'in_progress', startedAt: nowIso() });

      try {
        for (const [si, skillRef] of phase.skills.entries()) {
          // 중단 체크 — 사용자가 Stop 눌렀으면 loadingCache false 가 되어 있을 수 있음
          const stillLoading = loadingCache.get(taskId);
          if (stillLoading === false) {
            setPhaseState(taskId, phase.id, { status: 'failed', error: 'User stopped' });
            throw new Error('User stopped pipeline');
          }
          await runSkill(taskId, cwd, phase, skillRef, si, callbacks);
        }
      } catch (skillErr) {
        setPhaseState(taskId, phase.id, {
          status: 'failed',
          completedAt: nowIso(),
          error: String(skillErr),
        });
        throw skillErr;
      }

      setPhaseState(taskId, phase.id, { status: 'done', completedAt: nowIso() });

      // auto=false 면 사용자 승인 대기 — 여기서 멈춤
      if (!phase.auto && pi < cfg.phases.length - 1) {
        recordEvent('action', 'custom_pipeline.pause_for_approval', { phaseId: phase.id });
        break;
      }
    }
  } catch (err) {
    logger.error('runCustomPipeline error:', err);
  } finally {
    loadingCache.set(taskId, false);
    recordEvent('action', 'custom_pipeline.done', { configId: configRef.id });
    callbacks?.onDone?.();
  }
}
