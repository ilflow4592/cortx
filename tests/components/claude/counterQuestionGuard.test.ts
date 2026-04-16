import { describe, it, expect } from 'vitest';
import {
  isCounterQuestion,
  wrapCounterQuestion,
  extractHighestQNumber,
  findViolation,
  needsConfirmationAppend,
  stripPrematureQuestion,
  applyCounterQuestionGuard,
} from '../../../src/components/claude/counterQuestionGuard';

// ── isCounterQuestion ──

describe('isCounterQuestion', () => {
  it.each(['ㅇ', 'ㅇㅇ', '네', '응', '좋아', 'y', 'yes', 'ok', '진행', '진행해', '진행해줘', 'go'])(
    'returns false for approval word: "%s"',
    (word) => {
      expect(isCounterQuestion(word)).toBe(false);
    },
  );

  it.each(['진행해?', '네?', '좋아?', 'ok?'])('returns false for approval+?: "%s"', (word) => {
    expect(isCounterQuestion(word)).toBe(false);
  });

  it.each([
    '너는 어떻게 생각해?',
    '왜?',
    '다른 방법은 없어?',
    '그게 뭔데?',
    '장단점이 뭐야?',
    '어떤 게 나아?',
    '이유가 뭐야?',
    '어떻게 하면 돼?',
    '너가 볼 때는 어떤 방법이 나을 것 같아?',
    '어느 쪽이 맞아?',
  ])('returns true for counter-question: "%s"', (q) => {
    expect(isCounterQuestion(q)).toBe(true);
  });

  it.each(['너는 어떻게 생각', '다른 방법은', '장단점 알려줘', '추천해줘'])(
    'returns true for pattern without ?: "%s"',
    (q) => {
      expect(isCounterQuestion(q)).toBe(true);
    },
  );

  it.each(['Redis 사용합니다', 'B 방향으로', '둘 다 필요합니다', 'nameKorean', ''])(
    'returns false for plain answer: "%s"',
    (a) => {
      expect(isCounterQuestion(a)).toBe(false);
    },
  );
});

// ── extractHighestQNumber ──

describe('extractHighestQNumber', () => {
  it('returns 0 for text without Q patterns', () => {
    expect(extractHighestQNumber('일반 텍스트입니다.')).toBe(0);
  });

  it('returns 1 for text with Q1', () => {
    expect(extractHighestQNumber('**Q1.** 첫 번째 질문입니다?')).toBe(1);
  });

  it('returns highest Q when multiple exist', () => {
    expect(extractHighestQNumber('**Q1.** foo\n\n**Q3.** bar\n\n**Q2.** baz')).toBe(3);
  });

  it('ignores non-bold Q patterns like Q1.', () => {
    expect(extractHighestQNumber('Q1. 이건 무시')).toBe(0);
  });
});

// ── findViolation ──

describe('findViolation', () => {
  it('returns null when no Q numbers in response', () => {
    expect(findViolation('B가 맞다고 봅니다. 이유는...', 1)).toBeNull();
  });

  it('returns null when Q number equals currentQNumber', () => {
    const text = 'x'.repeat(60) + '**Q1.** 다시 물어볼게요.';
    expect(findViolation(text, 1)).toBeNull();
  });

  it('returns violation for higher Q without confirmation', () => {
    const text = 'B가 맞다고 봅니다.\n\n' + 'x'.repeat(60) + '\n\n**Q2.** 다음 질문입니다.';
    const result = findViolation(text, 1);
    expect(result).not.toBeNull();
    expect(result!.qLabel).toBe('**Q2.**');
  });

  it('returns null when confirmation phrase appears before new Q', () => {
    const text = 'B가 맞다고 봅니다.\n\n이 방향으로 진행할까요?\n\n' + 'x'.repeat(60) + '**Q2.** 다음';
    expect(findViolation(text, 1)).toBeNull();
  });

  it('skips Q within first 50 chars (current Q restatement)', () => {
    const text = '**Q2.** 에 대해 추가 설명';
    expect(findViolation(text, 1)).toBeNull();
  });
});

// ── needsConfirmationAppend ──

describe('needsConfirmationAppend', () => {
  it('returns true when no confirmation phrase exists', () => {
    expect(needsConfirmationAppend('B가 맞다고 봅니다. 이유는 다음과 같습니다.')).toBe(true);
  });

  it('returns false when "진행할까요" exists', () => {
    expect(needsConfirmationAppend('이렇게 진행할까요?')).toBe(false);
  });

  it('returns false when "이 방향으로" exists', () => {
    expect(needsConfirmationAppend('이 방향으로 가겠습니다.')).toBe(false);
  });
});

// ── stripPrematureQuestion ──

describe('stripPrematureQuestion', () => {
  it('truncates at paragraph break and appends confirmation', () => {
    const text = '답변 내용입니다.\n\n추가 설명.\n\n**Q2.** 다음 질문';
    const pos = text.indexOf('**Q2.**');
    const result = stripPrematureQuestion(text, pos);
    expect(result).toContain('답변 내용입니다.');
    expect(result).toContain('추가 설명.');
    expect(result).not.toContain('**Q2.**');
    expect(result).toContain('이 방향으로 진행할까요?');
  });

  it('handles no paragraph break gracefully', () => {
    const text = '답변 내용 **Q2.** 다음';
    const pos = text.indexOf('**Q2.**');
    const result = stripPrematureQuestion(text, pos);
    expect(result).not.toContain('**Q2.**');
    expect(result).toContain('이 방향으로 진행할까요?');
  });
});

// ── applyCounterQuestionGuard ──

describe('applyCounterQuestionGuard', () => {
  it('returns null for non-counter-question', () => {
    expect(
      applyCounterQuestionGuard({
        userText: 'B로 진행합니다',
        responseText: '알겠습니다.\n\n**Q2.** 다음 질문',
        currentQNumber: 1,
      }),
    ).toBeNull();
  });

  it('returns null when response has confirmation before new Q', () => {
    expect(
      applyCounterQuestionGuard({
        userText: '왜?',
        responseText: '이유는 이것입니다.\n\n이 방향으로 진행할까요?\n\n' + 'x'.repeat(60) + '**Q2.** 다음',
        currentQNumber: 1,
      }),
    ).toBeNull();
  });

  it('strips premature Q and adds confirmation for counter-question violation', () => {
    const response = 'B가 맞다고 봅니다.\n\n이유는 블라블라입니다.\n\n' + 'x'.repeat(60) + '\n\n**Q2.** 다음 질문?';
    const result = applyCounterQuestionGuard({
      userText: '너는 어떻게 생각해?',
      responseText: response,
      currentQNumber: 1,
    });
    expect(result).not.toBeNull();
    expect(result).not.toContain('**Q2.**');
    expect(result).toContain('이 방향으로 진행할까요?');
    expect(result).toContain('B가 맞다고 봅니다.');
  });

  it('appends confirmation when counter-question but no Q and no confirmation', () => {
    const result = applyCounterQuestionGuard({
      userText: '왜?',
      responseText: '이유는 이것입니다.',
      currentQNumber: 1,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('이유는 이것입니다.');
    expect(result).toContain('이 방향으로 진행할까요?');
  });

  it('returns null when counter-question response already has confirmation', () => {
    expect(
      applyCounterQuestionGuard({
        userText: '다른 방법은?',
        responseText: '대안은 이것입니다.\n\n이 방향으로 진행할까요?',
        currentQNumber: 1,
      }),
    ).toBeNull();
  });
});

// ── wrapCounterQuestion ──

describe('wrapCounterQuestion', () => {
  it('appends harness constraint', () => {
    const wrapped = wrapCounterQuestion('너는 어떻게 생각해?');
    expect(wrapped).toContain('너는 어떻게 생각해?');
    expect(wrapped).toContain('SYSTEM CONSTRAINT');
    expect(wrapped).toContain('Q번호');
  });
});
