import { describe, it, expect } from 'vitest';
import { parsePipelineMarkers } from '../../../src/components/claude/pipelineMarkers';

describe('parsePipelineMarkers', () => {
  it('extracts complexity markers', () => {
    const { cleaned, updates } = parsePipelineMarkers('Hello [PIPELINE:complexity:medium] world');
    expect(cleaned.trim()).toBe('Hello  world');
    expect(updates).toEqual([{ kind: 'complexity', value: 'medium' }]);
  });

  it('extracts pr markers with number + url', () => {
    const { updates } = parsePipelineMarkers('Done [PIPELINE:pr:4920:https://github.com/x/y/pull/4920]');
    expect(updates).toEqual([
      { kind: 'pr', number: 4920, url: 'https://github.com/x/y/pull/4920' },
    ]);
  });

  it('extracts phase status with optional memo', () => {
    const { updates } = parsePipelineMarkers(
      '[PIPELINE:dev_plan:in_progress][PIPELINE:implement:done:빌드 성공]',
    );
    expect(updates).toEqual([
      { kind: 'phase', phase: 'dev_plan', status: 'in_progress', memo: undefined },
      { kind: 'phase', phase: 'implement', status: 'done', memo: '빌드 성공' },
    ]);
  });

  it('ignores unknown keys', () => {
    const { updates } = parsePipelineMarkers('[PIPELINE:unknown_key:value]');
    expect(updates).toEqual([]);
  });

  it('returns text unchanged + empty updates when no markers', () => {
    const { cleaned, updates } = parsePipelineMarkers('plain text');
    expect(cleaned).toBe('plain text');
    expect(updates).toEqual([]);
  });
});
