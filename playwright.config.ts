/**
 * Playwright E2E — Vite dev server 대상 (Tauri webview는 native bridge 필요).
 *
 * Tauri invoke/listen은 e2e/fixtures/tauriShim.ts에서 window에 주입된 mock으로
 * 대체됨. 실제 PTY/파일시스템 호출은 e2e 환경에서 실행되지 않음.
 *
 * 실행: npm run e2e (정적 서버 자동 기동)
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
