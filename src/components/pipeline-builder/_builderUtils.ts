/**
 * PipelineBuilder 공용 유틸 — 작은 순수 함수 + 공유 스타일.
 * 모달 파일 비대화 방지를 위해 분리. 단위 테스트 가능.
 */
import type { CSSProperties } from 'react';
import type { CustomPipelineConfig, CustomSkillRef } from '../../types/customPipeline';
import { useTaskStore } from '../../stores/taskStore';

export function isAnyPhaseInProgress(cfg: CustomPipelineConfig | null, taskId: string): boolean {
  if (!cfg) return false;
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  const active = task?.pipeline?.activeCustomPipeline;
  if (!active) return false;
  return Object.values(active.phaseStates).some((s) => s.status === 'in_progress');
}

export function skillRefLabel(ref: CustomSkillRef): string {
  if (ref.kind === 'agent') return `agent:${ref.subagentType}`;
  return `${ref.kind}:${ref.id}`;
}

export function createEmptyConfig(id: string, name: string): CustomPipelineConfig {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id,
    name,
    description: '',
    source: 'project',
    phases: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function btn(): CSSProperties {
  return {
    padding: '3px 8px',
    fontSize: 10,
    borderRadius: 4,
    border: '1px solid var(--border-strong)',
    background: 'var(--bg-surface)',
    color: 'var(--fg-secondary)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
  };
}

export function btnPrimary(): CSSProperties {
  return {
    ...btn(),
    background: 'var(--accent)',
    color: 'white',
    borderColor: 'var(--accent)',
    fontWeight: 600,
  };
}
