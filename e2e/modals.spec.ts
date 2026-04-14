/**
 * 모달 Escape/배경 클릭 dismissal 회귀 — ModalBackdrop 리팩터 안전망.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test('Settings 모달 — Escape로 닫힘', async ({ page }) => {
  // CommandPalette 통해 Settings 열기 — Cmd+K → Settings 검색
  await page.keyboard.press('Meta+k');
  await expect(page.locator('[cmdk-input]')).toBeVisible();
  await page.keyboard.type('Settings');
  await page.keyboard.press('Enter');

  // 모달 role=dialog 노출
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Escape로 닫힘
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Command Palette — Escape로 닫힘', async ({ page }) => {
  await page.keyboard.press('Meta+k');
  const input = page.locator('[cmdk-input]');
  await expect(input).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0, { timeout: 2000 });
});
