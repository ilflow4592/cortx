import { describe, it, expect } from 'vitest';
import { buildVerifierPrompt, parseVerifierOutput } from '../../../src/components/claude/verifierLLM';

describe('buildVerifierPrompt', () => {
  it('includes rule and response in prompt', () => {
    const prompt = buildVerifierPrompt('근거가 제시되었는가?', 'B를 추천합니다.');
    expect(prompt).toContain('근거가 제시되었는가?');
    expect(prompt).toContain('B를 추천합니다.');
  });

  it('enforces output format', () => {
    const prompt = buildVerifierPrompt('x', 'y');
    expect(prompt).toContain('VERDICT:');
    expect(prompt).toContain('REASON:');
    expect(prompt).toContain('PASS|FAIL|INCONCLUSIVE');
  });

  it('truncates very long responses', () => {
    const longResponse = 'a'.repeat(10000);
    const prompt = buildVerifierPrompt('rule', longResponse);
    // Should not include all 10k chars — truncated to 4000
    expect(prompt.length).toBeLessThan(6000);
  });
});

describe('parseVerifierOutput', () => {
  it('parses PASS verdict', () => {
    const result = parseVerifierOutput('VERDICT: PASS\nREASON: 근거가 충분합니다.');
    expect(result.verdict).toBe('pass');
    expect(result.reason).toBe('근거가 충분합니다.');
  });

  it('parses FAIL verdict', () => {
    const result = parseVerifierOutput('VERDICT: FAIL\nREASON: 근거가 없습니다.');
    expect(result.verdict).toBe('fail');
    expect(result.reason).toBe('근거가 없습니다.');
  });

  it('parses INCONCLUSIVE verdict', () => {
    const result = parseVerifierOutput('VERDICT: INCONCLUSIVE\nREASON: 판단 불가.');
    expect(result.verdict).toBe('inconclusive');
  });

  it('returns inconclusive for malformed output', () => {
    const result = parseVerifierOutput('This is not formatted correctly.');
    expect(result.verdict).toBe('inconclusive');
    expect(result.reason).toContain('Malformed');
  });

  it('handles lowercase verdict', () => {
    const result = parseVerifierOutput('VERDICT: pass\nREASON: ok');
    expect(result.verdict).toBe('pass');
  });

  it('truncates very long reasons', () => {
    const longReason = 'x'.repeat(500);
    const result = parseVerifierOutput(`VERDICT: FAIL\nREASON: ${longReason}`);
    expect(result.reason.length).toBeLessThanOrEqual(200);
  });
});
