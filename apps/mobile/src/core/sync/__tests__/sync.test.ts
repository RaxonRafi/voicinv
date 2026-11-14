import { eq } from 'drizzle-orm';

import { customers, payments } from '@/core/db';
import { FakeApi } from '@/core/testing/fake-api';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';
import { deviceResponseSchema, registerResponseSchema } from '@/shared';

import { applyRemoteChanges, collectDirty, syncNow } from '../engine';
import { INITIAL_SYNC_STATE, runSync, useSyncStore } from '../sync-store';

const OTHER_DEVICE = '0192f0c0-0000-7000-8000-0000000000d2';

/** A phone with an account on the fake server and a registered device. */
async function signedInPhone(fake: FakeApi): Promise<TestShopApp> {
  const app = await createTestShopApp();
  app.services.api = fake.client();
  const { api } = app.services;
  const tokens = await api.request(registerResponseSchema, {
    method: 'POST',
    path: '/auth/register',
    auth: false,
    json: {
      identifier: `owner${fake.accounts.length}@example.com`,
      password: 'password123',
      shop: {
        id: app.shopId,
        name: 'Rahim Store',
        currencyCode: 'BDT',
        defaultLanguage: 'en',
        invoicePrefix: 'RS',
      },
    },
  });
  await api.startSession(tokens);
  await api.request(deviceResponseSchema, {
    method: 'POST',
    path: '/devices',
    json: { id: app.services.device.deviceId, name: 'Phone', platform: 'android' },
  });
  return app;
}

function deps(app: TestShopApp) {
  return {
    db: app.db,
    api: app.services.api,
    shopId: app.shopId,
    deviceId: app.services.device.deviceId,
  };
}

function customerRow(app: TestShopApp, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id: app.services.newId(),
    shopId: app.shopId,
    createdAt: app.clock.now(),
    updatedAt: app.clock.now(),
    deletedAt: null,
    deviceId: app.services.device.deviceId,
    isDirty: true,
    name,
    phone: null,
    notes: null,
    creditLimit: null,
    isArchived: false,
    ...overrides,
  };
}

describe('sync engine', () => {
  let fake: FakeApi;
  let app: TestShopApp;

  beforeEach(async () => {
    useSyncStore.setState(INITIAL_SYNC_STATE);
    fake = new FakeApi();
    app = await signedInPhone(fake);
  });

  afterEach(() => app.close());

  it('pushes local records, marks them clean, and does nothing more on the next run', async () => {
    const karim = customerRow(app, 'Karim');
    await app.db.write((tx) => tx.orm.insert(customers).values(karim));

    const first = await syncNow(deps(app));

    expect(first.pushed).toBe(2); // the shop and Karim
    expect(fake.record(app.shopId, 'customers', karim.id)).toMatchObject({ name: 'Karim' });
    expect((await collectDirty(app.db)).records).toHaveLength(0);
    expect(fake.record(app.shopId, 'customers', karim.id)).not.toHaveProperty('isDirty');

    const second = await syncNow(deps(app));
    expect(second).toEqual({ pushed: 0, pulled: 0, invalid: 0 });
  });

  it('receives records created on another device', async () => {
    await syncNow(deps(app));
    const id = app.services.newId();
    fake.seed(
      app.shopId,
      'customers',
      { ...customerRow(app, 'Rahim', { id, deviceId: OTHER_DEVICE }), isDirty: undefined } as never,
      OTHER_DEVICE,
    );

    const result = await syncNow(deps(app));

    expect(result.pulled).toBe(1);
    const [row] = await app.db.orm.select().from(customers).where(eq(customers.id, id));
    expect(row).toMatchObject({ name: 'Rahim', isDirty: false });
  });

  it('pulls page after page until the server has nothing more', async () => {
    fake = new FakeApi({ pageSize: 2 });
    await app.close();
    app = await signedInPhone(fake);
    for (let n = 0; n < 5; n += 1) {
      const record = customerRow(app, `Remote ${n}`, { deviceId: OTHER_DEVICE });
      const { isDirty: _dirty, ...data } = record;
      fake.seed(app.shopId, 'customers', data, OTHER_DEVICE);
    }

    await syncNow(deps(app));

    expect(await app.db.orm.select().from(customers)).toHaveLength(5);
    expect(fake.calls.filter((call) => call.path === '/sync/pull').length).toBeGreaterThan(2);
  });

  it('never overwrites a local edit that has not been pushed yet', async () => {
    const karim = customerRow(app, 'Karim (edited here)');
    await app.db.write((tx) => tx.orm.insert(customers).values(karim));
    const { isDirty: _dirty, ...remote } = { ...karim, name: 'Karim (older remote)' };

    await app.db.write((tx) =>
      applyRemoteChanges(
        tx,
        { customers: { created: [], updated: [remote], deleted: [] } },
        app.shopId,
      ),
    );

    const [row] = await app.db.orm.select().from(customers).where(eq(customers.id, karim.id));
    expect(row).toMatchObject({ name: 'Karim (edited here)', isDirty: true });
  });

  it('keeps a record dirty when it is edited while its push is in flight', async () => {
    const karim = customerRow(app, 'Karim');
    await app.db.write((tx) => tx.orm.insert(customers).values(karim));
    fake.beforePush = async () => {
      fake.beforePush = null;
      app.clock.advance(1000);
      await app.db.write((tx) =>
        tx.orm
          .update(customers)
          .set({ name: 'Karim Uddin', updatedAt: app.clock.now(), isDirty: true })
          .where(eq(customers.id, karim.id)),
      );
    };

    await syncNow(deps(app));
    const [afterFirst] = await app.db.orm
      .select()
      .from(customers)
      .where(eq(customers.id, karim.id));
    expect(afterFirst?.isDirty).toBe(true);

    await syncNow(deps(app));
    expect(fake.record(app.shopId, 'customers', karim.id)).toMatchObject({ name: 'Karim Uddin' });
  });

  it('inserts received payments once and never changes them', async () => {
    const customer = customerRow(app, 'Karim');
    await app.db.write((tx) => tx.orm.insert(customers).values(customer));
    const payment = {
      id: app.services.newId(),
      shopId: app.shopId,
      createdAt: 1,
      deviceId: OTHER_DEVICE,
      customerId: customer.id,
      amount: 10_000,
      date: 1,
      note: null,
      invoiceId: null,
    };
    const changes = { payments: { created: [payment], updated: [], deleted: [] } };

    await app.db.write((tx) => applyRemoteChanges(tx, changes, app.shopId));
    await app.db.write((tx) => applyRemoteChanges(tx, changes, app.shopId));

    const rows = await app.db.orm.select().from(payments);
    expect(rows).toEqual([{ ...payment, isDirty: false }]);
  });

  it('ignores received records of another shop', async () => {
    const stranger = { ...customerRow(app, 'Stranger'), shopId: OTHER_DEVICE };
    const { isDirty: _dirty, ...record } = stranger;
    await app.db.write((tx) =>
      applyRemoteChanges(
        tx,
        { customers: { created: [record], updated: [], deleted: [] } },
        app.shopId,
      ),
    );
    expect(await app.db.orm.select().from(customers)).toHaveLength(0);
  });

  it('holds back records that fail validation and still syncs the rest', async () => {
    await app.db.write(async (tx) => {
      await tx.orm.insert(customers).values(customerRow(app, 'Fine'));
      await tx.orm.insert(customers).values(customerRow(app, '   ')); // blank name: invalid
    });

    const result = await syncNow(deps(app));

    expect(result.invalid).toBe(1);
    expect(fake.table(app.shopId, 'customers')).toHaveLength(1);
  });

  it('records the outcome for the interface, and keeps working offline', async () => {
    await runSync(app.services);
    expect(useSyncStore.getState()).toMatchObject({
      signedIn: true,
      status: 'idle',
      lastSyncedAt: app.clock.now(),
    });

    fake.offline = true;
    await expect(runSync(app.services)).resolves.toBeNull();
    expect(useSyncStore.getState()).toMatchObject({ status: 'error', errorCode: 'NETWORK' });
  });
});
