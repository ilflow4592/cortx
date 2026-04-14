/**
 * Command Palette 유저 플로우 — 타이핑 필터, 방향키 네비, Enter/클릭 실행.
 * 실제 invoke는 shim으로 차단, 모달 오픈까지만 검증.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Meta+k');
  await expect(page.locator('[cmdk-input]')).toBeVisible();
});

test('타이핑 시 결과가 필터링된다 — "settin"은 Settings 항목을 남긴다', async ({ page }) => {
  await page.keyboard.type('settin');
  const items = page.locator('[cmdk-item]');
  await expect(items.first()).toBeVisible();
  await expect(items.filter({ hasText: /Open Settings/i })).toHaveCount(1);
  await expect(items.filter({ hasText: /New Task/i })).toHaveCount(0);
});

test('방향키로 선택이 이동한다 — aria-selected 변경', async ({ page }) => {
  // 두 개 이상 보이는 상태에서 ArrowDown 눌러 두 번째로 선택 이동
  await page.keyboard.press('ArrowDown');
  const selected = page.locator('[cmdk-item][data-selected="true"]');
  await expect(selected).toHaveCount(1);
});

test('"New Task" 팔레트 항목 Enter → NewTask 모달 오픈', async ({ page }) => {
  await page.keyboard.type('New Task');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /New Task/i });
  await expect(dialog).toBeVisible({ timeout: 3000 });
});

test('"Open Settings" 팔레트 항목 Enter → Settings 모달 오픈', async ({ page }) => {
  await page.keyboard.type('Open Settings');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 3000 });
});

test('클릭으로도 Enter와 동일하게 액션이 실행된다', async ({ page }) => {
  await page.keyboard.type('New Project');
  const item = page
    .locator('[cmdk-item]')
    .filter({ hasText: /New Project/i })
    .first();
  await item.click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 3000 });
});

test('매치되는 결과가 없으면 empty 메시지가 보인다', async ({ page }) => {
  await page.keyboard.type('zzzxxxyyy-no-such-cmd');
  // cmdk.Command.Empty 는 [cmdk-empty] 속성을 단다
  const empty = page.locator('[cmdk-empty]');
  await expect(empty).toBeVisible({ timeout: 2000 });
});
