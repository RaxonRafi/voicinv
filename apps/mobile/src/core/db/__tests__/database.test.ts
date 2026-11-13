import { eq, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/sqlite-core';

import { type Database } from '../database';
import { getCounter, getValue, setValue } from '../kv';
import { migrate, type Migration } from '../migrator';
import { MIGRATIONS } from '../migrations';
import { APPEND_ONLY_TABLES, customers, kv, payments, TABLES, type TableName } from '../schema';
import { createNodeSqliteDriver, createTestDatabase } from '../testing/node-sqlite-driver';

const customerRow = (id: string, name: string) => ({
  id,
  shopId: 'shop-1',
  createdAt: 1000,
  updatedAt: 1000,
  deletedAt: null,
  deviceId: 'device-1',
  name,
});

describe('migrations', () => {
  it('creates every table of the schema with the same columns', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver, MIGRATIONS);

    for (const table of Object.values(TABLES)) {
      const config = getTableConfig(table);
      const info = await driver.execute(`PRAGMA table_info(${config.name})`);
      // PRAGMA table_info columns: cid, name, type, notnull, dflt_value, pk
      const actual = info
        .map((row) => ({
          name: row[1],
          type: row[2],
          notNull: row[3] === 1,
          primary: row[5] === 1,
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const expected = config.columns
        .map((column) => ({
          name: column.name,
          type: column.getSQLType().toUpperCase(),
          notNull: column.notNull,
          primary: column.primary,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      expect({ table: config.name, columns: actual }).toEqual({
        table: config.name,
        columns: expected,
      });
    }
  });

  it('creates every index declared in the schema', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver, MIGRATIONS);
    const rows = await driver.execute(`SELECT name FROM sqlite_master WHERE type = 'index'`);
    const actual = new Set(rows.map((row) => row[0]));

    for (const table of Object.values(TABLES)) {
      for (const index of getTableConfig(table).indexes) {
        expect(actual).toContain(index.config.name);
      }
    }
  });

  it('applies each migration once', async () => {
    const driver = createNodeSqliteDriver();
    expect(await migrate(driver, MIGRATIONS)).toEqual(MIGRATIONS.map((migration) => migration.id));
    expect(await migrate(driver, MIGRATIONS)).toEqual([]);
  });

  it('applies later migrations on top of an existing database and keeps its data', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver, MIGRATIONS);
    await driver.execute(`INSERT INTO kv (key, value) VALUES ('device.id', 'abc')`);

    const next: Migration = {
      id: '9999-test-add-column',
      statements: [`ALTER TABLE kv ADD COLUMN note TEXT`],
    };
    expect(await migrate(driver, [...MIGRATIONS, next])).toEqual(['9999-test-add-column']);
    expect(await driver.execute(`SELECT key, value, note FROM kv`)).toEqual([
      ['device.id', 'abc', null],
    ]);
  });

  it('rolls a failed migration back completely', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver, MIGRATIONS);
    const broken: Migration = {
      id: '9999-broken',
      statements: [`CREATE TABLE half_done (id TEXT)`, `THIS IS NOT SQL`],
    };

    await expect(migrate(driver, [...MIGRATIONS, broken])).rejects.toThrow(
      'Migration 9999-broken failed',
    );
    const tables = await driver.execute(`SELECT name FROM sqlite_master WHERE name = 'half_done'`);
    expect(tables).toEqual([]);
    expect(await migrate(driver, MIGRATIONS)).toEqual([]);
  });

  it('refuses a database created by a newer app version', async () => {
    const driver = createNodeSqliteDriver();
    await migrate(driver, [...MIGRATIONS, { id: '9999-from-the-future', statements: [] }]);
    await expect(migrate(driver, MIGRATIONS)).rejects.toThrow(/newer app version/);
  });
});

describe('append-only tables', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
    await db.write(async ({ orm }) => {
      await orm.insert(payments).values({
        id: 'pay-1',
        shopId: 'shop-1',
        createdAt: 1000,
        deviceId: 'device-1',
        customerId: 'cust-1',
        amount: 50_000,
        date: 1000,
      });
    });
  });

  afterEach(() => db.close());

  it('covers every financial table with update and delete triggers', async () => {
    const rows = await db.executeRaw(`SELECT name FROM sqlite_master WHERE type = 'trigger'`);
    const triggers = rows.map((row) => row[0]);
    for (const table of APPEND_ONLY_TABLES) {
      expect(triggers).toEqual(
        expect.arrayContaining([`${table}_no_update`, `${table}_no_delete`]),
      );
    }
  });

  it('rejects changing a payment', async () => {
    await expect(
      db.write(({ orm }) =>
        orm.update(payments).set({ amount: 1 }).where(eq(payments.id, 'pay-1')),
      ),
    ).rejects.toThrow();
    const rows = await db.orm.select().from(payments);
    expect(rows[0]?.amount).toBe(50_000);
  });

  it('rejects deleting a payment', async () => {
    await expect(db.write(({ orm }) => orm.delete(payments))).rejects.toThrow();
    expect(await db.orm.select().from(payments)).toHaveLength(1);
  });

  it('still lets the sync engine clear the local dirty flag', async () => {
    await db.write(({ orm }) => orm.update(payments).set({ isDirty: false }));
    const rows = await db.orm.select().from(payments);
    expect(rows[0]?.isDirty).toBe(false);
  });

  it('rejects a payment that is not positive', async () => {
    await expect(
      db.executeRaw(
        `INSERT INTO payments (id, shop_id, created_at, device_id, customer_id, amount, date)
         VALUES ('pay-2', 's', 1, 'd', 'c', 0, 1)`,
      ),
    ).rejects.toThrow();
  });
});

describe('invoice integrity checks', () => {
  const insert = (db: Database, total: number, paid: number, due: number) =>
    db.executeRaw(
      `INSERT INTO invoices (id, shop_id, created_at, updated_at, device_id, invoice_number, date,
         subtotal, discount, total, paid_amount, due_amount, status)
       VALUES ('inv-1', 's', 1, 1, 'd', 'RS-A-000001', 1, 500000, 0, ?, ?, ?, 'ACTIVE')`,
      [total, paid, due],
    );

  it('accepts consistent totals and rejects inconsistent ones', async () => {
    const db = await createTestDatabase();
    await expect(insert(db, 400_000, 200_000, 200_000)).rejects.toThrow(); // total ≠ subtotal − discount
    await expect(insert(db, 500_000, 100_000, 100_000)).rejects.toThrow(); // paid + due ≠ total
    await expect(insert(db, 500_000, 250_000, 250_000)).resolves.toEqual([]);
    await db.close();
  });
});

describe('Database.write', () => {
  let db: Database;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(() => db.close());

  it('commits all statements together', async () => {
    await db.write(async ({ orm }) => {
      await orm.insert(customers).values(customerRow('c1', 'Karim'));
      await orm.insert(customers).values(customerRow('c2', 'Rahim'));
    });
    expect(await db.orm.select().from(customers)).toHaveLength(2);
  });

  it('rolls everything back when any step fails', async () => {
    await expect(
      db.write(async ({ orm }) => {
        await orm.insert(customers).values(customerRow('c1', 'Karim'));
        await orm.insert(customers).values(customerRow('c1', 'Duplicate id'));
      }),
    ).rejects.toThrow();
    expect(await db.orm.select().from(customers)).toEqual([]);

    // The connection is usable again after the rollback.
    await db.write(({ orm }) => orm.insert(customers).values(customerRow('c1', 'Karim')));
    expect(await db.orm.select().from(customers)).toHaveLength(1);
  });

  it('never interleaves two transactions', async () => {
    await db.write(({ orm }) => orm.insert(kv).values({ key: 'counter', value: '0' }));
    const increment = () =>
      db.write(async (tx) => {
        const current = await getCounter(tx.orm, 'counter');
        await Promise.resolve(); // give another transaction the chance to cut in
        await setValue(tx, 'counter', String(current + 1));
      });

    await Promise.all(Array.from({ length: 25 }, increment));
    expect(await getCounter(db.orm, 'counter')).toBe(25);
  });

  it('keeps outside reads from seeing a transaction that is still open', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));

    const writing = db.write(async ({ orm }) => {
      await orm.insert(customers).values(customerRow('c1', 'Karim'));
      await gate;
      throw new Error('abort');
    });
    const reading = db.orm.select().from(customers);
    release();

    await expect(writing).rejects.toThrow('abort');
    expect(await reading).toEqual([]);
  });

  it('notifies listeners once, after the commit, with the touched tables', async () => {
    const events: TableName[][] = [];
    const countsAtEvent: Promise<number>[] = [];
    const unsubscribe = db.subscribe((tables) => {
      events.push([...tables].sort());
      // What a screen would do on notification: re-query. It must already see the new row.
      countsAtEvent.push(
        db.orm
          .select({ count: sql<number>`count(*)` })
          .from(customers)
          .then((rows) => rows[0]?.count ?? -1),
      );
    });

    await db.write(async (tx) => {
      await tx.orm.insert(customers).values(customerRow('c1', 'Karim'));
      tx.touch('customers');
      tx.touch('customers', 'ledgerEntries');
    });

    expect(events).toEqual([['customers', 'ledgerEntries']]);
    expect(await Promise.all(countsAtEvent)).toEqual([1]);

    unsubscribe();
    await db.write(async (tx) => tx.touch('customers'));
    expect(events).toHaveLength(1);
  });

  it('does not notify when the transaction fails or touches nothing', async () => {
    const listener = jest.fn();
    db.subscribe(listener);
    await expect(
      db.write(async (tx) => {
        tx.touch('customers');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await db.write(async () => undefined);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('kv', () => {
  it('stores, overwrites and reads values', async () => {
    const db = await createTestDatabase();
    expect(await getValue(db.orm, 'device.code')).toBeNull();
    await db.write((tx) => setValue(tx, 'device.code', 'A'));
    await db.write((tx) => setValue(tx, 'device.code', 'B'));
    expect(await getValue(db.orm, 'device.code')).toBe('B');
    expect(await getCounter(db.orm, 'missing')).toBe(0);
    await db.close();
  });
});
