/**
 * SidebarHeader — drag region (Tauri window) + 오늘 날짜 + "Tasks" 라벨.
 *
 * Sidebar 최상단 영역. 더블클릭으로 윈도우 maximize 토글, 드래그로 윈도우 이동.
 * Tauri API는 CLAUDE.md 규칙에 따라 동적 import.
 */
export function SidebarHeader() {
  return (
    <div
      className="sb-header"
      onMouseDown={async (e) => {
        if (e.buttons === 1 && (e.target as HTMLElement).tagName !== 'BUTTON') {
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().startDragging();
          } catch {
            /* ignore */
          }
        }
      }}
      onDoubleClick={async (e) => {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const w = getCurrentWindow();
          if (await w.isMaximized()) await w.unmaximize();
          else await w.maximize();
        } catch {
          /* ignore */
        }
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-primary)' }}>
        {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' })}
      </span>
      <span className="sb-title" style={{ fontSize: 10 }}>
        Tasks
      </span>
    </div>
  );
}
