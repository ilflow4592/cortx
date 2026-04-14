import { describe, it, expect } from 'vitest';
import { formatNum, formatUsd, dateBucket } from '../../../src/components/cost-dashboard/format';

describe('formatNum', () => {
  it('uses M for ≥ 1M', () => {
    expect(formatNum(1_500_000)).toBe('1.50M');
    expect(formatNum(2_000_000)).toBe('2.00M');
  });
  it('uses K for ≥ 1K', () => {
    expect(formatNum(1500)).toBe('1.5K');
    expect(formatNum(999_999)).toBe('1000.0K');
  });
  it('uses locale string for < 1K', () => {
    expect(formatNum(42)).toBe('42');
    expect(formatNum(999)).toBe('999');
  });
});

describe('formatUsd', () => {
  it('uses 4 decimals for < $0.01', () => {
    expect(formatUsd(0.0042)).toBe('$0.0042');
  });
  it('uses 3 decimals for < $1', () => {
    expect(formatUsd(0.5)).toBe('$0.500');
  });
  it('uses 2 decimals for ≥ $1', () => {
    expect(formatUsd(12.345)).toBe('$12.35');
  });
});

describe('dateBucket', () => {
  it('extracts YYYY-MM-DD prefix from ISO timestamp', () => {
    expect(dateBucket('2026-04-14T10:30:00Z')).toBe('2026-04-14');
  });
});
