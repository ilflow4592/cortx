/**
 * Network exfil guard — Claude의 외부 네트워크 호출 감지.
 *
 * Bash 명령에 curl/wget/nc/fetch 가 등장하고 unknown 도메인이면 경고.
 * OWASP LLM02 (exfiltration vector) + LLM06 (Excessive Agency) 대응.
 *
 * allowlist: 개발/배포 도구 정상 사용처만 포함.
 * 사용자는 이 목록을 늘릴 수 없음 (app 레벨 정책).
 */

export type ExfilSeverity = 'high' | 'medium';

export interface ExfilMatch {
  tool: string;
  url: string;
  host: string;
  severity: ExfilSeverity;
  reason: string;
}

/**
 * 암시적으로 허용되는 도메인 — 개발/배포 관련 정상 endpoints.
 * Subdomain 매칭 (예: api.github.com 도 허용).
 */
const ALLOWED_HOSTS = [
  // Git/Code
  'github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'codeload.github.com',
  'objects.githubusercontent.com',
  'gitlab.com',
  'bitbucket.org',

  // Claude / Anthropic
  'api.anthropic.com',
  'console.anthropic.com',
  'platform.claude.com',

  // Package registries
  'registry.npmjs.org',
  'registry.yarnpkg.com',
  'pypi.org',
  'files.pythonhosted.org',
  'crates.io',
  'static.crates.io',

  // CI/Build
  'api.openai.com', // 일부 플러그인용, 허용
  'hub.docker.com',

  // Localhost
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
];

/** 도메인 화이트리스트 매칭 (정확 일치 + suffix 매칭) */
export function isAllowedHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/:\d+$/, ''); // 포트 제거
  for (const allowed of ALLOWED_HOSTS) {
    if (normalized === allowed) return true;
    if (normalized.endsWith('.' + allowed)) return true;
  }
  return false;
}

/** Bash 명령에서 URL 추출 (curl, wget, fetch, nc 등) */
export function extractUrls(command: string): { tool: string; url: string; host: string }[] {
  const results: { tool: string; url: string; host: string }[] = [];

  // URL 정규식 — 최대한 관대하게
  const URL_RE = /https?:\/\/([a-zA-Z0-9][\w.-]*\.[a-zA-Z]{2,}|localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/[^\s'"`]*)?/g;

  // 도구별 검출 — 명령에 도구 이름이 있고 URL이 있으면 매칭
  const toolHints: [RegExp, string][] = [
    [/\bcurl\b/i, 'curl'],
    [/\bwget\b/i, 'wget'],
    [/\bfetch\b/i, 'fetch'],
    [/\bhttpie?\b/i, 'http'],
    [/\bnc\b|\bnetcat\b/i, 'nc'],
    [/\bssh\b/i, 'ssh'],
    [/\bscp\b|\brsync\b/i, 'scp'],
    [/\bnode\b.*(?:http|fetch)/i, 'node-http'],
    [/\bpython[0-9.]*\b.*(?:requests|urllib)/i, 'python-http'],
  ];

  let detectedTool: string | null = null;
  for (const [re, name] of toolHints) {
    if (re.test(command)) {
      detectedTool = name;
      break;
    }
  }

  for (const m of command.matchAll(URL_RE)) {
    const url = m[0];
    const host = m[1];
    results.push({ tool: detectedTool || 'unknown', url, host });
  }

  // nc/ssh host-only (URL 없이 host만 나옴)
  const hostPatterns: [RegExp, string][] = [
    [/\bnc\s+(-\w+\s+)*([a-zA-Z0-9][\w.-]+\.[a-zA-Z]{2,})\s+\d+/, 'nc'],
    [/\bssh\s+(?:-\w+\s+)*(?:\w+@)?([a-zA-Z0-9][\w.-]+\.[a-zA-Z]{2,})/, 'ssh'],
  ];
  for (const [re, tool] of hostPatterns) {
    const m = command.match(re);
    if (m) {
      const host = m[2] || m[1];
      if (host && !results.some((r) => r.host === host)) {
        results.push({ tool, url: `${tool}://${host}`, host });
      }
    }
  }

  return results;
}

/**
 * 네트워크 exfil 검사 — 명령에서 외부 호출 추출 후 allowlist 체크.
 */
export function scanNetworkExfil(command: string): ExfilMatch[] {
  const urls = extractUrls(command);
  const findings: ExfilMatch[] = [];
  for (const { tool, url, host } of urls) {
    if (isAllowedHost(host)) continue;
    // shell-pipe to sh는 dangerousCommandGuard에서 이미 잡힘 — 여기선 일반 exfil
    findings.push({
      tool,
      url,
      host,
      severity: 'high',
      reason: `비허용 도메인 (${host})으로 ${tool} 호출 — 데이터 유출 가능성`,
    });
  }
  return findings;
}
