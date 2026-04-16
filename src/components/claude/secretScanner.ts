/**
 * Secret / credential leak detector.
 *
 * Claude 응답에 API key, token, private key 등이 포함되는 경우 자동 마스킹.
 * OWASP LLM02 (Sensitive Information Disclosure) 대응.
 *
 * 코드 블록(```)과 인라인 텍스트 모두 검사.
 * false positive 최소화를 위해 보수적 패턴만 사용 (길이 + 접두사 엄격 매칭).
 */

export interface SecretMatch {
  type: string;
  severity: 'high' | 'medium';
  start: number;
  end: number;
  raw: string;
}

export interface SecretScanResult {
  found: boolean;
  matches: SecretMatch[];
  masked: string;
}

interface SecretPattern {
  regex: RegExp;
  type: string;
  severity: 'high' | 'medium';
}

/**
 * 시스템 프롬프트 유출 패턴 — Cortx 내부 마커/섹션 이름이 응답에 노출되면 마스킹.
 * OWASP LLM07 (System Prompt Leakage) 대응.
 */
const SYSTEM_PROMPT_LEAK_PATTERNS: SecretPattern[] = [
  { regex: /CORTX_PIPELINE_TRACKING/g, type: 'system_prompt_marker', severity: 'medium' },
  { regex: /CORTX_CONTEXT_PACK_MODE/g, type: 'system_prompt_marker', severity: 'medium' },
  { regex: /CORTX_RULES \(MUST FOLLOW\)/g, type: 'system_prompt_marker', severity: 'medium' },
  { regex: /CORTX_PROJECT_CONTEXT/g, type: 'system_prompt_marker', severity: 'medium' },
  { regex: /⛔ SYSTEM CONSTRAINT[\s\S]{0,500}?---/g, type: 'harness_leak', severity: 'medium' },
];

/**
 * 각 패턴은 "명확히 secret" 수준. 일반 키워드(password=xxx 같은)는
 * false positive 많아서 제외. 형식이 특정된 것만.
 */
const SECRET_PATTERNS: SecretPattern[] = [
  // Anthropic / OpenAI
  { regex: /sk-ant-[a-zA-Z0-9_-]{50,}/g, type: 'anthropic_api_key', severity: 'high' },
  { regex: /sk-proj-[a-zA-Z0-9_-]{20,}/g, type: 'openai_project_key', severity: 'high' },
  { regex: /\bsk-[a-zA-Z0-9]{48}\b/g, type: 'openai_api_key', severity: 'high' },

  // GitHub
  { regex: /\bghp_[a-zA-Z0-9]{36,}\b/g, type: 'github_personal_token', severity: 'high' },
  { regex: /\bgho_[a-zA-Z0-9]{36,}\b/g, type: 'github_oauth_token', severity: 'high' },
  { regex: /\bghs_[a-zA-Z0-9]{36,}\b/g, type: 'github_server_token', severity: 'high' },
  { regex: /\bghr_[a-zA-Z0-9]{36,}\b/g, type: 'github_refresh_token', severity: 'high' },

  // Slack
  { regex: /\bxox[abpsro]-[0-9]+-[0-9]+-[a-zA-Z0-9]+\b/g, type: 'slack_token', severity: 'high' },

  // AWS
  { regex: /\bAKIA[0-9A-Z]{16}\b/g, type: 'aws_access_key', severity: 'high' },
  { regex: /\bASIA[0-9A-Z]{16}\b/g, type: 'aws_temp_access_key', severity: 'high' },

  // Google
  { regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, type: 'google_api_key', severity: 'high' },

  // Private keys (PEM blocks)
  {
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END [^-]+-----/g,
    type: 'private_key',
    severity: 'high',
  },

  // JWT (3-part base64, only flag if long enough to be real token)
  {
    regex: /\beyJ[A-Za-z0-9_=-]{10,}\.eyJ[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_=-]{20,}\b/g,
    type: 'jwt_token',
    severity: 'medium',
  },

  // Stripe
  { regex: /\bsk_live_[a-zA-Z0-9]{24,}\b/g, type: 'stripe_live_key', severity: 'high' },
  { regex: /\brk_live_[a-zA-Z0-9]{24,}\b/g, type: 'stripe_restricted_key', severity: 'high' },

  // Generic cloud
  { regex: /\bxoxe\.xox[bp]-[0-9]+-[a-zA-Z0-9]+\b/g, type: 'slack_app_token', severity: 'high' },
];

/**
 * 텍스트 스캔. 비파괴적 — 원본과 마스킹된 버전을 모두 반환.
 * Secret 패턴 + 시스템 프롬프트 유출 패턴 모두 검사.
 */
export function scanForSecrets(text: string): SecretScanResult {
  const matches: SecretMatch[] = [];
  const allPatterns = [...SECRET_PATTERNS, ...SYSTEM_PROMPT_LEAK_PATTERNS];

  for (const { regex, type, severity } of allPatterns) {
    // regex에 /g 플래그 있음 → matchAll
    for (const m of text.matchAll(regex)) {
      matches.push({
        type,
        severity,
        start: m.index ?? 0,
        end: (m.index ?? 0) + m[0].length,
        raw: m[0],
      });
    }
  }

  if (matches.length === 0) {
    return { found: false, matches: [], masked: text };
  }

  // position 겹침 방지: start 기준 정렬 + 뒤에서부터 치환
  matches.sort((a, b) => a.start - b.start);
  const dedupedMatches = dedupeOverlapping(matches);

  let masked = text;
  for (let i = dedupedMatches.length - 1; i >= 0; i--) {
    const m = dedupedMatches[i];
    const replacement = maskSecret(m);
    masked = masked.slice(0, m.start) + replacement + masked.slice(m.end);
  }

  return { found: true, matches: dedupedMatches, masked };
}

/** 겹치는 매치 제거 (긴 것 우선) */
export function dedupeOverlapping(matches: SecretMatch[]): SecretMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end);
  const result: SecretMatch[] = [];
  for (const m of sorted) {
    const last = result[result.length - 1];
    if (last && m.start < last.end) continue; // 겹침 → 스킵
    result.push(m);
  }
  return result;
}

/**
 * secret 타입별 마스킹 문자열. 원본 길이/형태 힌트는 남기되 값 자체는 숨김.
 */
export function maskSecret(m: SecretMatch): string {
  if (m.type === 'private_key') {
    return '⚠️[CORTX: private key redacted]';
  }
  if (m.type === 'system_prompt_marker' || m.type === 'harness_leak') {
    return '⚠️[CORTX: 내부 지시 redacted]';
  }
  // 앞 8자 + *** + 뒤 4자 형태 (길이 힌트 유지하면서 가려지기)
  const head = m.raw.slice(0, 8);
  const tail = m.raw.slice(-4);
  return `${head}***${tail}⚠️[${m.type}]`;
}
