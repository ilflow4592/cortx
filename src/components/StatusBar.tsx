import { useTaskStore } from '../stores/taskStore';

export function StatusBar({
  showSidebar,
  onToggleSidebar,
  showRightPanel,
  onToggleRightPanel,
}: {
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  showRightPanel?: boolean;
  onToggleRightPanel?: () => void;
}) {
  const { tasks, activeTaskId } = useTaskStore();
  const activeTask = tasks.find((t) => t.id === activeTaskId);

  return (
    <div className="statusbar">
      <div className="sb-l">
        {activeTask ? (
          <span className="sb-active-tag">
            <span className="dot" />
            {activeTask.title}
          </span>
        ) : (
          <span style={{ color: 'var(--fg-dim)' }}>No active task</span>
        )}
      </div>
      <div className="sb-r">
        <span
          style={{ cursor: 'pointer', color: showSidebar ? 'var(--fg-subtle)' : '#818cf8' }}
          onClick={onToggleSidebar}
          title="Toggle sidebar ⌘B"
        >
          ⌘B sidebar
        </span>
        <span
          style={{ cursor: 'pointer', color: showRightPanel ? 'var(--fg-subtle)' : '#818cf8' }}
          onClick={onToggleRightPanel}
          title="Toggle right panel ⌘⇧B"
        >
          ⌘⇧B panel
        </span>
        <span>⌘K palette</span>
        <span>⌘⇧P pause</span>
        <span>⌘⇧R resume</span>
      </div>
    </div>
  );
}
