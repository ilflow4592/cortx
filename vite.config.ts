/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

// ANALYZE=1 npm run build로 dist/stats.html 생성 — bundle 내역 시각화.
const analyze = process.env.ANALYZE === '1';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(analyze
      ? [
          visualizer({
            filename: 'dist/stats.html',
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // 큰 vendor 모듈을 별도 chunk로 분리해 main bundle에서 제거.
    // node_modules 경로 패턴 기반으로 라우팅 — 한 라이브러리가 여러 entry로 자랄 때도 자동 통합.
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@monaco-editor') || id.includes('monaco-editor')) return 'monaco';
          if (id.includes('@xterm') || id.includes('xterm')) return 'xterm';
          if (id.includes('@tauri-apps')) return 'tauri';
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler')) return 'react-vendor';
          if (id.includes('zustand')) return 'zustand';
          if (id.includes('cmdk')) return 'cmdk';
          if (id.includes('lucide-react')) return 'lucide';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // e2e/는 Playwright 전용 — vitest가 import 시 playwright 의존성으로 깨짐
    exclude: ['node_modules', 'dist', 'e2e', 'src-tauri'],
  },
});
