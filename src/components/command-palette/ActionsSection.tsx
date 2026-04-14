/**
 * Global actions group — New Task, Settings, Worktree Cleanup, MCP, etc.
 *
 * Visibility is decided by `showAction(label)` which delegates to the shared
 * keyword matcher. The Edit Pipeline / Export entries depend on `activeTask`,
 * so the parent passes it in instead of re-reading the store here.
 *
 * Layout-toggle items live in `LayoutSection` and are rendered at the bottom
 * of this same `Command.Group` to preserve the original single-section layout.
 */
import { Command } from 'cmdk';
import {
  ArrowUp,
  Download,
  FileText,
  FolderOpen,
  Plus,
  Server,
  Settings as SettingsIcon,
  Slash,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Task } from '../../types/task';
import type { Project } from '../../types/project';
import { useModalStore } from '../../stores/modalStore';
import { exportTaskAsJson, exportTaskAsMarkdown, importTasksFromJson } from '../../services/taskExport';
import { useT } from '../../i18n';
import { PaletteItem } from './PaletteItem';
import { LayoutSection } from './LayoutSection';

interface Props {
  heading: string;
  showAction: (label: string) => boolean;
  activeTask: Task | undefined;
  projects: Project[];
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  run: (fn: () => void) => void;
}

export function ActionsSection({
  heading,
  showAction,
  activeTask,
  projects,
  toggleSidebar,
  toggleRightPanel,
  run,
}: Props) {
  const modal = useModalStore();
  const t = useT();

  return (
    <Command.Group heading={heading}>
      {showAction('New Task') && (
        <PaletteItem
          icon={<Plus size={14} color="#818cf8" strokeWidth={1.5} />}
          label={t('action.newTask')}
          hint="⌘N"
          onSelect={() => run(() => modal.openNewTask())}
        />
      )}
      {showAction('New Project') && (
        <PaletteItem
          icon={<FolderOpen size={14} color="#818cf8" strokeWidth={1.5} />}
          label={t('action.newProject')}
          onSelect={() => run(() => modal.open('newProject'))}
        />
      )}
      {showAction('Open Settings') && (
        <PaletteItem
          icon={<SettingsIcon size={14} color="var(--fg-muted)" strokeWidth={1.5} />}
          label={t('action.openSettings')}
          hint="⌘,"
          onSelect={() => run(() => modal.open('settings'))}
        />
      )}
      {showAction('Daily Report') && (
        <PaletteItem
          icon={<FileText size={14} color="var(--fg-muted)" strokeWidth={1.5} />}
          label={t('action.dailyReport')}
          onSelect={() => run(() => modal.open('report'))}
        />
      )}
      {showAction('Worktree Cleanup') && (
        <PaletteItem
          icon={<Trash2 size={14} color="var(--fg-muted)" strokeWidth={1.5} />}
          label="Worktree Cleanup"
          onSelect={() => run(() => modal.open('worktreeCleanup'))}
        />
      )}
      {showAction('Manage MCP Servers') && (
        <PaletteItem
          icon={<Server size={14} color="var(--accent)" strokeWidth={1.5} />}
          label="Manage MCP Servers"
          onSelect={() => run(() => modal.open('mcpManager'))}
        />
      )}
      {showAction('Slash Command Builder') && (
        <PaletteItem
          icon={<Slash size={14} color="var(--accent)" strokeWidth={1.5} />}
          label="Slash Command Builder"
          onSelect={() => run(() => modal.open('slashBuilder'))}
        />
      )}
      {showAction('Check for Updates') && (
        <PaletteItem
          icon={<ArrowUp size={14} color="var(--accent)" strokeWidth={1.5} />}
          label="Check for Updates"
          onSelect={() => run(() => modal.open('updateChecker'))}
        />
      )}
      {activeTask && showAction('Edit Pipeline Config') && (
        <PaletteItem
          icon={<SettingsIcon size={14} color="var(--fg-muted)" strokeWidth={1.5} />}
          label="Edit Pipeline Config"
          onSelect={() =>
            run(() => {
              const project = activeTask.projectId ? projects.find((p) => p.id === activeTask.projectId) : null;
              if (!project?.localPath) {
                alert('Current task has no project with a local path');
                return;
              }
              modal.openPipelineEditor(project.localPath, project.name);
            })
          }
        />
      )}
      {activeTask && showAction('Export Current Task (Markdown)') && (
        <PaletteItem
          icon={<Download size={14} color="#818cf8" strokeWidth={1.5} />}
          label="Export Current Task (Markdown)"
          onSelect={() =>
            run(() => {
              exportTaskAsMarkdown(activeTask).catch((err) => alert(`Export failed: ${err}`));
            })
          }
        />
      )}
      {activeTask && showAction('Export Current Task (JSON)') && (
        <PaletteItem
          icon={<Download size={14} color="#818cf8" strokeWidth={1.5} />}
          label="Export Current Task (JSON)"
          onSelect={() =>
            run(() => {
              exportTaskAsJson(activeTask).catch((err) => alert(`Export failed: ${err}`));
            })
          }
        />
      )}
      {showAction('Import Tasks from JSON') && (
        <PaletteItem
          icon={<Upload size={14} color="#34d399" strokeWidth={1.5} />}
          label="Import Tasks from JSON"
          onSelect={() =>
            run(() => {
              importTasksFromJson()
                .then((result) => {
                  if (result) {
                    alert(`Imported ${result.importedTasks} task(s) and ${result.importedProjects} project(s)`);
                  }
                })
                .catch((err) => alert(`Import failed: ${err}`));
            })
          }
        />
      )}
      <LayoutSection
        showAction={showAction}
        toggleSidebar={toggleSidebar}
        toggleRightPanel={toggleRightPanel}
        run={run}
      />
    </Command.Group>
  );
}
