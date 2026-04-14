/**
 * ContextPack의 store 셀렉터 · 파생 데이터를 한곳에서 계산.
 *
 * 이전에는 ContextPack.tsx 상단 40+줄이 zustand 셀렉터였다. taskId 기반 slice가
 * 반복되고 정렬/필터/newCount는 매번 계산되지만 순수 함수라 훅으로 묶어 격리.
 */
import { useContextPackStore } from '../../stores/contextPackStore';
import { useContextHistoryStore } from '../../stores/contextHistoryStore';
import { useMcpStore } from '../../stores/mcpStore';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectStore } from '../../stores/projectStore';
import type { ContextItem } from '../../types/contextPack';

const SOURCE_ORDER: Record<string, number> = { github: 0, notion: 1, slack: 2, obsidian: 3, pin: 4 };

export interface ContextPackData {
  // 원시 store 상태
  isCollecting: boolean;
  collectProgress: ReturnType<typeof useContextPackStore.getState>['collectProgresses'][string];
  sources: ReturnType<typeof useContextPackStore.getState>['sources'];
  taskItems: ContextItem[];
  taskDelta: ContextItem[];
  lastCollectedAt: string | undefined;
  storedKeywords: string[];
  mcpServers: ReturnType<typeof useMcpStore.getState>['servers'];

  // 조인된 엔티티
  task: ReturnType<typeof useTaskStore.getState>['tasks'][number] | undefined;
  project: ReturnType<typeof useProjectStore.getState>['projects'][number] | null;
  /** MCP settings, .mcp.json, ~/.claude.json 모두 project root 기준 — worktree 경로 아님 */
  projectCwd: string;

  // 파생 데이터
  /** sourceType 기준 정렬된 아이템 */
  sortedItems: ContextItem[];
  /** delta 이후 isNew 표시된 아이템 수 */
  newCount: number;
}

export function useContextPackData(taskId: string): ContextPackData {
  // || fallback은 셀렉터 *외부*에서 — 내부 시 매 getSnapshot마다 새 ref 반환해
  // useSyncExternalStore "snapshot should be cached" 경고 유발.
  const isCollecting = useContextPackStore((s) => s.collecting[taskId]) || false;
  const collectProgress = useContextPackStore((s) => s.collectProgresses[taskId]) || [];
  const sources = useContextPackStore((s) => s.sources);
  const taskItemsRaw = useContextPackStore((s) => s.items[taskId]);
  const taskDeltaRaw = useContextHistoryStore((s) => s.deltaItems[taskId]);
  const lastCollectedAt = useContextPackStore((s) => s.lastCollectedAt[taskId]);
  const storedKeywords = useContextPackStore((s) => s.keywords[taskId]) || [];

  const mcpServers = useMcpStore((s) => s.servers);
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === taskId));
  const projects = useProjectStore((s) => s.projects);
  const project = task?.projectId ? projects.find((p) => p.id === task.projectId) || null : null;

  const taskItems = taskItemsRaw || [];
  const taskDelta = taskDeltaRaw || [];
  const projectCwd = project?.localPath || task?.repoPath || '';

  const sortedItems = [...taskItems].sort(
    (a, b) => (SOURCE_ORDER[a.sourceType] ?? 9) - (SOURCE_ORDER[b.sourceType] ?? 9),
  );
  const newCount = taskItems.filter((i) => i.isNew).length;

  return {
    isCollecting,
    collectProgress,
    sources,
    taskItems,
    taskDelta,
    lastCollectedAt,
    storedKeywords,
    mcpServers,
    task,
    project,
    projectCwd,
    sortedItems,
    newCount,
  };
}
