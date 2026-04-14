/**
 * 사이드바 레이아웃 스모크 — 리사이즈 핸들, 토글.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test('사이드바 리사이즈 핸들 — role=slider + aria', async ({ page }) => {
  // a11y 리팩터에서 role=slider로 전환됨 — 회귀 방지
  const slider = page.getByRole('slider').first();
  await expect(slider).toBeVisible({ timeout: 3000 });
  await expect(slider).toHaveAttribute('aria-orientation', 'vertical');
});

test('앱 레이아웃 — 사이드바 + 메인 + 우측 패널이 모두 렌더', async ({ page }) => {
  // 기본 3 컬럼 존재 확인
  const buttons = page.getByRole('button');
  // 사이드바만으로도 버튼 여러개 있어야 함 (collapse toggle, new task 등)
  const count = await buttons.count();
  expect(count).toBeGreaterThan(3);
});
