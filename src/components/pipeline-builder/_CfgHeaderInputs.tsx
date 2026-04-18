/**
 * 현재 파이프라인의 이름·설명 인라인 편집 입력 2개.
 * PipelineBuilder 의 builtinLock 아래에 렌더.
 */
import type { CustomPipelineConfig } from '../../types/customPipeline';

interface Props {
  cfg: CustomPipelineConfig;
  editLocked: boolean;
  onChange: (patch: Partial<CustomPipelineConfig>) => void;
}

export function CfgHeaderInputs({ cfg, editLocked, onChange }: Props) {
  return (
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
        onChange={(e) => !editLocked && onChange({ name: e.target.value })}
        readOnly={editLocked}
        placeholder="파이프라인 이름"
        style={{
          flex: 1,
          padding: '4px 8px',
          background: editLocked ? 'var(--bg-app)' : 'var(--bg-chip)',
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
        onChange={(e) => !editLocked && onChange({ description: e.target.value })}
        readOnly={editLocked}
        placeholder="(선택)"
        style={{
          flex: 2,
          padding: '4px 8px',
          background: editLocked ? 'var(--bg-app)' : 'var(--bg-chip)',
          border: '1px solid var(--border-muted)',
          borderRadius: 4,
          color: 'var(--fg-primary)',
          fontSize: 11,
          outline: 'none',
        }}
      />
    </div>
  );
}
