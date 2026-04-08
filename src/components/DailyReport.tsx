import { BarChart3 } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { formatTime } from '../utils/time';

export function DailyReport({ onClose }: { onClose: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);

  const today = new Date().toDateString();
  const todayTasks = tasks.filter((t) => new Date(t.createdAt).toDateString() === today || new Date(t.updatedAt).toDateString() === today);

  const totalFocus = todayTasks.reduce((s, t) => s + t.elapsedSeconds, 0);
  const doneTasks = todayTasks.filter((t) => t.status === 'done');
  const activeTasks = todayTasks.filter((t) => t.status === 'active');
  const pausedTasks = todayTasks.filter((t) => t.status === 'paused');

  const allInterrupts = todayTasks.flatMap((t) => t.interrupts || []);
  const todayInterrupts = allInterrupts.filter((e) => new Date(e.pausedAt).toDateString() === today);
  const totalInterruptTime = todayInterrupts.reduce((s, e) => s + e.durationSeconds, 0);

  // Interrupt breakdown by reason
  const reasonCounts: Record<string, { count: number; time: number }> = {};
  for (const entry of todayInterrupts) {
    const r = entry.reason || 'other';
    if (!reasonCounts[r]) reasonCounts[r] = { count: 0, time: 0 };
    reasonCounts[r].count++;
    reasonCounts[r].time += entry.durationSeconds;
  }

  const reasonLabels: Record<string, string> = {
    interrupt: '🔔 Interrupted',
    'other-task': '🔄 Task switch',
    break: '☕ Break',
    meeting: '📅 Meeting',
    other: '💭 Other',
  };

  const focusRatio = totalFocus + totalInterruptTime > 0
    ? Math.round((totalFocus / (totalFocus + totalInterruptTime)) * 100)
    : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BarChart3 size={20} strokeWidth={1.5} /> Daily Report</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
          {/* Summary cards */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'#141418', borderBottom:'1px solid #141418' }}>
            <StatCard label="Focus Time" value={formatTime(totalFocus)} color="#818cf8" />
            <StatCard label="Interrupts" value={`${todayInterrupts.length} (${formatTime(totalInterruptTime)})`} color="#eab308" />
            <StatCard label="Focus Ratio" value={`${focusRatio}%`} color={focusRatio >= 70 ? '#34d399' : focusRatio >= 40 ? '#eab308' : '#ef4444'} />
          </div>

          <div style={{ padding:20 }}>
            {/* Task breakdown */}
            <div className="rp-section">Tasks ({todayTasks.length})</div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <MiniStat label="Done" value={doneTasks.length} color="#34d399" />
              <MiniStat label="Active" value={activeTasks.length} color="#818cf8" />
              <MiniStat label="Paused" value={pausedTasks.length} color="#eab308" />
            </div>

            {doneTasks.length > 0 && (
              <>
                <div className="rp-section">✅ Completed</div>
                {doneTasks.map((t) => (
                  <div key={t.id} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12 }}>
                    <span style={{ color:'#a1a1aa' }}>{t.title}</span>
                    <span style={{ color:'#3f3f46', fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>{formatTime(t.elapsedSeconds)}</span>
                  </div>
                ))}
              </>
            )}

            {/* Interrupt breakdown */}
            {todayInterrupts.length > 0 && (
              <>
                <div className="rp-section" style={{ marginTop:16 }}>Interrupt Breakdown</div>
                {Object.entries(reasonCounts).map(([reason, data]) => (
                  <div key={reason} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12 }}>
                    <span style={{ color:'#a1a1aa' }}>{reasonLabels[reason] || reason}</span>
                    <span style={{ color:'#eab308', fontFamily:"'JetBrains Mono', monospace", fontSize:11 }}>
                      {data.count}× · {formatTime(data.time)}
                    </span>
                  </div>
                ))}
              </>
            )}

            {/* Focus bar */}
            <div style={{ marginTop:16 }}>
              <div className="rp-section">Focus vs Interrupts</div>
              <div style={{ height:8, borderRadius:4, background:'#18181b', overflow:'hidden', display:'flex' }}>
                <div style={{ width:`${focusRatio}%`, background:'#6366f1', borderRadius:4, transition:'width 0.3s' }} />
                <div style={{ flex:1, background:'#eab30830' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#3f3f46', marginTop:4 }}>
                <span>Focus {focusRatio}%</span>
                <span>Interrupts {100 - focusRatio}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background:'#08080c', padding:16, textAlign:'center' }}>
      <div style={{ fontSize:10, color:'#3f3f46', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:18, fontWeight:700, color, fontFamily:"'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ flex:1, background:'#0c0c10', border:'1px solid #18181b', borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
      <div style={{ fontSize:18, fontWeight:700, color, fontFamily:"'JetBrains Mono', monospace" }}>{value}</div>
      <div style={{ fontSize:10, color:'#3f3f46', marginTop:2 }}>{label}</div>
    </div>
  );
}
