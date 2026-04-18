/**
 * Context Pack 직렬화 — useClaudeSession 에서 추출한 순수 함수.
 * 외부 콘텐츠 (Notion/Slack/GitHub/Pin) 를 trust boundary 로 감싸고
 * indirect injection 패턴을 스캔해 guardrail 이벤트 발행.
 */
import type { ContextItem } from '../../types/contextPack';
import { sanitizeExternalContent } from '../../services/contextSanitizer';
import { recordAndPublish } from '../../services/guardrailEventBus';

const SOURCE_LABELS: Record<string, string> = {
  github: 'GitHub',
  slack: 'Slack',
  notion: 'Notion',
  pin: 'Pinned',
};

export function serializeContextItems(items: ContextItem[], taskId?: string): string {
  if (items.length === 0) return '';

  const sections: string[] = [];
  const bySource: Record<string, ContextItem[]> = {};

  for (const item of items) {
    const key = item.sourceType;
    if (!bySource[key]) bySource[key] = [];
    bySource[key].push(item);
  }

  for (const [source, sourceItems] of Object.entries(bySource)) {
    const label = SOURCE_LABELS[source] || source;
    const lines = sourceItems.map((item) => {
      const parts = [`- **${item.title}**`];
      if (item.summary && item.summary !== 'Pinned') parts.push(`  ${item.summary}`);
      if (item.url && item.url.startsWith('http')) parts.push(`  ${item.url}`);
      if (item.metadata?.fullText) {
        const { wrapped, findings } = sanitizeExternalContent(item.metadata.fullText, source);
        if (findings.length > 0) {
          void recordAndPublish('context_injection_detected', {
            source,
            taskId,
            patternCount: findings.length,
            severities: findings.map((f) => f.severity),
          });
        }
        parts.push(`\n${wrapped}`);
      }
      return parts.join('\n');
    });
    sections.push(`## ${label}\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
