import fs from 'node:fs';
import path from 'node:path';

import { parseVoice } from '../parser';
import { type ParsedPayment, type ParsedQuery, type ParsedSale } from '../types';

interface FixtureCase {
  input: string;
  customers: string[];
  products: { name: string; unit: string; price: number | null; aliases?: string[] }[];
  expected: {
    intent: 'SALE' | 'PAYMENT' | 'QUERY';
    customer?: string | null;
    items?: {
      product: string;
      qtyMilli: number;
      unit?: string;
      unitPrice?: number | null;
    }[];
    payment?: {
      type: 'FULL' | 'NONE' | 'FRACTION' | 'AMOUNT';
      value?: number;
      amount?: number;
      numerator?: number;
      denominator?: number;
    };
    amount?: number;
    queryType?: 'CUSTOMER_BALANCE' | 'TODAYS_SALES' | 'UNKNOWN';
  };
}

function loadFixtures(dir: string): FixtureCase[] {
  const cases: FixtureCase[] = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) {
      cases.push(...(parsed as FixtureCase[]));
    } else {
      cases.push(parsed as FixtureCase);
    }
  }

  return cases;
}

describe('parser fixtures (AGENTS.md §14)', () => {
  const enDir = path.join(__dirname, '../fixtures/en');
  const bnDir = path.join(__dirname, '../fixtures/bn');

  const enCases = loadFixtures(enDir);
  const bnCases = loadFixtures(bnDir);

  it('has at least 100 cases per v1 language', () => {
    expect(enCases.length).toBeGreaterThanOrEqual(100);
    expect(bnCases.length).toBeGreaterThanOrEqual(100);
  });

  describe('English fixtures evaluation', () => {
    let correctCount = 0;
    let moneyMathCorrect = 0;
    let moneyMathTotal = 0;

    for (let i = 0; i < enCases.length; i++) {
      const c = enCases[i];
      if (!c) continue;

      it(`Case #${i + 1} [en]: "${c.input}"`, () => {
        const result = parseVoice(c.input, {
          customers: c.customers.map((name) => ({ name })),
          products: c.products.map((p) => ({
            name: p.name,
            unit: p.unit,
            defaultPrice: p.price,
            aliases: p.aliases,
          })),
          language: 'en',
        });

        // Intent check
        expect(result.intent).toBe(c.expected.intent);

        if (c.expected.intent === 'SALE') {
          const sale = result as ParsedSale;

          // Customer match
          if (c.expected.customer === null) {
            expect(sale.customer).toBeNull();
          } else if (c.expected.customer !== undefined) {
            expect(sale.customer?.name).toBe(c.expected.customer);
          }

          // Items check
          if (c.expected.items) {
            expect(sale.items).toHaveLength(c.expected.items.length);
            for (let j = 0; j < c.expected.items.length; j++) {
              const expItem = c.expected.items[j];
              const actItem = sale.items[j];
              if (!expItem || !actItem) continue;
              expect(actItem.name).toBe(expItem.product);
              expect(actItem.qtyMilli).toBe(expItem.qtyMilli);
              if (expItem.unitPrice !== undefined) {
                expect(actItem.unitPrice).toBe(expItem.unitPrice);
              }
            }
          }

          // Payment check
          if (c.expected.payment) {
            expect(sale.payment.type).toBe(c.expected.payment.type);
            moneyMathTotal++;
            if (c.expected.payment.type === 'FRACTION') {
              if (sale.payment.type === 'FRACTION') {
                const fracVal = sale.payment.numerator / sale.payment.denominator;
                expect(fracVal).toBeCloseTo(c.expected.payment.value ?? 0.5, 2);
                moneyMathCorrect++;
              }
            } else if (c.expected.payment.type === 'AMOUNT') {
              if (sale.payment.type === 'AMOUNT') {
                expect(sale.payment.amount).toBe(c.expected.payment.amount);
                moneyMathCorrect++;
              }
            } else {
              moneyMathCorrect++;
            }
          }
        } else if (c.expected.intent === 'PAYMENT') {
          const payment = result as ParsedPayment;
          expect(payment.customer?.name).toBe(c.expected.customer);
          if (c.expected.amount !== undefined) {
            moneyMathTotal++;
            expect(payment.amount).toBe(c.expected.amount);
            moneyMathCorrect++;
          }
        } else if (c.expected.intent === 'QUERY') {
          const query = result as ParsedQuery;
          expect(query.queryType).toBe(c.expected.queryType);
          if (c.expected.customer) {
            expect(query.customer?.name).toBe(c.expected.customer);
          }
        }

        correctCount++;
      });
    }

    afterAll(() => {
      const accuracy = (correctCount / enCases.length) * 100;
      expect(accuracy).toBeGreaterThanOrEqual(90);
      if (moneyMathTotal > 0) {
        expect(moneyMathCorrect).toBe(moneyMathTotal);
      }
    });
  });

  describe('Bengali fixtures evaluation', () => {
    let correctCount = 0;

    for (let i = 0; i < bnCases.length; i++) {
      const c = bnCases[i];
      if (!c) continue;

      it(`Case #${i + 1} [bn]: "${c.input}"`, () => {
        const result = parseVoice(c.input, {
          customers: c.customers.map((name) => ({ name })),
          products: c.products.map((p) => ({
            name: p.name,
            unit: p.unit,
            defaultPrice: p.price,
            aliases: p.aliases,
          })),
          language: 'bn',
        });

        // Intent check
        expect(result.intent).toBe(c.expected.intent);

        if (c.expected.intent === 'SALE') {
          const sale = result as ParsedSale;

          // Customer match
          if (c.expected.customer === null) {
            expect(sale.customer).toBeNull();
          } else if (c.expected.customer !== undefined) {
            expect(sale.customer?.name).toBe(c.expected.customer);
          }

          // Items check
          if (c.expected.items) {
            expect(sale.items).toHaveLength(c.expected.items.length);
            for (let j = 0; j < c.expected.items.length; j++) {
              const expItem = c.expected.items[j];
              const actItem = sale.items[j];
              if (!expItem || !actItem) continue;
              expect(actItem.name).toBe(expItem.product);
              expect(actItem.qtyMilli).toBe(expItem.qtyMilli);
              if (expItem.unitPrice !== undefined) {
                expect(actItem.unitPrice).toBe(expItem.unitPrice);
              }
            }
          }

          // Payment check
          if (c.expected.payment) {
            expect(sale.payment.type).toBe(c.expected.payment.type);
            if (c.expected.payment.type === 'FRACTION') {
              if (sale.payment.type === 'FRACTION') {
                const fracVal = sale.payment.numerator / sale.payment.denominator;
                expect(fracVal).toBeCloseTo(c.expected.payment.value ?? 0.5, 2);
              }
            } else if (c.expected.payment.type === 'AMOUNT') {
              if (sale.payment.type === 'AMOUNT') {
                expect(sale.payment.amount).toBe(c.expected.payment.amount);
              }
            }
          }
        } else if (c.expected.intent === 'PAYMENT') {
          const payment = result as ParsedPayment;
          expect(payment.customer?.name).toBe(c.expected.customer);
          if (c.expected.amount !== undefined) {
            expect(payment.amount).toBe(c.expected.amount);
          }
        } else if (c.expected.intent === 'QUERY') {
          const query = result as ParsedQuery;
          expect(query.queryType).toBe(c.expected.queryType);
          if (c.expected.customer) {
            expect(query.customer?.name).toBe(c.expected.customer);
          }
        }

        correctCount++;
      });
    }

    afterAll(() => {
      const accuracy = (correctCount / bnCases.length) * 100;
      expect(accuracy).toBeGreaterThanOrEqual(90);
    });
  });
});
