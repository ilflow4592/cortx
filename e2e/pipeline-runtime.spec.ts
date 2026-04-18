/**
 * Pipeline 런타임 E2E — 브라우저에서 runPipeline() 실행 시 스트리밍 이벤트
 * 처리 + 파이프라인 phase 마커 반영 + 메시지 캐시 동기화까지 전체 JS 경로
 * 검증. Rust 측은 scripted event emission 으로 대체 (Playwright 브라우저 테스트).
 *
 * 스코프: Tauri invoke/listen 을 window.__TAURI_INTERNALS__ 로 모킹,
 * __shimEmitByPrefix 로 Claude CLI 스트리밍 응답을 재생. 실제 Rust 바이너리 미기동.
 *
 * 커버리지: runPipeline → listen('claude-data-*') 등록 → scripted assistant
 * 텍스트 이벤트 → messageCache 반영 → [PIPELINE:grill_me:in_progress] 마커가
 * taskStore 에 전환 적용되는지까지.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test('runPipeline: scripted stream → assistant 메시지 + phase 마커 적용', async ({ page }) => {
  await installTauriShim(page, (cmd) => {
    if (cmd === 'claude_stop_task') return Promise.resolve();
    if (cmd === 'claude_spawn') return Promise.resolve();
    if (cmd === 'run_shell_command') return Promise.resolve({ success: false, output: '' });
    if (cmd === 'get_builtin_pipeline_skill') return Promise.resolve(null);
    if (cmd === 'list_slash_commands') return Promise.resolve([]);
    if (cmd === 'plugin:sql|select') return Promise.resolve([]);
    return null;
  });

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // 태스크 + 프로젝트 store seeding
  await page.evaluate(async () => {
    const { useTaskStore } = await import('/src/stores/taskStore.ts');
    const { useProjectStore } = await import('/src/stores/projectStore.ts');
    useProjectStore.getState().loadProjects([
      {
        id: 'p1',
        name: 'Test Project',
        localPath: '/tmp/test',
        mainBranch: 'main',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    useTaskStore.getState().loadTasks([
      {
        id: 't1',
        title: 'Test Task',
        status: 'waiting',
        layer: 'feat',
        projectId: 'p1',
        branchName: 'feat/test',
        worktreePath: '/tmp/test',
        repoPath: '/tmp/test',
        elapsedSeconds: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  const result = await page.evaluate(async () => {
    type ShimWindow = {
      __shimEmitByPrefix: (prefix: string, payload: unknown) => void;
      __shimListenerCount: (prefix: string) => number;
    };
    const w = window as unknown as ShimWindow;

    const { runPipeline } = await import('/src/utils/pipelineExec.ts');
    const { messageCache } = await import('/src/utils/chatState.ts');
    const { useTaskStore } = await import('/src/stores/taskStore.ts');

    const runPromise = runPipeline('t1', '/pipeline:dev-task test task');

    // listen('claude-data-*') 등록될 때까지 polling (최대 3초)
    const waitForListener = async () => {
      for (let i = 0; i < 150; i++) {
        if (w.__shimListenerCount('claude-data-claude-t1-') > 0) return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    };
    const listenerReady = await waitForListener();

    // scripted Claude stream-json 재생 — t1 task 용 모든 listener 로 브로드캐스트
    // (reqId 랜덤이므로 prefix 매칭 사용)
    w.__shimEmitByPrefix(
      'claude-data-claude-t1-',
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 'e2e-session-123' }),
    );
    w.__shimEmitByPrefix(
      'claude-data-claude-t1-',
      JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: '[PIPELINE:grill_me:in_progress]\n\nQ1. 사용자 인증 방식은 OAuth인가요?' }],
        },
      }),
    );
    w.__shimEmitByPrefix('claude-done-claude-t1-', {});

    // messageCache 동기화 + 마커 적용 시간
    await new Promise((r) => setTimeout(r, 100));

    // 정리: runPipeline donePromise resolve 후 cleanup
    await Promise.race([runPromise, new Promise((r) => setTimeout(r, 500))]);

    const msgs = messageCache.get('t1') || [];
    const userMsgs = msgs.filter((m) => m.role === 'user');
    const assistantMsgs = msgs.filter((m) => m.role === 'assistant');
    const grillMePhase = useTaskStore.getState().tasks.find((t) => t.id === 't1')?.pipeline?.phases?.grill_me;

    return {
      listenerReady,
      userCount: userMsgs.length,
      assistantCount: assistantMsgs.length,
      assistantFirst: assistantMsgs[0]?.content.trim() || '',
      grillMeStatus: grillMePhase?.status || 'unknown',
    };
  });

  expect(result.listenerReady).toBe(true);
  expect(result.userCount).toBeGreaterThanOrEqual(1);
  expect(result.assistantCount).toBeGreaterThanOrEqual(1);
  expect(result.assistantFirst).toContain('Q1.');
  // 마커가 stripMarkers 로 제거됐는지
  expect(result.assistantFirst).not.toContain('[PIPELINE:grill_me:in_progress]');
  // taskStore phase 전환 적용됐는지
  expect(result.grillMeStatus).toBe('in_progress');
});
