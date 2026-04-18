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
  invalidateList,
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
  const [activeSource, setActiveSource] = useState<'user' | 'project' | 'builtin'>('project');
  const [cfg, setCfg] = useState<CustomPipelineConfig | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string>('');

  const runtimeLock = isAnyPhaseInProgress(cfg, taskId);
  const builtinLock = cfg?.source === 'builtin';
  const locked = runtimeLock || builtinLock; // builtin 편집 차단

  // 최초 목록 로드 — 캐시 강제 무효화 후 재조회 (외부에서 파일 삭제/수정된 경우
  // 유령 항목이 드롭다운에 남지 않게).
  useEffect(() => {
    (async () => {
      invalidateList(cwd);
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
    // "New" 로 방금 만든 로컬 전용 cfg 는 디스크에 없어도 cfg 상태로 들고 있어야
    // 함 (저장 전까지). activeId 가 현재 cfg 와 일치 && cfg 가 이미 로드돼 있으면
    // 재로드 시도 skip.
    if (cfg && cfg.id === activeId) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await readCustomPipeline(activeId, activeSource, cwd);
        if (cancelled) return;
        setCfg(loaded);
        setSelectedPhaseId(loaded.phases[0]?.id || null);
        setDirty(false);
        setStatus(''); // 성공 시 이전 에러 제거
      } catch {
        // 로드 실패 — 해당 id 는 유령 (캐시 ↔ 디스크 불일치). 목록에서 제거 + 캐시
        // 무효화 + activeId 초기화.
        if (!cancelled) {
          const failedId = activeId;
          setActiveId(null);
          setCfg(null);
          setPipelines((prev) => prev.filter((p) => p.id !== failedId));
          invalidateList(cwd);
          setStatus(`파일 없음: ${failedId} — 목록에서 제거됨`);
          setTimeout(() => {
            setStatus((prev) => (prev.startsWith('파일 없음') ? '' : prev));
          }, 4000);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cfg 를 deps 에 넣으면 재로드 루프
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
    const name = prompt('새 파이프라인 이름:', 'My Pipeline');
    if (name === null) return; // 취소
    const trimmed = name.trim() || 'Untitled Pipeline';
    const id = `custom-${Date.now().toString(36)}`;
    const empty = createEmptyConfig(id, trimmed);
    setCfg(empty);
    setActiveId(id);
    setActiveSource('project');
    setSelectedPhaseId(null);
    setDirty(true);
    setStatus(`새 파이프라인 '${trimmed}' 생성됨 — Save 로 저장`);
  };

  // 빈 캔버스에 스킬 드롭 → 새 파이프라인 생성 + 첫 phase + 드롭된 스킬 추가.
  const handleCreateWithSkill = (skill: CustomSkillRef) => {
    if (locked) return;
    const name = prompt('새 파이프라인 이름:', 'My Pipeline');
    if (name === null) return;
    const trimmed = name.trim() || 'Untitled Pipeline';
    const id = `custom-${Date.now().toString(36)}`;
    const empty = createEmptyConfig(id, trimmed);
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
    setStatus(`새 파이프라인 '${trimmed}' 생성됨 — Save 로 저장`);
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
    const defaultName = `${cfg.name} (copy)`;
    const newName = prompt('복사본 이름:', defaultName);
    if (newName === null) return;
    const trimmedName = newName.trim() || defaultName;
    const newId = `custom-${Date.now().toString(36)}`;
    try {
      await duplicateCustomPipeline(cfg.id, cfg.source, newId, trimmedName, 'project', cwd);
      const list = await listCustomPipelines(cwd);
      setPipelines(list);
      setActiveId(newId);
      setActiveSource('project');
      setStatus(`복사됨: ${trimmedName}`);
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
    // 이전에 돌고 있던 Claude 프로세스(내장 파이프라인 등) 가 있으면 먼저 kill.
    // 같은 taskId 로 새 spawn 을 시도하면 UI 가 잠금 + 이전 이벤트와 충돌.
    try {
      const mod = await import('@tauri-apps/api/core');
      await mod.invoke('claude_stop_task', { taskId });
    } catch {
      /* 진행 중 없음 — 정상 */
    }
    onClose();
    // 태스크 파이프라인 상태 재초기화 — 내장 phase 흔적 제거, 커스텀 모드 활성화.
    // activeCustomPipeline 은 runCustomPipeline 내부 initState 에서 세팅됨.
    useTaskStore.getState().updateTask(taskId, {
      pipeline: {
        enabled: true,
        phases: {} as never,
        pipelineMode: 'custom',
        activeCustomPipeline: undefined,
      },
    });
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
          <span style={{ fontSize: 10, color: builtinLock ? 'var(--amber, #f59e0b)' : 'var(--fg-dim)' }}>
            {runtimeLock
              ? '🔒 실행 중 — read-only'
              : builtinLock
                ? '📦 builtin — Dup 으로 편집'
                : dirty
                  ? '● 변경됨'
                  : ''}
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
            <option value="">{pipelines.length === 0 ? '저장된 파이프라인 없음' : '파이프라인 선택...'}</option>
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
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {builtinLock && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 16px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
                  color: 'var(--amber, #f59e0b)',
                }}
              >
                <span style={{ fontSize: 18 }}>📦</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>내장 템플릿 — 편집 불가</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-dim)' }}>
                    이 파이프라인은 Cortx 바이너리에 embed 된 읽기 전용 템플릿. 오른쪽 <strong>복사 후 편집</strong>{' '}
                    버튼으로 project 복사본을 만들어 자유롭게 수정하세요.
                  </div>
                </div>
                <button
                  onClick={handleDuplicate}
                  style={{
                    padding: '6px 14px',
                    fontSize: 11,
                    background: 'var(--amber, #f59e0b)',
                    color: '#000',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  복사 후 편집 →
                </button>
              </div>
            )}
            {cfg && (
              <div
                style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border-muted)',
                  background: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', minWidth: 38 }}>이름</span>
                <input
                  type="text"
                  value={cfg.name}
                  onChange={(e) => !locked && updateCfg({ name: e.target.value })}
                  readOnly={locked}
                  placeholder="파이프라인 이름"
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    background: locked ? 'var(--bg-app)' : 'var(--bg-chip)',
                    border: '1px solid var(--border-muted)',
                    borderRadius: 4,
                    color: 'var(--fg-primary)',
                    fontSize: 12,
                    fontWeight: 500,
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: 10, color: 'var(--fg-dim)', minWidth: 38 }}>설명</span>
                <input
                  type="text"
                  value={cfg.description || ''}
                  onChange={(e) => !locked && updateCfg({ description: e.target.value })}
                  readOnly={locked}
                  placeholder="(선택)"
                  style={{
                    flex: 2,
                    padding: '4px 8px',
                    background: locked ? 'var(--bg-app)' : 'var(--bg-chip)',
                    border: '1px solid var(--border-muted)',
                    borderRadius: 4,
                    color: 'var(--fg-primary)',
                    fontSize: 11,
                    outline: 'none',
                  }}
                />
              </div>
            )}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              <PhaseCanvas
                cfg={cfg}
                selectedPhaseId={selectedPhaseId}
                onSelectPhase={setSelectedPhaseId}
                onPhasesChange={updatePhases}
                onCreateWithSkill={handleCreateWithSkill}
                disabled={locked}
              />
            </div>
          </div>
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
