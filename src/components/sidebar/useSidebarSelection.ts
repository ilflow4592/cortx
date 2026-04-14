/**
 * Sidebar 선택/접기 상태 관리 훅.
 *
 * 선택된 태스크 집합, 접힌 프로젝트 집합, 삭제 확인 모달 대상을 Sidebar
 * 컴포넌트 밖으로 빼 책임 경계를 명확히 한다.
 */
import { useState, useCallback } from 'react';

export interface DeleteProjectTarget {
  id: string;
  name: string;
  taskCount: number;
}

export function useSidebarSelection() {
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<DeleteProjectTarget | null>(null);

  const toggleSelect = useCallback((id: string) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedTasks(new Set()), []);

  return {
    // selection
    selectedTasks,
    setSelectedTasks,
    toggleSelect,
    clearSelection,

    // collapse
    collapsedProjects,
    toggleCollapse,

    // reset confirm
    showResetConfirm,
    setShowResetConfirm,

    // delete project modal
    deleteProjectTarget,
    setDeleteProjectTarget,
  };
}
