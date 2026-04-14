import { describe, it, expect } from 'vitest';
import { parseGitHubUrl, deriveProjectName } from '../../src/services/projectCreation';

describe('parseGitHubUrl', () => {
  it('parses https GitHub URL', () => {
    expect(parseGitHubUrl('https://github.com/anthropics/cortx.git')).toEqual({
      owner: 'anthropics',
      repo: 'cortx',
      repoName: 'cortx',
    });
  });
  it('parses ssh GitHub URL', () => {
    expect(parseGitHubUrl('git@github.com:anthropics/cortx.git')).toEqual({
      owner: 'anthropics',
      repo: 'cortx',
      repoName: 'cortx',
    });
  });
  it('returns empty owner/repo for non-GitHub URL but extracts repoName', () => {
    expect(parseGitHubUrl('https://gitlab.com/foo/bar.git')).toEqual({
      owner: '',
      repo: '',
      repoName: 'bar',
    });
  });
  it('returns all-empty for malformed input', () => {
    expect(parseGitHubUrl('')).toEqual({ owner: '', repo: '', repoName: '' });
  });
});

describe('deriveProjectName', () => {
  it('uses last path segment', () => {
    expect(deriveProjectName('/Users/me/Dev/my-project')).toBe('my-project');
  });
  it('handles trailing slash', () => {
    expect(deriveProjectName('/Users/me/Dev/my-project/')).toBe('my-project');
  });
  it('falls back to "project" for blank or root path', () => {
    expect(deriveProjectName('')).toBe('project');
    expect(deriveProjectName('/')).toBe('project');
  });
});
