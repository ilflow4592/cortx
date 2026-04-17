/**
 * @module types/task
 * 작업(Task) 도메인의 핵심 타입 정의.
 * Task lifecycle, 중단 기록, AI 채팅, 파이프라인 상태를 모델링한다.
 */

/** 작업 상태 — waiting(대기) → active(진행) ↔ paused(일시정지) → done(완료) */
export type TaskStatus = 'waiting' | 'active' | 'paused' | 'done';

/** 3-layer 우선순위 체계: focus(집중), batch(일괄), reactive(반응형) */
export type TaskLayer = 'focus' | 'batch' | 'reactive';

/** 작업 중단 사유 분류 */
export type InterruptReason = 'interrupt' | 'other-task' | 'break' | 'meeting' | 'other';

/** 작업 중단(interrupt) 1건의 기록 */
export interface InterruptEntry {
  id: string;
  /** ISO timestamp — 중단 시점 */
  pausedAt: string;
  /** ISO timestamp — 재개 시점 (아직 재개 안 됐으면 null) */
  resumedAt: string | null;
  reason: InterruptReason;
  /** 사용자가 남긴 중단 메모 */
  memo: string;
  /** 중단 지속 시간 (초 단위) */
  durationSeconds: number;
}

/** AI 채팅 메시지 1건 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 응답을 생성한 모델 ID (assistant 메시지에만 존재) */
  model?: string;
  /** ISO timestamp */
  timestamp: string;
}

/** 개발 파이프라인 단계 이름 (grill_me → save → ... → done) */
export type PipelinePhase = 'grill_me' | 'save' | 'dev_plan' | 'implement' | 'commit_pr' | 'review_loop' | 'done';

/** 각 파이프라인 단계의 진행 상태 */
export type PhaseStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

/** 파이프라인 개별 단계의 상세 정보 */
export interface PipelinePhaseEntry {
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  /** 단계별 메모 (예: 스킵 사유) */
  memo?: string;
  /** LLM 입력 토큰 수 */
  inputTokens?: number;
  /** LLM 출력 토큰 수 */
  outputTokens?: number;
  /** 해당 단계에서 발생한 비용 (USD) */
  costUsd?: number;
}

/** 작업의 전체 파이프라인 상태 */
export interface PipelineState {
  /** 파이프라인 활성화 여부 */
  enabled: boolean;
  /** 각 단계별 진행 상태 */
  phases: Record<PipelinePhase, PipelinePhaseEntry>;
  /** grill_me 단계에서 판단된 작업 복잡도 */
  complexity?: string;
  /** 생성된 GitHub PR 번호 */
  prNumber?: number;
  /** GitHub PR URL */
  prUrl?: string;
  /** 코드 리뷰 반복 횟수 */
  reviewRounds?: number;
  /** implement 단계에서 사용할 개발 계획 텍스트 */
  devPlan?: string;
  /** Plan mode 에서 Claude 가 제출한 승인 대기 중인 계획 (ExitPlanMode tool_use) */
  pendingPlanApproval?: {
    /** 계획 본문 (markdown) */
    plan: string;
    /** Claude CLI 가 저장한 plan 파일 경로 (있을 경우) */
    planFilePath?: string;
    /** 계획 생성 시각 */
    createdAt: string;
  };
  /**
   * 파이프라인 실행 모드.
   * - `builtin` (기본): 하드코딩 7단계 파이프라인 사용. `phases` 가 PipelinePhase 리터럴 기반.
   * - `custom`: 사용자 정의 파이프라인. `activeCustomPipeline` 에 별도 상태 저장.
   * undefined 는 builtin 으로 간주 (기존 task localStorage 호환성).
   */
  pipelineMode?: 'builtin' | 'custom';
  /** 커스텀 모드일 때 실행 중인 파이프라인 런타임 상태 */
  activeCustomPipeline?: import('./customPipeline').ActiveCustomPipeline;
}

/**
 * 작업(Task) — Cortx의 핵심 도메인 엔티티.
 * 하나의 개발 작업 단위를 나타내며, git branch, 타이머, 채팅, 파이프라인을 포함한다.
 */
export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  layer: TaskLayer;
  /** 소속 프로젝트 ID (미지정 시 독립 작업) */
  projectId?: string;
  /** git branch 이름 */
  branchName: string;
  /** git worktree 경로 */
  worktreePath: string;
  /** git 저장소 루트 경로 */
  repoPath: string;
  memo: string;
  /** 누적 작업 시간 (초 단위, 타이머로 측정) */
  elapsedSeconds: number;
  /** AI 채팅 이력 */
  chatHistory: ChatMessage[];
  /** 중단 기록 목록 */
  interrupts: InterruptEntry[];
  /** 개발 파이프라인 상태 */
  pipeline?: PipelineState;
  createdAt: string;
  updatedAt: string;
}
