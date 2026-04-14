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

  const handlePin = () => {
    if (!pinTitle.trim()) return;
    useContextPackStore.getState().addPin(taskId, {
      id: `pin-${Date.now().toString(36)}`,
      sourceType: 'pin',
      title: pinTitle.trim(),
      url: pinUrl.trim(),
      summary: 'Pinned',
      timestamp: new Date().toISOString(),
      isNew: false,
      category: 'pinned',
    } as ContextItem);
    setPinUrl('');
    setPinTitle('');
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
