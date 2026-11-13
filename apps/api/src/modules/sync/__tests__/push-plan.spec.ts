import { type SyncChanges } from '../../../shared/index.js';
import {
  findPushRejection,
  mentionedIds,
  planTable,
  type RecordData,
  sameRecord,
  type StoredVersion,
} from '../push-plan.js';

const SHOP = '0192f0c0-0000-7000-8000-0000000000a1';
const OTHER_SHOP = '0192f0c0-0000-7000-8000-0000000000a2';
const DEVICE = '0192f0c0-0000-7000-8000-0000000000d1';
const OTHER_DEVICE = '0192f0c0-0000-7000-8000-0000000000d2';
const NOW = 1_800_000_000_000;

const id = (n: number) => `0192f0c0-0000-7000-8000-${String(n).padStart(12, '0')}`;

function customer(n: number, overrides: Record<string, unknown> = {}): RecordData {
  return {
    id: id(n),
    shopId: SHOP,
    createdAt: 1000,
    updatedAt: 1000,
    deletedAt: null,
    deviceId: DEVICE,
    name: `Customer ${n}`,
    phone: null,
    notes: null,
    creditLimit: null,
    isArchived: false,
    ...overrides,
  };
}

function payment(n: number, overrides: Record<string, unknown> = {}): RecordData {
  return {
    id: id(n),
    shopId: SHOP,
    createdAt: 1000,
    deviceId: DEVICE,
    customerId: id(1),
    amount: 5000,
    date: 1000,
    note: null,
    invoiceId: null,
    ...overrides,
  };
}

/** Test payloads are built loosely; the real ones are validated by the Zod contract first. */
const changes = (value: Record<string, unknown>) => value as SyncChanges;

const stored = (
  data: Record<string, unknown>,
  overrides: Partial<StoredVersion> = {},
): StoredVersion => ({ data, deleted: false, deviceId: DEVICE, serverSeq: 5, ...overrides });

function plan(
  table: 'customers' | 'payments',
  tableChanges: Record<string, unknown>,
  storedRows: [string, StoredVersion][] = [],
  options: { lastPulledCursor?: number; seq?: number } = {},
) {
  return planTable({
    table,
    changes: changes({ [table]: { created: [], updated: [], deleted: [], ...tableChanges } }),
    stored: new Map(storedRows),
    deviceId: DEVICE,
    lastPulledCursor: options.lastPulledCursor ?? 10,
    seq: options.seq ?? 10,
    now: NOW,
  });
}

describe('findPushRejection', () => {
  it('accepts a push whose records all belong to the caller’s shop', () => {
    const push = changes({
      customers: { created: [customer(1)], updated: [customer(2)], deleted: [id(3)] },
      payments: { created: [payment(4)], updated: [], deleted: [] },
    });
    expect(findPushRejection(push, SHOP)).toBeNull();
  });

  it('refuses a record that names another shop', () => {
    const push = changes({
      customers: { created: [customer(1, { shopId: OTHER_SHOP })], updated: [], deleted: [] },
    });
    expect(findPushRejection(push, SHOP)).toEqual({
      reason: 'FOREIGN_SHOP',
      table: 'customers',
      id: id(1),
    });
  });

  it('refuses a shop record other than the caller’s own shop', () => {
    const push = changes({
      shops: { created: [], updated: [{ id: OTHER_SHOP, shopId: SHOP }], deleted: [] },
    });
    expect(findPushRejection(push, SHOP)).toMatchObject({ reason: 'FOREIGN_SHOP', table: 'shops' });
  });

  it.each([
    ['an update', { created: [], updated: [payment(1)], deleted: [] }],
    ['a delete', { created: [], updated: [], deleted: [id(1)] }],
  ])('refuses %s of an append-only record', (_case, entry) => {
    expect(findPushRejection(changes({ payments: entry }), SHOP)).toEqual({
      reason: 'APPEND_ONLY',
      table: 'payments',
    });
    expect(findPushRejection(changes({ ledgerEntries: entry }), SHOP)).toMatchObject({
      reason: 'APPEND_ONLY',
    });
    expect(findPushRejection(changes({ invoiceRevisions: entry }), SHOP)).toMatchObject({
      reason: 'APPEND_ONLY',
    });
  });

  it('refuses deleting the shop, by ID or by a deletedAt timestamp', () => {
    const byId = changes({ shops: { created: [], updated: [], deleted: [SHOP] } });
    const byTimestamp = changes({
      shops: { created: [], updated: [{ id: SHOP, shopId: SHOP, deletedAt: NOW }], deleted: [] },
    });
    expect(findPushRejection(byId, SHOP)).toEqual({ reason: 'SHOP_DELETE' });
    expect(findPushRejection(byTimestamp, SHOP)).toEqual({ reason: 'SHOP_DELETE' });
  });
});

describe('mentionedIds', () => {
  it('lists each mentioned record once', () => {
    const push = changes({
      customers: { created: [customer(1)], updated: [customer(1), customer(2)], deleted: [id(3)] },
    });
    expect(mentionedIds(push, 'customers')).toEqual([id(1), id(2), id(3)]);
    expect(mentionedIds(push, 'products')).toEqual([]);
  });
});

describe('sameRecord', () => {
  it('compares field by field, whatever the key order', () => {
    expect(sameRecord({ a: 1, b: null }, { b: null, a: 1 })).toBe(true);
    expect(sameRecord({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameRecord({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameRecord({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });
});

describe('planTable', () => {
  it('stores new records with consecutive sequence numbers', () => {
    const result = plan('customers', { created: [customer(1), customer(2)] });

    expect(result.writes).toEqual([
      { tableName: 'customers', id: id(1), data: customer(1), deleted: false, serverSeq: 11 },
      { tableName: 'customers', id: id(2), data: customer(2), deleted: false, serverSeq: 12 },
    ]);
    expect(result.seq).toBe(12);
    expect(result.conflicts).toEqual({ updated: [], deleted: [] });
  });

  it('skips a record that is already stored unchanged (idempotent re-push)', () => {
    const result = plan('customers', { created: [customer(1)] }, [[id(1), stored(customer(1))]]);

    expect(result.writes).toEqual([]);
    expect(result.seq).toBe(10);
  });

  it('replaces a changed mutable record: the last write to arrive wins', () => {
    const renamed = customer(1, { name: 'Karim Uddin', updatedAt: 2000 });
    const result = plan('customers', { updated: [renamed] }, [[id(1), stored(customer(1))]]);

    expect(result.writes).toEqual([
      { tableName: 'customers', id: id(1), data: renamed, deleted: false, serverSeq: 11 },
    ]);
    expect(result.conflicts.updated).toEqual([]);
  });

  it('reports a conflict when it overwrites another device’s change it had not pulled', () => {
    const renamed = customer(1, { name: 'Mine' });
    const theirs = stored(customer(1, { name: 'Theirs' }), {
      deviceId: OTHER_DEVICE,
      serverSeq: 12,
    });

    const unseen = plan('customers', { updated: [renamed] }, [[id(1), theirs]], {
      lastPulledCursor: 10,
      seq: 12,
    });
    const seen = plan('customers', { updated: [renamed] }, [[id(1), theirs]], {
      lastPulledCursor: 12,
      seq: 12,
    });

    expect(unseen.writes).toHaveLength(1);
    expect(unseen.conflicts.updated).toEqual([renamed]);
    expect(seen.writes).toHaveLength(1);
    expect(seen.conflicts.updated).toEqual([]);
  });

  it('does not report a conflict with the device’s own earlier push', () => {
    const own = stored(customer(1), { deviceId: DEVICE, serverSeq: 12 });
    const result = plan(
      'customers',
      { updated: [customer(1, { name: 'Again' })] },
      [[id(1), own]],
      {
        lastPulledCursor: 10,
        seq: 12,
      },
    );
    expect(result.conflicts.updated).toEqual([]);
  });

  it('treats re-sending a stored append-only record unchanged as a no-op', () => {
    const result = plan('payments', { created: [payment(1)] }, [[id(1), stored(payment(1))]]);

    expect(result.writes).toEqual([]);
    expect(result.rejection).toBeNull();
    expect(result.seq).toBe(10);
  });

  it('rejects an append-only record sent again with different content', () => {
    const result = plan('payments', { created: [payment(2), payment(1, { amount: 999_999 })] }, [
      [id(1), stored(payment(1))],
    ]);

    expect(result.rejection).toEqual({ reason: 'APPEND_ONLY', table: 'payments', id: id(1) });
    expect(result.writes).toEqual([]);
  });

  describe('cancelled invoices', () => {
    function invoice(n: number, overrides: Record<string, unknown> = {}): RecordData {
      return {
        id: id(n),
        shopId: SHOP,
        createdAt: 1000,
        updatedAt: 1000,
        deletedAt: null,
        deviceId: DEVICE,
        invoiceNumber: 'RS-A-000001',
        customerId: id(1),
        date: 1000,
        subtotal: 5000,
        discount: 0,
        total: 5000,
        paidAmount: 0,
        dueAmount: 5000,
        status: 'ACTIVE',
        sourceText: null,
        ...overrides,
      };
    }
    const planInvoices = (pushed: RecordData, storedVersion: RecordData) =>
      planTable({
        table: 'invoices',
        changes: changes({ invoices: { created: [], updated: [pushed], deleted: [] } }),
        stored: new Map([[pushed.id, stored(storedVersion, { deviceId: OTHER_DEVICE })]]),
        deviceId: DEVICE,
        lastPulledCursor: 0,
        seq: 10,
        now: NOW,
      });

    it('keeps a cancelled invoice cancelled and returns it as the winning version', () => {
      const cancelled = invoice(7, { status: 'CANCELLED', updatedAt: 2000 });
      const staleEdit = invoice(7, { paidAmount: 5000, dueAmount: 0, updatedAt: 3000 });

      const result = planInvoices(staleEdit, cancelled);

      expect(result.writes).toEqual([]);
      expect(result.conflicts.updated).toEqual([cancelled]);
      expect(result.rejection).toBeNull();
    });

    it('still applies a newer version of an invoice that is cancelled on both sides', () => {
      const cancelled = invoice(7, { status: 'CANCELLED', updatedAt: 2000 });
      const later = invoice(7, { status: 'CANCELLED', updatedAt: 4000 });

      expect(planInvoices(later, cancelled).writes).toHaveLength(1);
    });

    it('lets an active invoice be cancelled', () => {
      const cancelled = invoice(7, { status: 'CANCELLED', updatedAt: 2000 });

      expect(planInvoices(cancelled, invoice(7)).writes).toHaveLength(1);
    });
  });

  it('stores new append-only records and never flags them deleted', () => {
    const result = plan('payments', { created: [payment(1)] });
    expect(result.writes).toEqual([
      { tableName: 'payments', id: id(1), data: payment(1), deleted: false, serverSeq: 11 },
    ]);
  });

  it('flags a record pushed with deletedAt as deleted', () => {
    const removed = customer(1, { deletedAt: 3000, updatedAt: 3000 });
    const result = plan('customers', { updated: [removed] }, [[id(1), stored(customer(1))]]);

    expect(result.writes).toEqual([
      { tableName: 'customers', id: id(1), data: removed, deleted: true, serverSeq: 11 },
    ]);
  });

  it('soft-deletes a stored record when its ID is sent as deleted', () => {
    const result = plan('customers', { deleted: [id(1)] }, [[id(1), stored(customer(1))]]);

    expect(result.writes).toEqual([
      {
        tableName: 'customers',
        id: id(1),
        data: { ...customer(1), deletedAt: NOW, updatedAt: NOW, deviceId: DEVICE },
        deleted: true,
        serverSeq: 11,
      },
    ]);
  });

  it('ignores deletes of unknown or already deleted records, and repeated IDs', () => {
    const gone = stored(customer(2, { deletedAt: 1 }), { deleted: true });
    const result = plan('customers', { deleted: [id(1), id(2), id(2), id(3), id(3)] }, [
      [id(2), gone],
      [id(3), stored(customer(3))],
    ]);

    expect(result.writes.map((write) => write.id)).toEqual([id(3)]);
    expect(result.seq).toBe(11);
  });

  it('uses the record itself when an ID is both updated and listed as deleted', () => {
    const removed = customer(1, { deletedAt: 3000 });
    const result = plan('customers', { updated: [removed], deleted: [id(1)] }, [
      [id(1), stored(customer(1))],
    ]);

    expect(result.writes).toEqual([
      { tableName: 'customers', id: id(1), data: removed, deleted: true, serverSeq: 11 },
    ]);
  });

  it('keeps the last mention when a push lists one record twice', () => {
    const first = customer(1, { name: 'First' });
    const second = customer(1, { name: 'Second' });
    const result = plan('customers', { created: [first], updated: [second] });

    expect(result.writes).toHaveLength(1);
    expect(result.writes[0]?.data).toEqual(second);
  });

  it('reports a conflict for a delete that removes an unseen change of another device', () => {
    const theirs = stored(customer(1, { name: 'Theirs' }), {
      deviceId: OTHER_DEVICE,
      serverSeq: 12,
    });
    const result = plan('customers', { deleted: [id(1)] }, [[id(1), theirs]], {
      lastPulledCursor: 10,
      seq: 12,
    });
    expect(result.conflicts.deleted).toEqual([id(1)]);
  });
});
