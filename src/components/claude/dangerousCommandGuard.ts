/**
 * Dangerous command guard — Claude가 실행하려는 파괴적 Bash 명령 감지.
 *
 * Claude CLI가 `bypassPermissions` 모드로 실행되므로 tool_use 시점에
 * 코드 레벨 검증이 유일한 안전장치. OWASP LLM06 (Excessive Agency) 대응.
 *
 * 실제 차단은 불가 (Claude CLI 내부에서 실행) — 감지 + 경고 + 텔레메트리.
 */

export type DangerSeverity = 'critical' | 'high' | 'medium';

export interface DangerousCommandMatch {
  pattern: string;
  severity: DangerSeverity;
  description: string;
  snippet: string;
}

interface DangerPattern {
  regex: RegExp;
  severity: DangerSeverity;
  label: string;
  description: string;
}

/**
 * 파괴적/위험 명령 패턴. false positive 최소화 — 명백히 위험한 것만.
 */
const DANGER_PATTERNS: DangerPattern[] = [
  // 파일시스템 파괴
  {
    regex: /rm\s+(-[rRf]+\s+)+(\/|~|\$HOME|\*)/,
    severity: 'critical',
    label: 'rm_rf_root',
    description: 'Root/home 디렉토리 삭제',
  },
  {
    regex: /\brm\s+-rf\s+--no-preserve-root/,
    severity: 'critical',
    label: 'rm_no_preserve',
    description: 'Root 보호 해제 삭제',
  },
  // dd는 of=/dev/...만 파괴적 (쓰기). if=는 읽기라 안전.
  {
    regex: /\bdd\s+.*\bof=\/dev\/(sd|nvme|hd|xvd)[a-z]/,
    severity: 'critical',
    label: 'dd_disk',
    description: '디스크 직접 쓰기',
  },
  { regex: /\bmkfs\.\w+\s+\/dev\//, severity: 'critical', label: 'mkfs', description: '디스크 포맷' },

  // Fork bomb
  {
    regex: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/,
    severity: 'critical',
    label: 'fork_bomb',
    description: 'Fork bomb',
  },

  // Git 파괴적
  {
    regex: /git\s+push\s+(-f|--force(?!-with-lease))/,
    severity: 'high',
    label: 'git_force_push',
    description: '강제 푸시 (lease 없음)',
  },
  {
    regex: /git\s+reset\s+--hard\s+(HEAD~|origin\/)/,
    severity: 'medium',
    label: 'git_reset_hard',
    description: 'Hard reset',
  },
  {
    regex: /git\s+clean\s+-[fdxX]{2,}/,
    severity: 'high',
    label: 'git_clean_force',
    description: '추적 안 된 파일 강제 삭제',
  },
  {
    regex: /git\s+branch\s+-D\s/,
    severity: 'medium',
    label: 'git_branch_force_delete',
    description: '브랜치 강제 삭제',
  },
  { regex: /git\s+checkout\s+\.$/, severity: 'medium', label: 'git_checkout_all', description: '모든 변경 폐기' },
  { regex: /--no-verify/, severity: 'medium', label: 'bypass_hooks', description: 'Git hooks 우회' },

  // DB 파괴적
  {
    regex: /\bDROP\s+(DATABASE|TABLE|SCHEMA)\b/i,
    severity: 'critical',
    label: 'sql_drop',
    description: 'DB 객체 삭제',
  },
  { regex: /\bTRUNCATE\s+TABLE\b/i, severity: 'high', label: 'sql_truncate', description: '테이블 비우기' },
  {
    regex: /\bDELETE\s+FROM\s+\w+(\s*;|\s*$|(?!.*WHERE))/i,
    severity: 'high',
    label: 'sql_delete_no_where',
    description: 'WHERE 없는 DELETE',
  },

  // 권한 변경
  {
    regex: /chmod\s+(-R\s+)?(777|666|\+s|u\+s)/,
    severity: 'high',
    label: 'chmod_wide_open',
    description: '과도한 권한 부여',
  },
  {
    regex: /chown\s+-R\s+\S+\s+\/(?!tmp|var\/tmp)/,
    severity: 'high',
    label: 'chown_root_recursive',
    description: 'Root 경로 소유자 재귀 변경',
  },

  // Sudo / privilege escalation
  {
    regex: /\bsudo\s+(rm|dd|mkfs|chmod|chown)\b/,
    severity: 'high',
    label: 'sudo_destructive',
    description: 'Sudo + 파괴 명령',
  },

  // Network exfil
  {
    regex: /\bcurl\s+.{0,200}\|\s*(sh|bash|zsh)/,
    severity: 'high',
    label: 'curl_pipe_shell',
    description: '원격 스크립트 바로 실행',
  },
  {
    regex: /\bwget\s+.{0,200}\|\s*(sh|bash|zsh)/,
    severity: 'high',
    label: 'wget_pipe_shell',
    description: '원격 스크립트 바로 실행',
  },

  // Package managers (force)
  { regex: /npm\s+(install|i)\s+.*--force/, severity: 'medium', label: 'npm_force', description: 'npm force install' },
];

/**
 * 명령 텍스트를 검사. 모든 매치 반환 (하나라도 있으면 경고).
 */
export function scanDangerousCommand(command: string): DangerousCommandMatch[] {
  const matches: DangerousCommandMatch[] = [];
  for (const { regex, severity, label, description } of DANGER_PATTERNS) {
    const m = command.match(regex);
    if (m) {
      matches.push({
        pattern: label,
        severity,
        description,
        snippet: m[0].slice(0, 100),
      });
    }
  }
  return matches;
}

/**
 * Tool use 블록에서 Bash 명령 추출. name이 Bash 계열이면 input.command 반환.
 */
export function extractBashCommand(toolName: string, toolInput: unknown): string | null {
  if (toolName !== 'Bash' && toolName !== 'bash') return null;
  if (!toolInput || typeof toolInput !== 'object') return null;
  const input = toolInput as Record<string, unknown>;
  const cmd = input.command;
  return typeof cmd === 'string' ? cmd : null;
}
