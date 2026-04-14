/** 표시용 숫자/금액 포맷터 — 임계값별로 단위 변환. */

export function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/** ISO 타임스탬프 → `YYYY-MM-DD` (트렌드 버킷 키) */
export function dateBucket(iso: string): string {
  return iso.slice(0, 10);
}
