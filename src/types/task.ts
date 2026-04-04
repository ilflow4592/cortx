export type TaskStatus = 'waiting' | 'active' | 'paused' | 'done';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  branchName: string;
  worktreePath: string;
  repoPath: string;
  memo: string;
  elapsedSeconds: number;
  chatHistory: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
