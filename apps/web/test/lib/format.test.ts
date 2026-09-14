import { describe, it, expect } from 'vitest';
import { formatPaisaToBDT, toBengaliNumerals, formatDate, formatDateTime } from '@/lib/format';

describe('Bangladeshi Currency & Date Formatting Utilities', () => {
  it('converts ASCII digits to Bengali numerals correctly', () => {
    expect(toBengaliNumerals('1234567890')).toBe('১২৩৪৫৬৭৮৯০');
    expect(toBengaliNumerals(1500)).toBe('১৫০০');
    expect(toBengaliNumerals('৳ 1,500.00')).toBe('৳ ১,৫০০.০০');
  });

  it('formats Paisa to BDT with South Asian comma grouping and Taka symbol', () => {
    // 150000 paisa = 1500.00 BDT
    expect(formatPaisaToBDT(150000n)).toBe('৳ 1,500.00');

    // 14589000000 paisa = 14,58,90,000.00 BDT (Lakh / Crore grouping)
    expect(formatPaisaToBDT(14589000000n)).toBe('৳ 14,58,90,000.00');

    // Without symbol
    expect(formatPaisaToBDT(150000n, { showSymbol: false })).toBe('1,500.00');

    // With Bengali digits
    expect(formatPaisaToBDT(150000n, { banglaDigits: true })).toBe('৳ ১,৫০০.০০');

    // Zero or null handling
    expect(formatPaisaToBDT(0n)).toBe('৳ 0.00');
    expect(formatPaisaToBDT(null)).toBe('৳ 0.00');
    expect(formatPaisaToBDT(undefined)).toBe('৳ 0.00');
  });

  it('formats dates cleanly according to en-GB conventions', () => {
    const d = new Date('2026-09-14T10:30:00Z');
    expect(formatDate(d)).toContain('2026');
    expect(formatDate(null)).toBe('-');
    expect(formatDateTime(d)).toContain('2026');
    expect(formatDateTime(null)).toBe('-');
  });
});
