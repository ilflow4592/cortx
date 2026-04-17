/**
 * Pipeline Builder 메인 모달.
 * Dashboard 의 "⚙ Customize" 버튼에서 열림. 3-panel:
 *   - 좌측 SkillLibrary: 드래그 소스 (builtin/project/user/agent)
 *   - 중앙 PhaseCanvas: phase 노드 + skill stack + 드롭존
 *   - 우측 PhaseDetail: 현재 선택된 phase 의 속성 편집
 *
 * v1 상단 툴바:
 *   - 파이프라인 선택 드롭다운 (이 태스크에 매핑된 config)
 *   - New / Duplicate / Save As / Export / Import / Delete
 *   - ▶ Run (pipelineMode 를 'custom' 으로 켜고 runCustomPipeline 실행)
 *
 * 실행 중 태스크면 전체 편집/교체 UI 가 read-only (결정 정책).
 */
import { useEffect, useMemo, useState } from 'react';
import { X, Play, Plus, Save, Copy, Trash2, Download, Upload } from 'lucide-react';
import type { CustomPipelineConfig, CustomPipelineMeta, CustomPhase, CustomSkillRef } from '../../types/customPipeline';
import {
  listCustomPipelines,
  readCustomPipeline,
  writeCustomPipeline,
  duplicateCustomPipeline,
  deleteCustomPipeline,
  exportCustomPipeline,
  importCustomPipeline,
} from '../../services/customPipelineStore';
import { useTaskStore } from '../../stores/taskStore';
import { runCustomPipeline } from '../../utils/pipeline-exec/runCustomPipeline';
import { SkillLibrary } from './SkillLibrary';
import { PhaseCanvas } from './PhaseCanvas';
import { PhaseDetail } from './PhaseDetail';

interface Props {
  taskId: string;
  cwd: string;
  onClose: () => void;
}

function isAnyPhaseInProgress(cfg: CustomPipelineConfig | null, taskId: string): boolean {
  if (!cfg) return false;
  const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
  const active = task?.pipeline?.activeCustomPipeline;
  if (!active) return false;
  return Object.values(active.phaseStates).some((s) => s.status === 'in_progress');
}

function skillRefLabel(ref: CustomSkillRef): string {
  if (ref.kind === 'agent') return `agent:${ref.subagentType}`;
  return `${ref.kind}:${ref.id}`;
}

function createEmptyConfig(id: string, name: string): CustomPipelineConfig {
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

export function PipelineBuilder({ taskId, cwd, onClose }: Props) {
  const [pipelines, setPipelines] = useState<CustomPipelineMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<'user' | 'project'>('project');
  const [cfg, setCfg] = useState<CustomPipelineConfig | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string>('');

  const locked = isAnyPhaseInProgress(cfg, taskId);

  // 최초 목록 로드
  useEffect(() => {
    (async () => {
      const list = await listCustomPipelines(cwd);
      setPipelines(list);
      if (list.length > 0 && !activeId) {
        setActiveId(list[0].id);
        setActiveSource(list[0].source);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd]);

  // activeId/source 변경 → 해당 파이프라인 본문 로드
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await readCustomPipeline(activeId, activeSource, cwd);
        if (cancelled) return;
        setCfg(loaded);
        setSelectedPhaseId(loaded.phases[0]?.id || null);
        setDirty(false);
      } catch (e) {
        setStatus(`Load failed: ${e}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeId, activeSource, cwd]);

  const updateCfg = (patch: Partial<CustomPipelineConfig>) => {
    if (!cfg || locked) return;
    setCfg({ ...cfg, ...patch });
    setDirty(true);
  };

  const updatePhases = (phases: CustomPhase[]) => {
    updateCfg({ phases });
  };

  const updatePhase = (phaseId: string, patch: Partial<CustomPhase>) => {
    if (!cfg) return;
    updatePhases(cfg.phases.map((p) => (p.id === phaseId ? { ...p, ...patch } : p)));
  };

  const selectedPhase = useMemo(
    () => cfg?.phases.find((p) => p.id === selectedPhaseId) || null,
    [cfg, selectedPhaseId],
  );

  const handleSave = async () => {
    if (!cfg || locked) return;
    try {
      await writeCustomPipeline(cfg, cwd);
      setDirty(false);
      setStatus('Saved');
      const list = await listCustomPipelines(cwd);
      setPipelines(list);
    } catch (e) {
      setStatus(`Save failed: ${e}`);
    }
  };

  const handleNew = () => {
    const id = `custom-${Date.now().toString(36)}`;
    const empty = createEmptyConfig(id, 'New Pipeline');
    setCfg(empty);
    setActiveId(id);
    setActiveSource('project');
    setSelectedPhaseId(null);
    setDirty(true);
  };

  // 빈 캔버스에 스킬 드롭 → 새 파이프라인 생성 + 첫 phase + 드롭된 스킬 추가.
  const handleCreateWithSkill = (skill: CustomSkillRef) => {
    if (locked) return;
    const id = `custom-${Date.now().toString(36)}`;
    const empty = createEmptyConfig(id, 'New Pipeline');
    const firstPhase: CustomPhase = {
      id: 'phase_1',
      label: 'Phase 1',
      skills: [skill],
      model: 'Sonnet',
      effort: 'medium',
      permissionMode: 'bypassPermissions',
    };
    empty.phases = [firstPhase];
    setCfg(empty);
    setActiveId(id);
    setActiveSource('project');
    setSelectedPhaseId(firstPhase.id);
    setDirty(true);
    setStatus('새 파이프라인 생성됨 — Save 로 저장');
  };

  /**
   * 라이브러리에서 스킬 **클릭**으로 추가 (Tauri WebKit DnD 불안정 대응).
   * 현재 상태에 따라 동작 분기:
   *  - cfg 없음 → handleCreateWithSkill 위임 (새 파이프라인 생성)
   *  - cfg 있고 selectedPhase 있음 → 해당 phase 의 skills 에 append
   *  - cfg 있고 selectedPhase 없음/phase 전혀 없음 → 새 phase 하나 추가 + 스킬 포함
   */
  const handleAddSkillByClick = (skill: CustomSkillRef) => {
    if (locked) return;
    if (!cfg) {
      handleCreateWithSkill(skill);
      return;
    }
    // cfg 있음
    if (cfg.phases.length === 0) {
      const newPhase: CustomPhase = {
        id: 'phase_1',
        label: 'Phase 1',
        skills: [skill],
        model: 'Sonnet',
        effort: 'medium',
        permissionMode: 'bypassPermissions',
      };
      updatePhases([newPhase]);
      setSelectedPhaseId(newPhase.id);
      setStatus(`추가됨: Phase 1 + ${skillRefLabel(skill)}`);
      return;
    }
    // 타겟 phase 결정: selected → selected, 아니면 마지막 phase
    const targetId = selectedPhaseId || cfg.phases[cfg.phases.length - 1].id;
    updatePhases(cfg.phases.map((p) => (p.id === targetId ? { ...p, skills: [...p.skills, skill] } : p)));
    setSelectedPhaseId(targetId);
    setStatus(`추가됨: ${targetId} ← ${skillRefLabel(skill)}`);
  };

  const handleDuplicate = async () => {
    if (!cfg) return;
    const newId = `${cfg.id}-copy-${Date.now().toString(36).slice(-4)}`;
    try {
      await duplicateCustomPipeline(cfg.id, cfg.source, newId, `${cfg.name} (copy)`, 'project', cwd);
      const list = await listCustomPipelines(cwd);
      setPipelines(list);
      setActiveId(newId);
      setActiveSource('project');
      setStatus('Duplicated');
    } catch (e) {
      setStatus(`Duplicate failed: ${e}`);
    }
  };

  const handleDelete = async () => {
    if (!cfg || locked) return;
    if (!confirm(`Delete '${cfg.name}'?`)) return;
    try {
      await deleteCustomPipeline(cfg.id, cfg.source, cwd);
      const list = await listCustomPipelines(cwd);
      setPipelines(list);
      setActiveId(list[0]?.id || null);
      setActiveSource(list[0]?.source || 'project');
      setStatus('Deleted');
    } catch (e) {
      setStatus(`Delete failed: ${e}`);
    }
  };

  const handleExport = async () => {
    if (!cfg) return;
    try {
      const dialog = await import('@tauri-apps/plugin-dialog');
      const dest = await dialog.save({
        defaultPath: `${cfg.id}.json`,
        filters: [{ name: 'Pipeline JSON', extensions: ['json'] }],
      });
      if (!dest) return;
      await exportCustomPipeline(cfg.id, cfg.source, dest, cwd);
      setStatus('Exported');
    } catch (e) {
      setStatus(`Export failed: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const dialog = await import('@tauri-apps/plugin-dialog');
      const src = await dialog.open({
        multiple: false,
        filters: [{ name: 'Pipeline JSON', extensions: ['json'] }],
      });
      if (!src || typeof src !== 'string') return;
      const meta = await importCustomPipeline(src, 'project', cwd);
      const list = await listCustomPipelines(cwd);
      setPipelines(list);
      setActiveId(meta.id);
      setActiveSource(meta.source);
      setStatus(`Imported: ${meta.name}`);
    } catch (e) {
      setStatus(`Import failed: ${e}`);
    }
  };

  const handleRun = async () => {
    if (!cfg || dirty) {
      setStatus(dirty ? '먼저 저장하세요 (Ctrl+S)' : 'No pipeline loaded');
      return;
    }
    onClose();
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    if (!task?.pipeline) {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: {
          enabled: true,
          phases: {} as never, // builtin phases 는 unused. activeCustomPipeline 이 실제 상태
          pipelineMode: 'custom',
        },
      });
    } else {
      useTaskStore.getState().updateTask(taskId, {
        pipeline: { ...task.pipeline, enabled: true, pipelineMode: 'custom' },
      });
    }
    await runCustomPipeline(taskId, { id: cfg.id, source: cfg.source });
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '94vw',
          maxWidth: 1400,
          height: '90vh',
          background: 'var(--bg-app)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          display: 'grid',
          gridTemplateRows: '44px 1fr',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 12px',
            borderBottom: '1px solid var(--border-muted)',
            background: 'var(--bg-surface)',
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--accent-bright)', fontSize: 13 }}>⚙ Pipeline Builder</span>
          <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
            {locked ? '🔒 실행 중 — read-only' : dirty ? '● 변경됨' : ''}
          </span>

          <select
            value={activeId || ''}
            onChange={(e) => {
              const id = e.target.value;
              const meta = pipelines.find((p) => p.id === id);
              if (meta) {
                setActiveId(meta.id);
                setActiveSource(meta.source);
              }
            }}
            disabled={locked}
            style={{
              marginLeft: 12,
              background: 'var(--bg-chip)',
              color: 'var(--fg-primary)',
              border: '1px solid var(--border-muted)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
            }}
          >
            <option value="">(선택)</option>
            {pipelines.map((p) => (
              <option key={`${p.source}:${p.id}`} value={p.id}>
                [{p.source}] {p.name}
              </option>
            ))}
          </select>

          <span style={{ flex: 1 }} />

          <span style={{ fontSize: 10, color: 'var(--accent-bright)' }}>{status}</span>

          <button onClick={handleNew} disabled={locked} style={btn()} title="New Pipeline">
            <Plus size={12} /> New
          </button>
          <button onClick={handleDuplicate} disabled={!cfg || locked} style={btn()} title="Duplicate">
            <Copy size={12} /> Dup
          </button>
          <button onClick={handleImport} disabled={locked} style={btn()} title="Import JSON">
            <Upload size={12} /> Import
          </button>
          <button onClick={handleExport} disabled={!cfg} style={btn()} title="Export JSON">
            <Download size={12} /> Export
          </button>
          <button onClick={handleDelete} disabled={!cfg || locked} style={btn()} title="Delete">
            <Trash2 size={12} />
          </button>
          <button onClick={handleSave} disabled={!dirty || locked} style={btn()} title="Save (⌘S)">
            <Save size={12} /> Save
          </button>
          <button onClick={handleRun} disabled={!cfg || dirty || locked} style={btnPrimary()} title="Run pipeline">
            <Play size={12} /> Run
          </button>
          <button onClick={onClose} style={btn()} title="Close">
            <X size={14} />
          </button>
        </div>

        {/* 3-panel body */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr 300px',
            overflow: 'hidden',
          }}
        >
          <SkillLibrary cwd={cwd} disabled={locked} onAddSkill={handleAddSkillByClick} />
          <PhaseCanvas
            cfg={cfg}
            selectedPhaseId={selectedPhaseId}
            onSelectPhase={setSelectedPhaseId}
            onPhasesChange={updatePhases}
            onCreateWithSkill={handleCreateWithSkill}
            disabled={locked}
          />
          <PhaseDetail
            phase={selectedPhase}
            onChange={(patch) => selectedPhase && updatePhase(selectedPhase.id, patch)}
            disabled={locked}
          />
        </div>
      </div>
    </div>
  );
}

function btn(): React.CSSProperties {
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

function btnPrimary(): React.CSSProperties {
  return {
    ...btn(),
    background: 'var(--accent)',
    color: 'white',
    borderColor: 'var(--accent)',
    fontWeight: 600,
  };
}
