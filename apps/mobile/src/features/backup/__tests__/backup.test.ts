import { customers, products, shops } from '@/core/db';
import { createTestShopApp, type TestShopApp } from '@/core/testing/harness';

import { createBackupEnvelope, parseBackupEnvelope } from '../crypto';
import { clearAllTables, exportDatabaseDump } from '../repository';
import { createBackupFile, restoreFromBackupString } from '../usecases';

describe('backup feature', () => {
  let app: TestShopApp;
  let customerId: string;
  let productId: string;
  const now = Date.UTC(2026, 10, 12, 10, 0, 0);

  beforeEach(async () => {
    app = await createTestShopApp();
    customerId = app.ctx.newId();
    productId = app.ctx.newId();

    await app.ctx.db.write(async (tx) => {
      await tx.orm.insert(customers).values({
        id: customerId,
        shopId: app.shopId,
        name: 'Karim Uddin',
        phone: '01712345678',
        notes: 'Regular buyer',
        creditLimit: 500000,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });

      await tx.orm.insert(products).values({
        id: productId,
        shopId: app.shopId,
        name: 'Mustard Oil',
        unit: 'liter',
        defaultPrice: 22000,
        stockQty: 50,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deviceId: app.ctx.deviceId,
        isDirty: true,
      });
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('exports database dump containing all seeded tables', async () => {
    const dump = await exportDatabaseDump(app.ctx.db.orm, app.shopId, app.ctx.deviceId, now);

    expect(dump.version).toBe(1);
    expect(dump.shopId).toBe(app.shopId);
    expect(dump.tables.shops).toHaveLength(1);
    expect(dump.tables.customers).toHaveLength(1);
    expect(dump.tables.products).toHaveLength(1);
    expect(dump.tables.customers[0]?.name).toBe('Karim Uddin');
    expect(dump.tables.products[0]?.name).toBe('Mustard Oil');
  });

  it('envelopes and parses backup data with checksum verification', async () => {
    const dump = await exportDatabaseDump(app.ctx.db.orm, app.shopId, app.ctx.deviceId, now);
    const envelope = await createBackupEnvelope(dump);

    expect(envelope.magic).toBe('VOICELEDGER_BACKUP');
    expect(envelope.version).toBe(1);
    expect(typeof envelope.checksum).toBe('string');

    const parsed = await parseBackupEnvelope(JSON.stringify(envelope));
    expect(parsed).toEqual(dump);
  });

  it('detects corrupted backup data', async () => {
    const dump = await exportDatabaseDump(app.ctx.db.orm, app.shopId, app.ctx.deviceId, now);
    const envelope = await createBackupEnvelope(dump);

    // Tamper with data
    const corrupted = { ...envelope, data: Buffer.from('{"tampered":true}').toString('base64') };

    await expect(parseBackupEnvelope(JSON.stringify(corrupted))).rejects.toThrow(
      'Backup checksum mismatch: corrupted file',
    );
  });

  it('full roundtrip: export -> wipe -> restore yields identical data', async () => {
    // 1. Export
    const dump = await exportDatabaseDump(app.ctx.db.orm, app.shopId, app.ctx.deviceId, now);
    const envelope = await createBackupEnvelope(dump);
    const backupJson = JSON.stringify(envelope);

    // 2. Wipe
    await app.ctx.db.write(async (tx) => {
      await clearAllTables(tx);
    });

    const emptyShops = await app.ctx.db.orm.select().from(shops);
    const emptyCustomers = await app.ctx.db.orm.select().from(customers);
    const emptyProducts = await app.ctx.db.orm.select().from(products);

    expect(emptyShops).toHaveLength(0);
    expect(emptyCustomers).toHaveLength(0);
    expect(emptyProducts).toHaveLength(0);

    // 3. Restore
    await restoreFromBackupString(app.ctx.db, backupJson);

    // 4. Verify identical data
    const restoredShops = await app.ctx.db.orm.select().from(shops);
    const restoredCustomers = await app.ctx.db.orm.select().from(customers);
    const restoredProducts = await app.ctx.db.orm.select().from(products);

    expect(restoredShops).toEqual(dump.tables.shops);
    expect(restoredCustomers).toEqual(dump.tables.customers);
    expect(restoredProducts).toEqual(dump.tables.products);
  });

  it('creates backup file on disk', async () => {
    const { envelope, uri } = await createBackupFile(
      app.ctx.db.orm,
      app.shopId,
      app.ctx.deviceId,
      now,
    );
    expect(envelope.magic).toBe('VOICELEDGER_BACKUP');
    expect(uri).toContain('.vlbackup');
  });
});
