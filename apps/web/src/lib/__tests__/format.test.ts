import { fill, formatDate, formatMoney, formatNumber } from '../format';

describe('formatNumber', () => {
  it('uses each language’s own digits and grouping', () => {
    expect(formatNumber('en', 30)).toBe('30');
    expect(formatNumber('bn', 30)).toBe('৩০');
    expect(formatNumber('en', 12345)).toBe('12,345');
  });

  it('rejects fractions', () => {
    expect(() => formatNumber('en', 1.5)).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats integer minor units without creating a fractional number', () => {
    expect(formatMoney('en', 500_000)).toBe('৳5,000');
    expect(formatMoney('en', 250_050)).toBe('৳2,500.50');
    expect(formatMoney('en', 5)).toBe('৳0.05');
    expect(formatMoney('en', 0)).toBe('৳0');
  });

  it('keeps large amounts exact', () => {
    // 90,071,992,547,409.91 — the largest safe integer in minor units.
    expect(formatMoney('en', Number.MAX_SAFE_INTEGER)).toBe('৳90,071,992,547,409.91');
  });

  it('formats negative amounts', () => {
    expect(formatMoney('en', -250_000)).toBe('-৳2,500');
  });

  it('uses Bengali digits and the taka sign for Bengali', () => {
    const formatted = formatMoney('bn', 500_000);
    expect(formatted).toContain('৫,০০০');
    expect(formatted).toContain('৳');
    expect(formatted).not.toMatch(/[0-9]/);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %s, which is not an integer amount of minor units',
    (value) => {
      expect(() => formatMoney('en', value)).toThrow(RangeError);
    },
  );
});

describe('formatDate', () => {
  it('formats a calendar date in each language regardless of the build machine’s time zone', () => {
    expect(formatDate('en', '2026-11-12')).toBe('November 12, 2026');
    expect(formatDate('bn', '2026-11-12')).toBe('১২ নভেম্বর, ২০২৬');
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() => formatDate('en', '12/11/2026')).toThrow(RangeError);
  });
});

describe('fill', () => {
  it('replaces placeholders', () => {
    expect(fill('{count} invoices a month', { count: '30' })).toBe('30 invoices a month');
    expect(fill('no placeholders', {})).toBe('no placeholders');
  });

  it('fails loudly on a placeholder without a value', () => {
    expect(() => fill('Hello {name}', {})).toThrow(/\{name\}/);
  });
});
