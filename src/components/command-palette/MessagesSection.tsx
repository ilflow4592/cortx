/**
 * FTS message search results group. Selecting a hit activates the owning task.
 * Renders nothing when no hits are present.
 */
import { Command } from 'cmdk';
import { MessageSquare } from 'lucide-react';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import type { SearchHit } from '../../services/db';

interface Props {
  heading: string;
  hits: SearchHit[];
  tasks: Task[];
  projects: Project[];
  search: string;
  onPick: (taskId: string) => void;
  run: (fn: () => void) => void;
}

export function MessagesSection({ heading, hits, tasks, projects, search, onPick, run }: Props) {
  if (hits.length === 0) return null;

  return (
    <Command.Group heading={heading}>
      {hits.map((hit) => {
        const task = tasks.find((t) => t.id === hit.taskId);
        if (!task) return null;
        const project = projects.find((p) => p.id === task.projectId);
        const plainSnippet = hit.snippet.replace(/<\/?mark>/g, '');
        return (
          <Command.Item
            key={`fts-${hit.messageId}`}
            value={`msg-${hit.messageId}-${search}`}
            onSelect={() => run(() => onPick(hit.taskId))}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '8px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--fg-secondary)',
            }}
          >
            <MessageSquare
              size={12}
              color="var(--accent-bright)"
              strokeWidth={1.5}
              style={{ flexShrink: 0, marginTop: 2 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--fg-subtle)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {task.title}
                {project && <span style={{ color: 'var(--fg-dim)' }}> · {project.name}</span>}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--fg-muted)',
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
                dangerouslySetInnerHTML={{ __html: hit.snippet }}
              />
              <span style={{ display: 'none' }}>{plainSnippet}</span>
            </div>
          </Command.Item>
        );
      })}
    </Command.Group>
  );
}
