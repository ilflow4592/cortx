import { useTaskStore } from '../stores/taskStore';
import { formatTime } from '../utils/time';

export function StatusBar({ showSidebar, onToggleSidebar, showRightPanel, onToggleRightPanel }: {
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
  showRightPanel?: boolean;
  onToggleRightPanel?: () => void;
}) {
  const { tasks, activeTaskId } = useTaskStore();
  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const totalFocus = tasks.reduce((s, t) => s + t.elapsedSeconds, 0);
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="statusbar">
      <div className="sb-l">
        {activeTask ? (
          <span className="sb-active-tag"><span className="dot" />{activeTask.title}</span>
        ) : (
          <span style={{ color: '#3d4856' }}>No active task</span>
        )}
      </div>
      <div className="sb-r">
        <span style={{ cursor: 'pointer', color: showSidebar ? '#52525b' : '#818cf8' }} onClick={onToggleSidebar} title="Toggle sidebar ⌘B">⌘B sidebar</span>
        <span style={{ cursor: 'pointer', color: showRightPanel ? '#52525b' : '#818cf8' }} onClick={onToggleRightPanel} title="Toggle right panel ⌘⇧B">⌘⇧B panel</span>
        <span>⌘⇧P pause</span>
        <span>⌘⇧R resume</span>
      </div>
    </div>
  );
}
