import { useEffect } from 'react';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';
import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';

export function useGlobalShortcuts() {
  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        // Cmd+Shift+P → Pause active task
        await register('CommandOrControl+Shift+P', () => {
          if (!mounted) return;
          const state = useTaskStore.getState();
          const active = state.tasks.find((t) => t.status === 'active');
          if (active) {
            useContextPackStore.getState().takeSnapshot(active.id);
            state.setTaskStatus(active.id, 'paused');
          }
        });

        // Cmd+Shift+R → Resume paused/selected task
        await register('CommandOrControl+Shift+R', () => {
          if (!mounted) return;
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

        // Cmd+1~9 → Switch to task N
        for (let n = 1; n <= 9; n++) {
          await register(`CommandOrControl+${n}`, () => {
            if (!mounted) return;
            const state = useTaskStore.getState();
            const nonDone = state.tasks.filter((t) => t.status !== 'done');
            const target = nonDone[n - 1];
            if (target) {
              state.setActiveTask(target.id);
            }
          });
        }
      } catch (err) {
        console.warn('Failed to register global shortcuts:', err);
      }
    };

    setup();

    return () => {
      mounted = false;
      unregisterAll().catch(() => {});
    };
  }, []);
}
