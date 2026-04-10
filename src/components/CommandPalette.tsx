/**
 * Cmd+K command palette — fuzzy-searchable global command launcher.
 * Lists tasks, projects, actions, and pipeline triggers in one searchable UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { invoke } from '@tauri-apps/api/core';
import {
  CheckCircle2,
  Circle,
  FolderOpen,
  Plus,
  Settings as SettingsIcon,
  Play,
  PanelLeftClose,
  PanelRightClose,
  FileText,
  Search,
  Pause,
  RotateCcw,
  Square,
  MessageSquare,
} from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { runPipeline } from '../utils/pipelineExec';
import { messageCache, sessionCache, loadingCache } from '../utils/chatState';
import { searchAll, type SearchHit } from '../services/db';

interface Props {
  open: boolean;
  onClose: () => void;
  onNewTask: () => void;
  onNewProject: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  onToggleRightPanel: () => void;
  onShowReport: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onNewTask,
  onNewProject,
  onOpenSettings,
  onToggleSidebar,
  onToggleRightPanel,
  onShowReport,
}: Props) {
  const [search, setSearch] = useState('');
  const [ftsHits, setFtsHits] = useState<SearchHit[]>([]);
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const pauseWithReason = useTaskStore((s) => s.pauseWithReason);
  const resumeTask = useTaskStore((s) => s.resumeTask);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);

  // Reset search when reopened
  useEffect(() => {
    if (open) {
      setSearch('');
      setFtsHits([]);
    }
  }, [open]);

  // Debounced full-text search
  useEffect(() => {
    if (!search.trim() || search.length < 2) {
      setFtsHits([]);
      return;
    }
    const handle = setTimeout(() => {
      searchAll(search, 30)
        .then((hits) => setFtsHits(hits.filter((h) => h.kind === 'message')))
        .catch(() => setFtsHits([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [search]);

  // Manual filtering since shouldFilter={false}
  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (text: string) => !searchLower || text.toLowerCase().includes(searchLower);

  const filteredTasks = useMemo(() => {
    if (!searchLower) return tasks;
    return tasks.filter((task) => {
      const project = projects.find((p) => p.id === task.projectId);
      return (
        matchesSearch(task.title) ||
        matchesSearch(task.branchName || '') ||
        matchesSearch(project?.name || '')
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projects, searchLower]);

  const filteredProjects = useMemo(() => {
    if (!searchLower) return projects;
    return projects.filter(
      (p) => matchesSearch(p.name) || matchesSearch(p.githubRepo) || matchesSearch(p.githubOwner),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, searchLower]);

  const actionItems: { label: string; keywords?: string[] }[] = useMemo(
    () => [
      { label: 'New Task', keywords: ['new', 'task', 'create', 'add'] },
      { label: 'New Project', keywords: ['new', 'project', 'create', 'folder'] },
      { label: 'Open Settings', keywords: ['settings', 'preferences', 'config'] },
      { label: 'Daily Report', keywords: ['daily', 'report', 'stats'] },
      { label: 'Toggle Sidebar', keywords: ['sidebar', 'panel', 'toggle'] },
      { label: 'Toggle Right Panel', keywords: ['right', 'panel', 'context', 'toggle'] },
    ],
    [],
  );
  const showAction = (label: string) => {
    if (!searchLower) return true;
    const item = actionItems.find((a) => a.label === label);
    if (matchesSearch(label)) return true;
    return item?.keywords?.some((k) => matchesSearch(k)) ?? false;
  };

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const run = (fn: () => void) => {
    onClose();
    setTimeout(fn, 0);
  };

  const activeTask = tasks.find((t) => t.id === activeTaskId);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600,
          maxWidth: '90vw',
          maxHeight: '70vh',
          background: '#0c0c12',
          border: '1px solid #2a3642',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Command label="Command Palette" shouldFilter={false}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 18px',
              borderBottom: '1px solid #1e2530',
            }}
          >
            <Search size={16} color="#5aa5a5" strokeWidth={1.5} />
            <Command.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder="Search tasks, projects, actions..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#e8eef5',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: '#3d4856',
                background: '#141821',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ESC
            </span>
          </div>

          <Command.List
            style={{
              padding: 8,
              overflowY: 'auto',
              maxHeight: 'calc(70vh - 60px)',
            }}
          >
            <Command.Empty
              style={{
                padding: '24px 12px',
                fontSize: 12,
                color: '#4d5868',
                textAlign: 'center',
              }}
            >
              No results found.
            </Command.Empty>

            {/* ── Actions ── */}
            <Command.Group heading="Actions">
              {showAction('New Task') && (
                <PaletteItem
                  icon={<Plus size={14} color="#818cf8" strokeWidth={1.5} />}
                  label="New Task"
                  hint="⌘N"
                  onSelect={() => run(onNewTask)}
                />
              )}
              {showAction('New Project') && (
                <PaletteItem
                  icon={<FolderOpen size={14} color="#818cf8" strokeWidth={1.5} />}
                  label="New Project"
                  onSelect={() => run(onNewProject)}
                />
              )}
              {showAction('Open Settings') && (
                <PaletteItem
                  icon={<SettingsIcon size={14} color="#a1a1aa" strokeWidth={1.5} />}
                  label="Open Settings"
                  hint="⌘,"
                  onSelect={() => run(onOpenSettings)}
                />
              )}
              {showAction('Daily Report') && (
                <PaletteItem
                  icon={<FileText size={14} color="#a1a1aa" strokeWidth={1.5} />}
                  label="Daily Report"
                  onSelect={() => run(onShowReport)}
                />
              )}
              {showAction('Toggle Sidebar') && (
                <PaletteItem
                  icon={<PanelLeftClose size={14} color="#a1a1aa" strokeWidth={1.5} />}
                  label="Toggle Sidebar"
                  hint="⌘B"
                  onSelect={() => run(onToggleSidebar)}
                />
              )}
              {showAction('Toggle Right Panel') && (
                <PaletteItem
                  icon={<PanelRightClose size={14} color="#a1a1aa" strokeWidth={1.5} />}
                  label="Toggle Right Panel"
                  hint="⌘⇧B"
                  onSelect={() => run(onToggleRightPanel)}
                />
              )}
            </Command.Group>

            {/* ── Active Task Actions ── */}
            {activeTask && (
              <Command.Group heading={`Current Task: ${activeTask.title}`}>
                <PaletteItem
                  icon={<Play size={14} color="#34d399" strokeWidth={1.5} />}
                  label="Run Pipeline (/pipeline:dev-task)"
                  onSelect={() =>
                    run(() => {
                      runPipeline(activeTask.id, '/pipeline:dev-task');
                    })
                  }
                />
                {loadingCache.get(activeTask.id) && (
                  <PaletteItem
                    icon={<Square size={14} color="#ef4444" strokeWidth={1.5} fill="#ef4444" />}
                    label="Stop Claude Process (kill running pipeline)"
                    onSelect={() =>
                      run(() => {
                        // Kill any running Claude process for this task
                        invoke('claude_stop_task', { taskId: activeTask.id }).catch(() => {});
                        // Reset chat + pipeline + timer (same as red Stop button in chat)
                        messageCache.delete(activeTask.id);
                        sessionCache.delete(activeTask.id);
                        loadingCache.delete(activeTask.id);
                        useTaskStore.getState().updateTask(activeTask.id, {
                          status: 'waiting',
                          pipeline: undefined,
                          elapsedSeconds: 0,
                        });
                      })
                    }
                  />
                )}
                {activeTask.status === 'active' && (
                  <PaletteItem
                    icon={<Pause size={14} color="#eab308" strokeWidth={1.5} />}
                    label="Pause Current Task (timer only)"
                    hint="⌘⇧P"
                    onSelect={() =>
                      run(() => pauseWithReason(activeTask.id, 'other', 'Paused via command palette'))
                    }
                  />
                )}
                {activeTask.status === 'paused' && (
                  <PaletteItem
                    icon={<RotateCcw size={14} color="#34d399" strokeWidth={1.5} />}
                    label="Resume Current Task"
                    hint="⌘⇧R"
                    onSelect={() => run(() => resumeTask(activeTask.id))}
                  />
                )}
                {activeTask.status !== 'done' && (
                  <PaletteItem
                    icon={<CheckCircle2 size={14} color="#5aa5a5" strokeWidth={1.5} />}
                    label="Mark as Done"
                    onSelect={() => run(() => setTaskStatus(activeTask.id, 'done'))}
                  />
                )}
              </Command.Group>
            )}

            {/* ── Tasks ── */}
            {filteredTasks.length > 0 && (
              <Command.Group heading="Tasks">
                {filteredTasks.map((task) => {
                  const project = projects.find((p) => p.id === task.projectId);
                  const dotColor =
                    task.status === 'active'
                      ? '#34d399'
                      : task.status === 'paused'
                        ? '#eab308'
                        : task.status === 'done'
                          ? '#5aa5a5'
                          : '#3d4856';
                  return (
                    <PaletteItem
                      key={task.id}
                      icon={<Circle size={10} fill={dotColor} stroke="none" />}
                      label={task.title}
                      hint={project?.name || (task.branchName ? task.branchName : undefined)}
                      keywords={[task.title, task.branchName, project?.name || '']}
                      onSelect={() => run(() => setActiveTask(task.id))}
                    />
                  );
                })}
              </Command.Group>
            )}

            {/* ── Chat Messages (FTS) ── */}
            {ftsHits.length > 0 && (
              <Command.Group heading="Chat Messages">
                {ftsHits.map((hit) => {
                  const task = tasks.find((t) => t.id === hit.taskId);
                  if (!task) return null;
                  const project = projects.find((p) => p.id === task.projectId);
                  // Strip HTML mark tags for display (cmdk value should be plain text)
                  const plainSnippet = hit.snippet.replace(/<\/?mark>/g, '');
                  return (
                    <Command.Item
                      key={`fts-${hit.messageId}`}
                      value={`msg-${hit.messageId}-${search}`}
                      onSelect={() => run(() => setActiveTask(hit.taskId))}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        color: '#c0c8d4',
                      }}
                    >
                      <MessageSquare
                        size={12}
                        color="#7dbdbd"
                        strokeWidth={1.5}
                        style={{ flexShrink: 0, marginTop: 2 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#6b7585',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {task.title}
                          {project && <span style={{ color: '#3d4856' }}> · {project.name}</span>}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: '#8b95a5',
                            marginTop: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}
                          dangerouslySetInnerHTML={{ __html: hit.snippet }}
                        />
                        {/* Hidden value for cmdk matching — the plain text */}
                        <span style={{ display: 'none' }}>{plainSnippet}</span>
                      </div>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* ── Projects ── */}
            {filteredProjects.length > 0 && (
              <Command.Group heading="Projects">
                {filteredProjects.map((project) => (
                  <PaletteItem
                    key={project.id}
                    icon={
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: project.color,
                          display: 'inline-block',
                        }}
                      />
                    }
                    label={project.name}
                    hint={project.localPath || project.githubRepo}
                    keywords={[project.name, project.githubRepo, project.githubOwner]}
                    onSelect={() =>
                      run(() => {
                        // Find first task of this project and activate
                        const firstTask = tasks.find((t) => t.projectId === project.id);
                        if (firstTask) setActiveTask(firstTask.id);
                      })
                    }
                  />
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function PaletteItem({
  icon,
  label,
  hint,
  keywords,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  keywords?: string[];
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={[label, ...(keywords || [])].filter(Boolean).join(' ')}
      onSelect={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderRadius: 6,
        cursor: 'pointer',
        fontSize: 13,
        color: '#c0c8d4',
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {hint && (
        <span
          style={{
            fontSize: 10,
            color: '#4d5868',
            fontFamily: "'JetBrains Mono', monospace",
            flexShrink: 0,
          }}
        >
          {hint}
        </span>
      )}
    </Command.Item>
  );
}
