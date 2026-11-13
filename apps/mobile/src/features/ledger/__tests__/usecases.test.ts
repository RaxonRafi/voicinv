import { customers, ledgerEntries, payments } from '@/core/db';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';
import { ledgerEntrySchema, paymentSchema } from '@/shared';

import { getBalance, listDebtors, sumForReference, totalReceivable } from '../repository';
import {
  allocatePayments,
  creditStatus,
  getStatement,
  recordAdjustment,
  recordInvoiceDue,
  recordPayment,
  recordReversal,
} from '../usecases';

describe('ledger', () => {
  let app: TestShopApp;
  let karim: string;
  let rahim: string;

  async function addCustomer(name: string): Promise<string> {
    const id = app.ctx.newId();
    await app.db.write((tx) =>
      tx.orm.insert(customers).values({
        id,
        shopId: app.shopId,
        createdAt: app.clock.now(),
        updatedAt: app.clock.now(),
        deviceId: app.ctx.deviceId,
        name,
      }),
    );
    return id;
  }

  beforeEach(async () => {
    app = await createTestShopApp();
    karim = await addCustomer('Karim');
    rahim = await addCustomer('Rahim');
  });

  afterEach(() => app.close());

  it('starts every customer at zero', async () => {
    expect(await getBalance(app.db.orm, karim)).toBe(0);
    expect(await getStatement(app.db.orm, karim)).toEqual([]);
  });

  it('records a payment as one payment row and one negative ledger entry', async () => {
    const { payment, balance } = await recordPayment(app.ctx, {
      customerId: karim,
      amount: 50_000,
      note: ' cash ',
      invoiceId: null,
    });

    expect(balance).toBe(-50_000);
    expect(payment).toMatchObject({
      customerId: karim,
      amount: 50_000,
      note: 'cash',
      isDirty: true,
    });
    const entries = await app.db.orm.select().from(ledgerEntries);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      customerId: karim,
      type: 'PAYMENT',
      amount: -50_000,
      refId: payment.id,
    });

    // Both rows are valid sync entities (minus the local dirty flag).
    const { isDirty: _a, ...paymentEntity } = payment;
    expect(paymentSchema.safeParse(paymentEntity).success).toBe(true);
    const { isDirty: _b, ...entryEntity } = entries[0] ?? {};
    expect(ledgerEntrySchema.safeParse(entryEntity).success).toBe(true);
  });

  it.each([
    ['zero', 0],
    ['negative', -100],
    ['fractional', 10.5],
  ])('rejects a %s payment and records nothing', async (_label, amount) => {
    await expect(
      recordPayment(app.ctx, { customerId: karim, amount, note: '', invoiceId: null }),
    ).rejects.toThrow();
    expect(await app.db.orm.select().from(payments)).toEqual([]);
    expect(await app.db.orm.select().from(ledgerEntries)).toEqual([]);
  });

  it('rejects a payment for an unknown customer', async () => {
    await expect(
      recordPayment(app.ctx, { customerId: 'nobody', amount: 100, note: '', invoiceId: null }),
    ).rejects.toMatchObject({ code: 'notFound' });
    expect(await app.db.orm.select().from(payments)).toEqual([]);
  });

  it('keeps a running balance across dues, payments, adjustments and reversals', async () => {
    const invoiceA = app.ctx.newId();
    const invoiceB = app.ctx.newId();
    await app.db.write(async (tx) => {
      await recordInvoiceDue(tx, app.ctx, { customerId: karim, refId: invoiceA, amount: 250_000 });
    });
    app.clock.advance(1000);
    await recordPayment(app.ctx, { customerId: karim, amount: 100_000, note: '', invoiceId: null });
    app.clock.advance(1000);
    await app.db.write(async (tx) => {
      await recordInvoiceDue(tx, app.ctx, { customerId: karim, refId: invoiceB, amount: 40_000 });
      await recordAdjustment(tx, app.ctx, { customerId: karim, refId: invoiceB, amount: -10_000 });
    });
    app.clock.advance(1000);
    await app.db.write((tx) =>
      recordReversal(tx, app.ctx, { customerId: karim, refId: invoiceA, amount: 250_000 }),
    );

    const statement = await getStatement(app.db.orm, karim);
    expect(statement.map((line) => [line.entry.type, line.entry.amount, line.balance])).toEqual([
      ['INVOICE_DUE', 250_000, 250_000],
      ['PAYMENT', -100_000, 150_000],
      ['INVOICE_DUE', 40_000, 190_000],
      ['ADJUSTMENT', -10_000, 180_000],
      ['REVERSAL', -250_000, -70_000],
    ]);
    expect(await getBalance(app.db.orm, karim)).toBe(-70_000);
    // Per invoice: the cancelled one nets to zero, the edited one to its new due amount.
    expect(await sumForReference(app.db.orm, karim, invoiceA)).toBe(0);
    expect(await sumForReference(app.db.orm, karim, invoiceB)).toBe(30_000);
    // Another customer is untouched.
    expect(await getBalance(app.db.orm, rahim)).toBe(0);
  });

  it('refuses entries that would record nothing or have the wrong sign', async () => {
    const refId = app.ctx.newId();
    await app.db.write(async (tx) => {
      expect(() => recordInvoiceDue(tx, app.ctx, { customerId: karim, refId, amount: 0 })).toThrow(
        RangeError,
      );
      expect(() => recordReversal(tx, app.ctx, { customerId: karim, refId, amount: -5 })).toThrow(
        RangeError,
      );
      expect(() => recordAdjustment(tx, app.ctx, { customerId: karim, refId, amount: 0 })).toThrow(
        RangeError,
      );
      await expect(
        recordInvoiceDue(tx, app.ctx, { customerId: karim, refId, amount: 10.5 }),
      ).rejects.toThrow(RangeError);
    });
    expect(await app.db.orm.select().from(ledgerEntries)).toEqual([]);
  });

  it('lists who owes money, largest first, and the total owed', async () => {
    const salma = await addCustomer('Salma');
    await app.db.write(async (tx) => {
      await recordInvoiceDue(tx, app.ctx, {
        customerId: karim,
        refId: app.ctx.newId(),
        amount: 30_000,
      });
      await recordInvoiceDue(tx, app.ctx, {
        customerId: rahim,
        refId: app.ctx.newId(),
        amount: 90_000,
      });
    });
    await recordPayment(app.ctx, { customerId: salma, amount: 5000, note: '', invoiceId: null });

    expect(await listDebtors(app.db.orm, 10)).toEqual([
      { customerId: rahim, name: 'Rahim', phone: null, balance: 90_000 },
      { customerId: karim, name: 'Karim', phone: null, balance: 30_000 },
    ]);
    expect(await listDebtors(app.db.orm, 1)).toHaveLength(1);
    // Salma's advance does not reduce what the others owe.
    expect(await totalReceivable(app.db.orm)).toBe(120_000);
  });
});

describe('creditStatus', () => {
  it('warns only when a limit exists and is exceeded', () => {
    expect(creditStatus(500_000, null)).toBe('none');
    expect(creditStatus(100_000, 100_000)).toBe('within');
    expect(creditStatus(100_001, 100_000)).toBe('over');
    expect(creditStatus(-5000, 0)).toBe('within');
  });
});

describe('allocatePayments', () => {
  const invoices = [
    { id: 'old', date: 1, dueAmount: 100 },
    { id: 'mid', date: 2, dueAmount: 200 },
    { id: 'new', date: 3, dueAmount: 300 },
  ];
  const settle = (...made: { amount: number; invoiceId: string | null }[]) =>
    Object.fromEntries(allocatePayments(invoices, made));

  it('settles the oldest invoices first', () => {
    expect(settle({ amount: 250, invoiceId: null })).toEqual({ old: 100, mid: 150, new: 0 });
  });

  it('applies a payment made for a specific invoice to that invoice first', () => {
    expect(settle({ amount: 250, invoiceId: 'new' })).toEqual({ old: 0, mid: 0, new: 250 });
  });

  it('spills what an invoice does not need over to the oldest ones', () => {
    expect(settle({ amount: 350, invoiceId: 'new' })).toEqual({ old: 50, mid: 0, new: 300 });
  });

  it('never settles more than is due, however much is paid', () => {
    expect(settle({ amount: 5000, invoiceId: null })).toEqual({ old: 100, mid: 200, new: 300 });
  });

  it('treats a payment for an unknown invoice as a general payment', () => {
    expect(settle({ amount: 120, invoiceId: 'gone' })).toEqual({ old: 100, mid: 20, new: 0 });
  });

  it('conserves money: settled amounts never exceed payments', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const made = [
        { amount: (seed * 37) % 400, invoiceId: seed % 3 === 0 ? 'mid' : null },
        { amount: (seed * 91) % 250, invoiceId: seed % 5 === 0 ? 'new' : null },
      ].filter((payment) => payment.amount > 0);
      const result = allocatePayments(invoices, made);
      const settledTotal = [...result.values()].reduce((a, b) => a + b, 0);
      const paidTotal = made.reduce((a, b) => a + b.amount, 0);
      expect(settledTotal).toBe(Math.min(paidTotal, 600));
      for (const invoice of invoices) {
        expect(result.get(invoice.id)).toBeLessThanOrEqual(invoice.dueAmount);
        expect(result.get(invoice.id)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
