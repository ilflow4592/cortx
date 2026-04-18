/**
 * Sensitive file path guard — Claude의 파일 접근 범위 제한.
 *
 * Read/Edit/Glob/Grep tool_use에서 시크릿/개인정보 파일 경로 탐지.
 * OWASP LLM02 (Sensitive Info Disclosure) 예방 + LLM06 (Excessive Agency) 보완.
 *
 * 실제 차단은 Claude CLI 내부에서만 가능 — app은 감지/경고/워크스페이스 경계 검사만.
 */

export type PathSeverity = 'critical' | 'high' | 'medium';

export interface SensitivePathMatch {
  pattern: string;
  severity: PathSeverity;
  description: string;
}

interface PathPattern {
  regex: RegExp;
  severity: PathSeverity;
  label: string;
  description: string;
}

/**
 * 민감 파일 패턴. regex는 절대 또는 상대 경로 모두 매치되도록 설계.
 */
const SENSITIVE_PATH_PATTERNS: PathPattern[] = [
  // SSH 키
  {
    regex: /\.ssh\/(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.pub)?$/,
    severity: 'critical',
    label: 'ssh_private_key',
    description: 'SSH 개인 키',
  },
  { regex: /\.ssh\/authorized_keys$/, severity: 'high', label: 'ssh_authorized', description: 'SSH 허용 키 목록' },
  { regex: /\.ssh\/known_hosts$/, severity: 'medium', label: 'ssh_known_hosts', description: 'SSH 신뢰 호스트' },

  // 클라우드 자격증명 (먼저 — 더 구체적인 매치 우선)
  { regex: /\.aws\/credentials$/, severity: 'critical', label: 'aws_credentials', description: 'AWS 자격증명' },
  { regex: /\.aws\/config$/, severity: 'medium', label: 'aws_config', description: 'AWS 설정' },
  {
    regex: /\.config\/gcloud\/credentials/,
    severity: 'critical',
    label: 'gcloud_credentials',
    description: 'GCP 자격증명',
  },
  { regex: /gcp[-_]key\.json$/i, severity: 'critical', label: 'gcp_key_json', description: 'GCP 서비스 계정 키' },
  { regex: /\.kube\/config$/, severity: 'high', label: 'kube_config', description: 'Kubernetes 설정' },

  // 환경/비밀
  { regex: /(^|\/)\.env(\.[\w-]+)?$/, severity: 'high', label: 'env_file', description: '환경 변수 파일' },
  { regex: /(^|\/)\.envrc$/, severity: 'high', label: 'envrc', description: 'direnv 설정' },
  {
    regex: /(^|\/)credentials?(\.json|\.yaml|\.yml|\.toml)?$/i,
    severity: 'high',
    label: 'credentials',
    description: '자격증명 파일',
  },
  {
    regex: /(^|\/)secrets?(\.json|\.yaml|\.yml|\.toml|\.env)?$/i,
    severity: 'high',
    label: 'secrets_file',
    description: '시크릿 파일',
  },
  { regex: /\.pem$/, severity: 'high', label: 'pem_file', description: 'PEM 인증서/키' },
  { regex: /\.key$/, severity: 'high', label: 'key_file', description: '키 파일' },
  { regex: /\.p12$|\.pfx$/, severity: 'high', label: 'pkcs12', description: 'PKCS#12 번들' },

  // 브라우저/OS 저장소
  { regex: /Library\/Keychains\//, severity: 'critical', label: 'macos_keychain', description: 'macOS Keychain' },
  { regex: /\.netrc$/, severity: 'high', label: 'netrc', description: 'FTP/HTTP 자격증명' },
  { regex: /\.pgpass$/, severity: 'high', label: 'pgpass', description: 'PostgreSQL 비밀번호 파일' },
  { regex: /\.my\.cnf$/, severity: 'high', label: 'mysql_config', description: 'MySQL 자격증명' },

  // 시스템 보안
  { regex: /^\/etc\/shadow$/, severity: 'critical', label: 'etc_shadow', description: '시스템 암호 해시' },
  { regex: /^\/etc\/passwd$/, severity: 'medium', label: 'etc_passwd', description: '사용자 목록' },
  { regex: /^\/etc\/sudoers$/, severity: 'critical', label: 'etc_sudoers', description: 'Sudo 설정' },

  // 앱 자격증명
  { regex: /\.npmrc$/, severity: 'high', label: 'npmrc', description: 'npm 자격증명 (auth token 포함 가능)' },
  { regex: /\.pypirc$/, severity: 'high', label: 'pypirc', description: 'PyPI 자격증명' },
  { regex: /\.git-credentials$/, severity: 'critical', label: 'git_credentials', description: 'Git 저장된 자격증명' },
];

/**
 * 경로 검사. 매치된 모든 패턴 반환.
 */
export function scanSensitivePath(path: string): SensitivePathMatch[] {
  const matches: SensitivePathMatch[] = [];
  for (const { regex, severity, label, description } of SENSITIVE_PATH_PATTERNS) {
    if (regex.test(path)) {
      matches.push({ pattern: label, severity, description });
    }
  }
  return matches;
}

/**
 * Tool input에서 파일 경로 추출.
 * Read/Edit/Glob/Grep 등 Claude Code 내장 도구의 path/file_path/pattern 필드 지원.
 */
export function extractToolPaths(toolName: string, toolInput: unknown): string[] {
  if (!toolInput || typeof toolInput !== 'object') return [];
  const input = toolInput as Record<string, unknown>;
  const paths: string[] = [];

  // 단일 경로 필드 — 다양한 이름 커버
  for (const field of ['file_path', 'path', 'filePath', 'notebook_path']) {
    const v = input[field];
    if (typeof v === 'string') paths.push(v);
  }

  // Glob pattern — 경로처럼 취급
  if (toolName === 'Glob' || toolName === 'Grep') {
    for (const field of ['pattern', 'glob']) {
      const v = input[field];
      if (typeof v === 'string') paths.push(v);
    }
  }

  // Write/Edit에는 content도 있지만 여기서는 경로만 검사
  return paths;
}

/**
 * 경로가 워크스페이스(cwd) 밖인지 검사.
 * 절대경로가 cwd prefix를 갖지 않거나, `..` 상대경로로 벗어나면 out-of-workspace.
 */
export function isPathOutsideWorkspace(path: string, cwd: string): boolean {
  if (!cwd) return false;
  const normalizedCwd = cwd.replace(/\/$/, '');

  // 절대경로
  if (path.startsWith('/') || path.startsWith('~')) {
    const home =
      typeof globalThis !== 'undefined' &&
      (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.HOME;
    const expanded = path.startsWith('~') ? path.replace(/^~/, home || '/Users') : path;
    // /tmp, /var/tmp는 일반적인 임시 공간이라 허용
    if (expanded.startsWith('/tmp/') || expanded.startsWith('/var/tmp/')) return false;
    return !expanded.startsWith(normalizedCwd + '/') && expanded !== normalizedCwd;
  }

  // 상대경로 `../` — 단순 카운트
  const segments = path.split('/');
  let depth = 0;
  for (const seg of segments) {
    if (seg === '..') depth--;
    else if (seg !== '.' && seg !== '') depth++;
    if (depth < 0) return true; // cwd 위로 나감
  }
  return false;
}
