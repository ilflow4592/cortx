/** Cost dashboard 도메인 타입. */
import type { PipelinePhase } from '../../types/task';

export type Period = 'today' | '7d' | '30d' | 'all';

export interface PhaseUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TaskUsage {
  taskId: string;
  title: string;
  projectId?: string;
  updatedAt: string;
  phases: Partial<Record<PipelinePhase, PhaseUsage>>;
  totalIn: number;
  totalOut: number;
  totalCost: number;
}
