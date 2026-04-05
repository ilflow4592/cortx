import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';

export async function registerShortcuts() {
  try {
    const { register } = await import('@tauri-apps/plugin-global-shortcut');

    await register('CommandOrControl+Shift+P', () => {
      const state = useTaskStore.getState();
      const active = state.tasks.find((t) => t.status === 'active');
      if (active) {
        useContextPackStore.getState().takeSnapshot(active.id);
        state.setTaskStatus(active.id, 'paused');
      }
    });

    await register('CommandOrControl+Shift+R', () => {
      const state = useTaskStore.getState();
      const activeId = state.activeTaskId;
      if (activeId) {
        const task = state.tasks.find((t) => t.id === activeId);
        if (task && task.status === 'paused') {
          useContextPackStore.getState().detectDelta(activeId, task.branchName);
          state.setTaskStatus(activeId, 'active');
        } else if (task && task.status === 'waiting') {
          state.startTask(activeId);
        }
      }
    });

    for (let n = 1; n <= 9; n++) {
      await register(`CommandOrControl+${n}`, () => {
        const state = useTaskStore.getState();
        const nonDone = state.tasks.filter((t) => t.status !== 'done');
        const target = nonDone[n - 1];
        if (target) state.setActiveTask(target.id);
      });
    }
  } catch (err) {
    console.warn('Global shortcuts not available:', err);
  }
}
