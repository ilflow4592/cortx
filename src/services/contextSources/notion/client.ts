/**
 * Notion MCP 호출 단일 진실 공급원.
 *
 * Claude CLI를 통해 Notion MCP 서버(`mcp__notion__*`)를 호출하는 모든 경로의
 * 공통 래퍼. 플래그/타임아웃/모델/에러 로깅을 한 곳에서 관리해 호출부마다
 * 다르게 튜닝되는 drift를 방지한다.
 *
 * OAuth Notion MCP 사용자의 경우 인증 토큰이 Claude CLI 내부에 보관돼 있어
 * cortx가 직접 Notion REST API를 호출할 수 없다 → Claude subprocess 경로 필수.
 */

import { runShell } from '../../../utils/pipeline-exec/runShell';

const DEFAULT_MAX_TURNS = 6;
const DEFAULT_TIMEOUT_SEC = 60;
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

export interface McpCallOptions {
  /** Claude에게 보낼 프롬프트 (URL/키워드 등 inline). */
  prompt: string;
  /** --allowedTools 인자 (single-quote로 감싼 패턴 또는 빈 문자열). */
  toolFilter: string;
  /** Claude max-turns. default 6 (검색+fetch 체이닝 여유). */
  maxTurns?: number;
  /** Shell timeout 초. default 60. */
  timeoutSec?: number;
  /** Claude 모델. default Haiku. */
  model?: string;
}

export interface McpCallResult {
  /** Claude stdout (trim됨). null = 실패. */
  output: string | null;
  /** stderr 로그 파일 경로. 디버깅용. */
  stderrPath: string;
}

/** Single-quote 이스케이프 (shell 명령 안전 결합). */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Claude CLI + Notion MCP 호출. 표준 플래그 적용 후 stdout 반환.
 * - timeout으로 hang 방지
 * - bypassPermissions로 권한 프롬프트 회피
 * - stderr를 임시 파일로 분리 (실패 시 진단)
 */
export async function callNotionMcp(opts: McpCallOptions): Promise<McpCallResult> {
  const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS;
  const timeoutSec = opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const model = opts.model ?? DEFAULT_MODEL;
  const stderrPath = `/tmp/cortx-notion-mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.err`;

  const cmd = [
    `timeout ${timeoutSec}`,
    'claude',
    '-p',
    shellEscape(opts.prompt),
    '--max-turns',
    String(maxTurns),
    '--allowedTools',
    opts.toolFilter,
    '--permission-mode',
    'bypassPermissions',
    '--model',
    model,
    `2>${stderrPath}`,
  ].join(' ');

  const result = await runShell(cmd);
  if (!result.success || !result.output?.trim()) {
    return { output: null, stderrPath };
  }
  return { output: result.output.trim(), stderrPath };
}
