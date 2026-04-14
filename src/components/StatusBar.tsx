import { useTaskStore } from '../stores/taskStore';
import { useLayoutStore } from '../stores/layoutStore';
import { useT } from '../i18n';

export function StatusBar() {
  const { tasks, activeTaskId } = useTaskStore();
  const activeTask = tasks.find((task) => task.id === activeTaskId);
  const { showSidebar, showRightPanel, toggleSidebar, toggleRightPanel } = useLayoutStore();
  const t = useT();

  return (
    <div className="statusbar">
      <div className="sb-l">
        {activeTask ? (
          <span className="sb-active-tag">
            <span className="dot" />
            {activeTask.title}
          </span>
        ) : (
          <span style={{ color: 'var(--fg-dim)' }}>{t('empty.noActiveTask')}</span>
        )}
      </div>
      <div className="sb-r">
        <span
          style={{ cursor: 'pointer', color: showSidebar ? 'var(--fg-subtle)' : '#818cf8' }}
          onClick={toggleSidebar}
          title="Toggle sidebar ⌘B"
        >
          ⌘B {t('status.sidebar')}
        </span>
        <span
          style={{ cursor: 'pointer', color: showRightPanel ? 'var(--fg-subtle)' : '#818cf8' }}
          onClick={toggleRightPanel}
          title="Toggle right panel ⌘⇧B"
        >
          ⌘⇧B {t('status.panel')}
        </span>
        <span>⌘K {t('status.palette')}</span>
        <span>⌘⇧P {t('status.pause')}</span>
        <span>⌘⇧R {t('status.resume')}</span>
      </div>
    </div>
  );
}
