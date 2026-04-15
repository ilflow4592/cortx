/**
 * Notion 통합 컨텍스트 소스 타입.
 */

/** Notion 검색 결과의 메타데이터 (본문 fetch 전 단계). */
export interface NotionSearchHit {
  title: string;
  url: string;
  /** Notion page ID (32자 hex, 하이픈 제거). search 시 추출 가능하면 채움. */
  id?: string;
  /** 부모 페이지 제목/식별자. 검색 결과의 계층 표현에 사용. */
  parent?: string;
}

/** collectNotion 옵션. */
export interface CollectNotionOptions {
  /** 키워드 검색 모드. urls와 동시 사용 가능 (병합 후 fetch). */
  keywords?: string[];
  /** 직접 URL 모드 (Pin 등). 검색 없이 fullText만 가져옴. */
  urls?: string[];
  /** 검색 결과 상한. default 10. */
  maxItems?: number;
  /** 본문 fetch 동시성. default 4. Claude+MCP 호출이 직렬화돼 hang나는 것 방지. */
  parallelism?: number;
  /** Claude 모델 (검색용). default Haiku. */
  model?: string;
}
