/**
 * DnD utils E2E — Pipeline Builder 의 드래그앤드랍이 Tauri WebKit 에서 정상
 * 작동하는지. 핵심 이슈는 `dataTransfer.setData` 가 custom MIME 만으로는 안 돼
 * text/plain fallback 이 필요한 것. 이 테스트는 setDragPayload/getDragPayload
 * 유틸이 올바른 MIME 조합을 설정하는지만 검증.
 *
 * 브라우저 DnD 시뮬은 까다로워 low-level window evaluate 로 유틸을 직접 호출.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
});

test('setDragPayload — custom MIME + text/plain 동시 설정', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(async () => {
    const mod = await import('/src/components/pipeline-builder/dndUtils.ts');
    const { setDragPayload, getDragPayload } = mod as typeof import('/src/components/pipeline-builder/dndUtils');

    const dt = new DataTransfer();
    const mockEvent = { dataTransfer: dt } as unknown as React.DragEvent;
    setDragPayload(mockEvent, 'application/cortx-skill', 'hello');

    return {
      skillMime: dt.getData('application/cortx-skill'),
      textPlain: dt.getData('text/plain'),
      fallback: getDragPayload(mockEvent, 'application/cortx-skill'),
    };
  });

  expect(result.skillMime).toBe('hello');
  expect(result.textPlain).toBe('hello');
  expect(result.fallback).toBe('hello');
});

test('getDragPayload — custom MIME 비어 있으면 text/plain fallback', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(async () => {
    const mod = await import('/src/components/pipeline-builder/dndUtils.ts');
    const { getDragPayload } = mod as typeof import('/src/components/pipeline-builder/dndUtils');

    const dt = new DataTransfer();
    dt.setData('text/plain', 'fallback-only');
    const mockEvent = { dataTransfer: dt } as unknown as React.DragEvent;

    return getDragPayload(mockEvent, 'application/cortx-skill');
  });

  expect(result).toBe('fallback-only');
});
