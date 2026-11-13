import { DataSource } from 'typeorm';

import { buildDataSourceOptions } from '../src/database/data-source-options.js';
import { migrations } from '../src/database/migrations/index.js';
import { createTestSchema, type TestSchema } from './support/test-database.js';

describe('database migrations (e2e)', () => {
  let database: TestSchema;
  let dataSource: DataSource;

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
    expect(await tables()).toEqual(['migrations', 'waitlist_entries']);
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

  it('reverts every migration cleanly and can re-apply them', async () => {
    for (const _migration of migrations) {
      await dataSource.undoLastMigration();
    }
    expect(await tables()).toEqual(['migrations']);

    expect(await dataSource.runMigrations()).toHaveLength(migrations.length);
    expect(await tables()).toEqual(['migrations', 'waitlist_entries']);
  });
});
