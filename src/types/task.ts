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
  createdAt: string;
  updatedAt: string;
}
