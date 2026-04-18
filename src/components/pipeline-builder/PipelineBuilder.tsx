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
import { PromptModal, type PromptRequest } from './PromptModal';
import { BuiltinBanner } from './_BuiltinBanner';
import { CfgHeaderInputs } from './_CfgHeaderInputs';
import { BuilderToolbar } from './_BuilderToolbar';
import { isAnyPhaseInProgress, skillRefLabel, createEmptyConfig } from './_builderUtils';

interface Props {
  taskId: string;
  cwd: string;
  onClose: () => void;
}

export function PipelineBuilder({ taskId, cwd, onClose }: Props) {
  const [pipelines, setPipelines] = useState<CustomPipelineMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<'user' | 'project' | 'builtin'>('project');
  const [cfg, setCfg] = useState<CustomPipelineConfig | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [promptReq, setPromptReq] = useState<PromptRequest | null>(null);

  /** Tauri WebKit 에서 window.prompt 차단되므로 커스텀 모달 사용 */
  const askText = (title: string, defaultValue?: string, message?: string): Promise<string | null> =>
    new Promise((resolve) => {
      setPromptReq({ title, message, defaultValue, kind: 'input', resolve });
    });
  const askConfirm = (title: string, message?: string): Promise<boolean> =>
    new Promise((resolve) => {
      setPromptReq({
        title,
        message,
        kind: 'confirm',
        confirmLabel: '확인',
        resolve: (v) => resolve(v !== null),
      });
    });

  const runtimeLock = isAnyPhaseInProgress(cfg, taskId);
  const builtinLock = cfg?.source === 'builtin';
  // 현재 파이프라인의 phase/skill/필드 편집만 차단.
  // New/Dup/Import 같은 글로벌 CRUD 는 runtimeLock 일 때만 차단 (builtin 이어도 허용 —
  // 그래야 사용자가 builtin 에서 빠져나올 수 있음).
  const editLocked = runtimeLock || builtinLock;

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
    if (!cfg || editLocked) return;
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
    if (!cfg || editLocked) return;
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

  const handleNew = async () => {
    const name = await askText('새 파이프라인 이름', 'My Pipeline');
    if (name === null) return;
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
  const handleCreateWithSkill = async (skill: CustomSkillRef) => {
    if (editLocked) return;
    const name = await askText('새 파이프라인 이름', 'My Pipeline');
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
    if (editLocked) return;
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
    const newName = await askText('복사본 이름', defaultName);
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
    if (!cfg || editLocked) return;
    const ok = await askConfirm(`'${cfg.name}' 삭제?`, '이 작업은 되돌릴 수 없습니다.');
    if (!ok) return;
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
    if (cfg.source === 'builtin') {
      setStatus('내장 파이프라인은 Run 불가 — 복사 후 편집하세요');
      return;
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
        <BuilderToolbar
          pipelines={pipelines}
          activeId={activeId}
          cfg={cfg}
          dirty={dirty}
          runtimeLock={runtimeLock}
          builtinLock={builtinLock}
          editLocked={editLocked}
          status={status}
          onSelectPipeline={(id) => {
            const meta = pipelines.find((p) => p.id === id);
            if (meta) {
              setActiveId(meta.id);
              setActiveSource(meta.source);
            }
          }}
          onNew={handleNew}
          onDuplicate={handleDuplicate}
          onImport={handleImport}
          onExport={handleExport}
          onDelete={handleDelete}
          onSave={handleSave}
          onRun={handleRun}
          onClose={onClose}
        />

        {/* 3-panel body */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '260px 1fr 300px',
            overflow: 'hidden',
          }}
        >
          <SkillLibrary cwd={cwd} disabled={editLocked} onAddSkill={handleAddSkillByClick} />
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {builtinLock && <BuiltinBanner onDuplicate={handleDuplicate} />}
            {cfg && <CfgHeaderInputs cfg={cfg} editLocked={editLocked} onChange={updateCfg} />}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              <PhaseCanvas
                cfg={cfg}
                selectedPhaseId={selectedPhaseId}
                onSelectPhase={setSelectedPhaseId}
                onPhasesChange={updatePhases}
                onCreateWithSkill={handleCreateWithSkill}
                disabled={editLocked}
              />
            </div>
          </div>
          <PhaseDetail
            phase={selectedPhase}
            onChange={(patch) => selectedPhase && updatePhase(selectedPhase.id, patch)}
            disabled={editLocked}
          />
        </div>
      </div>
      {promptReq && <PromptModal req={promptReq} onClose={() => setPromptReq(null)} />}
    </div>
  );
}
