/**
 * Notion 통합 컨텍스트 소스 — 공개 API.
 *
 * 호출 예시:
 *   collectNotion({ urls: [pinUrl] })                // Pin 단일 URL
 *   collectNotion({ keywords: ['BE-1456'] })         // 키워드 검색
 *   collectNotion({ keywords, urls, maxItems: 5 })   // 혼합
 *
 * 모든 결과 항목은 동일한 ContextItem 형태로 반환되며, MCP fetch가 성공한
 * 항목은 metadata.fullText를 포함한다.
 */

export { collectNotion, isNotionUrl } from './collector';
export type { CollectNotionOptions, NotionSearchHit } from './types';
