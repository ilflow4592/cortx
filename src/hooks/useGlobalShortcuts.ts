/**
 * @module hooks/useGlobalShortcuts
 * Tauri 전역 키보드 단축키 등록.
 * OS 레벨에서 동작하므로 앱이 포커스되지 않아도 작동한다.
 * Tauri plugin을 동적 import하여 webview 초기화 충돌을 방지한다.
 */

import { useTaskStore } from '../stores/taskStore';
import { useContextPackStore } from '../stores/contextPackStore';

/**
 * 전역 단축키를 등록한다.
 * - Cmd/Ctrl+Shift+P: 현재 활성 작업을 일시정지 (스냅샷 저장 후 pause)
 * - Cmd/Ctrl+Shift+R: 선택된 작업을 재개 (delta 감지 후 resume)
 * - Cmd/Ctrl+1~9: 목록에서 n번째 미완료 작업을 선택
 */
export async function registerShortcuts() {
  try {
    // Dynamic import — Tauri API는 정적 import 시 webview 초기화 전에 실행되어 오류 발생
    const { register } = await import('@tauri-apps/plugin-global-shortcut');

    // 작업 일시정지: 컨텍스트 스냅샷을 찍고 상태를 paused로 변경
    await register('CommandOrControl+Shift+P', () => {
      const state = useTaskStore.getState();
      const active = state.tasks.find((t) => t.status === 'active');
      if (active) {
        useContextPackStore.getState().takeSnapshot(active.id);
        state.setTaskStatus(active.id, 'paused');
      }
    });

    // 작업 재개: paused → active (delta 감지 포함), waiting → active (최초 시작)
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

    // Cmd/Ctrl+1~9: 미완료 작업 목록에서 n번째 작업을 빠르게 선택
    for (let n = 1; n <= 9; n++) {
      await register(`CommandOrControl+${n}`, () => {
        const state = useTaskStore.getState();
        const nonDone = state.tasks.filter((t) => t.status !== 'done');
        const target = nonDone[n - 1];
        if (target) state.setActiveTask(target.id);
      });
    }
  } catch (err) {
    // 브라우저 개발 환경 등 Tauri가 없는 경우 graceful fallback
    console.warn('Global shortcuts not available:', err);
  }
}
