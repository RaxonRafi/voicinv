import { Money, Quantity } from '../index.js';

describe('Money', () => {
  it('adds and subtracts integers of minor units', () => {
    expect(Money.add(250_000, 250_000)).toBe(500_000);
    expect(Money.add()).toBe(0);
    expect(Money.sum([1, 2, 3])).toBe(6);
    expect(Money.subtract(500_000, 250_000)).toBe(250_000);
    expect(Money.subtract(100, 30, 20)).toBe(50);
    expect(Money.negate(250)).toBe(-250);
    expect(Object.is(Money.negate(0), 0)).toBe(true);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '100', null])(
    'rejects %p as an amount',
    (value) => {
      expect(Money.isMinorUnits(value)).toBe(false);
      expect(() => Money.assert(value)).toThrow(RangeError);
      expect(() => Money.add(value as number, 1)).toThrow(RangeError);
    },
  );

  it('throws instead of silently losing precision on overflow', () => {
    expect(() => Money.add(Number.MAX_SAFE_INTEGER, 1)).toThrow(/safe integer range/);
    expect(() => Money.multiplyByQuantity(Number.MAX_SAFE_INTEGER, 2000)).toThrow(RangeError);
  });

  describe('multiplyByQuantity', () => {
    it.each([
      [250_000, 2000, 500_000], // 2 bags at 2,500.00
      [8000, 1500, 12_000], // 1.5 kg at 80.00
      [8000, 250, 2000], // a quarter
      [3333, 333, 1110], // 1109.889 rounds up
      [1, 500, 1], // 0.5 rounds half up
      [1, 499, 0],
      [0, 5000, 0],
      [9999, 1000, 9999],
    ])('%i × %i/1000 = %i', (unitPrice, qtyMilli, expected) => {
      expect(Money.multiplyByQuantity(unitPrice, qtyMilli)).toBe(expected);
    });

    it('stays exact where floating point would not', () => {
      // 0.1 + 0.2 style trap: 1.10 × 3 = 3.30 exactly.
      expect(Money.multiplyByQuantity(110, 3000)).toBe(330);
      // A product far beyond 2^53 before division.
      expect(Money.multiplyByQuantity(9_000_000_000_000, 999)).toBe(8_991_000_000_000);
    });

    it('rejects a fractional quantity', () => {
      expect(() => Money.multiplyByQuantity(100, 1.5)).toThrow(RangeError);
    });
  });

  describe('fraction', () => {
    it.each([
      [500_000, 1, 2, 250_000],
      [100, 1, 3, 33],
      [200, 2, 3, 133],
      [1, 1, 2, 1], // half rounds away from zero
      [-1, 1, 2, -1],
      [-100, 1, 3, -33],
      [500_000, 3, 4, 375_000],
      [500_000, 0, 4, 0],
    ])('%i × %i/%i = %i', (amount, numerator, denominator, expected) => {
      expect(Money.fraction(amount, numerator, denominator)).toBe(expected);
    });

    it('refuses to divide by zero', () => {
      expect(() => Money.fraction(100, 1, 0)).toThrow(/divide money by zero/);
    });
  });

  it('compares and clamps', () => {
    expect(Money.compare(1, 2)).toBe(-1);
    expect(Money.compare(2, 2)).toBe(0);
    expect(Money.compare(3, 2)).toBe(1);
    expect(Money.min(5, 9)).toBe(5);
    expect(Money.max(5, 9)).toBe(9);
    expect(Money.clamp(700, 0, 500)).toBe(500);
    expect(Money.clamp(-5, 0, 500)).toBe(0);
    expect(Money.clamp(120, 0, 500)).toBe(120);
  });

  describe('decimal text', () => {
    it.each([
      [250_050, '2500.50'],
      [5, '0.05'],
      [0, '0.00'],
      [-250_000, '-2500.00'],
      [Number.MAX_SAFE_INTEGER, '90071992547409.91'],
    ])('writes %i as %s', (amount, text) => {
      expect(Money.toDecimalString(amount)).toBe(text);
      expect(Money.fromDecimalString(text)).toBe(amount);
    });

    it.each([
      ['2500', 250_000],
      ['2500.5', 250_050],
      ['0.05', 5],
      [' 12.30 ', 1230],
      ['7.', 700],
      ['-3.2', -320],
    ])('parses "%s" as %i', (text, amount) => {
      expect(Money.fromDecimalString(text)).toBe(amount);
    });

    it.each(['', 'abc', '1.234', '1,000', '1e3', '.5', '--1', '99999999999999999999'])(
      'rejects "%s"',
      (text) => {
        expect(Money.fromDecimalString(text)).toBeNull();
      },
    );

    it('supports currencies without decimals', () => {
      expect(Money.toDecimalString(1500, 0)).toBe('1500');
      expect(Money.fromDecimalString('1500', 0)).toBe(1500);
      expect(Money.fromDecimalString('1500.5', 0)).toBeNull();
    });
  });
});

describe('Quantity', () => {
  it.each([
    ['2', 2000],
    ['1.5', 1500],
    ['0.25', 250],
    ['0.001', 1],
    ['12.345', 12_345],
  ])('parses "%s" as %i thousandths and writes it back', (text, qtyMilli) => {
    expect(Quantity.fromDecimalString(text)).toBe(qtyMilli);
    expect(Quantity.toDecimalString(qtyMilli)).toBe(text);
  });

  it('rejects negative, over-precise and non-numeric quantities', () => {
    expect(Quantity.fromDecimalString('-1')).toBeNull();
    expect(Quantity.fromDecimalString('1.2345')).toBeNull();
    expect(Quantity.fromDecimalString('two')).toBeNull();
  });
});
