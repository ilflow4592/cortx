/**
 * @module types/customPipeline
 * 사용자 정의 커스텀 파이프라인 도메인 타입.
 * 기존 builtin 파이프라인(types/task.ts 의 PipelinePhase 리터럴)과 **별도 구조로 공존**.
 * Task.pipeline.pipelineMode: 'builtin' | 'custom' 로 활성화 모드 토글.
 */

/** 스킬이 속한 소스 카테고리. builtin 은 읽기 전용(fork 필요), 나머지는 편집 가능 */
export type SkillKind = 'builtin' | 'project' | 'user' | 'agent';

/**
 * Phase 내 skill stack 에 들어가는 참조 단위.
 * 여러 Ref 가 한 phase 에서 순차 실행되며, contract 기반으로 산출물을 주고받는다.
 */
export type CustomSkillRef =
  | { kind: 'builtin'; id: string } // 예: 'pipeline/dev-task'
  | { kind: 'project'; id: string } // .claude/commands/<id>.md
  | { kind: 'user'; id: string } // ~/.claude/commands/<id>.md
  | {
      kind: 'agent';
      /** Claude Code 내장 또는 ~/.claude/agents/ 의 agent 식별자 */
      subagentType: string;
      /** 반환 결과를 artifacts[outputKey] 에 저장. 다음 스킬에서 {outputKey} 로 참조 */
      outputKey?: string;
      /** agent 에게 전달할 커스텀 프롬프트 (기본: skill body) */
      prompt?: string;
    };

/** 스킬 frontmatter 로 선언되는 입출력 계약 */
export interface SkillContract {
  /** artifacts[key] 가 반드시 존재해야 실행 가능 */
  requires?: string[];
  /** 실행 완료 후 artifacts[key] 에 저장될 산출물 (OUTPUT 마커로 수집) */
  produces?: string[];
  /**
   * shared: 동일 --resume Claude 세션 공유 (이전 대화 전부 보임)
   * isolated: 새 Claude 세션 spawn, requires 만 주입 (자기 완결형)
   */
  contextMode?: 'shared' | 'isolated';
  /** 선언적 부작용 레이블 (git/files/network 등). 현재는 UI 경고 용도만 */
  sideEffects?: string[];
}

/**
 * 커스텀 파이프라인의 phase 1 개.
 * phase 가 시작되면 skills 가 순차 실행됨.
 */
export interface CustomPhase {
  /** slug (영숫자+하이픈). PIPELINE_KEYS 와 충돌 금지 */
  id: string;
  /** UI 라벨 */
  label: string;
  /** 순차 실행될 스킬/에이전트 스택 */
  skills: CustomSkillRef[];
  /** 모델 오버라이드 (미지정 시 skill frontmatter.model 또는 기본값 Sonnet) */
  model?: 'Opus' | 'Sonnet' | 'Haiku';
  /** --effort CLI 플래그 (기본 medium) */
  effort?: 'low' | 'medium' | 'high';
  /** --permission-mode 오버라이드. plan 지정 시 ExitPlanMode 승인 카드 자동 렌더 */
  permissionMode?: 'plan' | 'bypassPermissions' | 'default';
  /** true: 직전 phase done 시 자동 시작. false: 사용자 명시 승인 필요 */
  auto?: boolean;
  /** --max-turns 오버라이드 */
  maxTurns?: number;
  /** --disallowed-tools 패턴 */
  disallowedTools?: string[];
}

/**
 * 파일로 저장되는 커스텀 파이프라인 설정.
 * 위치: ~/.cortx/pipelines/<id>.json (user) 또는 <cwd>/.cortx/pipelines/<id>.json (project).
 */
export interface CustomPipelineConfig {
  /** 스키마 버전 — 향후 호환성 마이그레이션 키 */
  schemaVersion: 1;
  /** 파일 stem과 일치. slug */
  id: string;
  /** UI 표시 이름 */
  name: string;
  description?: string;
  /** 런타임에 결정되는 소스 (파일 디렉토리 기반) */
  source: 'user' | 'project';
  /** 실행 순서대로의 phase 목록 */
  phases: CustomPhase[];
  createdAt: string;
  updatedAt: string;
}

/** 목록 조회 시 사용하는 경량 메타 (본문 로드 없이 UI 리스트 구성) */
export interface CustomPipelineMeta {
  id: string;
  name: string;
  description?: string;
  source: 'user' | 'project';
  phaseCount: number;
  updatedAt: string;
}

/** 한 스킬의 실행 상태 — UI 진행 표시용 */
export type CustomSkillStatus = 'pending' | 'in_progress' | 'done' | 'failed';

/** Phase 런타임 상태 */
export interface CustomPhaseState {
  status: CustomSkillStatus;
  /** phase 내 skill 별 상태 (index → status) */
  skillStates: Record<number, CustomSkillStatus>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

/**
 * Task.pipeline 에 얹히는 커스텀 진행도 블록.
 * 교체 금지 정책: 실행 중(any phase === 'in_progress')이면 readonly 로 락.
 */
export interface ActiveCustomPipeline {
  /** CustomPipelineConfig.id */
  configId: string;
  /** 어디서 로드됐는지 — 같은 id 라도 project 우선 머지 */
  source: 'user' | 'project';
  currentPhaseIndex: number;
  currentSkillIndex: number;
  /** phase.id → 상태 */
  phaseStates: Record<string, CustomPhaseState>;
  /** OUTPUT 마커로 수집된 스킬 간 산출물. 다음 스킬에서 {key} 로 치환됨 */
  artifacts: Record<string, string>;
}

/** 내장 Claude Code 에이전트 메타데이터 (registry 에 하드코딩) */
export interface ClaudeAgentEntry {
  /** Agent tool 의 subagent_type 파라미터 값 */
  subagentType: string;
  displayName: string;
  description: string;
  /** UI 아이콘 (emoji 1자) */
  icon: string;
  /** 커스텀 파일에서 로드됐으면 경로 */
  filePath?: string;
  /** ~/.claude/agents 에서 스캔된 경우 true, 내장이면 false */
  isCustom: boolean;
}
