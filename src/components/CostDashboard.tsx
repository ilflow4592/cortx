/**
 * Cost Dashboard — global token usage and cost analytics across all tasks.
 * Shows totals, trends over time, breakdown by phase/project/model.
 * Data source: task.pipeline.phases[phase].{inputTokens, outputTokens, costUsd}.
 */
import { useEffect, useMemo, useState } from 'react';
import { DollarSign, Zap, TrendingUp, Package, FolderOpen } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { PHASE_NAMES } from '../constants/pipeline';
import type { Period } from './cost-dashboard/types';
import { formatNum, formatUsd } from './cost-dashboard/format';
import {
  computeUsages,
  filterByPeriod,
  sumTotals,
  computeTrend,
  computePhaseBreakdown,
  computeProjectBreakdown,
  topNTasks,
} from './cost-dashboard/aggregations';
import { StatCard, Section, HoverButton, CloseButton, TopTaskRow } from './cost-dashboard/components';

interface Props {
  onClose: () => void;
}

export function CostDashboard({ onClose }: Props) {
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);
  const [period, setPeriod] = useState<Period>('7d');

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

  const usages = useMemo(() => computeUsages(tasks), [tasks]);
  const filtered = useMemo(() => filterByPeriod(usages, period), [usages, period]);
  const totals = useMemo(() => sumTotals(filtered), [filtered]);
  const trend = useMemo(() => computeTrend(filtered), [filtered]);
  const phaseBreakdown = useMemo(() => computePhaseBreakdown(filtered), [filtered]);
  const projectBreakdown = useMemo(() => computeProjectBreakdown(filtered, projects), [filtered, projects]);
  const topTasks = useMemo(() => topNTasks(filtered, 10), [filtered]);

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
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: 'var(--fg-muted)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatNum(input)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: 'var(--fg-muted)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatNum(output)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: 'var(--accent-bright)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatUsd(cost)}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div
                          style={{
                            height: 4,
                            background: 'var(--bg-surface-hover)',
                            borderRadius: 2,
                            overflow: 'hidden',
                          }}
                        >
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
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: 'var(--fg-muted)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {count}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          color: 'var(--accent-bright)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {formatUsd(cost)}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div
                          style={{
                            height: 4,
                            background: 'var(--bg-surface-hover)',
                            borderRadius: 2,
                            overflow: 'hidden',
                          }}
                        >
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
