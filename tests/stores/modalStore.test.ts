import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from '../../src/stores/modalStore';

describe('useModalStore', () => {
  beforeEach(() => {
    // 각 테스트 전 상태 초기화
    useModalStore.setState({
      newProject: false,
      settings: false,
      report: false,
      onboarding: false,
      crashRecovery: false,
      costDashboard: false,
      worktreeCleanup: false,
      mcpManager: false,
      slashBuilder: false,
      updateChecker: false,
      commandPalette: false,
      newTask: { open: false, projectId: undefined },
      editProjectId: null,
      pipelineConfigEditor: null,
    });
  });

  describe('open/close simple modals', () => {
    it('opens and closes a simple modal', () => {
      useModalStore.getState().open('settings');
      expect(useModalStore.getState().settings).toBe(true);
      useModalStore.getState().close('settings');
      expect(useModalStore.getState().settings).toBe(false);
    });
  });

  describe('openNewTask with projectId', () => {
    it('opens with projectId', () => {
      useModalStore.getState().openNewTask('p1');
      expect(useModalStore.getState().newTask).toEqual({ open: true, projectId: 'p1' });
    });
    it('opens without projectId', () => {
      useModalStore.getState().openNewTask();
      expect(useModalStore.getState().newTask).toEqual({ open: true, projectId: undefined });
    });
    it('closeNewTask resets projectId', () => {
      useModalStore.getState().openNewTask('p1');
      useModalStore.getState().closeNewTask();
      expect(useModalStore.getState().newTask).toEqual({ open: false, projectId: undefined });
    });
  });

  describe('openPipelineEditor', () => {
    it('stores path + name', () => {
      useModalStore.getState().openPipelineEditor('/repo', 'my-proj');
      expect(useModalStore.getState().pipelineConfigEditor).toEqual({ path: '/repo', name: 'my-proj' });
    });
    it('close clears', () => {
      useModalStore.getState().openPipelineEditor('/repo', 'x');
      useModalStore.getState().closePipelineEditor();
      expect(useModalStore.getState().pipelineConfigEditor).toBeNull();
    });
  });

  describe('closeTopmost priority stack', () => {
    it('closes editProject first when open', () => {
      useModalStore.getState().openEditProject('p1');
      useModalStore.getState().open('report');
      useModalStore.getState().open('settings');
      expect(useModalStore.getState().closeTopmost()).toBe(true);
      expect(useModalStore.getState().editProjectId).toBeNull();
      // 다른 모달은 그대로
      expect(useModalStore.getState().report).toBe(true);
      expect(useModalStore.getState().settings).toBe(true);
    });
    it('then closes report', () => {
      useModalStore.getState().open('report');
      useModalStore.getState().open('settings');
      useModalStore.getState().closeTopmost();
      expect(useModalStore.getState().report).toBe(false);
      expect(useModalStore.getState().settings).toBe(true);
    });
    it('returns false when nothing to close', () => {
      expect(useModalStore.getState().closeTopmost()).toBe(false);
    });
  });

  describe('toggleCommandPalette', () => {
    it('flips on/off', () => {
      useModalStore.getState().toggleCommandPalette();
      expect(useModalStore.getState().commandPalette).toBe(true);
      useModalStore.getState().toggleCommandPalette();
      expect(useModalStore.getState().commandPalette).toBe(false);
    });
  });
});
