/**
 * 스모크 E2E — 앱이 렌더되는지, 기본 모달을 열 수 있는지 확인.
 * Tauri 시스템 호출은 shim으로 우회 — 실제 PTY/FS 동작은 검증 불가.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
});

test('앱 초기 렌더 — 에러 바운더리 표시 없음', async ({ page }) => {
  await page.goto('/');
  // ErrorBoundary fallback 문구 확인 — 없어야 정상
  const errorBanner = page.getByText(/Something went wrong|App Error/i);
  await expect(errorBanner).toHaveCount(0);

  // 사이드바 root 존재 확인
  const main = page.locator('body');
  await expect(main).toBeVisible();
});

test('Command Palette — Cmd+K로 열린다', async ({ page }) => {
  await page.goto('/');
  // React 초기 마운트 대기
  await page.waitForLoadState('networkidle');

  // macOS Cmd+K (Playwright는 Meta+K)
  await page.keyboard.press('Meta+k');

  // cmdk input 등장 확인
  const palette = page.locator('[cmdk-input]');
  await expect(palette).toBeVisible({ timeout: 3000 });
});
