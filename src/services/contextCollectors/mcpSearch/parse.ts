/**
 * @module contextCollectors/mcpSearch/parse
 * Claude CLI stdout에서 JSON 배열을 추출/파싱하고 ContextItem으로 변환.
 */

import type { ContextItem, ContextSourceType } from '../../../types/contextPack';

/**
 * Claude CLI 출력 문자열에서 JSON 배열을 찾아 파싱한다.
 * JSON 파싱 실패 시 title/url 정규식 매칭으로 fallback.
 */
export function parseClaudeOutput(output: string): Array<Record<string, string>> | null {
  const jsonMatch = output.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // Fallback: extract title/url manually
    const titles = [...output.matchAll(/"title"\s*:\s*"([^"]*?)"/g)].map((m) => m[1]);
    const urls = [...output.matchAll(/"url"\s*:\s*"([^"]*?)"/g)].map((m) => m[1]);
    return titles.map((t, i) => ({ title: t, url: urls[i] || '' }));
  }
}

/**
 * stderr에서 "input: 123 output: 456" 형태의 토큰 사용량을 파싱한다.
 */
export function parseTokenUsage(stderr: string): { input: number; output: number } | null {
  const usageMatch = stderr.match(/input[:\s]+(\d+).*output[:\s]+(\d+)/i);
  if (!usageMatch) return null;
  return { input: parseInt(usageMatch[1]), output: parseInt(usageMatch[2]) };
}

/** 알려진 서비스 이름 → ContextSourceType 매핑 */
const knownSourceTypes: Record<string, ContextSourceType> = {
  notion: 'notion',
  slack: 'slack',
  obsidian: 'obsidian',
};

/**
 * 파싱된 JSON 객체를 ContextItem으로 변환한다.
 */
export function toContextItems(
  parsed: Array<Record<string, string>>,
  serviceType: string,
): ContextItem[] {
  return parsed.map((item, i) => ({
    id: `mcp-${serviceType}-${item.id || i}`,
    sourceType: knownSourceTypes[serviceType] || ('pin' as ContextSourceType),
    title: item.parent ? `↳ ${item.title}` : item.title || 'Untitled',
    url: item.url || '',
    summary: item.parent ? `${item.parent}` : item.summary || '',
    timestamp: item.lastEdited || item.timestamp || new Date().toISOString(),
    isNew: false,
    category: 'auto' as const,
    metadata: {
      source: 'mcp',
      ...(item.parent ? { parent: item.parent } : {}),
      ...(item.channel ? { channel: item.channel } : {}),
    },
  }));
}
