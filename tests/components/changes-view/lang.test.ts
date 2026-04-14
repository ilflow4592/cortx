import { describe, it, expect } from 'vitest';
import { getLanguageFromPath } from '../../../src/components/changes-view/lang';

describe('getLanguageFromPath', () => {
  it.each([
    ['Foo.java', 'java'],
    ['component.tsx', 'typescript'],
    ['util.ts', 'typescript'],
    ['legacy.js', 'javascript'],
    ['Bundle.jsx', 'javascript'],
    ['data.json', 'json'],
    ['README.md', 'markdown'],
    ['build.gradle', 'groovy'],
    ['app.toml', 'ini'],
  ])('maps %s → %s', (path, expected) => {
    expect(getLanguageFromPath(path)).toBe(expected);
  });

  it('falls back to plaintext for unknown extensions', () => {
    expect(getLanguageFromPath('weird.xyz')).toBe('plaintext');
    expect(getLanguageFromPath('NOEXTENSION')).toBe('plaintext');
  });

  it('is case-insensitive on the extension', () => {
    expect(getLanguageFromPath('foo.TS')).toBe('typescript');
  });
});
