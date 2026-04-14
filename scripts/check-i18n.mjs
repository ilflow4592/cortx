#!/usr/bin/env node
/**
 * i18n 누락 키 검증 — en.ts가 source of truth.
 *
 * 각 다른 로케일 파일이 en의 키를 모두 포함하는지 비교. 누락 키 있으면
 * exit 1 + 리스트 출력. CI에서 번역 drift 감지.
 *
 * 사용: npm run i18n:check
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'src', 'i18n', 'locales');

/** 파일 내용에서 quoted key 추출 — `'key.name':` 패턴 */
function extractKeys(source) {
  const keys = new Set();
  const re = /['"]([a-zA-Z0-9_.-]+)['"]\s*:/g;
  let m;
  while ((m = re.exec(source)) !== null) keys.add(m[1]);
  return keys;
}

function loadLocale(file) {
  const path = join(LOCALES_DIR, file);
  return extractKeys(readFileSync(path, 'utf8'));
}

const enKeys = loadLocale('en.ts');
const localeFiles = readdirSync(LOCALES_DIR).filter(
  (f) => f.endsWith('.ts') && f !== 'en.ts' && f !== 'index.ts',
);

let hasError = false;
for (const file of localeFiles) {
  const keys = loadLocale(file);
  const missing = [...enKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.has(k));

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✓ ${file}: ${keys.size} keys (all en keys present)`);
    continue;
  }

  hasError = true;
  console.log(`\n✗ ${file}:`);
  if (missing.length > 0) {
    console.log(`  Missing ${missing.length} keys (exist in en.ts, absent here):`);
    for (const k of missing) console.log(`    - ${k}`);
  }
  if (extra.length > 0) {
    console.log(`  Extra ${extra.length} keys (orphan — not in en.ts):`);
    for (const k of extra) console.log(`    - ${k}`);
  }
}

if (hasError) {
  console.log('\ni18n drift detected. Sync locale files with en.ts or remove orphan keys.');
  process.exit(1);
}
console.log(`\nAll locales in sync with en.ts (${enKeys.size} keys).`);
