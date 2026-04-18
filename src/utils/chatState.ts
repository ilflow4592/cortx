/** Module-level caches — survive component unmount/remount on task switch */
import type { Message } from '../components/claude/types';

export const messageCache = new Map<string, Message[]>();
export const sessionCache = new Map<string, string>();
export const loadingCache = new Map<string, boolean>();
