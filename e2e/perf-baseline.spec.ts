/**
 * Performance baseline — 초기 렌더 + JS heap 상한.
 * 회귀 방지 가드. Playwright chromium 브라우저 측정이라 Tauri 네이티브 콜드
 * 스타트와 정확히 일치하지 않지만, frontend 번들/실행 회귀는 잡아낸다.
 *
 * 임계값은 여유 있게 잡음 (측정값 × 2 상한):
 * - DOMContentLoaded: 3000ms (현재 로컬 ~500ms)
 * - load: 5000ms
 * - JS heap after networkidle: 80 MB (현재 로컬 ~40 MB)
 *
 * CI 환경 느리면 retry + threshold 완화.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

interface PerfTiming {
  domContentLoaded: number;
  load: number;
  jsHeapMB: number | null;
}

test('perf: 초기 로드 + heap 예산 준수', async ({ page }) => {
  await installTauriShim(page);
  await page.goto('/', { waitUntil: 'networkidle' });

  const timing: PerfTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    type MemInfo = { usedJSHeapSize: number };
    const mem = (performance as unknown as { memory?: MemInfo }).memory;
    return {
      domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : -1,
      load: nav ? nav.loadEventEnd - nav.startTime : -1,
      jsHeapMB: mem ? Math.round((mem.usedJSHeapSize / 1024 / 1024) * 10) / 10 : null,
    };
  });

  // 로그 — 회귀 관찰용. CI 출력에 남음.
  console.log(`[perf] DOMContentLoaded=${timing.domContentLoaded}ms load=${timing.load}ms heap=${timing.jsHeapMB}MB`);

  expect(timing.domContentLoaded).toBeGreaterThan(0);
  expect(timing.domContentLoaded).toBeLessThan(3000);
  expect(timing.load).toBeLessThan(5000);
  if (timing.jsHeapMB !== null) {
    expect(timing.jsHeapMB).toBeLessThan(80);
  }
});

test('perf: lazy chunk 분리 — 초기 로드 시 xterm/monaco/PipelineBuilder 미포함', async ({ page }) => {
  await installTauriShim(page);

  const urls: string[] = [];
  page.on('request', (r) => {
    const u = r.url();
    if (u.endsWith('.js')) urls.push(u);
  });

  await page.goto('/', { waitUntil: 'networkidle' });

  // 초기 로드 단계에서 터미널/에디터/빌더 chunk 는 lazy 경로 — 당장 fetch 되면 안 됨.
  // (Terminal 은 "ever active" 패턴으로 탭 진입 시 로드. Monaco/Builder 는 모달.)
  const heavy = ['xterm', 'monaco', 'PipelineBuilder'];
  for (const name of heavy) {
    const loaded = urls.some((u) => u.includes(name));
    expect(loaded, `${name} chunk should not load on initial page`).toBe(false);
  }
});
