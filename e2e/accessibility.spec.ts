/**
 * 접근성 스모크 — axe 대신 경량 휴리스틱.
 * 1) 모든 button 에 accessible name (textContent or aria-label or title) 이 있다
 * 2) 모든 img 에 alt (또는 role=presentation) 이 있다
 * 3) 모든 role=dialog 에 aria-label or aria-labelledby 이 있다
 * 4) 모달 오픈 시 포커스가 다이얼로그 내부로 이동한다
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test('초기 페이지 — 모든 button 에 accessible name 이 있다', async ({ page }) => {
  const bad = await page.$$eval('button', (btns) =>
    btns
      .filter((b) => {
        const aria = b.getAttribute('aria-label');
        const title = b.getAttribute('title');
        const text = (b.textContent || '').trim();
        return !aria && !title && !text;
      })
      .map((b) => b.outerHTML.slice(0, 200)),
  );
  expect(bad, `accessible name 누락 button: ${bad.join('\n')}`).toHaveLength(0);
});

test('초기 페이지 — 모든 img 에 alt 속성이 있다', async ({ page }) => {
  const bad = await page.$$eval(
    'img',
    (imgs) => imgs.filter((i) => i.getAttribute('alt') === null && i.getAttribute('role') !== 'presentation').length,
  );
  expect(bad).toBe(0);
});

test('role=dialog 요소는 aria-label 또는 aria-labelledby 를 가진다', async ({ page }) => {
  // Settings 모달 오픈
  await page.keyboard.press('Meta+k');
  await page.keyboard.type('Open Settings');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').first()).toBeVisible();

  const labeled = await page.$$eval('[role="dialog"]', (els) =>
    els.every((e) => e.hasAttribute('aria-label') || e.hasAttribute('aria-labelledby')),
  );
  expect(labeled).toBe(true);
});

test('모달 오픈 시 포커스가 다이얼로그 내부로 이동한다 — Command Palette input', async ({ page }) => {
  await page.keyboard.press('Meta+k');
  const input = page.locator('[cmdk-input]');
  await expect(input).toBeVisible();
  // CommandPalette는 open 시 inputRef.current?.focus() 호출 → cmdk input 에 포커스
  await expect(input).toBeFocused();
});

test('Palette Escape 후 — 바디(또는 루트 요소)로 포커스 복귀', async ({ page }) => {
  await page.keyboard.press('Meta+k');
  await expect(page.locator('[cmdk-input]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('[cmdk-input]')).toHaveCount(0);
  // 팔레트 unmount 후 포커스는 body 로 돌아가는 것이 기본. 다이얼로그 잔존 포커스가 없어야 한다.
  const activeTag = await page.evaluate(() => document.activeElement?.tagName.toLowerCase() || 'none');
  expect(['body', 'html', 'none']).toContain(activeTag);
});
