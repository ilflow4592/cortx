/**
 * Agent registry — 내장 23종 + `~/.claude/agents/*.md` 커스텀 머지.
 * 내장은 constants/agentRegistry.ts (static), 커스텀은 Rust list_claude_agents 로 스캔.
 */
import type { ClaudeAgentEntry } from '../types/customPipeline';
import type { ClaudeAgent } from '../types/generated/ClaudeAgent';
import { BUILTIN_AGENTS } from '../constants/agentRegistry';
import { logger } from '../utils/logger';

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke<T>(cmd, args);
}

let cache: ClaudeAgentEntry[] | null = null;

/**
 * 전체 agent 목록. 내장이 먼저, 그 뒤에 사용자 커스텀.
 * 동일 subagentType 이 커스텀에 있으면 내장을 가리지 않고 별도로 표시 (구분 위해 isCustom=true).
 */
export async function listAgents(): Promise<ClaudeAgentEntry[]> {
  if (cache) return cache;
  const builtins = BUILTIN_AGENTS;
  let customs: ClaudeAgentEntry[] = [];
  try {
    const raw = await invoke<ClaudeAgent[]>('list_claude_agents');
    customs = raw.map((a) => ({
      subagentType: a.subagentType,
      displayName: a.displayName,
      description: a.description,
      icon: '🤖',
      filePath: a.filePath,
      isCustom: true,
    }));
  } catch (e) {
    logger.error('listAgents (custom scan) failed:', e);
  }
  cache = [...builtins, ...customs];
  return cache;
}

export function invalidateAgentCache(): void {
  cache = null;
}

/**
 * 커스텀 agent 본문 읽기 (편집 모달용). 내장은 불가 (throw).
 */
export async function readAgentBody(subagentType: string, isCustom: boolean): Promise<string> {
  if (!isCustom) {
    throw new Error(`Builtin agent has no editable body: ${subagentType}`);
  }
  return invoke<string>('read_claude_agent', { name: subagentType });
}
