/**
 * MCP server status store — 컨텍스트 수집과 독립된 관심사.
 *
 * ~/.claude.json의 MCP 설정을 로드하고 라이브 헬스체크를 덧씌워
 * UI에 ready/auth-needed/unknown 상태를 노출한다. 비영속 (fresh load on start).
 *
 * 이전에는 contextPackStore에 섞여있었지만 (1) 수집 도메인과 무관하고,
 * (2) 동일 taskId slicing을 공유하지 않아 분리가 자연스럽다.
 */
import { create } from 'zustand';
import { detectServiceType } from '../config/searchResources';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

export interface McpServerStatus {
  name: string;
  command: string;
  args: string[];
  status: 'ready' | 'auth-needed' | 'unknown';
  authUrl?: string;
  serviceType: string;
  env: Record<string, string>;
  /** "project" | "local" | "global" | "claude.ai" | "built-in" */
  source: string;
  /** disabled in Claude Code settings */
  disabled: boolean;
}

/** 인증이 필요한 서비스만 별도 체크. 나머지는 레지스트리에 있으면 자동 ready */
const AUTH_CHECKS: Record<string, { cmd: string; authUrl: string }> = {
  github: { cmd: 'gh auth status 2>&1', authUrl: 'https://github.com/settings/tokens' },
};

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

interface McpState {
  servers: McpServerStatus[];
  loading: boolean;
  load: (projectCwd?: string) => Promise<void>;
  /** useMcpFileWatcher가 mtime 변경 감지 시 fast-path 업데이트 */
  setServers: (servers: McpServerStatus[]) => void;
}

async function checkAuth(authCmd: string): Promise<'ready' | 'auth-needed'> {
  try {
    const result = await invoke<{ success: boolean; output: string }>('run_shell_command', {
      cwd: '/',
      command: authCmd,
    });
    return result.success || result.output.includes('Logged in') || result.output.includes('ok')
      ? 'ready'
      : 'auth-needed';
  } catch {
    return 'auth-needed';
  }
}

function resolveApiKeyStatus(server: RawMcpServer, current: 'ready' | 'auth-needed' | 'unknown') {
  const hasEnv = Object.keys(server.env || {}).length > 0;
  const needsApiKey = ['tavily', 'brave', 'exa'].some((k) => server.name.toLowerCase().includes(k));
  return !hasEnv && needsApiKey && !server.disabled ? 'unknown' : current;
}

async function hydrateServer(server: RawMcpServer): Promise<McpServerStatus> {
  const serviceType = detectServiceType(server.name);
  const authKey = Object.keys(AUTH_CHECKS).find((k) => server.name.toLowerCase().includes(k));

  let status: 'ready' | 'auth-needed' | 'unknown' = 'ready';
  let authUrl = '';

  if (authKey) {
    const check = AUTH_CHECKS[authKey];
    authUrl = check.authUrl;
    status = await checkAuth(check.cmd);
  }
  status = resolveApiKeyStatus(server, status);

  return {
    name: server.name,
    command: server.command,
    args: server.args || [],
    env: server.env || {},
    status: server.disabled ? 'unknown' : status,
    authUrl,
    serviceType,
    source: server.source || 'global',
    disabled: server.disabled || false,
  };
}

/** 백그라운드 헬스체크 — `claude mcp list`로 실제 연결 상태를 덧씌움 */
async function overlayLiveStatus(current: McpServerStatus[], projectCwd?: string): Promise<McpServerStatus[]> {
  try {
    const healthResult = await invoke<{ success: boolean; output: string }>('run_shell_command', {
      cwd: projectCwd || '/',
      command: 'claude mcp list 2>/dev/null',
    });
    if (!healthResult.success || !healthResult.output) return current;

    const liveServers = new Map<string, 'ready' | 'unknown'>();
    for (const line of healthResult.output.split('\n')) {
      const connected = line.includes('✓ Connected');
      const failed = line.includes('✗ Failed');
      if (!connected && !failed) continue;
      const nameMatch = line.match(/^(.+?):\s/);
      if (!nameMatch) continue;
      liveServers.set(nameMatch[1].trim(), connected ? 'ready' : 'unknown');
    }
    return current.map((s) => {
      if (s.disabled) return s;
      if (liveServers.has(s.name)) return { ...s, status: liveServers.get(s.name)! };
      return s;
    });
  } catch {
    return current;
  }
}

/** 초기 state — 테스트 reset + 신규 필드 추가 시 단일 진실 공급원 */
export const MCP_INITIAL_STATE: Pick<McpState, 'servers' | 'loading'> = {
  servers: [],
  loading: false,
};

export const useMcpStore = create<McpState>((set) => ({
  ...MCP_INITIAL_STATE,

  setServers: (servers) => set({ servers }),

  load: async (projectCwd?: string) => {
    set({ loading: true });
    try {
      const raw = await invoke<RawMcpServer[]>('list_mcp_servers', { projectCwd: projectCwd || null });
      const statuses = await Promise.all(raw.map(hydrateServer));
      // config-based 결과를 즉시 노출 → 헬스체크는 background에서 덧씌움
      set({ servers: [...statuses], loading: false });
      overlayLiveStatus(statuses, projectCwd).then((updated) => set({ servers: updated }));
    } catch {
      set({ loading: false });
    }
  },
}));
