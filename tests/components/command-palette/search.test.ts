import { describe, it, expect } from 'vitest';
import { matchesAtBoundary, matchesLabelOrKeywords } from '../../../src/components/command-palette/search';

describe('matchesAtBoundary', () => {
  it('matches at start of string', () => {
    expect(matchesAtBoundary('Export Task', 'ex')).toBe(true);
  });
  it('does not match in middle of word', () => {
    expect(matchesAtBoundary('context', 'ex')).toBe(false);
    expect(matchesAtBoundary('prune', 'run')).toBe(false);
  });
  it('matches after whitespace', () => {
    expect(matchesAtBoundary('Run Pipeline', 'pipe')).toBe(true);
  });
  it('matches after punctuation boundaries', () => {
    expect(matchesAtBoundary('Run Pipeline (/pipeline:dev-task)', '/')).toBe(true);
    expect(matchesAtBoundary('foo-bar', 'bar')).toBe(true);
    expect(matchesAtBoundary('a.b.c', 'b')).toBe(true);
  });
  it('empty query matches anything', () => {
    expect(matchesAtBoundary('whatever', '')).toBe(true);
    expect(matchesAtBoundary('whatever', '   ')).toBe(true);
  });
  it('case-insensitive', () => {
    expect(matchesAtBoundary('Export', 'EX')).toBe(true);
  });
});

describe('matchesLabelOrKeywords', () => {
  it('matches via label', () => {
    expect(matchesLabelOrKeywords('exp', 'Export Task', [])).toBe(true);
  });
  it('matches via keywords when label fails', () => {
    expect(matchesLabelOrKeywords('save', 'Export Task', ['save', 'download'])).toBe(true);
  });
  it('returns false when neither label nor keyword matches', () => {
    expect(matchesLabelOrKeywords('xyz', 'Export Task', ['save'])).toBe(false);
  });
  it('blank query matches everything', () => {
    expect(matchesLabelOrKeywords('', 'anything', [])).toBe(true);
  });
});
