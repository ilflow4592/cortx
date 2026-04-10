import type { ReactNode } from 'react';
import type { ContextItem } from '../../types/contextPack';
import { GitHubIcon, SlackIcon, NotionIcon, PinIcon } from '../SourceIcons';

function sourceIcon(type: string): ReactNode {
  if (type === 'github') return <GitHubIcon size={14} color="#a1a1aa" />;
  if (type === 'slack') return <SlackIcon size={14} />;
  if (type === 'notion') return <NotionIcon size={14} color="#a1a1aa" />;
  return <PinIcon size={14} />;
}

export function ContextTab({
  taskItems,
  taskDelta,
}: {
  taskItems: ContextItem[];
  taskDelta: ContextItem[];
}) {
  return (
    <>
      {taskDelta.length > 0 && (
        <>
          <div className="rp-section">⚡ Updates Since Pause</div>
          {taskDelta.slice(0, 5).map((item) => (
            <div key={item.id} className="cp-item">
              <div className="cp-icon">{sourceIcon(item.sourceType)}</div>
              <div className="cp-body">
                <div className="cp-name" style={{ color: '#eab308' }}>
                  {item.title}
                </div>
                <div className="cp-sub">{item.summary}</div>
              </div>
            </div>
          ))}
        </>
      )}
      <div className="rp-section">All Items ({taskItems.length})</div>
      {taskItems.map((item) => (
        <div key={item.id} className="cp-item">
          <div className="cp-icon">{sourceIcon(item.sourceType)}</div>
          <div className="cp-body">
            <div className="cp-name">{item.title}</div>
            <div className="cp-sub">
              {item.summary} {item.isNew && <span className="cp-new">NEW</span>}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
