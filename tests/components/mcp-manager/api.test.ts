import { describe, it, expect } from 'vitest';
import { parseEnvText, stringifyEnv, emptyDraft } from '../../../src/components/mcp-manager/api';

describe('parseEnvText', () => {
  it('parses KEY=value lines', () => {
    expect(parseEnvText('FOO=bar\nBAZ=qux')).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });
  it('skips blank lines and # comments', () => {
    expect(parseEnvText('# comment\n\nFOO=bar\n# another')).toEqual({ FOO: 'bar' });
  });
  it('preserves = inside value', () => {
    expect(parseEnvText('TOKEN=abc=def=ghi')).toEqual({ TOKEN: 'abc=def=ghi' });
  });
  it('skips lines without =', () => {
    expect(parseEnvText('NOT_A_PAIR\nFOO=bar')).toEqual({ FOO: 'bar' });
  });
});

describe('stringifyEnv', () => {
  it('round-trips with parseEnvText', () => {
    const env = { A: '1', B: '2' };
    expect(parseEnvText(stringifyEnv(env))).toEqual(env);
  });
  it('returns empty string for empty object', () => {
    expect(stringifyEnv({})).toBe('');
  });
});

describe('emptyDraft', () => {
  it('defaults to stdio + npx', () => {
    const d = emptyDraft();
    expect(d.type).toBe('stdio');
    expect(d.command).toBe('npx');
    expect(d.name).toBe('');
    expect(d.envText).toBe('');
  });
});
