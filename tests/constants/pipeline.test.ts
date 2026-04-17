import { describe, it, expect } from 'vitest';
import { PHASE_KEYS, PHASE_ORDER, PHASE_NAMES, PHASE_MODELS } from '../../src/constants/pipeline';

describe('pipeline constants', () => {
  it('PHASE_ORDER has all 7 phases', () => {
    expect(PHASE_ORDER).toHaveLength(7);
    expect(PHASE_ORDER).toEqual(['grill_me', 'save', 'dev_plan', 'implement', 'commit_pr', 'review_loop', 'done']);
  });

  it('PHASE_KEYS set contains all order entries', () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_KEYS.has(phase)).toBe(true);
    }
    expect(PHASE_KEYS.size).toBe(PHASE_ORDER.length);
  });

  it('PHASE_NAMES has a label for every phase', () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_NAMES[phase]).toBeTruthy();
      expect(typeof PHASE_NAMES[phase]).toBe('string');
    }
  });

  it('PHASE_MODELS has a model for every phase', () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_MODELS[phase]).toBeTruthy();
    }
  });

  it('implement phase uses Sonnet model', () => {
    expect(PHASE_MODELS.implement).toBe('Sonnet');
  });

  it('grill_me/save use Opus (대화·요약 품질)', () => {
    expect(PHASE_MODELS.grill_me).toBe('Opus');
    expect(PHASE_MODELS.save).toBe('Opus');
  });

  it('dev_plan / implement / commit_pr / review_loop use Sonnet', () => {
    expect(PHASE_MODELS.dev_plan).toBe('Sonnet');
    expect(PHASE_MODELS.implement).toBe('Sonnet');
    expect(PHASE_MODELS.commit_pr).toBe('Sonnet');
    expect(PHASE_MODELS.review_loop).toBe('Sonnet');
  });
});
