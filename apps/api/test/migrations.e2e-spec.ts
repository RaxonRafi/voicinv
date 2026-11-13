import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../src/database/data-source-options.js';
import { migrations } from '../src/database/migrations/index.js';
import { createTestSchema, type TestSchema } from './support/test-database.js';

describe('database migrations (e2e)', () => {
  let database: TestSchema;
  let dataSource: DataSource;

  const ALL_TABLES = [
    'devices',
    'migrations',
    'refresh_tokens',
    'shops',
    'users',
    'waitlist_entries',
  ];

  const tables = async (): Promise<string[]> => {
    const result: { table_name: string }[] = await dataSource.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1',
      [database.schema],
    );
    return result.map((row) => row.table_name);
  };

  beforeAll(async () => {
    database = await createTestSchema();
    dataSource = new DataSource(buildDataSourceOptions(database));
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource?.destroy();
    await database?.drop();
  });

  it('applies every migration to an empty database', async () => {
    const applied = await dataSource.runMigrations();

    expect(applied).toHaveLength(migrations.length);
    expect(await tables()).toEqual(ALL_TABLES);
    expect(await dataSource.showMigrations()).toBe(false);
  });

  it('is a no-op when run again', async () => {
    expect(await dataSource.runMigrations()).toHaveLength(0);
  });

  describe('waitlist_entries', () => {
    it('has the expected columns', async () => {
      const columns: { column_name: string; data_type: string; is_nullable: string }[] =
        await dataSource.query(
          `SELECT column_name, data_type, is_nullable FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = 'waitlist_entries' ORDER BY ordinal_position`,
          [database.schema],
        );

      expect(columns).toEqual([
        { column_name: 'id', data_type: 'uuid', is_nullable: 'NO' },
        { column_name: 'email', data_type: 'character varying', is_nullable: 'YES' },
        { column_name: 'phone', data_type: 'character varying', is_nullable: 'YES' },
        { column_name: 'name', data_type: 'character varying', is_nullable: 'YES' },
        { column_name: 'locale', data_type: 'character varying', is_nullable: 'NO' },
        { column_name: 'shop_type', data_type: 'character varying', is_nullable: 'YES' },
        { column_name: 'source', data_type: 'character varying', is_nullable: 'NO' },
        { column_name: 'created_at', data_type: 'timestamp with time zone', is_nullable: 'NO' },
      ]);
    });

    it('fills id, source and created_at by default', async () => {
      const [row]: { id: string; source: string; created_at: Date }[] = await dataSource.query(
        `INSERT INTO waitlist_entries (email, locale) VALUES ('defaults@example.com', 'en')
         RETURNING id, source, created_at`,
      );

      expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(row?.source).toBe('landing');
      expect(row?.created_at).toBeInstanceOf(Date);
    });

    it('requires an email or a phone number', async () => {
      await expect(
        dataSource.query(`INSERT INTO waitlist_entries (locale) VALUES ('en')`),
      ).rejects.toThrow(/chk_waitlist_entries_contact/);
    });

    it('allows each email and phone number only once', async () => {
      await dataSource.query(
        `INSERT INTO waitlist_entries (email, phone, locale) VALUES ('dup@example.com', '+8801700000000', 'en')`,
      );

      await expect(
        dataSource.query(
          `INSERT INTO waitlist_entries (email, locale) VALUES ('dup@example.com', 'en')`,
        ),
      ).rejects.toThrow(/uq_waitlist_entries_email/);
      await expect(
        dataSource.query(
          `INSERT INTO waitlist_entries (phone, locale) VALUES ('+8801700000000', 'bn')`,
        ),
      ).rejects.toThrow(/uq_waitlist_entries_phone/);
    });

    it('allows many signups that leave email or phone empty', async () => {
      await dataSource.query(
        `INSERT INTO waitlist_entries (email, locale) VALUES ('a@example.com', 'en'), ('b@example.com', 'en')`,
      );
      await dataSource.query(
        `INSERT INTO waitlist_entries (phone, locale) VALUES ('+8801711111111', 'bn'), ('+8801722222222', 'bn')`,
      );
    });
  });

  describe('account tables', () => {
    const USER = '0192f0c0-0000-7000-8000-00000000000a';
    const OTHER_USER = '0192f0c0-0000-7000-8000-00000000000b';
    const SHOP = '0192f0c0-0000-7000-8000-00000000000c';
    const OTHER_SHOP = '0192f0c0-0000-7000-8000-00000000000d';
    const DEVICE = '0192f0c0-0000-7000-8000-00000000000e';

    const insertShop = (id: string, owner: string) =>
      dataSource.query(
        `INSERT INTO shops (id, owner_id, name, currency_code, default_language, invoice_prefix)
         VALUES ($1, $2, 'Shop', 'BDT', 'bn', 'RS')`,
        [id, owner],
      );

    it('requires exactly one of phone and email on a user', async () => {
      await dataSource.query(
        `INSERT INTO users (id, email, password_hash, recovery_code_hash)
         VALUES ($1, 'owner@example.com', 'h', 'r')`,
        [USER],
      );
      await dataSource.query(
        `INSERT INTO users (id, phone, password_hash, recovery_code_hash)
         VALUES ($1, '+8801700000001', 'h', 'r')`,
        [OTHER_USER],
      );

      await expect(
        dataSource.query(
          `INSERT INTO users (id, password_hash, recovery_code_hash)
           VALUES (gen_random_uuid(), 'h', 'r')`,
        ),
      ).rejects.toThrow(/chk_users_identifier/);
      await expect(
        dataSource.query(
          `INSERT INTO users (id, phone, email, password_hash, recovery_code_hash)
           VALUES (gen_random_uuid(), '+8801700000002', 'both@example.com', 'h', 'r')`,
        ),
      ).rejects.toThrow(/chk_users_identifier/);
    });

    it('allows each phone number and email only once', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO users (id, email, password_hash, recovery_code_hash)
           VALUES (gen_random_uuid(), 'owner@example.com', 'h', 'r')`,
        ),
      ).rejects.toThrow(/uq_users_email/);
      await expect(
        dataSource.query(
          `INSERT INTO users (id, phone, password_hash, recovery_code_hash)
           VALUES (gen_random_uuid(), '+8801700000001', 'h', 'r')`,
        ),
      ).rejects.toThrow(/uq_users_phone/);
    });

    it('starts a shop’s device sequence at 1 and requires an existing owner', async () => {
      await insertShop(SHOP, USER);
      await insertShop(OTHER_SHOP, OTHER_USER);

      const [shop]: { device_sequence: number; address: string | null }[] = await dataSource.query(
        'SELECT device_sequence, address FROM shops WHERE id = $1',
        [SHOP],
      );
      expect(shop).toEqual({ device_sequence: 1, address: null });
      await expect(insertShop(randomUUID(), randomUUID())).rejects.toThrow(/fk_shops_owner/);
    });

    it('keys devices by shop: one code per shop, the same device ID in two shops', async () => {
      const insertDevice = (shop: string, id: string, code: string) =>
        dataSource.query(
          `INSERT INTO devices (shop_id, id, device_code, name, platform)
           VALUES ($1, $2, $3, 'Phone', 'android')`,
          [shop, id, code],
        );

      await insertDevice(SHOP, DEVICE, 'A');
      await insertDevice(OTHER_SHOP, DEVICE, 'A');

      await expect(insertDevice(SHOP, DEVICE, 'B')).rejects.toThrow(/pk_devices/);
      await expect(insertDevice(SHOP, randomUUID(), 'A')).rejects.toThrow(/uq_devices_shop_code/);
      await expect(insertDevice(randomUUID(), randomUUID(), 'A')).rejects.toThrow(
        /fk_devices_shop/,
      );
    });

    it('stores each refresh token hash once', async () => {
      const insertToken = (hash: string) =>
        dataSource.query(
          `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
           VALUES ($1, $2, now() + interval '1 day') RETURNING id, rotated_at, revoked_at`,
          [USER, hash],
        );

      const [token]: { id: string; rotated_at: Date | null; revoked_at: Date | null }[] =
        await insertToken('a'.repeat(64));
      expect(token).toEqual({ id: expect.any(String), rotated_at: null, revoked_at: null });
      await expect(insertToken('a'.repeat(64))).rejects.toThrow(/uq_refresh_tokens_hash/);
    });

    it('removes a user’s shop, devices and sessions with the user', async () => {
      await dataSource.query('DELETE FROM users WHERE id = $1', [USER]);

      const remaining = async (table: string, column: string, value: string) => {
        const rows: unknown[] = await dataSource.query(
          `SELECT 1 FROM ${table} WHERE ${column} = $1`,
          [value],
        );
        return rows.length;
      };
      expect(await remaining('shops', 'id', SHOP)).toBe(0);
      expect(await remaining('devices', 'shop_id', SHOP)).toBe(0);
      expect(await remaining('refresh_tokens', 'user_id', USER)).toBe(0);
      expect(await remaining('devices', 'shop_id', OTHER_SHOP)).toBe(1);
    });
  });

  it('reverts every migration cleanly and can re-apply them', async () => {
    for (const _migration of migrations) {
      await dataSource.undoLastMigration();
    }
    expect(await tables()).toEqual(['migrations']);

    expect(await dataSource.runMigrations()).toHaveLength(migrations.length);
    expect(await tables()).toEqual(ALL_TABLES);
  });
});
