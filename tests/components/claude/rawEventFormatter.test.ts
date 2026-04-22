import { describe, it, expect } from 'vitest';
import { classifyEvent, summarizeEvent } from '../../../src/components/claude/rawEventFormatter';
import type { RawEvent } from '../../../src/components/claude/types';

function makeEvent(parsed: unknown): RawEvent {
  return {
    kind: classifyEvent(parsed),
    raw: JSON.stringify(parsed),
    parsed,
    timestamp: 0,
  };
}

describe('classifyEvent', () => {
  it('classifies tool_use blocks inside assistant event', () => {
    const parsed = {
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
    };
    expect(classifyEvent(parsed)).toBe('tool_use');
  });

  it('classifies thinking blocks inside assistant event', () => {
    const parsed = {
      type: 'assistant',
      message: { content: [{ type: 'thinking', thinking: 'hmm' }] },
    };
    expect(classifyEvent(parsed)).toBe('thinking');
  });

  it('classifies plain assistant text', () => {
    const parsed = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'hello' }] },
    };
    expect(classifyEvent(parsed)).toBe('assistant');
  });

  it('classifies user tool_result', () => {
    const parsed = {
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'out' }] },
    };
    expect(classifyEvent(parsed)).toBe('tool_result');
  });

  it('falls back to system/result/error', () => {
    expect(classifyEvent({ type: 'system', subtype: 'init' })).toBe('system');
    expect(classifyEvent({ type: 'result' })).toBe('result');
    expect(classifyEvent({ type: 'error', content: 'nope' })).toBe('error');
  });

  it('returns unknown for gibberish', () => {
    expect(classifyEvent(null)).toBe('unknown');
    expect(classifyEvent({ type: 'weird_unheard_of' })).toBe('unknown');
  });
});

describe('summarizeEvent', () => {
  it('summarizes tool_use with Bash command', () => {
    const ev = makeEvent({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }] },
    });
    const s = summarizeEvent(ev);
    expect(s.label).toBe('tool_use · Bash');
    expect(s.detail).toBe('ls -la');
    expect(s.pretty).toContain('"command": "ls -la"');
  });

  it('summarizes tool_result text content', () => {
    const ev = makeEvent({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'text', text: 'file listing' }] }],
      },
    });
    const s = summarizeEvent(ev);
    expect(s.label).toBe('tool_result');
    expect(s.detail).toBe('file listing');
  });

  it('summarizes result with usage and cost', () => {
    const ev = makeEvent({
      type: 'result',
      usage: { input_tokens: 100, output_tokens: 50 },
      total_cost_usd: 0.0123,
    });
    const s = summarizeEvent(ev);
    expect(s.label).toContain('in=100');
    expect(s.label).toContain('out=50');
    expect(s.label).toContain('$0.0123');
  });

  it('handles plain text fallback', () => {
    const ev: RawEvent = { kind: 'plain', raw: 'some non-json line', timestamp: 0 };
    const s = summarizeEvent(ev);
    expect(s.label).toBe('plain');
    expect(s.pretty).toBe('some non-json line');
  });
});
