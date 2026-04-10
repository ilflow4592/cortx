import { useContextPackStore } from '../../stores/contextPackStore';
import type { ContextItem } from '../../types/contextPack';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from '../SourceIcons';

interface ContextItemCardProps {
  taskId: string;
  item: ContextItem;
  onPreview: (url: string) => void;
}

function sourceIcon(t: string) {
  if (t === 'github') return <GitHubIcon size={14} color="#a1a1aa" />;
  if (t === 'slack') return <SlackIcon size={14} />;
  if (t === 'notion') return <NotionIcon size={14} color="#a1a1aa" />;
  return <PinIcon size={14} />;
}

export function ContextItemCard({ taskId, item, onPreview }: ContextItemCardProps) {
  return (
    <div className="cp-item" style={{ position: 'relative' }}>
      <div className="cp-icon">{sourceIcon(item.sourceType)}</div>
      <div className="cp-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.url ? (
            <span
              className="cp-name"
              style={{ cursor: 'pointer', textDecoration: 'underline', textDecorationColor: '#3d4856' }}
              onClick={() => onPreview(item.url)}
            >
              {item.title}
            </span>
          ) : (
            <span className="cp-name">{item.title}</span>
          )}
          {item.isNew && <span className="cp-new">NEW</span>}
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10, color: '#4d5868', flexShrink: 0 }}
              title="Open in browser"
            >
              ↗
            </a>
          )}
        </div>
        <div className="cp-sub">{item.summary}</div>
      </div>
      <button
        onClick={() => useContextPackStore.getState().removeItem(taskId, item.id)}
        style={{
          background: 'none',
          border: 'none',
          color: '#3d4856',
          cursor: 'pointer',
          fontSize: 12,
          position: 'absolute',
          right: 0,
          top: 8,
        }}
      >
        ×
      </button>
    </div>
  );
}
