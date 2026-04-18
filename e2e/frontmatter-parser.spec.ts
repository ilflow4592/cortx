/**
 * Skill frontmatter 파서 E2E — 브라우저 런타임에서 YAML-lite 파싱 + OUTPUT 마커
 * 추출이 정상 작동하는지. Vite 번들러 + ESM 경로 해석 회귀 방지.
 *
 * 단위 테스트는 tests/utils/frontmatterParser.test.ts 에 있으나, 여기서는
 * 실제 Vite dev server 가 모듈을 서빙할 수 있는지도 함께 확인.
 */
import { test, expect } from '@playwright/test';
import { installTauriShim } from './fixtures/tauriShim';

test.beforeEach(async ({ page }) => {
  await installTauriShim(page);
});

test('parseSkillFrontmatter — requires/produces 배열 파싱', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(async () => {
    const mod = await import('/src/utils/pipeline-exec/frontmatterParser.ts');
    const { parseSkillFrontmatter } = mod as typeof import('/src/utils/pipeline-exec/frontmatterParser');
    const md = `---
requires: [spec, codeMap]
produces: [plan]
contextMode: isolated
---
# Skill body`;
    return parseSkillFrontmatter(md);
  });

  expect(result.frontmatter).toEqual({
    requires: ['spec', 'codeMap'],
    produces: ['plan'],
    contextMode: 'isolated',
  });
  expect(result.body).toBe('# Skill body');
});

test('extractOutputMarkers + substituteArtifacts — end-to-end', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const result = await page.evaluate(async () => {
    const mod = await import('/src/utils/pipeline-exec/outputMarker.ts');
    const { extractOutputMarkers, substituteArtifacts } = mod as typeof import('/src/utils/pipeline-exec/outputMarker');

    const streamText = 'preface\n[OUTPUT:plan]\nStep 1\n[/OUTPUT:plan]\nepilogue';
    const { artifacts } = extractOutputMarkers(streamText);
    const { result: substituted } = substituteArtifacts('Use: {plan}', artifacts);
    return { plan: artifacts.plan, substituted };
  });

  expect(result.plan).toBe('Step 1');
  expect(result.substituted).toBe('Use: Step 1');
});
