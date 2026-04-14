/**
 * @module vector-search
 * 로컬 벡터 검색 엔진.
 * Ollama(임베딩 생성) + Qdrant(벡터 DB)를 사용하여 100% 로컬에서 실행된다.
 * 컨텍스트 아이템(Slack 메시지, GitHub 이슈, Notion 페이지 등)을 벡터로 저장하고,
 * 시맨틱 유사도 기반으로 관련 컨텍스트를 검색한다.
 * 또한 KeyBERT 스타일의 키워드 추출 기능도 제공한다.
 */

export type { VectorItem } from './store';
export { storeContext, storeContextBatch } from './store';
export { searchContext, searchGlobalContext, checkVectorServices, extractKeywords } from './search';
