import { useState } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import type { ContextItem } from '../../types/contextPack';

interface PinDialogProps {
  taskId: string;
  onClose: () => void;
}

export function PinDialog({ taskId, onClose }: PinDialogProps) {
  const [pinUrl, setPinUrl] = useState('');
  const [pinTitle, setPinTitle] = useState('');
  // 수동 본문 입력 — MCP fetch가 실패하거나 토큰 없는 환경에서 사용자가 직접 붙여넣기.
  // 입력하면 fetchPinUrl 우회하고 fullText에 그대로 저장 → 파이프라인이 즉시 활용.
  const [pinFullText, setPinFullText] = useState('');

  const handlePin = () => {
    if (!pinTitle.trim()) return;
    const trimmedFullText = pinFullText.trim();
    const item = {
      id: `pin-${Date.now().toString(36)}`,
      sourceType: 'pin' as const,
      title: pinTitle.trim(),
      url: pinUrl.trim(),
      summary: 'Pinned',
      timestamp: new Date().toISOString(),
      isNew: false,
      category: 'pinned' as const,
      ...(trimmedFullText ? { metadata: { fullText: trimmedFullText } } : {}),
    } as ContextItem;
    const store = useContextPackStore.getState();
    // 본문이 있으면 eager fetch 불필요 — 일반 addPin으로 저장
    if (trimmedFullText) store.addPin(taskId, item);
    else store.addPinWithFetch(taskId, item);
    setPinUrl('');
    setPinTitle('');
    setPinFullText('');
    onClose();
  };

  return (
    <div className="ctx-pin-form">
      <input value={pinTitle} onChange={(e) => setPinTitle(e.target.value)} placeholder="Title" />
      <input
        value={pinUrl}
        onChange={(e) => setPinUrl(e.target.value)}
        placeholder="URL (optional)"
        style={{ fontFamily: 'Fira Code, JetBrains Mono, monospace', fontSize: 11 }}
      />
      <textarea
        value={pinFullText}
        onChange={(e) => setPinFullText(e.target.value)}
        placeholder="본문 (선택) — Notion 페이지 본문을 직접 붙여넣으면 MCP fetch 우회"
        rows={4}
        style={{
          fontFamily: 'Fira Code, JetBrains Mono, monospace',
          fontSize: 11,
          width: '100%',
          resize: 'vertical',
          background: 'transparent',
          color: '#e5e5e5',
          border: '1px solid #3a3a44',
          borderRadius: 4,
          padding: 6,
        }}
      />
      <div className="ctx-pin-actions">
        <button style={{ background: 'none', color: '#888895' }} onClick={onClose}>
          Cancel
        </button>
        <button style={{ background: 'var(--accent)', color: '#e5e5e5' }} onClick={handlePin}>
          Pin
        </button>
      </div>
    </div>
  );
}
