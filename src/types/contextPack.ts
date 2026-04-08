/**
 * @module types/contextPack
 * Context Pack 타입 정의.
 * 작업 중단/재개 시 변경된 외부 컨텍스트(GitHub, Slack, Notion 등)를
 * 자동 수집하여 작업 복귀 시 빠르게 파악할 수 있게 한다.
 */

/** 컨텍스트 소스 유형 */
export type ContextSourceType = 'github' | 'slack' | 'notion' | 'pin';

/** 수집된 컨텍스트 항목 1건 */
export interface ContextItem {
  id: string;
  sourceType: ContextSourceType;
  title: string;
  url: string;
  /** AI가 생성한 요약 텍스트 */
  summary: string;
  /** ISO timestamp */
  timestamp: string;
  /** 마지막 중단 이후 새로 추가/변경된 항목이면 true */
  isNew: boolean;
  /** pinned: 수동 고정, linked: PR/이슈 연결, auto: 자동 수집 */
  category: 'pinned' | 'linked' | 'auto';
  /** 소스별 추가 메타데이터 (예: PR 번호, 채널명 등) */
  metadata?: Record<string, string>;
}

/** 작업 중단 시점의 컨텍스트 스냅샷 — 재개 시 delta 감지에 사용 */
export interface ContextSnapshot {
  taskId: string;
  /** ISO timestamp — 스냅샷 생성 시점 (= 작업 중단 시점) */
  takenAt: string;
  /** 스냅샷에 포함된 컨텍스트 항목 ID 목록 */
  itemIds: string[];
  /** 항목별 콘텐츠 해시 — 재개 시 변경 감지용 (id → hash) */
  itemHashes: Record<string, string>;
}

/** 외부 소스 연결 설정 */
export interface ContextSourceConfig {
  type: ContextSourceType;
  enabled: boolean;
  /** API 인증 토큰 */
  token: string;
  // GitHub 전용
  owner?: string;
  repo?: string;
  // Slack 전용
  slackChannel?: string;
  // Notion 전용
  notionDatabaseId?: string;
}

/** Context Pack 전체 상태 (Zustand store용) */
export interface ContextPackState {
  /** taskId → 해당 작업의 컨텍스트 항목 목록 */
  items: Record<string, ContextItem[]>;
  /** taskId → 마지막 스냅샷 */
  snapshots: Record<string, ContextSnapshot>;
  /** 등록된 외부 소스 설정 목록 */
  sources: ContextSourceConfig[];
  /** taskId → 자동 수집에 사용할 검색 키워드 */
  keywords: Record<string, string[]>;
}
