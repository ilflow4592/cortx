/**
 * Built-in slash commands handled locally (no Claude CLI dispatch).
 *
 * useClaudeSession에서 switch 블록으로 존재하던 7종 커맨드를 Map 기반으로 추출.
 * 각 핸들러는 훅 로컬 상태에 접근해야 하므로 `BuiltinCommandContext`로 주입한다.
 */
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { isClaudeActiveInTerminal } from '../../utils/terminalState';
import { messageCache, sessionCache, loadingCache } from '../../utils/chatState';
import { useTaskStore } from '../../stores/taskStore';
import { PHASE_NAMES, PHASE_ORDER } from '../../constants/pipeline';
import type { PipelinePhase } from '../../types/task';
import type { Message, SlashCommand } from './types';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

const BUILTIN_COMMANDS = ['mcp', 'clear', 'cost', 'help', 'model', 'status'] as const;
type BuiltinCommandName = (typeof BUILTIN_COMMANDS)[number];

export function isBuiltinCommand(name: string): name is BuiltinCommandName {
  return (BUILTIN_COMMANDS as readonly string[]).includes(name);
}

export interface BuiltinCommandContext {
  taskId: string;
  cwd: string;
  cmd: string;
  slashCommands: SlashCommand[];
  loading: boolean;
  messagesRef: MutableRefObject<Message[]>;
  claudeSessionIdRef: MutableRefObject<string>;
  currentReqIdRef: MutableRefObject<string>;
  unlistenRefs: MutableRefObject<Array<() => void>>;
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setLoading: (v: boolean) => void;
  /** 사용자 입력 메시지 + 시스템 응답 메시지를 메시지 리스트에 append */
  sysMsg: (content: string) => void;
  onSwitchTab?: (tab: string) => void;
}

type BuiltinHandler = (ctx: BuiltinCommandContext) => Promise<void>;

const handlers: Record<BuiltinCommandName, BuiltinHandler> = {
  mcp: async ({ taskId, onSwitchTab }) => {
    const ptyId = `term-${taskId}`;
    onSwitchTab?.('terminal');
    // 터미널에 이미 Claude가 떠 있으면 `/mcp`만, 아니면 `claude /mcp`로 시작
    const claudeRunning = isClaudeActiveInTerminal(taskId);
    const mcpCmd = claudeRunning ? '/mcp\r' : 'claude /mcp\r';
    // 터미널 마운트/PTY 준비 대기
    setTimeout(() => {
      invoke('pty_write', { id: ptyId, data: mcpCmd }).catch(() => {});
    }, 300);
  },

  clear: async ({
    taskId,
    loading,
    currentReqIdRef,
    unlistenRefs,
    setLoading,
    setMessages,
    claudeSessionIdRef,
  }) => {
    if (loading && currentReqIdRef.current) {
      invoke('claude_stop', { id: currentReqIdRef.current }).catch(() => {});
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    }
    setLoading(false);
    setMessages([]);
    messageCache.set(taskId, []);
    loadingCache.delete(taskId);
    sessionCache.delete(taskId);
    claudeSessionIdRef.current = '';
    useTaskStore
      .getState()
      .updateTask(taskId, { status: 'waiting', pipeline: undefined, elapsedSeconds: 0 });
  },

  cost: async ({ taskId, sysMsg }) => {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    if (!task?.pipeline?.enabled) {
      sysMsg('No pipeline active — token tracking is only available during pipeline runs.');
      return;
    }
    const phases = task.pipeline.phases;
    let totalIn = 0;
    let totalOut = 0;
    let totalCost = 0;
    const rows = PHASE_ORDER.filter((p) => phases[p]?.inputTokens || phases[p]?.outputTokens).map((p) => {
      const e = phases[p]!;
      const inT = e.inputTokens || 0;
      const outT = e.outputTokens || 0;
      const cost = e.costUsd || 0;
      totalIn += inT;
      totalOut += outT;
      totalCost += cost;
      return `| ${PHASE_NAMES[p]} | ${inT.toLocaleString()} | ${outT.toLocaleString()} | $${cost.toFixed(4)} |`;
    });
    if (rows.length === 0) {
      sysMsg('No token usage recorded yet.');
      return;
    }
    sysMsg(
      `| Phase | Input | Output | Cost |\n|---|---|---|---|\n${rows.join('\n')}\n| **Total** | **${totalIn.toLocaleString()}** | **${totalOut.toLocaleString()}** | **$${totalCost.toFixed(4)}** |`,
    );
  },

  help: async ({ slashCommands, sysMsg }) => {
    const builtinHelp = [
      '`/mcp` — Show configured MCP servers',
      '`/clear` — Clear chat messages',
      '`/cost` — Show token usage per pipeline phase',
      '`/help` — Show this help',
      '`/model` — Show current model',
      '`/status` — Show session status',
    ];
    const pipelineCmds = slashCommands
      .filter((c) => c.name.startsWith('pipeline:'))
      .map((c) => `\`/${c.name}\` — ${c.description}`);
    const customCmds = slashCommands
      .filter((c) => c.source !== 'builtin' && !c.name.startsWith('pipeline:'))
      .map((c) => `\`/${c.name}\` — ${c.description}`);

    let content = `**Built-in Commands**\n${builtinHelp.join('\n')}`;
    if (pipelineCmds.length > 0) content += `\n\n**Pipeline Commands**\n${pipelineCmds.join('\n')}`;
    if (customCmds.length > 0) content += `\n\n**Custom Commands**\n${customCmds.join('\n')}`;
    sysMsg(content);
  },

  model: async ({ taskId, sysMsg }) => {
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    const isImpl = task?.pipeline?.phases?.implement?.status === 'in_progress';
    const model = isImpl ? 'claude-sonnet-4-6 (Implement phase)' : 'claude-opus-4-6 (default)';
    sysMsg(`**Current model:** ${model}`);
  },

  status: async ({ taskId, cwd, claudeSessionIdRef, messagesRef, sysMsg }) => {
    const hasSession = !!(claudeSessionIdRef.current || sessionCache.get(taskId));
    const msgCount = messagesRef.current.length;
    const task = useTaskStore.getState().tasks.find((t) => t.id === taskId);
    const pipelineStatus = task?.pipeline?.enabled
      ? PHASE_ORDER.find((p) => task.pipeline!.phases[p]?.status === 'in_progress') || 'idle'
      : 'disabled';
    sysMsg(
      `**Session:** ${hasSession ? 'active' : 'none'}\n` +
        `**Messages:** ${msgCount}\n` +
        `**Pipeline:** ${pipelineStatus === 'disabled' ? 'disabled' : `active (${PHASE_NAMES[pipelineStatus as PipelinePhase] || pipelineStatus})`}\n` +
        `**CWD:** ${cwd || '/'}`,
    );
  },
};

/**
 * built-in 커맨드면 처리하고 `true`, 아니면 `false`를 반환.
 * 호출자는 `false`일 때 slash command 파일 해석 또는 일반 메시지로 진행한다.
 */
export async function handleBuiltinCommand(ctx: BuiltinCommandContext): Promise<boolean> {
  if (!isBuiltinCommand(ctx.cmd)) return false;
  await handlers[ctx.cmd](ctx);
  return true;
}
