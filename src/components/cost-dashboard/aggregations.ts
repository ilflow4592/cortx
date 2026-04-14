/**
 * Cost 통계 집계 — 모든 함수는 순수, store 의존 없음.
 *
 * 단계별 책임을 분리해 테스트 가능: tasks → usages → period filter →
 * totals/trend/breakdowns → top N.
 */
import type { Task, PipelinePhase } from '../../types/task';
import type { Project } from '../../types/project';
import { PHASE_ORDER } from '../../constants/pipeline';
import type { Period, PhaseUsage, TaskUsage } from './types';
import { dateBucket } from './format';

/** Task 배열에서 토큰/비용이 기록된 task만 TaskUsage로 변환 */
export function computeUsages(tasks: Task[]): TaskUsage[] {
  return tasks
    .map((t) => {
      const phases: Partial<Record<PipelinePhase, PhaseUsage>> = {};
      let totalIn = 0;
      let totalOut = 0;
      let totalCost = 0;
      if (t.pipeline?.phases) {
        for (const p of PHASE_ORDER) {
          const e = t.pipeline.phases[p];
          if (!e || (!e.inputTokens && !e.outputTokens && !e.costUsd)) continue;
          phases[p] = {
            inputTokens: e.inputTokens || 0,
            outputTokens: e.outputTokens || 0,
            costUsd: e.costUsd || 0,
          };
          totalIn += e.inputTokens || 0;
          totalOut += e.outputTokens || 0;
          totalCost += e.costUsd || 0;
        }
      }
      return {
        taskId: t.id,
        title: t.title,
        projectId: t.projectId,
        updatedAt: t.updatedAt,
        phases,
        totalIn,
        totalOut,
        totalCost,
      };
    })
    .filter((u) => u.totalCost > 0 || u.totalIn > 0);
}

/** Period에 따른 컷오프 시각 이후 사용량만 통과 */
export function filterByPeriod(usages: TaskUsage[], period: Period): TaskUsage[] {
  if (period === 'all') return usages;
  const now = new Date();
  const cutoff = new Date();
  if (period === 'today') cutoff.setHours(0, 0, 0, 0);
  else if (period === '7d') cutoff.setDate(now.getDate() - 7);
  else if (period === '30d') cutoff.setDate(now.getDate() - 30);
  const cutoffIso = cutoff.toISOString();
  return usages.filter((u) => u.updatedAt >= cutoffIso);
}

export interface Totals {
  inT: number;
  outT: number;
  cost: number;
  count: number;
}

export function sumTotals(usages: TaskUsage[]): Totals {
  let inT = 0;
  let outT = 0;
  let cost = 0;
  for (const u of usages) {
    inT += u.totalIn;
    outT += u.totalOut;
    cost += u.totalCost;
  }
  return { inT, outT, cost, count: usages.length };
}

/** 일별 비용 트렌드 (오름차순 날짜) */
export function computeTrend(usages: TaskUsage[]): Array<[string, number]> {
  const byDay = new Map<string, number>();
  for (const u of usages) {
    const day = dateBucket(u.updatedAt);
    byDay.set(day, (byDay.get(day) || 0) + u.totalCost);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export interface PhaseBreakdown {
  phase: PipelinePhase;
  input: number;
  output: number;
  cost: number;
}

export function computePhaseBreakdown(usages: TaskUsage[]): PhaseBreakdown[] {
  const byPhase = new Map<PipelinePhase, { input: number; output: number; cost: number }>();
  for (const u of usages) {
    for (const p of PHASE_ORDER) {
      const e = u.phases[p];
      if (!e) continue;
      const cur = byPhase.get(p) || { input: 0, output: 0, cost: 0 };
      cur.input += e.inputTokens;
      cur.output += e.outputTokens;
      cur.cost += e.costUsd;
      byPhase.set(p, cur);
    }
  }
  return PHASE_ORDER.filter((p) => byPhase.has(p)).map((p) => ({ phase: p, ...byPhase.get(p)! }));
}

export interface ProjectBreakdown {
  id: string;
  name: string;
  color: string;
  count: number;
  cost: number;
  in: number;
  out: number;
}

export function computeProjectBreakdown(usages: TaskUsage[], projects: Project[]): ProjectBreakdown[] {
  const byProj = new Map<string, { count: number; cost: number; in: number; out: number }>();
  for (const u of usages) {
    const key = u.projectId || '_none';
    const cur = byProj.get(key) || { count: 0, cost: 0, in: 0, out: 0 };
    cur.count++;
    cur.cost += u.totalCost;
    cur.in += u.totalIn;
    cur.out += u.totalOut;
    byProj.set(key, cur);
  }
  return [...byProj.entries()]
    .map(([id, data]) => {
      const project = id === '_none' ? null : projects.find((p) => p.id === id);
      return {
        id,
        name: project?.name || '(unassigned)',
        color: project?.color || 'var(--fg-dim)',
        ...data,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

export function topNTasks(usages: TaskUsage[], n: number): TaskUsage[] {
  return [...usages].sort((a, b) => b.totalCost - a.totalCost).slice(0, n);
}
