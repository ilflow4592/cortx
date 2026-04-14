import { Paperclip } from 'lucide-react';
import { ContextItemCard } from './ContextItemCard';
import type { ContextItem } from '../../types/contextPack';

interface ItemsListProps {
  taskId: string;
  filtered: ContextItem[];
  isCollecting: boolean;
  onPreview: (url: string) => void;
}

export function ItemsList({ taskId, filtered, isCollecting, onPreview }: ItemsListProps) {
  return (
    <div className="ctx-items">
      {filtered.length === 0 ? (
        <div className="ctx-empty">
          {isCollecting ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
              <div style={{ fontSize: 13, color: '#888895' }}>Searching via MCP...</div>
              <div style={{ fontSize: 11, color: 'var(--fg-faint)' }}>This may take a few seconds</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginBottom: 12, opacity: 0.3 }}>
                <Paperclip size={28} strokeWidth={1.5} />
              </div>
              <div style={{ marginBottom: 6 }}>Drop files or URLs here to pin them</div>
              <div style={{ color: 'var(--fg-faint)', fontSize: 11 }}>
                or click "Collect Now" to gather from connected sources
              </div>
            </div>
          )}
        </div>
      ) : (
        filtered.map((item) => (
          <ContextItemCard key={item.id} taskId={taskId} item={item} onPreview={onPreview} />
        ))
      )}
    </div>
  );
}
