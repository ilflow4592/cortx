import { describe, it, expect, beforeEach } from 'vitest';
import { useLayoutStore, LAYOUT_INITIAL_STATE } from '../../src/stores/layoutStore';

describe('useLayoutStore', () => {
  beforeEach(() => {
    useLayoutStore.setState(LAYOUT_INITIAL_STATE);
  });

  describe('setSidebarWidth clamps', () => {
    it('clamps below minimum (160)', () => {
      useLayoutStore.getState().setSidebarWidth(50);
      expect(useLayoutStore.getState().sidebarWidth).toBe(160);
    });
    it('clamps above maximum (400)', () => {
      useLayoutStore.getState().setSidebarWidth(999);
      expect(useLayoutStore.getState().sidebarWidth).toBe(400);
    });
    it('preserves values in range', () => {
      useLayoutStore.getState().setSidebarWidth(300);
      expect(useLayoutStore.getState().sidebarWidth).toBe(300);
    });
    it('accepts exact min/max', () => {
      useLayoutStore.getState().setSidebarWidth(160);
      expect(useLayoutStore.getState().sidebarWidth).toBe(160);
      useLayoutStore.getState().setSidebarWidth(400);
      expect(useLayoutStore.getState().sidebarWidth).toBe(400);
    });
  });

  describe('toggles', () => {
    it('toggleSidebar flips visibility', () => {
      useLayoutStore.getState().toggleSidebar();
      expect(useLayoutStore.getState().showSidebar).toBe(false);
      useLayoutStore.getState().toggleSidebar();
      expect(useLayoutStore.getState().showSidebar).toBe(true);
    });
    it('toggleRightPanel flips visibility', () => {
      useLayoutStore.getState().toggleRightPanel();
      expect(useLayoutStore.getState().showRightPanel).toBe(false);
    });
    it('setIsResizing updates flag', () => {
      useLayoutStore.getState().setIsResizing(true);
      expect(useLayoutStore.getState().isResizing).toBe(true);
    });
  });
});
