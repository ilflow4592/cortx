/**
 * 파일/URL 드래그 중 표시되는 오버레이.
 * useFileDropHandler의 isDragging 값을 받아 조건부 렌더링.
 */
import { Paperclip } from 'lucide-react';

export function DropOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: 'var(--accent-bg)',
        border: '2px dashed var(--accent)',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center', color: 'var(--accent-bright)' }}>
        <div style={{ marginBottom: 8 }}>
          <Paperclip size={32} strokeWidth={1.5} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Drop files or URLs here</div>
        <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 4 }}>
          They&apos;ll be pinned to this task&apos;s context
        </div>
      </div>
    </div>
  );
}
