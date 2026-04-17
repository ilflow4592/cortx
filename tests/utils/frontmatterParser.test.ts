import { describe, it, expect } from 'vitest';
import { parseSkillFrontmatter } from '../../src/utils/pipeline-exec/frontmatterParser';

describe('parseSkillFrontmatter', () => {
  it('returns null frontmatter when no --- present', () => {
    const md = '# Just a skill\n\nSome body.';
    const { frontmatter, body } = parseSkillFrontmatter(md);
    expect(frontmatter).toBeNull();
    expect(body).toBe(md);
  });

  it('returns null when only opening --- without closing', () => {
    const md = '---\nrequires: [a]\n\n# body';
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter).toBeNull();
  });

  it('parses inline array', () => {
    const md = `---\nrequires: [userSpec, codeMap]\nproduces: [plan]\n---\n# body`;
    const { frontmatter, body } = parseSkillFrontmatter(md);
    expect(frontmatter).toEqual({
      requires: ['userSpec', 'codeMap'],
      produces: ['plan'],
    });
    expect(body).toBe('# body');
  });

  it('parses block array', () => {
    const md = `---\nrequires:\n  - a\n  - b\nproduces:\n  - x\n---\nbody`;
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter).toEqual({ requires: ['a', 'b'], produces: ['x'] });
  });

  it('parses contextMode enum values', () => {
    const md = `---\ncontextMode: isolated\n---\n`;
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter?.contextMode).toBe('isolated');
  });

  it('drops invalid contextMode silently', () => {
    const md = `---\ncontextMode: weird\n---\n`;
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter?.contextMode).toBeUndefined();
  });

  it('supports sideEffects block list', () => {
    const md = `---\nsideEffects:\n  - git\n  - network\n---\n`;
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter?.sideEffects).toEqual(['git', 'network']);
  });

  it('ignores unknown keys (forward compat)', () => {
    const md = `---\nrequires: [a]\nfutureField: 42\n---\nbody`;
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter?.requires).toEqual(['a']);
  });

  it('handles empty frontmatter block', () => {
    const md = `---\n---\nbody only`;
    const { frontmatter, body } = parseSkillFrontmatter(md);
    expect(frontmatter).toEqual({});
    expect(body).toBe('body only');
  });

  it('strips BOM before parsing', () => {
    const md = `\ufeff---\nrequires: [a]\n---\nbody`;
    const { frontmatter } = parseSkillFrontmatter(md);
    expect(frontmatter?.requires).toEqual(['a']);
  });
});
