import { describe, it, expect } from 'vitest';
import { isApproval } from '../../../src/components/claude/pipelinePhaseTransitions';

describe('isApproval', () => {
  it.each([
    'y',
    'Y',
    'YES',
    'ㅇ',
    'ㅇㅇ',
    '진행',
    '진행해',
    '진행해줘',
    'yes',
    'ok',
    'OK',
    '네',
    '응',
    '좋아',
    'go',
    'Go',
  ])('treats %s as approval', (input) => {
    expect(isApproval(input)).toBe(true);
  });

  it.each(['no', '아니', 'wait', 'maybe', '', 'yes please', '진행할게요'])(
    'rejects %s',
    (input) => {
      expect(isApproval(input)).toBe(false);
    },
  );
});
