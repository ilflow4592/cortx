/**
 * Pipeline Builder 상단 툴바 — 파이프라인 선택 드롭다운 + CRUD 버튼들 + Run.
 * 상태/핸들러는 모두 props 로 받아 stateless 표시.
 */
import { X, Play, Plus, Save, Copy, Trash2, Download, Upload } from 'lucide-react';
import type { CustomPipelineConfig, CustomPipelineMeta } from '../../types/customPipeline';
import { btn, btnPrimary } from './_builderUtils';

interface Props {
  pipelines: CustomPipelineMeta[];
  activeId: string | null;
  cfg: CustomPipelineConfig | null;
  dirty: boolean;
  runtimeLock: boolean;
  builtinLock: boolean;
  editLocked: boolean;
  status: string;
  onSelectPipeline: (id: string) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: () => void;
  onSave: () => void;
  onRun: () => void;
  onClose: () => void;
}

export function BuilderToolbar({
  pipelines,
  activeId,
  cfg,
  dirty,
  runtimeLock,
  builtinLock,
  editLocked,
  status,
  onSelectPipeline,
  onNew,
  onDuplicate,
  onImport,
  onExport,
  onDelete,
  onSave,
  onRun,
  onClose,
}: Props) {
  return (
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
        {runtimeLock ? '🔒 실행 중 — read-only' : builtinLock ? '📦 builtin — Dup 으로 편집' : dirty ? '● 변경됨' : ''}
      </span>

      <select
        value={activeId || ''}
        onChange={(e) => onSelectPipeline(e.target.value)}
        disabled={runtimeLock}
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

      <button onClick={onNew} disabled={runtimeLock} style={btn()} title="New Pipeline">
        <Plus size={12} /> New
      </button>
      <button onClick={onDuplicate} disabled={!cfg || runtimeLock} style={btn()} title="Duplicate (builtin 도 가능)">
        <Copy size={12} /> Dup
      </button>
      <button onClick={onImport} disabled={runtimeLock} style={btn()} title="Import JSON">
        <Upload size={12} /> Import
      </button>
      <button onClick={onExport} disabled={!cfg} style={btn()} title="Export JSON">
        <Download size={12} /> Export
      </button>
      <button onClick={onDelete} disabled={!cfg || editLocked} style={btn()} title="Delete">
        <Trash2 size={12} />
      </button>
      <button onClick={onSave} disabled={!dirty || editLocked} style={btn()} title="Save (⌘S)">
        <Save size={12} /> Save
      </button>
      <button onClick={onRun} disabled={!cfg || dirty || runtimeLock} style={btnPrimary()} title="Run pipeline">
        <Play size={12} /> Run
      </button>
      <button onClick={onClose} style={btn()} title="Close">
        <X size={14} />
      </button>
    </div>
  );
}
