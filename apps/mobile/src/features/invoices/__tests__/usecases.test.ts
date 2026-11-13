import { invoiceItems, invoiceRevisions, invoices, kv, ledgerEntries, setValue } from '@/core/db';
import { SETTINGS } from '@/core/services';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';
import { DomainError } from '@/core/utils';
import { createCustomer } from '@/features/customers';
import { getBalance, getStatement, recordPayment, sumForReference } from '@/features/ledger';
import { invoiceItemSchema, invoiceSchema, type PaymentInstruction } from '@/shared';

import { countInvoicesBetween, listInvoiceItems, listInvoices } from '../repository';
import { type InvoiceInput } from '../types';
import {
  cancelInvoice,
  createInvoice,
  editInvoice,
  getInvoiceDetails,
  getSettledAmounts,
  invoiceBadgeStatus,
} from '../usecases';

const rice = { productId: null, name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 };
const half: PaymentInstruction = { type: 'FRACTION', numerator: 1, denominator: 2 };

describe('invoices', () => {
  let app: TestShopApp;
  let karim: string;
  let rahim: string;

  const sale = (overrides: Partial<InvoiceInput> = {}): InvoiceInput => ({
    customerId: karim,
    items: [rice],
    discount: 0,
    payment: half,
    sourceText: 'two bags of rice to karim paid half',
    ...overrides,
  });

  beforeEach(async () => {
    app = await createTestShopApp();
    const customer = (name: string) =>
      createCustomer(app.ctx, { name, phone: '', notes: '', creditLimit: null, aliases: [] });
    karim = (await customer('Karim')).id;
    rahim = (await customer('Rahim')).id;
  });

  afterEach(() => app.close());

  describe('createInvoice', () => {
    it('saves "two bags of rice to Karim, paid half" with items and the ledger entry', async () => {
      const invoice = await createInvoice(app.ctx, sale());

      expect(invoice).toMatchObject({
        invoiceNumber: 'RS-A-000001',
        customerId: karim,
        subtotal: 500_000,
        discount: 0,
        total: 500_000,
        paidAmount: 250_000,
        dueAmount: 250_000,
        status: 'ACTIVE',
        sourceText: 'two bags of rice to karim paid half',
        date: app.clock.now(),
        isDirty: true,
      });
      const items = await listInvoiceItems(app.db.orm, invoice.id);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        nameSnapshot: 'Rice',
        qtyMilli: 2000,
        unit: 'bag',
        unitPrice: 250_000,
        lineTotal: 500_000,
        position: 0,
      });
      expect(await getBalance(app.db.orm, karim)).toBe(250_000);
      const statement = await getStatement(app.db.orm, karim);
      expect(statement[0]?.entry).toMatchObject({
        type: 'INVOICE_DUE',
        amount: 250_000,
        refId: invoice.id,
      });

      // Stored records are valid sync entities.
      const { isDirty: _a, ...invoiceEntity } = invoice;
      expect(invoiceSchema.safeParse(invoiceEntity).success).toBe(true);
      const { isDirty: _b, ...itemEntity } = items[0] ?? {};
      expect(invoiceItemSchema.safeParse(itemEntity).success).toBe(true);
    });

    it('numbers invoices from this device’s own sequence, without gaps or repeats', async () => {
      const numbers: string[] = [];
      for (let index = 0; index < 5; index += 1) {
        numbers.push(
          (await createInvoice(app.ctx, sale({ payment: { type: 'FULL' } }))).invoiceNumber,
        );
      }
      expect(numbers).toEqual([
        'RS-A-000001',
        'RS-A-000002',
        'RS-A-000003',
        'RS-A-000004',
        'RS-A-000005',
      ]);
    });

    it('uses the device code assigned at registration', async () => {
      await app.db.write((tx) => setValue(tx, SETTINGS.deviceCode, 'B'));
      expect((await createInvoice(app.ctx, sale())).invoiceNumber).toBe('RS-B-000001');
    });

    it('does not consume a number when saving fails, and never reuses one after a cancel', async () => {
      await expect(createInvoice(app.ctx, sale({ customerId: 'nobody' }))).rejects.toMatchObject({
        code: 'notFound',
      });
      const first = await createInvoice(app.ctx, sale());
      expect(first.invoiceNumber).toBe('RS-A-000001');

      await cancelInvoice(app.ctx, first.id, 'wrong customer');
      expect((await createInvoice(app.ctx, sale())).invoiceNumber).toBe('RS-A-000002');
    });

    it('keeps concurrent saves from sharing a number', async () => {
      const created = await Promise.all(
        Array.from({ length: 12 }, () =>
          createInvoice(app.ctx, sale({ payment: { type: 'FULL' } })),
        ),
      );
      expect(new Set(created.map((invoice) => invoice.invoiceNumber)).size).toBe(12);
    });

    it('records no ledger entry for a fully paid sale', async () => {
      await createInvoice(app.ctx, sale({ payment: { type: 'FULL' } }));
      expect(await app.db.orm.select().from(ledgerEntries)).toEqual([]);
      expect(await getBalance(app.db.orm, karim)).toBe(0);
    });

    it('allows a walk-in sale only when it is paid in full', async () => {
      const paid = await createInvoice(
        app.ctx,
        sale({ customerId: null, payment: { type: 'FULL' } }),
      );
      expect(paid).toMatchObject({ customerId: null, dueAmount: 0, paidAmount: 500_000 });

      await expect(
        createInvoice(app.ctx, sale({ customerId: null, payment: half })),
      ).rejects.toMatchObject({
        code: 'walkInDue',
        field: 'payment',
      });
      expect(await app.db.orm.select().from(invoices)).toHaveLength(1);
    });

    it('applies a discount and several lines, rounding each line exactly', async () => {
      const invoice = await createInvoice(
        app.ctx,
        sale({
          items: [
            rice,
            { productId: null, name: 'Sugar', unit: 'kg', qtyMilli: 1500, unitPrice: 13_333 },
          ],
          discount: 10_000,
          payment: { type: 'AMOUNT', amount: 300_000 },
        }),
      );
      // 1.5 × 133.33 = 199.995 → 200.00
      expect(invoice).toMatchObject({
        subtotal: 520_000,
        discount: 10_000,
        total: 510_000,
        paidAmount: 300_000,
        dueAmount: 210_000,
      });
      const items = await listInvoiceItems(app.db.orm, invoice.id);
      expect(items.map((item) => [item.position, item.nameSnapshot, item.lineTotal])).toEqual([
        [0, 'Rice', 500_000],
        [1, 'Sugar', 20_000],
      ]);
    });

    it.each<[string, Partial<InvoiceInput>]>([
      ['no items', { items: [] }],
      ['a zero quantity', { items: [{ ...rice, qtyMilli: 0 }] }],
      ['a fractional price', { items: [{ ...rice, unitPrice: 2500.5 }] }],
      ['a negative price', { items: [{ ...rice, unitPrice: -1 }] }],
      ['a nameless item', { items: [{ ...rice, name: ' ' }] }],
      ['a discount above the subtotal', { discount: 600_000 }],
      ['a negative discount', { discount: -1 }],
    ])('saves nothing for an invoice with %s', async (_label, overrides) => {
      await expect(createInvoice(app.ctx, sale(overrides))).rejects.toThrow();
      expect(await app.db.orm.select().from(invoices)).toEqual([]);
      expect(await app.db.orm.select().from(invoiceItems)).toEqual([]);
      expect(await app.db.orm.select().from(ledgerEntries)).toEqual([]);
      const sequence = (await app.db.orm.select().from(kv)).find(
        (row) => row.key === SETTINGS.invoiceSequence,
      );
      expect(sequence).toBeUndefined();
    });

    it('lets a guard refuse the invoice before anything is written', async () => {
      const guard = jest.fn(() => Promise.reject(new DomainError('freeLimitReached')));
      await expect(createInvoice(app.ctx, sale(), guard)).rejects.toMatchObject({
        code: 'freeLimitReached',
      });
      expect(guard).toHaveBeenCalledTimes(1);
      expect(await app.db.orm.select().from(invoices)).toEqual([]);
    });
  });

  describe('cancelInvoice', () => {
    it('marks the invoice cancelled, keeps an audit record and reverses the due amount', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      app.clock.advance(60_000);

      await cancelInvoice(app.ctx, invoice.id, '  entered twice ');

      const details = await getInvoiceDetails(app.db.orm, invoice.id);
      expect(details?.invoice).toMatchObject({
        status: 'CANCELLED',
        updatedAt: app.clock.now(),
        isDirty: true,
      });
      expect(details?.items).toHaveLength(1); // nothing is deleted
      expect(details?.revisions).toHaveLength(1);
      expect(details?.revisions[0]?.reason).toBe('entered twice');
      const previous = JSON.parse(details?.revisions[0]?.previousJson ?? '{}');
      expect(previous.invoice).toMatchObject({ status: 'ACTIVE', dueAmount: 250_000 });
      expect(previous.items).toHaveLength(1);

      expect(await getBalance(app.db.orm, karim)).toBe(0);
      expect(await sumForReference(app.db.orm, karim, invoice.id)).toBe(0);
      const statement = await getStatement(app.db.orm, karim);
      expect(statement.map((line) => line.entry.type)).toEqual(['INVOICE_DUE', 'REVERSAL']);
    });

    it('leaves payments already received as the customer’s credit', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      await recordPayment(app.ctx, {
        customerId: karim,
        amount: 100_000,
        note: '',
        invoiceId: invoice.id,
      });
      await cancelInvoice(app.ctx, invoice.id, 'returned goods');
      expect(await getBalance(app.db.orm, karim)).toBe(-100_000);
    });

    it('cannot cancel twice, needs a reason, and needs an existing invoice', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      await expect(cancelInvoice(app.ctx, invoice.id, '   ')).rejects.toMatchObject({
        code: 'required',
      });
      await cancelInvoice(app.ctx, invoice.id, 'mistake');
      await expect(cancelInvoice(app.ctx, invoice.id, 'again')).rejects.toMatchObject({
        code: 'alreadyCancelled',
      });
      await expect(cancelInvoice(app.ctx, 'missing', 'x')).rejects.toMatchObject({
        code: 'notFound',
      });
      expect(await app.db.orm.select().from(invoiceRevisions)).toHaveLength(1);
      expect(await getBalance(app.db.orm, karim)).toBe(0);
    });

    it('writes no reversal for a fully paid or walk-in invoice', async () => {
      const paid = await createInvoice(app.ctx, sale({ payment: { type: 'FULL' } }));
      const walkIn = await createInvoice(
        app.ctx,
        sale({ customerId: null, payment: { type: 'FULL' } }),
      );
      await cancelInvoice(app.ctx, paid.id, 'mistake');
      await cancelInvoice(app.ctx, walkIn.id, 'mistake');
      expect(await app.db.orm.select().from(ledgerEntries)).toEqual([]);
    });
  });

  describe('editInvoice', () => {
    it('replaces the lines, keeps the number and adjusts the ledger by the difference', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      app.clock.advance(60_000);

      await editInvoice(
        app.ctx,
        invoice.id,
        sale({
          items: [{ ...rice, qtyMilli: 3000 }],
          payment: { type: 'AMOUNT', amount: 250_000 },
        }),
        'it was three bags',
      );

      const details = await getInvoiceDetails(app.db.orm, invoice.id);
      expect(details?.invoice).toMatchObject({
        invoiceNumber: invoice.invoiceNumber,
        total: 750_000,
        paidAmount: 250_000,
        dueAmount: 500_000,
        status: 'ACTIVE',
        createdAt: invoice.createdAt,
      });
      expect(details?.items.map((item) => item.qtyMilli)).toEqual([3000]);
      // The old line is soft-deleted, not removed.
      expect(await app.db.orm.select().from(invoiceItems)).toHaveLength(2);
      expect(details?.revisions).toHaveLength(1);
      expect(JSON.parse(details?.revisions[0]?.previousJson ?? '{}').invoice.total).toBe(500_000);

      const statement = await getStatement(app.db.orm, karim);
      expect(statement.map((line) => [line.entry.type, line.entry.amount])).toEqual([
        ['INVOICE_DUE', 250_000],
        ['ADJUSTMENT', 250_000],
      ]);
      expect(await sumForReference(app.db.orm, karim, invoice.id)).toBe(500_000);
    });

    it('writes no ledger entry when the due amount stays the same', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      await editInvoice(
        app.ctx,
        invoice.id,
        sale({ items: [{ ...rice, name: 'Miniket rice' }] }),
        'name',
      );
      expect(await app.db.orm.select().from(ledgerEntries)).toHaveLength(1);
      expect(await app.db.orm.select().from(invoiceRevisions)).toHaveLength(1);
    });

    it('moves the due amount when the customer is changed', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      await editInvoice(app.ctx, invoice.id, sale({ customerId: rahim }), 'wrong customer');

      expect(await getBalance(app.db.orm, karim)).toBe(0);
      expect(await getBalance(app.db.orm, rahim)).toBe(250_000);
      expect(await sumForReference(app.db.orm, rahim, invoice.id)).toBe(250_000);
    });

    it('can turn a credit sale into a paid walk-in sale', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      await editInvoice(
        app.ctx,
        invoice.id,
        sale({ customerId: null, payment: { type: 'FULL' } }),
        'paid cash',
      );
      expect(await getBalance(app.db.orm, karim)).toBe(0);
      expect((await getInvoiceDetails(app.db.orm, invoice.id))?.invoice).toMatchObject({
        customerId: null,
        dueAmount: 0,
      });
    });

    it('refuses to edit a cancelled invoice or to leave it invalid', async () => {
      const invoice = await createInvoice(app.ctx, sale());
      await expect(editInvoice(app.ctx, invoice.id, sale({ items: [] }), 'x')).rejects.toThrow();
      await expect(editInvoice(app.ctx, invoice.id, sale(), ' ')).rejects.toMatchObject({
        code: 'required',
      });
      await cancelInvoice(app.ctx, invoice.id, 'mistake');
      await expect(editInvoice(app.ctx, invoice.id, sale(), 'x')).rejects.toMatchObject({
        code: 'alreadyCancelled',
      });
      expect(await app.db.orm.select().from(invoiceRevisions)).toHaveLength(1);
    });
  });

  describe('queries', () => {
    it('lists invoices newest first, filtered by customer or search text', async () => {
      const first = await createInvoice(app.ctx, sale());
      app.clock.advance(1000);
      const second = await createInvoice(app.ctx, sale({ customerId: rahim }));
      app.clock.advance(1000);
      const walkIn = await createInvoice(
        app.ctx,
        sale({ customerId: null, payment: { type: 'FULL' } }),
      );

      const ids = async (filter = {}) =>
        (await listInvoices(app.db.orm, filter)).map((row) => row.invoice.id);
      expect(await ids()).toEqual([walkIn.id, second.id, first.id]);
      expect(await ids({ customerId: karim })).toEqual([first.id]);
      expect(await ids({ search: 'rah' })).toEqual([second.id]);
      expect(await ids({ search: '000003' })).toEqual([walkIn.id]);
      expect(await ids({ limit: 2 })).toEqual([walkIn.id, second.id]);
      expect((await listInvoices(app.db.orm))[0]?.customerName).toBeNull();
    });

    it('counts invoices in a period, including cancelled ones', async () => {
      const start = app.clock.now();
      const invoice = await createInvoice(app.ctx, sale());
      await cancelInvoice(app.ctx, invoice.id, 'mistake');
      app.clock.advance(10_000);
      await createInvoice(app.ctx, sale());

      expect(await countInvoicesBetween(app.db.orm, start, start + 20_000)).toBe(2);
      expect(await countInvoicesBetween(app.db.orm, start, start + 5000)).toBe(1);
      expect(await countInvoicesBetween(app.db.orm, start + 20_000, start + 30_000)).toBe(0);
    });

    it('shows an invoice as paid once later payments cover it, oldest first', async () => {
      const older = await createInvoice(app.ctx, sale()); // due 250,000
      app.clock.advance(1000);
      const newer = await createInvoice(app.ctx, sale()); // due 250,000
      await recordPayment(app.ctx, {
        customerId: karim,
        amount: 300_000,
        note: '',
        invoiceId: null,
      });

      const settled = await getSettledAmounts(app.db.orm, [karim]);
      expect(settled.get(older.id)).toBe(250_000);
      expect(settled.get(newer.id)).toBe(50_000);
      expect(invoiceBadgeStatus(older, settled.get(older.id) ?? 0)).toBe('PAID');
      expect(invoiceBadgeStatus(newer, settled.get(newer.id) ?? 0)).toBe('PARTLY_PAID');
      expect((await getInvoiceDetails(app.db.orm, newer.id))?.settledLater).toBe(50_000);
    });

    it('derives the badge from status and what has been paid', () => {
      expect(invoiceBadgeStatus({ status: 'CANCELLED', total: 100, paidAmount: 100 }, 0)).toBe(
        'CANCELLED',
      );
      expect(invoiceBadgeStatus({ status: 'ACTIVE', total: 100, paidAmount: 100 }, 0)).toBe('PAID');
      expect(invoiceBadgeStatus({ status: 'ACTIVE', total: 100, paidAmount: 0 }, 0)).toBe('DUE');
      expect(invoiceBadgeStatus({ status: 'ACTIVE', total: 100, paidAmount: 40 }, 60)).toBe('PAID');
    });
  });
});

describe('ledger property: balances always equal the sum of entries', () => {
  /** Small deterministic generator, so a failing sequence can be replayed by its seed. */
  function random(seed: number) {
    let state = seed >>> 0;
    return (limit: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state % limit;
    };
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'holds after a random sequence of operations (seed %i)',
    async (seed) => {
      const app = await createTestShopApp();
      const next = random(seed);
      const customerIds: string[] = [];
      for (const name of ['Karim', 'Rahim', 'Salma']) {
        const customer = await createCustomer(app.ctx, {
          name,
          phone: '',
          notes: '',
          creditLimit: null,
          aliases: [],
        });
        customerIds.push(customer.id);
      }
      const pick = <T>(list: readonly T[]): T => {
        const item = list[next(list.length)];
        if (item === undefined) throw new Error('empty list');
        return item;
      };
      const randomSale = (): InvoiceInput => {
        const customerId = next(5) === 0 ? null : pick(customerIds);
        const payments: PaymentInstruction[] = [
          { type: 'FULL' },
          { type: 'NONE' },
          { type: 'AMOUNT', amount: next(90_000) },
          { type: 'FRACTION', numerator: 1, denominator: 2 + next(3) },
        ];
        return {
          customerId,
          items: Array.from({ length: 1 + next(3) }, (_unused, index) => ({
            productId: null,
            name: `Item ${index}`,
            unit: 'kg',
            qtyMilli: 1 + next(5000),
            unitPrice: next(40_000),
          })),
          discount: 0,
          payment: customerId === null ? { type: 'FULL' } : pick(payments),
          sourceText: null,
        };
      };

      // The model: what each customer should owe, tracked independently of the ledger.
      const expected = new Map(customerIds.map((id) => [id, 0]));
      const active = new Map<string, { customerId: string | null; due: number }>();
      const owe = (customerId: string | null, amount: number) => {
        if (customerId !== null) expected.set(customerId, (expected.get(customerId) ?? 0) + amount);
      };

      for (let step = 0; step < 60; step += 1) {
        app.clock.advance(1000);
        const action = next(10);
        if (action < 4 || active.size === 0) {
          const invoice = await createInvoice(app.ctx, randomSale());
          active.set(invoice.id, { customerId: invoice.customerId, due: invoice.dueAmount });
          owe(invoice.customerId, invoice.dueAmount);
        } else if (action < 6) {
          const customerId = pick(customerIds);
          const amount = 1 + next(60_000);
          await recordPayment(app.ctx, { customerId, amount, note: '', invoiceId: null });
          owe(customerId, -amount);
        } else if (action < 8) {
          const id = pick([...active.keys()]);
          const before = active.get(id);
          const input = randomSale();
          await editInvoice(app.ctx, id, input, 'correction');
          const after = await getInvoiceDetails(app.db.orm, id);
          owe(before?.customerId ?? null, -(before?.due ?? 0));
          owe(after?.invoice.customerId ?? null, after?.invoice.dueAmount ?? 0);
          active.set(id, {
            customerId: after?.invoice.customerId ?? null,
            due: after?.invoice.dueAmount ?? 0,
          });
        } else {
          const id = pick([...active.keys()]);
          const before = active.get(id);
          await cancelInvoice(app.ctx, id, 'cancelled');
          owe(before?.customerId ?? null, -(before?.due ?? 0));
          active.delete(id);
        }

        for (const customerId of customerIds) {
          const entries = await getStatement(app.db.orm, customerId);
          const sumOfEntries = entries.reduce((total, line) => total + line.entry.amount, 0);
          const balance = await getBalance(app.db.orm, customerId);
          expect(balance).toBe(sumOfEntries);
          expect(balance).toBe(expected.get(customerId));
          expect(entries.at(-1)?.balance ?? 0).toBe(balance);
        }
      }

      // Every invoice's own entries add up to its due amount while active, and to zero otherwise.
      for (const row of await listInvoices(app.db.orm)) {
        const { invoice } = row;
        for (const customerId of customerIds) {
          const net = await sumForReference(app.db.orm, customerId, invoice.id);
          const owner = invoice.status === 'ACTIVE' && invoice.customerId === customerId;
          expect(net).toBe(owner ? invoice.dueAmount : 0);
        }
        expect(invoice.paidAmount + invoice.dueAmount).toBe(invoice.total);
      }
      await app.close();
    },
  );
});
