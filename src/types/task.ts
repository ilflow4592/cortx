export type TaskStatus = 'waiting' | 'active' | 'paused' | 'done';

export type TaskLayer = 'focus' | 'batch' | 'reactive';

export type InterruptReason = 'interrupt' | 'other-task' | 'break' | 'meeting' | 'other';

export interface InterruptEntry {
  id: string;
  pausedAt: string;
  resumedAt: string | null;
  reason: InterruptReason;
  memo: string;
  durationSeconds: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
}

export interface TaskModelConfig {
  provider?: 'claude' | 'openai' | 'ollama';
  modelId?: string;
}

export type PipelinePhase = 'grill_me' | 'obsidian_save' | 'dev_plan' | 'implement' | 'commit_pr' | 'review_loop' | 'done';
export type PhaseStatus = 'pending' | 'in_progress' | 'done' | 'skipped';

export interface PipelinePhaseEntry {
  status: PhaseStatus;
  startedAt?: string;
  completedAt?: string;
  memo?: string;
}

export interface PipelineState {
  enabled: boolean;
  phases: Record<PipelinePhase, PipelinePhaseEntry>;
  complexity?: string;
  prNumber?: number;
  prUrl?: string;
  reviewRounds?: number;
  devPlan?: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  layer: TaskLayer;
  projectId?: string;
  branchName: string;
  worktreePath: string;
  repoPath: string;
  memo: string;
  elapsedSeconds: number;
  chatHistory: ChatMessage[];
  interrupts: InterruptEntry[];
  modelOverride?: TaskModelConfig;
  pipeline?: PipelineState;
  createdAt: string;
  updatedAt: string;
}
