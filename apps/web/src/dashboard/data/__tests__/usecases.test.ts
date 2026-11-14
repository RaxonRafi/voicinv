import { createUuidV7Generator, Money, SYNC_TABLES, syncChangesSchema } from '@/domain';

import { createCustomer, createProduct, editCustomer, editProduct } from '../catalog';
import { draftFromInvoice, draftProblems, draftReducer, draftToInput, emptyDraft } from '../draft';
import { cancelInvoice, createInvoice, editInvoice, type InvoiceInput } from '../invoices';
import { recordPayment } from '../ledger';
import {
  customerBalances,
  getInvoiceDetails,
  getSalesSummary,
  getStatement,
  getTopDebtors,
  getTopProducts,
  highestInvoiceSequence,
  listCustomers,
  listInvoices,
  listProducts,
  receivables,
  settledAmounts,
} from '../selectors';
import { shopRecord, starterProducts, updateShopProfile } from '../shop';
import {
  applyChanges,
  type ChangeSet,
  DomainError,
  emptyShopData,
  type ShopData,
  type WriteContext,
} from '../shop-data';

const SHOP_ID = '0192f0c0-0000-7000-8000-00000000000a';
const DEVICE_ID = '0192f0c0-0000-7000-8000-00000000000b';

function setup() {
  let clock = 1_800_000_000_000;
  const ctx: WriteContext = {
    shopId: SHOP_ID,
    deviceId: DEVICE_ID,
    now: () => (clock += 1000),
    newId: createUuidV7Generator({ now: () => clock }),
  };
  let data: ShopData = emptyShopData();
  let sequence = 0;
  /** Applies a use case's change set the way the store does after a successful push. */
  const save = <T>(write: { changes: ChangeSet; result: T }): T => {
    const built = write.changes.build();
    // Everything a use case produces must pass the sync contract unchanged.
    expect(syncChangesSchema.safeParse(built).success).toBe(true);
    data = applyChanges(data, built, SHOP_ID);
    return write.result;
  };
  const invoiceNumber = () => `TS-A-${String((sequence += 1)).padStart(6, '0')}`;
  save({
    changes: starterProducts(ctx, 'grocery', 'en').put(
      'shops',
      shopRecord(ctx, {
        id: SHOP_ID,
        name: 'Test Store',
        currencyCode: 'BDT',
        defaultLanguage: 'en',
        invoicePrefix: 'TS',
      }),
    ),
    result: undefined,
  });
  return { ctx, save, invoiceNumber, data: () => data };
}

const sale = (customerId: string | null, overrides: Partial<InvoiceInput> = {}): InvoiceInput => ({
  customerId,
  items: [{ productId: null, name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 }],
  discount: 0,
  payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
  sourceText: null,
  ...overrides,
});

const CUSTOMER = { name: 'Karim', phone: '', notes: '', creditLimit: null, aliases: ['করিম'] };

describe('shop setup', () => {
  it('creates starter products in the shop language with the other names as aliases', () => {
    const { data } = setup();
    const products = listProducts(data());
    expect(products.map((product) => product.name)).toContain('Rice');
    expect(listProducts(data(), { search: 'চাল' }).map((product) => product.name)).toEqual(['Rice']);
    expect(products.every((product) => product.defaultPrice === null)).toBe(true);
  });

  it('updates the profile and rejects a bad prefix or phone', () => {
    const { ctx, save, data } = setup();
    const shop = save(
      updateShopProfile(data(), ctx, {
        name: ' Rahim  Store ',
        phone: '০১৭১২ ৩৪৫৬৭৮',
        address: 'Dhaka',
        invoicePrefix: 'rs',
      }),
    );
    expect(shop).toMatchObject({ name: 'Rahim Store', phone: '01712345678', invoicePrefix: 'RS' });
    const input = { name: 'X', phone: '', address: '', invoicePrefix: 'TOO-LONG' };
    expect(() => updateShopProfile(data(), ctx, input)).toThrow(DomainError);
    expect(() => updateShopProfile(data(), ctx, { ...input, invoicePrefix: 'X', phone: '12' })).toThrow(
      DomainError,
    );
  });
});

describe('customers and products', () => {
  it('refuses duplicates but allows two people with the same name and different phones', () => {
    const { ctx, save, data } = setup();
    save(createCustomer(data(), ctx, { ...CUSTOMER, phone: '01711111111' }));
    expect(() => createCustomer(data(), ctx, { ...CUSTOMER, name: ' karim ' })).toThrow(DomainError);
    save(createCustomer(data(), ctx, { ...CUSTOMER, phone: '01722222222' }));
    expect(listCustomers(data())).toHaveLength(2);
    expect(() => createProduct(data(), ctx, { name: 'rice', unit: 'kg', defaultPrice: null, aliases: [] })).toThrow(
      DomainError,
    );
  });

  it('finds customers by other names and hides archived ones', () => {
    const { ctx, save, data } = setup();
    const karim = save(createCustomer(data(), ctx, CUSTOMER));
    expect(listCustomers(data(), { search: 'করিম' })).toHaveLength(1);
    save(editCustomer(data(), ctx, karim.id, { ...CUSTOMER, aliases: ['Korim'], isArchived: true }));
    expect(listCustomers(data())).toHaveLength(0);
    expect(listCustomers(data(), { includeArchived: true, search: 'korim' })).toHaveLength(1);
    expect(listCustomers(data(), { includeArchived: true, search: 'করিম' })).toHaveLength(0);
  });

  it('edits a product without touching old invoices', () => {
    const { ctx, save, data, invoiceNumber } = setup();
    const [rice] = listProducts(data(), { search: 'rice' });
    if (!rice) throw new Error('missing starter product');
    const invoice = save(
      createInvoice(
        data(),
        ctx,
        sale(null, {
          items: [{ productId: rice.id, name: rice.name, unit: rice.unit, qtyMilli: 1500, unitPrice: 8000 }],
          payment: { type: 'FULL' },
        }),
        invoiceNumber(),
      ),
    );
    save(editProduct(data(), ctx, rice.id, { name: 'Miniket rice', unit: 'kg', defaultPrice: 9000, aliases: [] }));
    expect(getInvoiceDetails(data(), invoice.id)?.items[0]).toMatchObject({
      nameSnapshot: 'Rice',
      lineTotal: 12_000,
    });
  });
});

describe('invoices and the ledger', () => {
  it('saves an invoice with its lines and what is left due', () => {
    const { ctx, save, data, invoiceNumber } = setup();
    const karim = save(createCustomer(data(), ctx, CUSTOMER));
    const invoice = save(createInvoice(data(), ctx, sale(karim.id), invoiceNumber()));
    expect(invoice).toMatchObject({ total: 500_000, paidAmount: 250_000, dueAmount: 250_000 });
    expect(customerBalances(data()).get(karim.id)).toBe(250_000);
    expect(listInvoices(data())[0]).toMatchObject({ customerName: 'Karim', status: 'PARTLY_PAID' });
    expect(highestInvoiceSequence(data(), 'TS', 'A')).toBe(1);
    expect(highestInvoiceSequence(data(), 'TS', 'B')).toBe(0);
  });

  it('refuses a walk-in sale that is not paid in full', () => {
    const { ctx, data } = setup();
    expect(() => createInvoice(data(), ctx, sale(null), 'TS-A-000001')).toThrow(/walkInDue/);
  });

  it('settles the oldest invoice first when a payment arrives', () => {
    const { ctx, save, data, invoiceNumber } = setup();
    const karim = save(createCustomer(data(), ctx, CUSTOMER));
    const first = save(createInvoice(data(), ctx, sale(karim.id), invoiceNumber()));
    const second = save(createInvoice(data(), ctx, sale(karim.id), invoiceNumber()));
    const { balance } = save(
      recordPayment(data(), ctx, { customerId: karim.id, amount: 300_000, note: '', invoiceId: null }),
    );
    expect(balance).toBe(200_000);
    expect(settledAmounts(data()).get(first.id)).toBe(250_000);
    expect(settledAmounts(data()).get(second.id)).toBe(50_000);
    expect(getInvoiceDetails(data(), first.id)?.status).toBe('PAID');
    expect(getStatement(data(), karim.id).map((line) => line.balance)).toEqual([
      250_000, 500_000, 200_000,
    ]);
  });

  it('keeps an advance when a customer pays more than they owe', () => {
    const { ctx, save, data } = setup();
    const karim = save(createCustomer(data(), ctx, CUSTOMER));
    save(recordPayment(data(), ctx, { customerId: karim.id, amount: 10_000, note: 'advance', invoiceId: null }));
    expect(receivables(data())).toEqual({ toCollect: 0, advanceHeld: 10_000 });
    expect(getTopDebtors(data())).toEqual([]);
  });

  it('cancels with an audit record and a reversal, and never twice', () => {
    const { ctx, save, data, invoiceNumber } = setup();
    const karim = save(createCustomer(data(), ctx, CUSTOMER));
    const invoice = save(createInvoice(data(), ctx, sale(karim.id), invoiceNumber()));
    expect(() => cancelInvoice(data(), ctx, invoice.id, '  ')).toThrow(/required/);
    save(cancelInvoice(data(), ctx, invoice.id, 'Wrong customer'));
    const details = getInvoiceDetails(data(), invoice.id);
    expect(details?.status).toBe('CANCELLED');
    expect(details?.revisions).toHaveLength(1);
    expect(JSON.parse(details?.revisions[0]?.previousJson ?? '{}').invoice.status).toBe('ACTIVE');
    expect(customerBalances(data()).get(karim.id)).toBe(0);
    expect(() => cancelInvoice(data(), ctx, invoice.id, 'again')).toThrow(/alreadyCancelled/);
  });

  it('edits an invoice: lines replaced, difference adjusted, customer change moves the due', () => {
    const { ctx, save, data, invoiceNumber } = setup();
    const karim = save(createCustomer(data(), ctx, CUSTOMER));
    const rahim = save(createCustomer(data(), ctx, { ...CUSTOMER, name: 'Rahim', aliases: [] }));
    const invoice = save(createInvoice(data(), ctx, sale(karim.id), invoiceNumber()));

    const details = getInvoiceDetails(data(), invoice.id);
    if (!details) throw new Error('invoice not found');
    const draft = draftReducer(draftFromInvoice(details), {
      type: 'setPayment',
      payment: { type: 'NONE' },
    });
    save(editInvoice(data(), ctx, invoice.id, draftToInput(draft), 'Paid nothing after all'));
    expect(customerBalances(data()).get(karim.id)).toBe(500_000);
    expect(getInvoiceDetails(data(), invoice.id)?.items).toHaveLength(1);

    save(editInvoice(data(), ctx, invoice.id, { ...draftToInput(draft), customerId: rahim.id }, 'Wrong name'));
    expect(customerBalances(data()).get(karim.id)).toBe(0);
    expect(customerBalances(data()).get(rahim.id)).toBe(500_000);
    expect(getInvoiceDetails(data(), invoice.id)?.revisions).toHaveLength(2);
    expect(getInvoiceDetails(data(), invoice.id)?.invoice.invoiceNumber).toBe('TS-A-000001');
  });

  it('keeps every balance equal to the sum of its entries after any sequence of actions', () => {
    // Property-style check (AGENTS.md §14) with a fixed pseudo-random sequence.
    const { ctx, save, data, invoiceNumber } = setup();
    let seed = 42;
    const random = (limit: number) => (seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) % limit;
    const customers = ['Karim', 'Rahim', 'Salma'].map((name) =>
      save(createCustomer(data(), ctx, { ...CUSTOMER, name, aliases: [] })),
    );
    const pick = <T>(list: readonly T[]): T => list[random(list.length)] as T;

    for (let step = 0; step < 200; step += 1) {
      const customer = pick(customers);
      const active = listInvoices(data()).filter((row) => row.invoice.status === 'ACTIVE');
      const action = random(4);
      if (action === 0 || active.length === 0) {
        const input = sale(customer.id, {
          items: [{ productId: null, name: 'Item', unit: 'kg', qtyMilli: 500 + random(5000), unitPrice: random(90_000) }],
          payment: pick([{ type: 'FULL' }, { type: 'NONE' }, { type: 'AMOUNT', amount: random(50_000) }] as const),
        });
        save(createInvoice(data(), ctx, input, invoiceNumber()));
      } else if (action === 1) {
        save(recordPayment(data(), ctx, { customerId: customer.id, amount: 1 + random(80_000), note: '', invoiceId: null }));
      } else if (action === 2) {
        save(cancelInvoice(data(), ctx, pick(active).invoice.id, 'test'));
      } else {
        const row = pick(active);
        const details = getInvoiceDetails(data(), row.invoice.id);
        if (!details) throw new Error('invoice not found');
        const input = draftToInput(draftFromInvoice(details));
        const moved = { ...input, customerId: customer.id, payment: { type: 'AMOUNT', amount: random(20_000) } as const };
        save(editInvoice(data(), ctx, row.invoice.id, moved, 'test'));
      }

      // What every active invoice leaves due, minus all payments, is each customer's balance.
      const expected = new Map<string, number>();
      for (const { invoice } of listInvoices(data())) {
        if (invoice.status !== 'ACTIVE' || invoice.customerId === null) continue;
        expected.set(invoice.customerId, (expected.get(invoice.customerId) ?? 0) + invoice.dueAmount);
      }
      for (const payment of data().payments.values()) {
        expected.set(payment.customerId, (expected.get(payment.customerId) ?? 0) - payment.amount);
      }
      const balances = customerBalances(data());
      for (const { id } of customers) expect(balances.get(id) ?? 0).toBe(expected.get(id) ?? 0);
      for (const invoice of data().invoices.values()) {
        expect(SYNC_TABLES.invoices.schema.safeParse(invoice).success).toBe(true);
      }
    }
    const { toCollect, advanceHeld } = receivables(data());
    expect(toCollect - advanceHeld).toBe(Money.sum(customerBalances(data()).values()));
  });
});

describe('reports', () => {
  it('totals active invoices of the period and ranks products and debtors', () => {
    const { ctx, save, data, invoiceNumber } = setup();
    const karim = save(createCustomer(data(), ctx, CUSTOMER));
    save(createInvoice(data(), ctx, sale(karim.id), invoiceNumber()));
    const cancelled = save(createInvoice(data(), ctx, sale(null, { payment: { type: 'FULL' } }), invoiceNumber()));
    save(cancelInvoice(data(), ctx, cancelled.id, 'mistake'));
    save(
      createInvoice(
        data(),
        ctx,
        sale(null, {
          items: [{ productId: null, name: 'Egg', unit: 'piece', qtyMilli: 12_000, unitPrice: 1200 }],
          payment: { type: 'FULL' },
        }),
        invoiceNumber(),
      ),
    );
    const range = [0, ctx.now()] as const;
    expect(getSalesSummary(data(), ...range)).toEqual({
      totalSales: 514_400,
      totalPaid: 264_400,
      totalDue: 250_000,
      invoiceCount: 2,
    });
    expect(getTopProducts(data(), ...range).map((product) => product.name)).toEqual(['Rice', 'Egg']);
    expect(getTopDebtors(data())).toMatchObject([{ name: 'Karim', balance: 250_000 }]);
    expect(getSalesSummary(data(), 0, 1).invoiceCount).toBe(0);
  });
});

describe('invoice draft', () => {
  it('explains what stops a draft from being saved', () => {
    let draft = emptyDraft();
    expect(draftProblems(draft)).toEqual([{ code: 'noItems' }]);
    draft = draftReducer(draft, {
      type: 'addItem',
      item: { productId: null, name: 'Rice', unit: 'kg', qtyMilli: 1000, unitPrice: null },
    });
    expect(draftProblems(draft).map((problem) => problem.code)).toEqual(['itemPrice']);
    const [item] = draft.items;
    draft = draftReducer(draft, { type: 'updateItem', key: item?.key ?? '', changes: { unitPrice: 5000 } });
    draft = draftReducer(draft, { type: 'setPayment', payment: { type: 'NONE' } });
    expect(draftProblems(draft)).toEqual([{ code: 'walkInDue' }]);
    draft = draftReducer(draft, { type: 'setDiscount', discount: 6000 });
    expect(draftProblems(draft)).toEqual([{ code: 'discountTooBig' }]);
    expect(() => draftToInput(draft)).toThrow();
  });
});
