/**
 * Cmd+K command palette — fuzzy-searchable global command launcher.
 * Orchestrator: owns search input, store subscriptions, FTS hook,
 * and composes section components from `command-palette/`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Command } from 'cmdk';
import { Search } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useT } from '../i18n';
import { matchesAtBoundary, matchesLabelOrKeywords } from './command-palette/search';
import { useCommandPaletteSearch } from './command-palette/useCommandPaletteSearch';
import { ActionsSection } from './command-palette/ActionsSection';
import { CurrentTaskSection } from './command-palette/CurrentTaskSection';
import { TasksSection } from './command-palette/TasksSection';
import { ProjectsSection } from './command-palette/ProjectsSection';
import { MessagesSection } from './command-palette/MessagesSection';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const toggleSidebar = useLayoutStore((s) => s.toggleSidebar);
  const toggleRightPanel = useLayoutStore((s) => s.toggleRightPanel);
  const [search, setSearch] = useState('');
  const t = useT();
  const tasks = useTaskStore((s) => s.tasks);
  const projects = useProjectStore((s) => s.projects);
  const setActiveTask = useTaskStore((s) => s.setActiveTask);
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const pauseWithReason = useTaskStore((s) => s.pauseWithReason);
  const resumeTask = useTaskStore((s) => s.resumeTask);
  const setTaskStatus = useTaskStore((s) => s.setTaskStatus);

  const inputRef = useRef<HTMLInputElement>(null);

  // Reset search when reopened
  useEffect(() => {
    if (open) {
      setSearch('');
      inputRef.current?.focus();
    }
  }, [open]);

  const ftsHits = useCommandPaletteSearch(open, search);

  // 경계 인식 매칭 — 로직은 command-palette/search.ts로 추출됨
  const searchLower = search.trim().toLowerCase();
  const matchesSearch = (text: string) => matchesAtBoundary(text, search);

  const filteredTasks = useMemo(() => {
    if (!searchLower) return tasks;
    return tasks.filter((task) => {
      const project = projects.find((p) => p.id === task.projectId);
      return matchesSearch(task.title) || matchesSearch(task.branchName || '') || matchesSearch(project?.name || '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projects, searchLower]);

  const filteredProjects = useMemo(() => {
    if (!searchLower) return projects;
    return projects.filter((p) => matchesSearch(p.name) || matchesSearch(p.githubRepo) || matchesSearch(p.githubOwner));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, searchLower]);

  const actionItems: { label: string; keywords?: string[] }[] = useMemo(
    () => [
      { label: 'New Task', keywords: ['new', 'task', 'create', 'add'] },
      { label: 'New Project', keywords: ['new', 'project', 'create', 'folder'] },
      { label: 'Open Settings', keywords: ['settings', 'preferences', 'config'] },
      { label: 'Daily Report', keywords: ['daily', 'report', 'stats'] },
      { label: 'Worktree Cleanup', keywords: ['worktree', 'cleanup', 'delete', 'clean'] },
      { label: 'Manage MCP Servers', keywords: ['mcp', 'server', 'manage', 'claude.json'] },
      { label: 'Slash Command Builder', keywords: ['slash', 'command', 'builder', 'skill', 'create'] },
      { label: 'Check for Updates', keywords: ['update', 'upgrade', 'version', 'check'] },
      { label: 'Edit Pipeline Config', keywords: ['pipeline', 'config', 'customize', 'phases', 'edit'] },
      { label: 'Export Current Task (Markdown)', keywords: ['export', 'markdown', 'md', 'save', 'download'] },
      { label: 'Export Current Task (JSON)', keywords: ['export', 'json', 'save', 'download', 'backup'] },
      { label: 'Import Tasks from JSON', keywords: ['import', 'json', 'load', 'restore'] },
      { label: 'Toggle Sidebar', keywords: ['sidebar', 'panel', 'toggle'] },
      { label: 'Toggle Right Panel', keywords: ['right', 'panel', 'toggle'] },
    ],
    [],
  );
  const showAction = (label: string) => {
    const item = actionItems.find((a) => a.label === label);
    return matchesLabelOrKeywords(search, label, item?.keywords || []);
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

  const sectionActions = (
    <ActionsSection
      key="actions"
      heading={t('palette.actions')}
      showAction={showAction}
      activeTask={activeTask}
      projects={projects}
      toggleSidebar={toggleSidebar}
      toggleRightPanel={toggleRightPanel}
      run={run}
    />
  );

  const sectionCurrentTask = activeTask ? (
    <CurrentTaskSection
      key="current"
      activeTask={activeTask}
      search={search}
      pauseWithReason={pauseWithReason}
      resumeTask={resumeTask}
      setTaskStatus={setTaskStatus}
      run={run}
    />
  ) : null;

  const sectionTasks = (
    <TasksSection
      key="tasks"
      heading={t('palette.tasks')}
      tasks={filteredTasks}
      projects={projects}
      onPick={setActiveTask}
      run={run}
    />
  );

  const sectionProjects = (
    <ProjectsSection
      key="projects"
      heading={t('palette.projects')}
      projects={filteredProjects}
      tasks={tasks}
      onPickFirstTask={setActiveTask}
      run={run}
    />
  );

  const sectionChat = (
    <MessagesSection
      key="chat"
      heading={t('palette.chatMessages')}
      hits={ftsHits}
      tasks={tasks}
      projects={projects}
      search={search}
      onPick={setActiveTask}
      run={run}
    />
  );

  // Empty search: Actions → Current Task → Tasks → Projects
  // With search:   Current Task → Projects → Tasks → Chat Messages → Actions
  const sections = !searchLower
    ? [sectionActions, sectionCurrentTask, sectionTasks, sectionProjects]
    : [sectionCurrentTask, sectionProjects, sectionTasks, sectionChat, sectionActions];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          border: 'none',
          padding: 0,
          cursor: 'default',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        style={{
          width: 600,
          maxWidth: '90vw',
          maxHeight: '70vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-strong)',
          borderRadius: 12,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Command label="Command Palette" shouldFilter={false}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 18px',
              borderBottom: '1px solid var(--border-muted)',
            }}
          >
            <Search size={16} color="var(--accent)" strokeWidth={1.5} />
            <Command.Input
              ref={inputRef}
              value={search}
              onValueChange={setSearch}
              placeholder={t('palette.search')}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--fg-primary)',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            />
            <span
              style={{
                fontSize: 10,
                color: 'var(--fg-dim)',
                background: 'var(--bg-surface-hover)',
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
                color: 'var(--fg-faint)',
                textAlign: 'center',
              }}
            >
              {t('palette.noResults')}
            </Command.Empty>

            {sections}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
