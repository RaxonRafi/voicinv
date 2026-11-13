import { type SqlDriver } from './driver';

export interface Migration {
  /** Unique, sortable identifier, e.g. `0002-add-product-barcode`. */
  id: string;
  /** SQL statements, executed in order inside one transaction. */
  statements: readonly string[];
}

/**
 * Brings the database up to date and returns the IDs of the migrations it applied.
 *
 * Each migration runs in its own transaction, so a failure leaves the database exactly at the
 * last successful migration. A database that contains a migration this build does not know
 * (the app was downgraded) is refused rather than opened with a mismatched schema.
 */
export async function migrate(
  driver: SqlDriver,
  migrations: readonly Migration[],
  now: () => number = Date.now,
): Promise<string[]> {
  await driver.execute(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at INTEGER NOT NULL
    )`,
  );
  const rows = await driver.execute('SELECT id FROM schema_migrations ORDER BY id');
  const applied = rows.map((row) => String(row[0]));

  const known = new Set(migrations.map((migration) => migration.id));
  const unknown = applied.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new Error(
      `Database was created by a newer app version (unknown migrations: ${unknown.join(', ')})`,
    );
  }

  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    if (applied.includes(migration.id)) continue;
    await driver.execute('BEGIN IMMEDIATE');
    try {
      for (const statement of migration.statements) await driver.execute(statement);
      await driver.execute('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
        migration.id,
        now(),
      ]);
      await driver.execute('COMMIT');
    } catch (error) {
      await driver.execute('ROLLBACK');
      throw new Error(`Migration ${migration.id} failed`, { cause: error });
    }
    newlyApplied.push(migration.id);
  }
  return newlyApplied;
}
