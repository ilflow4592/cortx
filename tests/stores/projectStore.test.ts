import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/stores/projectStore';

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({ projects: [] });
  });

  describe('addProject', () => {
    it('creates a project with correct fields', () => {
      const id = useProjectStore.getState().addProject('Cortx', '/dev/cortx', 'portlogics', 'cortx');
      const project = useProjectStore.getState().projects.find((p) => p.id === id);

      expect(project).toBeDefined();
      expect(project!.name).toBe('Cortx');
      expect(project!.localPath).toBe('/dev/cortx');
      expect(project!.githubOwner).toBe('portlogics');
      expect(project!.githubRepo).toBe('cortx');
      expect(project!.baseBranch).toBe('main');
      expect(project!.slackChannels).toEqual([]);
      expect(project!.color).toBeTruthy();
    });

    it('assigns cycling colors', () => {
      const id1 = useProjectStore.getState().addProject('P1', '/', 'o', 'r');
      const id2 = useProjectStore.getState().addProject('P2', '/', 'o', 'r');

      const p1 = useProjectStore.getState().projects.find((p) => p.id === id1)!;
      const p2 = useProjectStore.getState().projects.find((p) => p.id === id2)!;

      expect(p1.color).not.toBe(p2.color);
    });
  });

  describe('removeProject', () => {
    it('removes project by id', () => {
      const id = useProjectStore.getState().addProject('P', '/', 'o', 'r');
      expect(useProjectStore.getState().projects).toHaveLength(1);

      useProjectStore.getState().removeProject(id);
      expect(useProjectStore.getState().projects).toHaveLength(0);
    });
  });

  describe('updateProject', () => {
    it('updates specified fields', () => {
      const id = useProjectStore.getState().addProject('P', '/', 'o', 'r');
      useProjectStore.getState().updateProject(id, { baseBranch: 'develop', slackChannels: ['C123'] });

      const project = useProjectStore.getState().projects.find((p) => p.id === id)!;
      expect(project.baseBranch).toBe('develop');
      expect(project.slackChannels).toEqual(['C123']);
    });
  });

  describe('loadProjects (migration)', () => {
    it('fills missing fields with defaults', () => {
      const raw = [{ id: 'old1', name: 'Old' } as any];
      useProjectStore.getState().loadProjects(raw);

      const project = useProjectStore.getState().projects[0];
      expect(project.localPath).toBe('');
      expect(project.githubOwner).toBe('');
      expect(project.baseBranch).toBe('main');
      expect(project.slackChannels).toEqual([]);
      expect(project.color).toBe('#818cf8');
    });

    it('preserves existing fields during migration', () => {
      const raw = [{ id: 'p1', name: 'Existing', localPath: '/dev/app', baseBranch: 'develop', slackChannels: ['C1'] } as any];
      useProjectStore.getState().loadProjects(raw);

      const project = useProjectStore.getState().projects[0];
      expect(project.localPath).toBe('/dev/app');
      expect(project.baseBranch).toBe('develop');
      expect(project.slackChannels).toEqual(['C1']);
    });
  });
});
