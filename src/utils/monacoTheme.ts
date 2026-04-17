/**
 * Monaco editor 의 `colors` 맵은 CSS 변수(`var(--foo)`) 를 받지 못한다
 * — 반드시 `#rgb` / `#rrggbb` / `#rrggbbaa` 리터럴이어야 한다. 런타임에
 * 실제 값을 `getComputedStyle` 로 해석해 주입한다.
 *
 * 참고: Monaco 의 `rules[].foreground` 는 hex 리터럴(`'cc7832'` — `#` 없음)
 * 포맷을 요구하므로 `colors` 와 형식이 다르다. 본 헬퍼는 `colors` 용.
 */
function resolveCssVar(value: string, fallback = '#000000'): string {
  const match = value.match(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/);
  if (!match) return value;
  const [, name, defaultVal] = match;
  const resolved = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return resolved || defaultVal?.trim() || fallback;
}

/**
 * Resolve CSS var references in a Monaco `colors` map at runtime. Values
 * that are already literal (hex / rgba / color name) pass through unchanged.
 */
export function resolveThemeColors<T extends Record<string, string>>(colors: T): T {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) {
    out[k] = resolveCssVar(v, v);
  }
  return out as T;
}
