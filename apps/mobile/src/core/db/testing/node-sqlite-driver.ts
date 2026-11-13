import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { Database } from '../database';
import { type SqlDriver, type SqlRow, type SqlValue } from '../driver';
import { migrate } from '../migrator';
import { MIGRATIONS } from '../migrations';

// Test-only driver backed by Node's built-in SQLite. It lets repositories, use cases and
// migrations run against a real SQL engine in Jest, with no native module and no mocks.

function toSqlValue(value: unknown): SqlValue {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Uint8Array) return value;
  throw new TypeError(`Unexpected SQLite value of type ${typeof value}`);
}

export function createNodeSqliteDriver(path = ':memory:'): SqlDriver {
  const db = new DatabaseSync(path);
  return {
    execute(sql: string, params: readonly SqlValue[] = []): Promise<SqlRow[]> {
      try {
        const statement = db.prepare(sql);
        statement.setReturnArrays(true);
        const input: SQLInputValue[] = [...params];
        const rows: unknown[] = statement.all(...input);
        return Promise.resolve(
          rows.map((row) =>
            Array.isArray(row) ? row.map(toSqlValue) : Object.values(row ?? {}).map(toSqlValue),
          ),
        );
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    close(): Promise<void> {
      db.close();
      return Promise.resolve();
    },
  };
}

/** A migrated in-memory database for tests. */
export async function createTestDatabase(): Promise<Database> {
  const driver = createNodeSqliteDriver();
  await migrate(driver, MIGRATIONS);
  return new Database(driver);
}
