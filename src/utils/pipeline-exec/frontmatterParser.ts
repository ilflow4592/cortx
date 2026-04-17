/**
 * Skill `.md` 상단의 YAML-lite frontmatter 파서.
 * `---` 구분자로 감싸인 블록을 파싱해 SkillContract 로 반환.
 *
 * 지원 문법 (최소):
 *   key: value           # 문자열/숫자/bool
 *   key: [a, b, c]       # 인라인 배열
 *   key:                 # 블록 배열
 *     - a
 *     - b
 *
 * 미지원: 중첩 객체, 다중 라인 문자열, JSON 리터럴, 앵커/참조.
 * 파싱 실패 시 null 반환 → 호출자는 contract 없는 "free" 스킬로 처리.
 *
 * YAML 라이브러리 의존 회피 (번들 사이즈 + 기존 인프라 JSON 기반).
 */
import type { SkillContract } from '../../types/customPipeline';

export interface ParsedSkill {
  frontmatter: SkillContract | null;
  body: string;
}

const ARRAY_INLINE_RE = /^\[(.*)\]$/;
const BLOCK_ITEM_RE = /^\s*-\s+(.+)$/;
const KEY_VALUE_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/;

function splitFrontmatter(md: string): { raw: string | null; body: string } {
  // 첫 라인이 정확히 '---' 여야 frontmatter 로 인정 (BOM 제거)
  const clean = md.replace(/^\ufeff/, '');
  const lines = clean.split('\n');
  if (lines[0]?.trim() !== '---') return { raw: null, body: md };
  // 두 번째 '---' 찾기 (start=0 이므로 1 부터)
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { raw: null, body: md };
  const raw = lines.slice(1, end).join('\n');
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '');
  return { raw, body };
}

function parseScalar(s: string): string | number | boolean | null {
  const t = s.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  // quoted string
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseInlineArray(s: string): string[] {
  const inner = s.slice(1, -1).trim();
  if (inner === '') return [];
  return inner.split(',').map((item) => {
    const v = parseScalar(item);
    return v === null ? '' : String(v);
  });
}

function parseYamlLite(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const kv = KEY_VALUE_RE.exec(line);
    if (!kv) {
      i++;
      continue;
    }
    const [, key, rest] = kv;
    const rightTrimmed = rest.trim();
    if (rightTrimmed === '') {
      // block array 시작 가능성
      const items: string[] = [];
      i++;
      while (i < lines.length) {
        const m = BLOCK_ITEM_RE.exec(lines[i]);
        if (!m) break;
        const v = parseScalar(m[1]);
        items.push(v === null ? '' : String(v));
        i++;
      }
      out[key] = items;
      continue;
    }
    const arr = ARRAY_INLINE_RE.exec(rightTrimmed);
    if (arr) {
      out[key] = parseInlineArray(rightTrimmed);
    } else {
      out[key] = parseScalar(rightTrimmed);
    }
    i++;
  }
  return out;
}

function toStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((x) => String(x));
}

function toContextMode(v: unknown): 'shared' | 'isolated' | undefined {
  return v === 'shared' || v === 'isolated' ? v : undefined;
}

/**
 * Skill 본문에서 frontmatter 를 추출해 SkillContract 로 변환.
 * frontmatter 없거나 파싱 실패 시 `{ frontmatter: null, body: md }` 반환.
 */
export function parseSkillFrontmatter(md: string): ParsedSkill {
  const { raw, body } = splitFrontmatter(md);
  if (raw === null) return { frontmatter: null, body };
  try {
    const obj = parseYamlLite(raw);
    const contract: SkillContract = {};
    const requires = toStringArray(obj.requires);
    const produces = toStringArray(obj.produces);
    const contextMode = toContextMode(obj.contextMode);
    const sideEffects = toStringArray(obj.sideEffects);
    if (requires) contract.requires = requires;
    if (produces) contract.produces = produces;
    if (contextMode) contract.contextMode = contextMode;
    if (sideEffects) contract.sideEffects = sideEffects;
    // 알 수 없는 키는 무시 (forward compat)
    return { frontmatter: contract, body };
  } catch {
    return { frontmatter: null, body };
  }
}
