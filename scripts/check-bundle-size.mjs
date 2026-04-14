#!/usr/bin/env node
/**
 * Bundle size budget — `dist/assets/*.js` gzip 크기를 bundle-budget.json과 비교.
 *
 * 각 entry 패턴별 임계치 초과 시 exit 1. 번들 회귀 방지.
 * 사용: npm run build && npm run size
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist', 'assets');
const BUDGET = JSON.parse(readFileSync(join(__dirname, '..', 'bundle-budget.json'), 'utf8'));

function gzipSize(path) {
  return gzipSync(readFileSync(path)).length;
}

/** JS 파일만 대상. 해시(Cshmpeu9 등) 제외하고 base name 매칭 */
function baseName(filename) {
  // `index-Cshmpeu9.js` → `index`
  return filename.replace(/-[A-Za-z0-9_-]{8,}\.js$/, '').replace(/\.js$/, '');
}

const files = readdirSync(DIST).filter((f) => f.endsWith('.js'));
const actualSizes = {};
for (const f of files) {
  const name = baseName(f);
  const size = gzipSize(join(DIST, f));
  actualSizes[name] = (actualSizes[name] || 0) + size;
}

let hasError = false;
console.log('Bundle size check (gzip bytes):\n');
console.log(`  ${'chunk'.padEnd(24)} ${'actual'.padStart(10)}  ${'budget'.padStart(10)}  status`);
console.log(`  ${'─'.repeat(24)} ${'─'.repeat(10)}  ${'─'.repeat(10)}  ──────`);

for (const [name, budget] of Object.entries(BUDGET)) {
  if (name === '__total__') continue;
  const actual = actualSizes[name] ?? 0;
  const pct = ((actual / budget) * 100).toFixed(0);
  const status = actual > budget ? '✗ OVER' : actual > budget * 0.9 ? '⚠ warn' : '✓ ok';
  if (actual > budget) hasError = true;
  console.log(
    `  ${name.padEnd(24)} ${String(actual).padStart(10)}  ${String(budget).padStart(10)}  ${status} (${pct}%)`,
  );
}

// budget에 없는 신규 청크 감지
for (const [name, actual] of Object.entries(actualSizes)) {
  if (!(name in BUDGET) && actual > 5000) {
    console.log(`  ${name.padEnd(24)} ${String(actual).padStart(10)}  ${'(new)'.padStart(10)}  ⚠ new chunk`);
  }
}

// 전체 합계
const total = Object.values(actualSizes).reduce((a, b) => a + b, 0);
const totalBudget = BUDGET.__total__ ?? Infinity;
console.log(`\n  Total: ${total} bytes (budget: ${totalBudget === Infinity ? 'none' : totalBudget})`);
if (total > totalBudget) {
  hasError = true;
  console.log('  ✗ Total exceeds budget');
}

if (hasError) {
  console.log('\nBundle size regression detected. Update bundle-budget.json if the growth is intentional.');
  process.exit(1);
}
console.log('\nAll chunks within budget.');
