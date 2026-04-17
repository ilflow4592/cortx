import { describe, it, expect } from 'vitest';
import { stripMarkers, extractMarkers, isQuestion, BUILTIN_PHASE_KEYS } from '../../src/utils/pipeline-exec/_shared';

describe('stripMarkers', () => {
  it('removes all PIPELINE markers', () => {
    const text = '[PIPELINE:dev_plan:in_progress]hello[PIPELINE:done:done]';
    expect(stripMarkers(text)).toBe('hello');
  });

  it('leaves non-marker text untouched', () => {
    expect(stripMarkers('plain text')).toBe('plain text');
  });

  it('trims leading whitespace after stripping', () => {
    expect(stripMarkers('[PIPELINE:x:y]\n\n  content')).toBe('content');
  });
});

describe('extractMarkers', () => {
  it('extracts valid markers for builtin phase set', () => {
    const text = '[PIPELINE:dev_plan:in_progress][PIPELINE:implement:done:custom memo]';
    const markers = extractMarkers(text, BUILTIN_PHASE_KEYS);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ phase: 'dev_plan', status: 'in_progress' });
    expect(markers[1]).toMatchObject({ phase: 'implement', status: 'done', memo: 'custom memo' });
  });

  it('rejects unknown phase for builtin set', () => {
    const text = '[PIPELINE:unknown_phase:done]';
    expect(extractMarkers(text, BUILTIN_PHASE_KEYS)).toEqual([]);
  });

  it('accepts custom phase ids from caller-provided set', () => {
    const customSet = new Set(['design', 'code', 'ship']);
    const text = '[PIPELINE:design:in_progress][PIPELINE:dev_plan:done]';
    const markers = extractMarkers(text, customSet);
    expect(markers).toHaveLength(1);
    expect(markers[0].phase).toBe('design');
  });

  it('rejects invalid status', () => {
    const text = '[PIPELINE:dev_plan:broken]';
    expect(extractMarkers(text, BUILTIN_PHASE_KEYS)).toEqual([]);
  });
});

describe('isQuestion', () => {
  it('detects trailing question mark', () => {
    expect(isQuestion('Shall we proceed?')).toBe(true);
    expect(isQuestion('진행할까요?')).toBe(true);
  });

  it('detects Korean honorific endings', () => {
    expect(isQuestion('이대로 진행해도 괜찮을까요')).toBe(true);
    expect(isQuestion('어떤가요')).toBe(true);
  });

  it('detects English confirmation phrases at end of text', () => {
    expect(isQuestion('Please confirm.')).toBe(true);
    expect(isQuestion('Shall we proceed? Should we')).toBe(true);
  });

  it('detects Q1./Q2. grill-me format', () => {
    expect(isQuestion('여러 질문 중\n\n**Q3.** 마지막 질문인가요?')).toBe(true);
  });

  it('returns false for non-questions', () => {
    expect(isQuestion('구현을 완료했습니다.')).toBe(false);
  });
});

describe('BUILTIN_PHASE_KEYS', () => {
  it('contains all 7 builtin phases', () => {
    expect(BUILTIN_PHASE_KEYS.size).toBe(7);
    for (const p of ['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done']) {
      expect(BUILTIN_PHASE_KEYS.has(p)).toBe(true);
    }
  });
});
