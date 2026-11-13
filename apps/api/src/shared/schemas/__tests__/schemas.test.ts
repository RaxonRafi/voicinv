import {
  countSyncRecords,
  createUuidV7Generator,
  customerSchema,
  identifierSchema,
  type Invoice,
  invoiceSchema,
  isAppendOnlyTable,
  ledgerEntrySchema,
  minorUnitsSchema,
  paymentSchema,
  registerRequestSchema,
  SYNC_TABLE_NAMES,
  SYNC_TABLES,
  syncChangesSchema,
  syncPullResponseSchema,
  syncPushRequestSchema,
  waitlistRequestSchema,
} from '../../index.js';

const uuid = createUuidV7Generator();
const shopId = uuid();
const deviceId = uuid();
const now = 1_800_000_000_000;

const mutable = () => ({
  id: uuid(),
  shopId,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  deviceId,
});
const appendOnly = () => ({ id: uuid(), shopId, createdAt: now, deviceId });

const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  ...mutable(),
  invoiceNumber: 'RS-A-000001',
  customerId: uuid(),
  date: now,
  subtotal: 500_000,
  discount: 0,
  total: 500_000,
  paidAmount: 250_000,
  dueAmount: 250_000,
  status: 'ACTIVE',
  sourceText: 'two bags of rice to karim paid half',
  ...overrides,
});

describe('money in schemas', () => {
  it.each([1.5, '100', Number.MAX_SAFE_INTEGER + 1, Number.NaN, null])('rejects %p', (value) => {
    expect(minorUnitsSchema.safeParse(value).success).toBe(false);
  });

  it('accepts negative and large safe integers', () => {
    expect(minorUnitsSchema.parse(-250_000)).toBe(-250_000);
    expect(minorUnitsSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('entity schemas', () => {
  it('accepts a valid customer and rejects unknown fields', () => {
    const customer = {
      ...mutable(),
      name: 'Karim',
      phone: '+8801712345678',
      notes: null,
      creditLimit: 1_000_000,
      isArchived: false,
    };
    expect(customerSchema.parse(customer)).toEqual(customer);
    expect(customerSchema.safeParse({ ...customer, balance: 5 }).success).toBe(false);
    expect(customerSchema.safeParse({ ...customer, creditLimit: 10.5 }).success).toBe(false);
    expect(customerSchema.safeParse({ ...customer, name: '   ' }).success).toBe(false);
  });

  it('accepts a consistent invoice', () => {
    expect(invoiceSchema.safeParse(invoice()).success).toBe(true);
    expect(
      invoiceSchema.safeParse(invoice({ customerId: null, paidAmount: 500_000, dueAmount: 0 }))
        .success,
    ).toBe(true);
  });

  it.each<[string, Partial<Invoice>]>([
    ['total ≠ subtotal − discount', { discount: 10_000 }],
    ['paid + due ≠ total', { paidAmount: 100_000 }],
    ['a walk-in sale with an amount due', { customerId: null }],
    ['a float amount', { total: 500_000.5 }],
    ['a malformed invoice number', { invoiceNumber: 'RS-000001' }],
    ['an unknown status', { status: 'DRAFT' as Invoice['status'] }],
  ])('rejects an invoice with %s', (_label, overrides) => {
    expect(invoiceSchema.safeParse(invoice(overrides)).success).toBe(false);
  });

  it('requires payments to be positive and ledger entries to be signed integers', () => {
    const payment = {
      ...appendOnly(),
      customerId: uuid(),
      amount: 50_000,
      date: now,
      note: null,
      invoiceId: null,
    };
    expect(paymentSchema.safeParse(payment).success).toBe(true);
    expect(paymentSchema.safeParse({ ...payment, amount: 0 }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...payment, amount: -5 }).success).toBe(false);

    const entry = {
      ...appendOnly(),
      customerId: uuid(),
      type: 'PAYMENT',
      amount: -50_000,
      refId: payment.id,
    };
    expect(ledgerEntrySchema.safeParse(entry).success).toBe(true);
    expect(ledgerEntrySchema.safeParse({ ...entry, type: 'REFUND' }).success).toBe(false);
    // Append-only records carry no updatedAt/deletedAt.
    expect(ledgerEntrySchema.safeParse({ ...entry, deletedAt: now }).success).toBe(false);
  });
});

describe('sync contracts', () => {
  it('classifies financial records as append-only', () => {
    expect(SYNC_TABLE_NAMES.filter(isAppendOnlyTable)).toEqual([
      'payments',
      'ledgerEntries',
      'invoiceRevisions',
    ]);
    expect(SYNC_TABLES.customers.mode).toBe('mutable');
  });

  it('covers every table in the change-set schema', () => {
    expect(Object.keys(syncChangesSchema.shape).sort()).toEqual([...SYNC_TABLE_NAMES].sort());
  });

  it('parses a push request and fills in missing change lists', () => {
    const request = syncPushRequestSchema.parse({
      deviceId,
      lastPulledCursor: '42',
      changes: { invoices: { created: [invoice()] } },
    });
    expect(request.changes.invoices).toMatchObject({ updated: [], deleted: [] });
    expect(countSyncRecords(request.changes)).toBe(1);
  });

  it('rejects invalid records, unknown tables and client-made cursors', () => {
    const base = { deviceId, lastPulledCursor: '0' };
    expect(
      syncPushRequestSchema.safeParse({
        ...base,
        changes: { invoices: { created: [invoice({ total: 1 })] } },
      }).success,
    ).toBe(false);
    expect(
      syncPushRequestSchema.safeParse({ ...base, changes: { users: { created: [] } } }).success,
    ).toBe(false);
    expect(
      syncPushRequestSchema.safeParse({ ...base, lastPulledCursor: '2026-11-12', changes: {} })
        .success,
    ).toBe(false);
  });

  it('parses a pull response', () => {
    const response = syncPullResponseSchema.parse({
      changes: {},
      cursor: '9007199254740993',
      hasMore: false,
    });
    expect(response.cursor).toBe('9007199254740993');
    expect(countSyncRecords(response.changes)).toBe(0);
  });
});

describe('API request schemas', () => {
  it('accepts a phone number or an email as the account identifier', () => {
    expect(identifierSchema.safeParse('+8801712345678').success).toBe(true);
    expect(identifierSchema.safeParse('karim@example.com').success).toBe(true);
    expect(identifierSchema.safeParse('karim').success).toBe(false);
  });

  it('validates registration', () => {
    const request = {
      identifier: '01712345678',
      password: 'correct horse',
      shop: {
        id: shopId,
        name: 'Rahim Store',
        currencyCode: 'BDT',
        defaultLanguage: 'bn',
        invoicePrefix: 'RS',
      },
    };
    expect(registerRequestSchema.safeParse(request).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...request, password: 'short' }).success).toBe(false);
    expect(registerRequestSchema.safeParse({ ...request, role: 'admin' }).success).toBe(false);
  });

  it('requires an email or a phone number on the waitlist', () => {
    expect(waitlistRequestSchema.safeParse({ phone: '01712345678', locale: 'bn' }).success).toBe(
      true,
    );
    expect(waitlistRequestSchema.safeParse({ locale: 'bn' }).success).toBe(false);
    expect(waitlistRequestSchema.safeParse({ email: 'a@example.com', locale: 'fr' }).success).toBe(
      false,
    );
  });
});
