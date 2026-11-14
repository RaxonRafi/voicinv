import {
  computeInvoiceTotals,
  deriveShopPrefix,
  deviceCodeFromIndex,
  formatInvoiceNumber,
  parseInvoiceNumber,
  type PaymentInstruction,
  paymentStatus,
  resolvePayment,
} from '../../index';

describe('invoice numbers', () => {
  it('formats and parses <prefix>-<device>-<sequence>', () => {
    const number = formatInvoiceNumber({ shopPrefix: 'RS', deviceCode: 'A', sequence: 123 });
    expect(number).toBe('RS-A-000123');
    expect(parseInvoiceNumber(number)).toEqual({
      shopPrefix: 'RS',
      deviceCode: 'A',
      sequence: 123,
    });
  });

  it('keeps growing past six digits', () => {
    const number = formatInvoiceNumber({ shopPrefix: 'RS', deviceCode: 'B', sequence: 1_234_567 });
    expect(number).toBe('RS-B-1234567');
    expect(parseInvoiceNumber(number)?.sequence).toBe(1_234_567);
  });

  it('never produces the same number on two devices', () => {
    const numbers = new Set<string>();
    for (const deviceCode of ['A', 'B', 'C']) {
      for (let sequence = 1; sequence <= 50; sequence += 1) {
        numbers.add(formatInvoiceNumber({ shopPrefix: 'RS', deviceCode, sequence }));
      }
    }
    expect(numbers.size).toBe(150);
  });

  it.each([
    [{ shopPrefix: 'rs', deviceCode: 'A', sequence: 1 }],
    [{ shopPrefix: '', deviceCode: 'A', sequence: 1 }],
    [{ shopPrefix: 'RS', deviceCode: '1', sequence: 1 }],
    [{ shopPrefix: 'RS', deviceCode: 'A', sequence: 0 }],
    [{ shopPrefix: 'RS', deviceCode: 'A', sequence: 1.5 }],
  ])('rejects %j', (parts) => {
    expect(() => formatInvoiceNumber(parts)).toThrow(RangeError);
  });

  it.each(['RS-A-123', 'RS-A-000000', 'RS--000001', 'rs-a-000001', 'RSA000001', ''])(
    'does not parse "%s"',
    (value) => {
      expect(parseInvoiceNumber(value)).toBeNull();
    },
  );

  it.each([
    ['Rahim Store', 'RS'],
    ['Karim & Sons Trading', 'KST'],
    ['Rahim', 'RAH'],
    ['al-amin general store ltd', 'AAGS'],
    ['7 Star Shop', '7SS'],
    ['করিম স্টোর', 'INV'],
    ['', 'INV'],
    ['মা Store', 'STO'],
  ])('derives a prefix for "%s": %s', (name, prefix) => {
    expect(deriveShopPrefix(name)).toBe(prefix);
    expect(() =>
      formatInvoiceNumber({ shopPrefix: prefix, deviceCode: 'A', sequence: 1 }),
    ).not.toThrow();
  });

  it('assigns device codes A, B, … Z, AA, AB', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(deviceCodeFromIndex)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
    expect(
      new Set(Array.from({ length: 2000 }, (_unused, index) => deviceCodeFromIndex(index))).size,
    ).toBe(2000);
    expect(() => deviceCodeFromIndex(-1)).toThrow(RangeError);
    expect(() => deviceCodeFromIndex(26 + 26 * 26 + 26 * 26 * 26)).toThrow(/Too many devices/);
  });
});

describe('computeInvoiceTotals', () => {
  const rice = { unitPrice: 250_000, qtyMilli: 2000 };

  it('handles "two bags of rice, paid half"', () => {
    expect(
      computeInvoiceTotals({
        lines: [rice],
        payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
      }),
    ).toEqual({
      lineTotals: [500_000],
      subtotal: 500_000,
      discount: 0,
      total: 500_000,
      paidAmount: 250_000,
      dueAmount: 250_000,
      change: 0,
    });
  });

  it.each<[string, PaymentInstruction, number, number, number]>([
    ['full', { type: 'FULL' }, 512_000, 0, 0],
    ['nothing', { type: 'NONE' }, 0, 512_000, 0],
    ['an amount', { type: 'AMOUNT', amount: 200_000 }, 200_000, 312_000, 0],
    ['more than the total', { type: 'AMOUNT', amount: 600_000 }, 512_000, 0, 88_000],
    ['a third', { type: 'FRACTION', numerator: 1, denominator: 3 }, 170_667, 341_333, 0],
    ['more than everything', { type: 'FRACTION', numerator: 3, denominator: 2 }, 512_000, 0, 0],
  ])('splits paid and due when the customer pays %s', (_label, payment, paid, due, change) => {
    const totals = computeInvoiceTotals({
      lines: [rice, { unitPrice: 8000, qtyMilli: 1500 }],
      payment,
    });
    expect(totals.subtotal).toBe(512_000);
    expect(totals.paidAmount).toBe(paid);
    expect(totals.dueAmount).toBe(due);
    expect(totals.change).toBe(change);
    expect(totals.paidAmount + totals.dueAmount).toBe(totals.total);
  });

  it('applies a discount before splitting', () => {
    const totals = computeInvoiceTotals({
      lines: [rice],
      discount: 20_000,
      payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
    });
    expect(totals).toMatchObject({
      subtotal: 500_000,
      discount: 20_000,
      total: 480_000,
      paidAmount: 240_000,
    });
  });

  it('keeps paid + due = total for awkward amounts', () => {
    for (let unitPrice = 1; unitPrice < 400; unitPrice += 7) {
      for (const denominator of [2, 3, 4, 7]) {
        const totals = computeInvoiceTotals({
          lines: [
            { unitPrice, qtyMilli: 333 },
            { unitPrice: unitPrice + 1, qtyMilli: 1250 },
          ],
          payment: { type: 'FRACTION', numerator: 1, denominator },
        });
        expect(totals.paidAmount + totals.dueAmount).toBe(totals.total);
        expect(totals.lineTotals.reduce((a, b) => a + b, 0)).toBe(totals.subtotal);
        expect(Number.isSafeInteger(totals.paidAmount)).toBe(true);
      }
    }
  });

  it('allows an empty invoice total of zero', () => {
    expect(computeInvoiceTotals({ lines: [], payment: { type: 'FULL' } })).toMatchObject({
      total: 0,
      paidAmount: 0,
      dueAmount: 0,
    });
  });

  it.each([
    [{ lines: [{ unitPrice: -1, qtyMilli: 1000 }], payment: { type: 'FULL' } as const }],
    [{ lines: [{ unitPrice: 100, qtyMilli: 0 }], payment: { type: 'FULL' } as const }],
    [{ lines: [{ unitPrice: 100.5, qtyMilli: 1000 }], payment: { type: 'FULL' } as const }],
    [{ lines: [rice], discount: 600_000, payment: { type: 'FULL' } as const }],
    [{ lines: [rice], discount: -1, payment: { type: 'FULL' } as const }],
    [{ lines: [rice], payment: { type: 'FRACTION', numerator: 1, denominator: 0 } as const }],
  ])('rejects invalid input %#', (input) => {
    expect(() => computeInvoiceTotals(input)).toThrow(RangeError);
  });

  it('never lets a negative amount count as a payment', () => {
    expect(resolvePayment(1000, { type: 'AMOUNT', amount: -500 })).toBe(0);
  });
});

describe('paymentStatus', () => {
  it('derives Paid / Partly paid / Due', () => {
    expect(paymentStatus(500, 500)).toBe('PAID');
    expect(paymentStatus(500, 700)).toBe('PAID');
    expect(paymentStatus(500, 200)).toBe('PARTLY_PAID');
    expect(paymentStatus(500, 0)).toBe('DUE');
    expect(paymentStatus(0, 0)).toBe('PAID');
  });
});
