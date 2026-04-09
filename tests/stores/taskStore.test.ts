import { describe, it, expect, beforeEach } from 'vitest';
import { useTaskStore } from '../../src/stores/taskStore';

describe('taskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({ tasks: [], activeTaskId: null });
  });

  describe('addTask', () => {
    it('creates a task with correct defaults', () => {
      const id = useTaskStore.getState().addTask('Test task', '/repo', 'feat/test');
      const task = useTaskStore.getState().tasks.find((t) => t.id === id);

      expect(task).toBeDefined();
      expect(task!.title).toBe('Test task');
      expect(task!.status).toBe('waiting');
      expect(task!.layer).toBe('focus');
      expect(task!.repoPath).toBe('/repo');
      expect(task!.branchName).toBe('feat/test');
      expect(task!.elapsedSeconds).toBe(0);
      expect(task!.chatHistory).toEqual([]);
      expect(task!.interrupts).toEqual([]);
    });

    it('accepts extra fields', () => {
      const id = useTaskStore.getState().addTask('Test', '/repo', 'br', { memo: 'hello' });
      const task = useTaskStore.getState().tasks.find((t) => t.id === id);
      expect(task!.memo).toBe('hello');
    });
  });

  describe('removeTask', () => {
    it('removes task by id', () => {
      const id = useTaskStore.getState().addTask('To remove', '/r', 'b');
      expect(useTaskStore.getState().tasks).toHaveLength(1);

      useTaskStore.getState().removeTask(id);
      expect(useTaskStore.getState().tasks).toHaveLength(0);
    });

    it('clears activeTaskId if removed task was active', () => {
      const id = useTaskStore.getState().addTask('Active', '/r', 'b');
      useTaskStore.setState({ activeTaskId: id });

      useTaskStore.getState().removeTask(id);
      expect(useTaskStore.getState().activeTaskId).toBeNull();
    });
  });

  describe('startTask', () => {
    it('sets task to active and selects it', () => {
      const id = useTaskStore.getState().addTask('Task', '/r', 'b');
      useTaskStore.getState().startTask(id);

      const task = useTaskStore.getState().tasks.find((t) => t.id === id);
      expect(task!.status).toBe('active');
      expect(useTaskStore.getState().activeTaskId).toBe(id);
    });

    it('pauses previously active task (single-active guarantee)', () => {
      const id1 = useTaskStore.getState().addTask('First', '/r', 'b1');
      const id2 = useTaskStore.getState().addTask('Second', '/r', 'b2');

      useTaskStore.getState().startTask(id1);
      useTaskStore.getState().startTask(id2);

      const t1 = useTaskStore.getState().tasks.find((t) => t.id === id1);
      const t2 = useTaskStore.getState().tasks.find((t) => t.id === id2);

      expect(t1!.status).toBe('paused');
      expect(t2!.status).toBe('active');
    });
  });

  describe('pauseWithReason / resumeTask', () => {
    it('pauses with interrupt entry and resumes with duration', () => {
      const id = useTaskStore.getState().addTask('Task', '/r', 'b');
      useTaskStore.getState().startTask(id);

      useTaskStore.getState().pauseWithReason(id, 'meeting', 'standup');

      let task = useTaskStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.status).toBe('paused');
      expect(task.interrupts).toHaveLength(1);
      expect(task.interrupts[0].reason).toBe('meeting');
      expect(task.interrupts[0].memo).toBe('standup');
      expect(task.interrupts[0].resumedAt).toBeNull();

      useTaskStore.getState().resumeTask(id);

      task = useTaskStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.status).toBe('active');
      expect(task.interrupts[0].resumedAt).toBeTruthy();
      expect(task.interrupts[0].durationSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setTaskStatus', () => {
    it('sets status and optional memo', () => {
      const id = useTaskStore.getState().addTask('Task', '/r', 'b');
      useTaskStore.getState().setTaskStatus(id, 'done', 'completed');

      const task = useTaskStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.status).toBe('done');
      expect(task.memo).toBe('completed');
    });

    it('clears activeTaskId when task is marked done', () => {
      const id = useTaskStore.getState().addTask('Task', '/r', 'b');
      useTaskStore.setState({ activeTaskId: id });

      useTaskStore.getState().setTaskStatus(id, 'done');
      expect(useTaskStore.getState().activeTaskId).toBeNull();
    });
  });

  describe('incrementTimer', () => {
    it('increments elapsedSeconds by 1', () => {
      const id = useTaskStore.getState().addTask('Task', '/r', 'b');
      useTaskStore.getState().incrementTimer(id);
      useTaskStore.getState().incrementTimer(id);

      const task = useTaskStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.elapsedSeconds).toBe(2);
    });
  });

  describe('loadTasks (migration)', () => {
    it('fills missing fields with defaults', () => {
      const rawTasks = [
        { id: 'old1', title: 'Old task' } as any,
      ];

      useTaskStore.getState().loadTasks(rawTasks, 'old1');

      const task = useTaskStore.getState().tasks[0];
      expect(task.status).toBe('waiting');
      expect(task.layer).toBe('focus');
      expect(task.branchName).toBe('');
      expect(task.elapsedSeconds).toBe(0);
      expect(task.chatHistory).toEqual([]);
      expect(task.interrupts).toEqual([]);
      expect(task.createdAt).toBeTruthy();
    });

    it('preserves existing fields during migration', () => {
      const rawTasks = [
        { id: 't1', title: 'Existing', status: 'active', elapsedSeconds: 100, chatHistory: [{ id: 'm1', role: 'user', content: 'hi', timestamp: '' }] } as any,
      ];

      useTaskStore.getState().loadTasks(rawTasks, 't1');

      const task = useTaskStore.getState().tasks[0];
      expect(task.status).toBe('active');
      expect(task.elapsedSeconds).toBe(100);
      expect(task.chatHistory).toHaveLength(1);
    });
  });

  describe('addChatMessage', () => {
    it('appends a message to task chatHistory', () => {
      const id = useTaskStore.getState().addTask('Task', '/r', 'b');
      useTaskStore.getState().addChatMessage(id, {
        id: 'msg1',
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString(),
      });

      const task = useTaskStore.getState().tasks.find((t) => t.id === id)!;
      expect(task.chatHistory).toHaveLength(1);
      expect(task.chatHistory[0].content).toBe('Hello');
    });
  });
});
