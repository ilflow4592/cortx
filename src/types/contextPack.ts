export type ContextSourceType = 'github' | 'slack' | 'notion' | 'pin';

export interface ContextItem {
  id: string;
  sourceType: ContextSourceType;
  title: string;
  url: string;
  summary: string;
  timestamp: string;
  isNew: boolean; // true if added/changed after last pause
  category: 'pinned' | 'linked' | 'auto';
  metadata?: Record<string, string>;
}

export interface ContextSnapshot {
  taskId: string;
  takenAt: string; // ISO timestamp when task was paused
  itemIds: string[];
  itemHashes: Record<string, string>; // id -> hash of content for delta detection
}

export interface ContextSourceConfig {
  type: ContextSourceType;
  enabled: boolean;
  token: string;
  // GitHub
  owner?: string;
  repo?: string;
  // Slack
  slackChannel?: string;
  // Notion
  notionDatabaseId?: string;
}

export interface ContextPackState {
  items: Record<string, ContextItem[]>; // taskId -> items
  snapshots: Record<string, ContextSnapshot>; // taskId -> last snapshot
  sources: ContextSourceConfig[];
  keywords: Record<string, string[]>; // taskId -> search keywords
}
