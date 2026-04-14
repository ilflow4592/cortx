/**
 * Tauri 네이티브 파일 드롭 핸들러 — 드래그 중 상태 + 드롭 시 pin 추가.
 *
 * Tauri 외부 환경에서는 `getCurrentWindow`가 실패하므로 silent skip.
 */
import { useEffect, useState } from 'react';
import { useContextPackStore } from '../../stores/contextPackStore';
import type { ContextItem } from '../../types/contextPack';

export function useFileDropHandler(taskId: string) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let lastDropTime = 0;

    import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => {
        getCurrentWindow()
          .onDragDropEvent((event) => {
            const payload = event.payload as { type: string; paths?: string[] };
            if (payload.type === 'enter' || payload.type === 'over') {
              setIsDragging(true);
              return;
            }
            if (payload.type === 'drop') {
              setIsDragging(false);
              // 동일 드롭이 500ms 내 반복되면 무시 (Tauri 중복 이벤트 방지)
              const now = Date.now();
              if (now - lastDropTime < 500) return;
              lastDropTime = now;

              const paths = payload.paths || [];
              const store = useContextPackStore.getState();
              const existing = store.items[taskId] || [];
              for (const filePath of paths) {
                if (existing.some((item) => item.url === filePath)) continue;
                const fileName = filePath.split('/').pop() || filePath;
                store.addPin(taskId, {
                  id: `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
                  sourceType: 'pin',
                  title: fileName,
                  url: filePath,
                  summary: `File · ${filePath}`,
                  timestamp: new Date().toISOString(),
                  isNew: false,
                  category: 'pinned',
                } as ContextItem);
              }
              return;
            }
            setIsDragging(false);
          })
          .then((fn) => {
            unlisten = fn;
          });
      })
      .catch(() => {
        /* Not in Tauri context */
      });

    return () => {
      unlisten?.();
    };
  }, [taskId]);

  return isDragging;
}
