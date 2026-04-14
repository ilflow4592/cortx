/**
 * 레이아웃 토글 — Cmd+B 사이드바, Cmd+Shift+B 우측 패널.
 * 우측 패널 slider 는 active task 가 있어야만 MainPanel 이 렌더하므로
 * 여기서는 StatusBar 의 toggle 버튼 색상(활성=보라, 비활성=회색)으로 상태를 검증.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test('Cmd+B — 사이드바 resize slider 가시성이 토글된다', async ({ page }) => {
  const sidebarSlider = page.getByRole('slider', { name: /Resize sidebar/i });
  await expect(sidebarSlider).toBeVisible();

  await page.keyboard.press('Meta+b');
  // showSidebar=false → slider 자체가 unmount 된다 (App.tsx: {layout.showSidebar && ...})
  await expect(sidebarSlider).toHaveCount(0, { timeout: 2000 });

  await page.keyboard.press('Meta+b');
  await expect(sidebarSlider).toBeVisible({ timeout: 2000 });
});

test('Cmd+Shift+B — StatusBar 우측 패널 토글 버튼 색이 바뀐다', async ({ page }) => {
  // 텍스트 "panel" 을 가진 StatusBar 버튼 선택 (accessible name 은 "⌘⇧B panel")
  const btn = page.locator('button[title^="Toggle right panel"]');
  await expect(btn).toBeVisible();
  const initialColor = await btn.evaluate((el) => getComputedStyle(el).color);

  await page.keyboard.press('Meta+Shift+B');
  // 색이 달라질 때까지 poll — showRightPanel 토글 → #818cf8(accent) 로 전환
  await expect
    .poll(async () => btn.evaluate((el) => getComputedStyle(el).color), { timeout: 2000 })
    .not.toBe(initialColor);
});

test('StatusBar 사이드바 토글 버튼 — 클릭으로 사이드바 unmount', async ({ page }) => {
  const sidebarSlider = page.getByRole('slider', { name: /Resize sidebar/i });
  await expect(sidebarSlider).toBeVisible();
  // StatusBar 의 Toggle sidebar 버튼 — title 속성으로 선택 (Dock 버튼과 구분 위해 text 포함)
  await page.locator('button[title^="Toggle sidebar"]').first().click();
  await expect(sidebarSlider).toHaveCount(0, { timeout: 2000 });
});
