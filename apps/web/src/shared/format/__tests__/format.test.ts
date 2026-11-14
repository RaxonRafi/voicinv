import {
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatInteger,
  formatMoney,
  formatQuantity,
  getNumberFormat,
  parseMoneyInput,
  parseQuantityInput,
  toAsciiDigits,
  toLocalDigits,
} from '../../index';

describe('numerals', () => {
  it('converts digits of supported scripts to ASCII and back', () => {
    expect(toAsciiDigits('০১৭১২৩৪৫৬৭৮')).toBe('01712345678');
    expect(toAsciiDigits('+৮৮০ 17 ०१ ٢٣')).toBe('+880 17 01 23');
    expect(toAsciiDigits('karim@example.com')).toBe('karim@example.com');
    expect(toLocalDigits('2,500.50', 'beng')).toBe('২,৫০০.৫০');
    expect(toLocalDigits('2,500.50', 'latn')).toBe('2,500.50');
  });
});

describe('getNumberFormat', () => {
  it('matches by language and falls back to English', () => {
    expect(getNumberFormat('bn').numberingSystem).toBe('beng');
    expect(getNumberFormat('bn-BD').grouping).toBe('indian');
    expect(getNumberFormat('BN_bd').numberingSystem).toBe('beng');
    expect(getNumberFormat('fr').numberingSystem).toBe('latn');
  });
});

describe('formatDecimal / formatInteger', () => {
  it.each([
    ['0', '0'],
    ['999', '999'],
    ['1000', '1,000'],
    ['1234567', '1,234,567'],
    ['-1234567.891', '-1,234,567.891'],
  ])('formats %s in English as %s', (input, expected) => {
    expect(formatDecimal(input, 'en')).toBe(expected);
  });

  it.each([
    ['999', '৯৯৯'],
    ['1000', '১,০০০'],
    ['100000', '১,০০,০০০'],
    ['12345678', '১,২৩,৪৫,৬৭৮'],
    ['1234567.5', '১২,৩৪,৫৬৭.৫'],
  ])('formats %s in Bengali with lakh grouping as %s', (input, expected) => {
    expect(formatDecimal(input, 'bn')).toBe(expected);
  });

  it('can skip grouping and rejects anything that is not plain decimal text', () => {
    expect(formatInteger(2026, 'bn', { useGrouping: false })).toBe('২০২৬');
    expect(formatInteger(30, 'bn')).toBe('৩০');
    expect(() => formatDecimal('1e5', 'en')).toThrow(RangeError);
    expect(() => formatInteger(1.5, 'en')).toThrow(RangeError);
  });
});

describe('formatQuantity', () => {
  it('drops trailing zeros', () => {
    expect(formatQuantity(2000, 'en')).toBe('2');
    expect(formatQuantity(1500, 'en')).toBe('1.5');
    expect(formatQuantity(250, 'bn')).toBe('০.২৫');
    expect(formatQuantity(1_234_500, 'en')).toBe('1,234.5');
  });
});

describe('formatMoney', () => {
  it.each([
    [500_000, '৳5,000'],
    [250_050, '৳2,500.50'],
    [5, '৳0.05'],
    [0, '৳0'],
    [-250_000, '-৳2,500'],
    [Number.MAX_SAFE_INTEGER, '৳90,071,992,547,409.91'],
  ])('formats %i in English as %s', (amount, expected) => {
    expect(formatMoney(amount, { locale: 'en' })).toBe(expected);
  });

  it.each([
    [500_000, '৫,০০০৳'],
    [250_050, '২,৫০০.৫০৳'],
    [10_000_000, '১,০০,০০০৳'],
    [-250_000, '-২,৫০০৳'],
  ])('formats %i in Bengali as %s', (amount, expected) => {
    expect(formatMoney(amount, { locale: 'bn' })).toBe(expected);
  });

  it('supports fixed decimals, hidden symbols and other currencies', () => {
    expect(formatMoney(500_000, { locale: 'en', fractionDigits: 'always' })).toBe('৳5,000.00');
    expect(formatMoney(500_000, { locale: 'en', showSymbol: false })).toBe('5,000');
    expect(formatMoney(1999, { locale: 'en', currency: 'USD' })).toBe('$19.99');
    expect(formatMoney(1999, { locale: 'en', currency: 'NPR' })).toBe('NPR 19.99');
    expect(formatMoney(1999, { locale: 'bn', currency: 'NPR' })).toBe('১৯.৯৯ NPR');
  });

  it('refuses a fractional amount', () => {
    expect(() => formatMoney(10.5, { locale: 'en' })).toThrow(RangeError);
  });
});

describe('parsing typed amounts and quantities', () => {
  it.each([
    ['2500', 'en', 250_000],
    ['2,500.5', 'en', 250_050],
    ['২,৫০০.৫', 'bn', 250_050],
    ['১,০০,০০০', 'bn', 10_000_000],
    [' 12 ', 'en', 1200],
    ['0', 'en', 0],
  ])('reads "%s" (%s) as %i', (text, locale, expected) => {
    expect(parseMoneyInput(text, locale)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1.234', '1.2.3'])('rejects "%s" as an amount', (text) => {
    expect(parseMoneyInput(text, 'en')).toBeNull();
  });

  it('round-trips formatted money', () => {
    for (const amount of [0, 5, 99, 250_050, 10_000_000, 123_456_789]) {
      for (const locale of ['en', 'bn']) {
        const text = formatMoney(amount, { locale, showSymbol: false });
        expect(parseMoneyInput(text, locale)).toBe(amount);
      }
    }
  });

  it('reads quantities', () => {
    expect(parseQuantityInput('১.৫', 'bn')).toBe(1500);
    expect(parseQuantityInput('2', 'en')).toBe(2000);
    expect(parseQuantityInput('-2', 'en')).toBeNull();
  });
});

describe('dates', () => {
  const noon = Date.UTC(2026, 10, 12, 12, 0, 0);

  it('formats in the requested time zone', () => {
    expect(formatDate(noon, 'en', { style: 'long', timeZone: 'UTC' })).toBe('November 12, 2026');
    expect(formatDate(noon, 'bn', { style: 'long', timeZone: 'UTC' })).toBe('১২ নভেম্বর, ২০২৬');
    // 23:30 UTC is already the next day in Dhaka (UTC+6).
    const lateEvening = Date.UTC(2026, 10, 12, 23, 30, 0);
    expect(formatDate(lateEvening, 'en', { style: 'long', timeZone: 'Asia/Dhaka' })).toBe(
      'November 13, 2026',
    );
  });

  it('formats date with time', () => {
    expect(formatDateTime(noon, 'en', { timeZone: 'Asia/Dhaka' })).toMatch(/Nov 12, 2026.*6:00/);
  });

  it('formats calendar dates independent of the machine time zone', () => {
    expect(formatCalendarDate('2026-11-12', 'en')).toBe('November 12, 2026');
    expect(() => formatCalendarDate('12/11/2026', 'en')).toThrow(RangeError);
  });

  it('rejects invalid dates', () => {
    expect(() => formatDate(Number.NaN, 'en')).toThrow(RangeError);
  });
});
