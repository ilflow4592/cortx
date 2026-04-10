/**
 * Cost Dashboard — global token usage and cost analytics across all tasks.
 * Shows totals, trends over time, breakdown by phase/project/model.
 * Data source: task.pipeline.phases[phase].{inputTokens, outputTokens, costUsd}.
 */
import { useEffect, useMemo, useState } from 'react';
import { X, DollarSign, Zap, TrendingUp, Package, FolderOpen } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { PHASE_ORDER, PHASE_NAMES } from '../constants/pipeline';
import type { PipelinePhase } from '../types/task';

type Period = 'today' | '7d' | '30d' | 'all';

interface PhaseUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface TaskUsage {
  taskId: string;
  title: string;
  projectId?: string;
  updatedAt: string;
  phases: Partial<Record<PipelinePhase, PhaseUsage>>;
  totalIn: number;
  totalOut: number;
  totalCost: number;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function dateBucket(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

interface Props {
  onClose: () => void;
}

export function CostDashboard({ onClose }: Props) {
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);
  const [period, setPeriod] = useState<Period>('7d');

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const usages: TaskUsage[] = useMemo(() => {
    return tasks
      .map((t) => {
        const phases: Partial<Record<PipelinePhase, PhaseUsage>> = {};
        let totalIn = 0,
          totalOut = 0,
          totalCost = 0;
        if (t.pipeline?.phases) {
          for (const p of PHASE_ORDER) {
            const e = t.pipeline.phases[p];
            if (e && (e.inputTokens || e.outputTokens || e.costUsd)) {
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
  }, [tasks]);

  const filtered: TaskUsage[] = useMemo(() => {
    if (period === 'all') return usages;
    const now = new Date();
    const cutoff = new Date();
    if (period === 'today') cutoff.setHours(0, 0, 0, 0);
    else if (period === '7d') cutoff.setDate(now.getDate() - 7);
    else if (period === '30d') cutoff.setDate(now.getDate() - 30);
    const cutoffIso = cutoff.toISOString();
    return usages.filter((u) => u.updatedAt >= cutoffIso);
  }, [usages, period]);

  const totals = useMemo(() => {
    let inT = 0,
      outT = 0,
      cost = 0;
    for (const u of filtered) {
      inT += u.totalIn;
      outT += u.totalOut;
      cost += u.totalCost;
    }
    return { inT, outT, cost, count: filtered.length };
  }, [filtered]);

  // Trend by day
  const trend = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const u of filtered) {
      const day = dateBucket(u.updatedAt);
      byDay.set(day, (byDay.get(day) || 0) + u.totalCost);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Breakdown by phase
  const phaseBreakdown = useMemo(() => {
    const byPhase = new Map<PipelinePhase, { input: number; output: number; cost: number }>();
    for (const u of filtered) {
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
  }, [filtered]);

  // Breakdown by project
  const projectBreakdown = useMemo(() => {
    const byProj = new Map<string | '_none', { count: number; cost: number; in: number; out: number }>();
    for (const u of filtered) {
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
  }, [filtered, projects]);

  // Top tasks
  const topTasks = useMemo(() => {
    return [...filtered].sort((a, b) => b.totalCost - a.totalCost).slice(0, 10);
  }, [filtered]);

  const maxTrendCost = Math.max(...trend.map(([, c]) => c), 0.001);
  const maxPhaseCost = Math.max(...phaseBreakdown.map((p) => p.cost), 0.001);
  const maxProjectCost = Math.max(...projectBreakdown.map((p) => p.cost), 0.001);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 1500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 900,
          maxWidth: '95vw',
          maxHeight: '90vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <DollarSign size={20} color="var(--accent)" strokeWidth={1.5} />
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--fg-primary)' }}>Cost Dashboard</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['today', '7d', '30d', 'all'] as Period[]).map((p) => (
              <HoverButton
                key={p}
                active={period === p}
                onClick={() => setPeriod(p)}
                activeBg="var(--accent-bg)"
                activeBorder="var(--accent-border)"
                activeColor="var(--accent-bright)"
                hoverBg="var(--accent-bg)"
                hoverBorder="var(--accent-bg)"
              >
                {p === 'today' ? 'Today' : p === '7d' ? '7 days' : p === '30d' ? '30 days' : 'All time'}
              </HoverButton>
            ))}
          </div>
          <CloseButton onClose={onClose} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
          {/* Totals cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            <StatCard
              icon={<DollarSign size={14} color="var(--accent)" strokeWidth={1.5} />}
              label="Total cost"
              value={formatUsd(totals.cost)}
              accent="var(--accent)"
            />
            <StatCard
              icon={<Zap size={14} color="#818cf8" strokeWidth={1.5} />}
              label="Input tokens"
              value={formatNum(totals.inT)}
              accent="#818cf8"
            />
            <StatCard
              icon={<Zap size={14} color="#c084fc" strokeWidth={1.5} />}
              label="Output tokens"
              value={formatNum(totals.outT)}
              accent="#c084fc"
            />
            <StatCard
              icon={<Package size={14} color="#eab308" strokeWidth={1.5} />}
              label="Tasks with usage"
              value={totals.count.toString()}
              accent="#eab308"
            />
          </div>

          {/* Trend */}
          {trend.length > 0 && (
            <Section icon={<TrendingUp size={13} color="var(--accent)" />} title="Daily cost trend">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 4,
                  height: 120,
                  padding: '12px 8px',
                  background: 'var(--bg-surface)',
                  borderRadius: 6,
                  border: '1px solid var(--bg-surface-hover)',
                }}
              >
                {trend.map(([day, cost]) => {
                  const heightPct = (cost / maxTrendCost) * 100;
                  return (
                    <div
                      key={day}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        minWidth: 0,
                      }}
                      title={`${day}: ${formatUsd(cost)}`}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: `${Math.max(heightPct, 2)}%`,
                          background: 'linear-gradient(to top, var(--accent), var(--accent-bright))',
                          borderRadius: '3px 3px 0 0',
                          transition: 'height 200ms ease',
                        }}
                      />
                      <div
                        style={{
                          fontSize: 9,
                          color: 'var(--fg-faint)',
                          fontFamily: "'JetBrains Mono', monospace",
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          width: '100%',
                          textAlign: 'center',
                        }}
                      >
                        {day.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Phase breakdown */}
          {phaseBreakdown.length > 0 && (
            <Section icon={<Package size={13} color="var(--accent)" />} title="By pipeline phase">
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--fg-faint)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Phase</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Input</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Output</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Cost</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {phaseBreakdown.map(({ phase, input, output, cost }) => (
                    <tr key={phase} style={{ borderTop: '1px solid var(--bg-surface-hover)' }}>
                      <td style={{ padding: '8px', color: 'var(--fg-secondary)' }}>{PHASE_NAMES[phase]}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--fg-muted)', fontFamily: 'monospace' }}>
                        {formatNum(input)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--fg-muted)', fontFamily: 'monospace' }}>
                        {formatNum(output)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--accent-bright)', fontFamily: 'monospace' }}>
                        {formatUsd(cost)}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ height: 4, background: 'var(--bg-surface-hover)', borderRadius: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${(cost / maxPhaseCost) * 100}%`,
                              background: 'var(--accent)',
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Project breakdown */}
          {projectBreakdown.length > 0 && (
            <Section icon={<FolderOpen size={13} color="var(--accent)" />} title="By project">
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--fg-faint)', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px', fontWeight: 500 }}>Project</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Tasks</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, textAlign: 'right' }}>Cost</th>
                    <th style={{ padding: '6px 8px', fontWeight: 500, width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {projectBreakdown.map(({ id, name, color, count, cost }) => (
                    <tr key={id} style={{ borderTop: '1px solid var(--bg-surface-hover)' }}>
                      <td style={{ padding: '8px', color: 'var(--fg-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 2,
                              background: color,
                              display: 'inline-block',
                            }}
                          />
                          {name}
                        </span>
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--fg-muted)', fontFamily: 'monospace' }}>
                        {count}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--accent-bright)', fontFamily: 'monospace' }}>
                        {formatUsd(cost)}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ height: 4, background: 'var(--bg-surface-hover)', borderRadius: 2, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${(cost / maxProjectCost) * 100}%`,
                              background: color,
                              borderRadius: 2,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Top tasks */}
          {topTasks.length > 0 && (
            <Section icon={<Zap size={13} color="var(--accent)" />} title="Top tasks by cost">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {topTasks.map((t) => (
                  <TopTaskRow key={t.taskId} task={t} />
                ))}
              </div>
            </Section>
          )}

          {filtered.length === 0 && (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: 'var(--fg-faint)',
                fontSize: 12,
              }}
            >
              No token usage data for this period.
              <br />
              Run a pipeline to start tracking costs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--bg-surface)',
        border: '1px solid var(--bg-surface-hover)',
        borderRadius: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--fg-muted)',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function HoverButton({
  active,
  onClick,
  activeBg,
  activeBorder,
  activeColor,
  hoverBg,
  hoverBorder,
  children,
}: {
  active: boolean;
  onClick: () => void;
  activeBg: string;
  activeBorder: string;
  activeColor: string;
  hoverBg: string;
  hoverBorder: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '5px 12px',
        borderRadius: 5,
        fontSize: 11,
        background: active ? activeBg : hovered ? hoverBg : 'none',
        border: `1px solid ${active ? activeBorder : hovered ? hoverBorder : 'var(--border-muted)'}`,
        color: active ? activeColor : hovered ? 'var(--fg-muted)' : 'var(--fg-subtle)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 120ms ease',
      }}
    >
      {children}
    </button>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(239,68,68,0.1)' : 'none',
        border: `1px solid ${hovered ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
        color: hovered ? '#ef4444' : 'var(--fg-faint)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 6,
        marginLeft: 8,
        borderRadius: 5,
        transition: 'all 120ms ease',
      }}
    >
      <X size={16} strokeWidth={1.5} />
    </button>
  );
}

function TopTaskRow({ task }: { task: TaskUsage }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        background: hovered ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--bg-surface-hover)'}`,
        borderRadius: 6,
        transition: 'all 120ms ease',
        cursor: 'default',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: hovered ? 'var(--fg-primary)' : 'var(--fg-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {task.title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--fg-faint)', fontFamily: 'monospace', marginTop: 2 }}>
          {formatNum(task.totalIn)} in / {formatNum(task.totalOut)} out
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--accent-bright)', fontFamily: 'monospace', flexShrink: 0 }}>
        {formatUsd(task.totalCost)}
      </div>
    </div>
  );
}
