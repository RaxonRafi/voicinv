import { randomUUID } from 'node:crypto';

import request from 'supertest';

import { createAccount, post, type TestAccount } from './support/accounts.js';
import { createTestApp, nextClientIp, type TestApp } from './support/test-app.js';

// Sync protocol against real Postgres (AGENTS.md §8.5, §14): idempotent push, append-only
// enforcement, conflict reporting, cursor correctness and tenant isolation.

interface Phone {
  account: TestAccount;
  deviceId: string;
}

describe('sync (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  async function registerDevice(account: TestAccount): Promise<string> {
    const deviceId = randomUUID();
    const response = await post(
      testApp,
      '/devices',
      { id: deviceId, name: 'Phone', platform: 'android' },
      account.accessToken,
    );
    expect(response.status).toBe(200);
    return deviceId;
  }

  async function newPhone(account?: TestAccount): Promise<Phone> {
    const owner = account ?? (await createAccount(testApp));
    return { account: owner, deviceId: await registerDevice(owner) };
  }

  const now = 1_800_000_000_000;

  function customer(phone: Phone, overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      shopId: phone.account.shopId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: phone.deviceId,
      name: 'Karim',
      phone: null,
      notes: null,
      creditLimit: null,
      isArchived: false,
      ...overrides,
    };
  }

  function payment(phone: Phone, customerId: string, overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      shopId: phone.account.shopId,
      createdAt: now,
      deviceId: phone.deviceId,
      customerId,
      amount: 10_000,
      date: now,
      note: null,
      invoiceId: null,
      ...overrides,
    };
  }

  function invoice(phone: Phone, customerId: string, overrides: Record<string, unknown> = {}) {
    return {
      id: randomUUID(),
      shopId: phone.account.shopId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: phone.deviceId,
      invoiceNumber: 'RS-A-000001',
      customerId,
      date: now,
      subtotal: 50_000,
      discount: 0,
      total: 50_000,
      paidAmount: 0,
      dueAmount: 50_000,
      status: 'ACTIVE',
      sourceText: null,
      ...overrides,
    };
  }

  function push(phone: Phone, changes: object, lastPulledCursor = '0') {
    return post(
      testApp,
      '/sync/push',
      { deviceId: phone.deviceId, lastPulledCursor, changes },
      phone.account.accessToken,
    );
  }

  function pull(phone: Phone, cursor: string) {
    return request(testApp.server)
      .get(`/api/v1/sync/pull?cursor=${cursor}`)
      .set('X-Forwarded-For', nextClientIp())
      .set('Authorization', `Bearer ${phone.account.accessToken}`);
  }

  /** Every record of the shop, following `hasMore` from cursor 0. */
  async function pullAll(phone: Phone) {
    const records: Record<string, unknown>[] = [];
    let cursor = '0';
    for (;;) {
      const response = await pull(phone, cursor);
      expect(response.status).toBe(200);
      const { changes, cursor: next, hasMore } = response.body.data;
      for (const entry of Object.values(changes) as { created: []; updated: [] }[]) {
        records.push(...entry.created, ...entry.updated);
      }
      expect(Number(next)).toBeGreaterThanOrEqual(Number(cursor));
      cursor = next;
      if (!hasMore) return { records, cursor };
    }
  }

  it('requires a signed-in user and a device registered to the shop', async () => {
    const phone = await newPhone();
    const unauthenticated = await request(testApp.server)
      .get('/api/v1/sync/pull?cursor=0')
      .set('X-Forwarded-For', nextClientIp());
    const unregistered = await push({ ...phone, deviceId: randomUUID() }, {});

    expect(unauthenticated.status).toBe(401);
    expect(unregistered.status).toBe(403);
  });

  it('stores a push and treats sending it again as a no-op', async () => {
    const phone = await newPhone();
    const karim = customer(phone);
    const changes = {
      customers: { updated: [karim] },
      payments: { created: [payment(phone, karim.id)] },
    };

    const first = await push(phone, changes);
    const again = await push(phone, changes, first.body.data.cursor);

    expect(first.status).toBe(200);
    expect(first.body.data.applied).toBe(2);
    expect(again.status).toBe(200);
    expect(again.body.data.applied).toBe(0);
    expect((await pullAll(phone)).records).toHaveLength(2);
  });

  it('refuses to update, delete or change a financial record', async () => {
    const phone = await newPhone();
    const karim = customer(phone);
    const paid = payment(phone, karim.id);
    await push(phone, { customers: { updated: [karim] }, payments: { created: [paid] } });

    const update = await push(phone, { payments: { updated: [paid] } });
    const remove = await push(phone, { payments: { deleted: [paid.id] } });
    const changed = await push(phone, { payments: { created: [{ ...paid, amount: 99_999 }] } });

    for (const response of [update, remove, changed]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('APPEND_ONLY_VIOLATION');
    }
    const stored = (await pullAll(phone)).records.find((record) => record.id === paid.id);
    expect(stored).toMatchObject({ amount: 10_000 });
  });

  it('protects financial records in the database itself', async () => {
    const phone = await newPhone();
    const karim = customer(phone);
    const paid = payment(phone, karim.id);
    await push(phone, { payments: { created: [paid] } });

    await expect(
      testApp.dataSource.query(
        `UPDATE "sync_records" SET "data" = '{}' WHERE "table_name" = 'payments' AND "id" = $1`,
        [paid.id],
      ),
    ).rejects.toThrow(/append-only/);
  });

  it('applies a whole push or nothing of it', async () => {
    const phone = await newPhone();
    const karim = customer(phone);
    const response = await push(phone, {
      customers: { updated: [karim] },
      payments: { created: [payment(phone, karim.id)], updated: [payment(phone, karim.id)] },
    });

    expect(response.status).toBe(400);
    expect((await pullAll(phone)).records).toHaveLength(0);
  });

  it('delivers one device’s changes to another, page by page with an advancing cursor', async () => {
    const phoneA = await newPhone();
    const phoneB = await newPhone(phoneA.account);
    const records = Array.from({ length: 12 }, (_, n) => customer(phoneA, { name: `C${n}` }));
    await push(phoneA, { customers: { updated: records } });

    const { records: received, cursor } = await pullAll(phoneB);
    const later = await pull(phoneB, cursor);

    expect(received.map((record) => record.id).sort()).toEqual(
      records.map((record) => record.id).sort(),
    );
    expect(later.body.data).toEqual({ changes: {}, cursor, hasMore: false });
  });

  it('reports a conflict when a push overwrites another device’s unseen change', async () => {
    const phoneA = await newPhone();
    const phoneB = await newPhone(phoneA.account);
    const karim = customer(phoneA);
    await push(phoneA, { customers: { updated: [karim] } });
    const { cursor } = await pullAll(phoneB);
    await push(phoneA, { customers: { updated: [{ ...karim, name: 'Karim (A)' }] } }, cursor);

    // Phone B edits the version it saw, without pulling A's newer edit first.
    const response = await push(
      phoneB,
      { customers: { updated: [{ ...karim, name: 'Karim (B)', deviceId: phoneB.deviceId }] } },
      cursor,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.conflicts.customers.updated).toEqual([
      expect.objectContaining({ id: karim.id, name: 'Karim (B)' }),
    ]);
    // The device was not up to date, so its cursor stays where it was.
    expect(response.body.data.cursor).toBe(cursor);
  });

  it('keeps a cancelled invoice cancelled and returns the cancelled version', async () => {
    const phoneA = await newPhone();
    const phoneB = await newPhone(phoneA.account);
    const karim = customer(phoneA);
    const sale = invoice(phoneA, karim.id);
    await push(phoneA, { customers: { updated: [karim] }, invoices: { updated: [sale] } });
    const { cursor } = await pullAll(phoneB);
    const cancelled = { ...sale, status: 'CANCELLED', updatedAt: now + 1 };
    await push(phoneA, { invoices: { updated: [cancelled] } }, cursor);

    const stale = await push(
      phoneB,
      {
        invoices: { updated: [{ ...sale, paidAmount: 50_000, dueAmount: 0, updatedAt: now + 2 }] },
      },
      cursor,
    );

    expect(stale.status).toBe(200);
    expect(stale.body.data.conflicts.invoices.updated).toEqual([
      expect.objectContaining({ id: sale.id, status: 'CANCELLED' }),
    ]);
    const stored = (await pullAll(phoneA)).records.find((record) => record.id === sale.id);
    expect(stored).toMatchObject({ status: 'CANCELLED' });
  });

  it('never lets one shop read or write another shop’s records', async () => {
    const phoneA = await newPhone();
    const intruder = await newPhone();
    const karim = customer(phoneA);
    await push(phoneA, { customers: { updated: [karim] } });

    const foreign = await push(intruder, {
      customers: { updated: [{ ...karim, name: 'Hijacked' }] },
    });
    const { records } = await pullAll(intruder);

    expect(foreign.status).toBe(403);
    expect(records).toEqual([]);
    const stored = (await pullAll(phoneA)).records.find((record) => record.id === karim.id);
    expect(stored).toMatchObject({ name: 'Karim' });
  });

  it('keeps the account’s shop profile in step with the synced shop record', async () => {
    const phone = await newPhone();
    const shop = {
      id: phone.account.shopId,
      shopId: phone.account.shopId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: phone.deviceId,
      name: 'Rahim Store (renamed)',
      address: null,
      phone: null,
      logo: null,
      currencyCode: 'BDT',
      defaultLanguage: 'bn',
      invoicePrefix: 'RS',
    };

    await push(phone, { shops: { updated: [shop] } });
    const me = await request(testApp.server)
      .get('/api/v1/me')
      .set('X-Forwarded-For', nextClientIp())
      .set('Authorization', `Bearer ${phone.account.accessToken}`);

    expect(me.body.data.shop.name).toBe('Rahim Store (renamed)');
  });
});
