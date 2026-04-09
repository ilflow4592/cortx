/** Module-level caches — survive component unmount/remount on task switch */

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'activity';
  content: string;
  toolName?: string;
}

export const messageCache = new Map<string, Message[]>();
export const sessionCache = new Map<string, string>();
export const loadingCache = new Map<string, boolean>();
