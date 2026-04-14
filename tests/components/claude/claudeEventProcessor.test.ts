import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeEventProcessor, type ClaudeEventProcessorContext } from '../../../src/components/claude/claudeEventProcessor';
import type { Message } from '../../../src/components/claude/types';

function makeCtx(): { ctx: ClaudeEventProcessorContext; messages: Message[]; errors: string[]; sessionRef: { current: string } } {
  const messages: Message[] = [];
  const errors: string[] = [];
  const sessionRef = { current: '' };
  const ctx: ClaudeEventProcessorContext = {
    taskId: 't1',
    reqId: 'req-1',
    activityId: 'req-1-activity',
    setMessages: (action) => {
      const next = typeof action === 'function' ? action(messages) : action;
      messages.length = 0;
      messages.push(...next);
    },
    setError: (msg) => errors.push(msg),
    claudeSessionIdRef: sessionRef as { current: string },
    processMarkers: (text) => text, // identity — 마커 처리는 별도 테스트
  };
  return { ctx, messages, errors, sessionRef };
}

describe('ClaudeEventProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures session_id from system init event', () => {
    const { ctx, sessionRef } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-abc' }));
    expect(sessionRef.current).toBe('sess-abc');
  });

  it('appends assistant text to single turn', () => {
    const { ctx, messages } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }));
    proc.process(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: ' world' }] } }));
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(messages[0].content).toBe('hello world');
  });

  it('content_block_delta extends current turn', () => {
    const { ctx, messages } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process(JSON.stringify({ type: 'content_block_delta', delta: { text: 'a' } }));
    proc.process(JSON.stringify({ type: 'content_block_delta', delta: { text: 'b' } }));
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('ab');
  });

  it('tool_use block resets currentMsgId so next text starts new turn', () => {
    const { ctx, messages } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'first' }] } }));
    proc.process(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'bash' }] } }));
    proc.process(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'second' }] } }));
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0].content).toBe('first');
    expect(assistantMessages[1].content).toBe('second');
  });

  it('error event calls setError with content', () => {
    const { ctx, errors } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process(JSON.stringify({ type: 'error', content: 'spawn failed' }));
    expect(errors).toEqual(['spawn failed']);
  });

  it('error event with no content uses default message', () => {
    const { ctx, errors } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process(JSON.stringify({ type: 'error' }));
    expect(errors[0]).toMatch(/Unknown error/);
  });

  it('result event adds final text only when different from response', () => {
    const { ctx, messages } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'partial' }] } }));
    proc.process(JSON.stringify({ type: 'result', result: 'partial' })); // 동일 → skip
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(1);

    proc.process(JSON.stringify({ type: 'result', result: 'final corrected' }));
    expect(messages.filter((m) => m.role === 'assistant')).toHaveLength(2);
    expect(messages[messages.length - 1].content).toBe('final corrected');
  });

  it('plain text fallback when JSON.parse fails', () => {
    const { ctx, messages } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    proc.process('not json at all');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toContain('not json at all');
  });

  it('hasContent returns false before any text, true after', () => {
    const { ctx } = makeCtx();
    const proc = new ClaudeEventProcessor(ctx);
    expect(proc.hasContent()).toBe(false);
    proc.process(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'x' }] } }));
    expect(proc.hasContent()).toBe(true);
  });
});
