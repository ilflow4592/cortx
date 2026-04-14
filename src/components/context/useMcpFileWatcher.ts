/**
 * `~/.claude.json` 변경을 Tauri plugin-fs `watch`로 구독해 MCP 목록 자동 갱신.
 *
 * 이전엔 1초마다 `stat -f "%m"` shell 호출로 mtime을 폴링했지만, Tauri의
 * FS watcher는 OS 네이티브 이벤트(kqueue/inotify/ReadDirectoryChangesW)를 받아
 * CPU 오버헤드를 거의 0으로 낮춘다. 변경 후에도 헬스체크는 건너뛰고 config-only
 * fast path로 서버 목록만 재하이드레이트.
 */
import { useEffect } from 'react';
import { useMcpStore, type McpServerStatus } from '../../stores/mcpStore';
import { detectServiceType } from '../../config/searchResources';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

interface RawMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  server_type: string;
  url: string;
  source: string;
  disabled: boolean;
}

async function reloadConfigFast(projectCwd: string) {
  try {
    const servers = await invoke<RawMcpServer[]>('list_mcp_servers', {
      projectCwd: projectCwd || null,
    });
    const statuses: McpServerStatus[] = servers.map((s) => ({
      name: s.name,
      command: s.command,
      args: s.args || [],
      env: s.env || {},
      status: (s.disabled ? 'unknown' : 'ready') as McpServerStatus['status'],
      authUrl: '',
      serviceType: detectServiceType(s.name),
      source: s.source || 'global',
      disabled: s.disabled || false,
    }));
    useMcpStore.getState().setServers(statuses);
  } catch {
    /* ignore */
  }
}

export function useMcpFileWatcher(projectCwd: string): void {
  useEffect(() => {
    if (!projectCwd) return;

    // Tauri plugin-fs API는 dynamic import (CLAUDE.md 규칙)
    let unwatch: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { watch, BaseDirectory } = await import('@tauri-apps/plugin-fs');
        // 300ms debounce — /mcp 명령이 파일을 연속 수정할 때 burst 방지
        const un = await watch(
          '.claude.json',
          () => {
            if (!cancelled) reloadConfigFast(projectCwd);
          },
          { baseDir: BaseDirectory.Home, delayMs: 300 },
        );
        if (cancelled) un();
        else unwatch = un;
      } catch {
        /* 권한/환경 문제 시 조용히 skip — stale 가능성만 남고 기능 영향 없음 */
      }
    })();

    return () => {
      cancelled = true;
      unwatch?.();
    };
  }, [projectCwd]);
}
