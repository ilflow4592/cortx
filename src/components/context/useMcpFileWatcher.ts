/**
 * `~/.claude.json`을 1초 간격으로 폴링해 MCP 설정 변경 시 서버 목록 리로드.
 *
 * Claude `/mcp` 커맨드가 파일을 수정하면 자동 반영된다. mtime만 비교하므로
 * 비용이 낮고, 변경 감지 후에도 full 헬스체크는 건너뛰고 config-only fast path.
 */
import { useEffect } from 'react';
import { useContextPackStore, type McpServerStatus } from '../../stores/contextPackStore';
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

export function useMcpFileWatcher(projectCwd: string): void {
  useEffect(() => {
    if (!projectCwd) return;
    let lastMtime = '';

    const interval = setInterval(async () => {
      try {
        const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
          cwd: '/',
          command: 'stat -f "%m" ~/.claude.json 2>/dev/null',
        });
        if (!result.success || result.output.trim() === lastMtime) return;

        // 첫 틱은 baseline 기록만 — 실제 변경이 아님
        if (lastMtime === '') {
          lastMtime = result.output.trim();
          return;
        }

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
        useContextPackStore.setState({ mcpServers: statuses });
        lastMtime = result.output.trim();
      } catch {
        /* ignore */
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [projectCwd]);
}
