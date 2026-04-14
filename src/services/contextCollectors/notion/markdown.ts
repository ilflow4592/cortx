/**
 * @module contextCollectors/notion/markdown
 * Notion block array → plain-text/markdown 변환.
 */

interface NotionBlock {
  type: string;
  child_page?: { title?: string };
  child_database?: { title?: string };
  [key: string]: unknown;
}

/**
 * Notion API의 block 응답 배열을 줄바꿈으로 구분된 텍스트로 변환한다.
 * rich_text를 포함하는 모든 블록 타입과 child_page/child_database를 처리.
 */
export function blocksToMarkdown(blocks: NotionBlock[]): string {
  const texts: string[] = [];
  for (const block of blocks) {
    const blockBody = block[block.type] as { rich_text?: Array<{ plain_text: string }> } | undefined;
    const richTexts = blockBody?.rich_text;
    if (richTexts) {
      const line = richTexts.map((t) => t.plain_text).join('');
      if (line) texts.push(line);
    }
    if (block.type === 'child_page') {
      texts.push(`[Page] ${block.child_page?.title || ''}`);
    }
    if (block.type === 'child_database') {
      texts.push(`[Database] ${block.child_database?.title || ''}`);
    }
  }
  return texts.join('\n');
}
