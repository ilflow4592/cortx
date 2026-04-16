import { describe, it, expect } from 'vitest';
import {
  scanForSecrets,
  maskSecret,
  dedupeOverlapping,
  type SecretMatch,
} from '../../../src/components/claude/secretScanner';

describe('scanForSecrets', () => {
  it('returns found: false for clean text', () => {
    const result = scanForSecrets('Just a normal response about refactoring.');
    expect(result.found).toBe(false);
    expect(result.matches).toEqual([]);
    expect(result.masked).toBe('Just a normal response about refactoring.');
  });

  it('detects Anthropic API key', () => {
    const key = 'sk-ant-' + 'a'.repeat(60);
    const result = scanForSecrets(`Use this key: ${key}`);
    expect(result.found).toBe(true);
    expect(result.matches[0].type).toBe('anthropic_api_key');
  });

  it('detects GitHub personal access token', () => {
    const key = 'ghp_' + 'A'.repeat(40);
    const result = scanForSecrets(`Token: ${key}`);
    expect(result.found).toBe(true);
    expect(result.matches[0].type).toBe('github_personal_token');
  });

  it('detects AWS access key', () => {
    const result = scanForSecrets('Access: AKIAIOSFODNN7EXAMPLE');
    expect(result.found).toBe(true);
    expect(result.matches[0].type).toBe('aws_access_key');
  });

  it('detects Slack token', () => {
    const result = scanForSecrets('xoxb-1234567890-1234567890-abcdefABCDEF1234567890');
    expect(result.found).toBe(true);
    expect(result.matches[0].type).toBe('slack_token');
  });

  it('detects private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----';
    const result = scanForSecrets(`Here is the key:\n${pem}`);
    expect(result.found).toBe(true);
    expect(result.matches[0].type).toBe('private_key');
    expect(result.masked).toContain('[CORTX: private key redacted]');
  });

  it('masks secrets in output', () => {
    const key = 'ghp_' + 'A'.repeat(40);
    const result = scanForSecrets(`Token: ${key}`);
    expect(result.masked).not.toContain(key);
    expect(result.masked).toContain('ghp_');
    expect(result.masked).toContain('***');
  });

  it('detects multiple secrets', () => {
    const k1 = 'ghp_' + 'A'.repeat(40);
    const k2 = 'AKIAIOSFODNN7EXAMPLE';
    const result = scanForSecrets(`${k1} and ${k2}`);
    expect(result.matches.length).toBe(2);
  });

  it('detects Cortx system prompt markers', () => {
    const result = scanForSecrets('CORTX_PIPELINE_TRACKING is where we...');
    expect(result.found).toBe(true);
    expect(result.matches[0].type).toBe('system_prompt_marker');
    expect(result.masked).toContain('내부 지시 redacted');
  });

  it('does not flag normal sk- prefix (too short)', () => {
    const result = scanForSecrets('Use sk-foo for short.');
    expect(result.found).toBe(false);
  });
});

describe('maskSecret', () => {
  it('truncates and brackets regular secrets', () => {
    const m: SecretMatch = {
      type: 'github_personal_token',
      severity: 'high',
      start: 0,
      end: 44,
      raw: 'ghp_' + 'A'.repeat(40),
    };
    const masked = maskSecret(m);
    expect(masked).toContain('ghp_');
    expect(masked).toContain('***');
    expect(masked).toContain('github_personal_token');
  });

  it('fully redacts private keys', () => {
    const m: SecretMatch = {
      type: 'private_key',
      severity: 'high',
      start: 0,
      end: 100,
      raw: '-----BEGIN RSA PRIVATE KEY-----...',
    };
    expect(maskSecret(m)).toBe('⚠️[CORTX: private key redacted]');
  });
});

describe('dedupeOverlapping', () => {
  it('removes overlapping matches (keeps first)', () => {
    const matches: SecretMatch[] = [
      { type: 'a', severity: 'high', start: 0, end: 10, raw: 'x' },
      { type: 'b', severity: 'high', start: 5, end: 15, raw: 'y' },
      { type: 'c', severity: 'high', start: 20, end: 30, raw: 'z' },
    ];
    const result = dedupeOverlapping(matches);
    expect(result.length).toBe(2);
    expect(result[0].type).toBe('a');
    expect(result[1].type).toBe('c');
  });
});
