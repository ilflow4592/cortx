/**
 * 내장(builtin) 파이프라인 선택 시 편집 불가 안내 배너.
 * Duplicate 버튼으로 project 복사본을 만들도록 유도.
 */
interface Props {
  onDuplicate: () => void;
}

export function BuiltinBanner({ onDuplicate }: Props) {
  return (
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
          이 파이프라인은 Cortx 바이너리에 embed 된 읽기 전용 템플릿. 오른쪽 <strong>복사 후 편집</strong> 버튼으로
          project 복사본을 만들어 자유롭게 수정하세요.
        </div>
      </div>
      <button
        onClick={onDuplicate}
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
  );
}
