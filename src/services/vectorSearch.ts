/**
 * @module vectorSearch
 * Back-compat shim — real implementation lives in ./vector-search/index.ts
 */
export type { VectorItem } from './vector-search/index';
export {
  storeContext,
  storeContextBatch,
  searchContext,
  searchGlobalContext,
  checkVectorServices,
  extractKeywords,
} from './vector-search/index';
