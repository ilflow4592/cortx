/**
 * Claude stream-json 원본 이벤트를 UI 확장 로그에 표시하기 위한 순수 포매터.
 *
 * `ClaudeEventProcessor.dispatch`는 assistant 텍스트만 Message.content로 추출하고
 * tool_use / tool_result / thinking 등은 버린다. 로그 확장 뷰는 버퍼에 저장된
 * raw 이벤트를 여기서 분류·요약한다.
 */
import type { RawEvent, RawEventKind } from './types';

interface AssistantBlock {
  type?: string;
  name?: string;
  input?: unknown;
  text?: string;
  content?: unknown;
  thinking?: string;
  tool_use_id?: string;
}

interface UserBlock {
  type?: string;
  content?: unknown;
  tool_use_id?: string;
}

/**
 * Parsed stream-json 이벤트에서 사용자에게 노출할 주 분류 키를 추출한다.
 * - `assistant` 이벤트의 content에 tool_use/thinking 블록이 섞여 있으면 해당 kind 우선
 * - `user` 이벤트의 content에 tool_result 블록이 있으면 `tool_result`로 분류
 * - 그 외에는 `type` 그대로 (알려지지 않은 타입은 'unknown')
 */
export function classifyEvent(parsed: unknown): RawEventKind {
  if (!parsed || typeof parsed !== 'object') return 'unknown';
  const obj = parsed as { type?: string; message?: { content?: unknown } };
  const type = obj.type;

  if (type === 'assistant' || type === 'user') {
    const content = obj.message?.content;
    if (Array.isArray(content)) {
      const blocks = content as AssistantBlock[];
      if (blocks.some((b) => b?.type === 'thinking')) return 'thinking';
      if (blocks.some((b) => b?.type === 'tool_use')) return 'tool_use';
      if (blocks.some((b) => (b as UserBlock)?.type === 'tool_result')) return 'tool_result';
    }
    return type === 'assistant' ? 'assistant' : 'tool_result';
  }

  switch (type) {
    case 'system':
    case 'result':
    case 'error':
    case 'content_block_delta':
      return type;
    default:
      return 'unknown';
  }
}

export interface EventSummary {
  /** 상단에 한 줄로 표시할 라벨 (예: "tool_use: Bash — ls -la") */
  label: string;
  /** 펼쳤을 때 preview 용 본문 (전체 JSON과 별개의 요약) */
  detail?: string;
  /** Pretty-printed JSON (collapsible body) */
  pretty: string;
}

/**
 * RawEvent 하나를 라벨/요약/pretty-JSON으로 변환. UI 렌더러가 이를 그대로 사용한다.
 */
export function summarizeEvent(ev: RawEvent): EventSummary {
  const pretty = prettify(ev);

  if (ev.kind === 'tool_use') {
    const block = findBlock(ev.parsed, 'tool_use');
    const name = typeof block?.name === 'string' ? block.name : 'tool';
    const input = block?.input as Record<string, unknown> | undefined;
    return {
      label: `tool_use · ${name}`,
      detail: summarizeToolInput(name, input),
      pretty,
    };
  }

  if (ev.kind === 'tool_result') {
    const block = findBlock(ev.parsed, 'tool_result');
    const content = block?.content;
    const text = extractResultText(content);
    return {
      label: 'tool_result',
      detail: text ? truncate(text, 200) : undefined,
      pretty,
    };
  }

  if (ev.kind === 'thinking') {
    const block = findBlock(ev.parsed, 'thinking');
    const text = typeof block?.thinking === 'string' ? block.thinking : '';
    return {
      label: 'thinking',
      detail: text ? truncate(text, 200) : undefined,
      pretty,
    };
  }

  if (ev.kind === 'system') {
    const obj = ev.parsed as { subtype?: string; session_id?: string } | undefined;
    const subtype = obj?.subtype ? ` · ${obj.subtype}` : '';
    return { label: `system${subtype}`, pretty };
  }

  if (ev.kind === 'result') {
    const obj = ev.parsed as
      | { total_cost_usd?: number; usage?: { input_tokens?: number; output_tokens?: number } }
      | undefined;
    const parts: string[] = [];
    if (obj?.usage) {
      parts.push(`in=${obj.usage.input_tokens ?? 0}, out=${obj.usage.output_tokens ?? 0}`);
    }
    if (typeof obj?.total_cost_usd === 'number') {
      parts.push(`$${obj.total_cost_usd.toFixed(4)}`);
    }
    return {
      label: parts.length ? `result · ${parts.join(' · ')}` : 'result',
      pretty,
    };
  }

  if (ev.kind === 'error') {
    return { label: 'error', pretty };
  }

  if (ev.kind === 'content_block_delta') {
    const obj = ev.parsed as { delta?: { text?: string } } | undefined;
    const text = obj?.delta?.text ?? '';
    return { label: 'delta', detail: text ? truncate(text, 80) : undefined, pretty };
  }

  if (ev.kind === 'assistant') {
    return { label: 'assistant (text)', pretty };
  }

  if (ev.kind === 'plain') {
    return { label: 'plain', detail: truncate(ev.raw, 120), pretty: ev.raw };
  }

  return { label: 'unknown', pretty };
}

/**
 * Tailwind 없이 쓸 수 있도록 칩 색상을 kind별로 고정 반환.
 */
export function colorForKind(kind: RawEventKind): { bg: string; fg: string; border: string } {
  switch (kind) {
    case 'tool_use':
      return { bg: 'rgba(59, 130, 246, 0.15)', fg: '#60a5fa', border: '#3b82f6' };
    case 'tool_result':
      return { bg: 'rgba(34, 197, 94, 0.15)', fg: '#4ade80', border: '#22c55e' };
    case 'thinking':
      return { bg: 'rgba(168, 85, 247, 0.15)', fg: '#c084fc', border: '#a855f7' };
    case 'error':
      return { bg: 'rgba(239, 68, 68, 0.15)', fg: '#f87171', border: '#ef4444' };
    case 'system':
    case 'result':
      return { bg: 'rgba(148, 163, 184, 0.15)', fg: '#cbd5e1', border: '#64748b' };
    default:
      return { bg: 'rgba(100, 116, 139, 0.12)', fg: '#94a3b8', border: '#475569' };
  }
}

function prettify(ev: RawEvent): string {
  if (ev.parsed === undefined) return ev.raw;
  try {
    return JSON.stringify(ev.parsed, null, 2);
  } catch {
    return ev.raw;
  }
}

function findBlock(parsed: unknown, blockType: string): AssistantBlock | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const content = (parsed as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return undefined;
  return (content as AssistantBlock[]).find((b) => b?.type === blockType);
}

function summarizeToolInput(name: string, input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  const cmd = typeof input.command === 'string' ? input.command : undefined;
  const filePath = typeof input.file_path === 'string' ? input.file_path : undefined;
  const pattern = typeof input.pattern === 'string' ? input.pattern : undefined;
  const description = typeof input.description === 'string' ? input.description : undefined;

  if (name === 'Bash' || name === 'bash') return cmd ? truncate(cmd, 200) : undefined;
  if (name === 'Read' || name === 'Edit' || name === 'Write') return filePath;
  if (name === 'Grep' || name === 'Glob') return pattern ? truncate(pattern, 120) : undefined;
  if (name === 'Agent') return description ? truncate(description, 160) : undefined;
  return undefined;
}

function extractResultText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = (content as Array<{ type?: string; text?: string }>)
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text!);
    if (parts.length > 0) return parts.join('\n');
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}
