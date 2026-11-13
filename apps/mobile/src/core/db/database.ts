import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

import { type SqlDriver, type SqlRow, type SqlValue } from './driver';
import * as schema from './schema';
import { type TableName } from './schema';

/** Drizzle query builder bound to the local database. */
export type Orm = SqliteRemoteDatabase<typeof schema>;

/** Handed to code running inside a write transaction. */
export interface Tx {
  /** Query builder that runs inside the open transaction. Use this, never `Database.orm`. */
  orm: Orm;
  /** Declares which tables were changed, so screens showing them refresh after the commit. */
  touch(...tables: TableName[]): void;
}

export type ChangeListener = (tables: ReadonlySet<TableName>) => void;

/** Runs asynchronous jobs strictly one after another. */
class Queue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(job: () => Promise<T>): Promise<T> {
    const result = this.tail.then(job);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

function isSqlValue(value: unknown): value is SqlValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Uint8Array
  );
}

function toSqlParams(params: readonly unknown[]): SqlValue[] {
  return params.map((param) => {
    if (typeof param === 'boolean') return param ? 1 : 0;
    if (isSqlValue(param)) return param;
    throw new TypeError(`Unsupported SQL parameter of type ${typeof param}`);
  });
}

/**
 * The local database: one SQLite connection shared by the whole app.
 *
 * SQLite has a single writer and this is a single connection, so all statements are funneled
 * through one queue. A write transaction holds the queue from BEGIN to COMMIT, which makes
 * multi-step writes (invoice + items + ledger entry) atomic and keeps other statements from
 * slipping into the middle of them.
 */
export class Database {
  /** For reads outside a transaction. Each statement waits for running transactions. */
  readonly orm: Orm;

  private readonly txOrm: Orm;
  private readonly queue = new Queue();
  private readonly listeners = new Set<ChangeListener>();

  constructor(private readonly driver: SqlDriver) {
    this.orm = drizzle((sql, params, method) => this.run(sql, params, method, true), { schema });
    this.txOrm = drizzle((sql, params, method) => this.run(sql, params, method, false), { schema });
  }

  private async run(
    sql: string,
    params: readonly unknown[],
    method: 'run' | 'all' | 'values' | 'get',
    queued: boolean,
  ): Promise<{ rows: SqlRow[] }> {
    if (method === 'get') {
      // `.get()` needs a differently shaped result; the app uses `.all()` and takes the first row.
      throw new Error('Use .all() or await the query instead of .get()');
    }
    const execute = () => this.driver.execute(sql, toSqlParams(params));
    return { rows: queued ? await this.queue.run(execute) : await execute() };
  }

  /**
   * Runs `work` inside one transaction. Everything it does through `tx.orm` is committed
   * together or not at all. Listeners are told about touched tables only after the commit.
   */
  write<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.queue.run(async () => {
      const touched = new Set<TableName>();
      const tx: Tx = {
        orm: this.txOrm,
        touch: (...tables) => tables.forEach((table) => touched.add(table)),
      };
      await this.driver.execute('BEGIN IMMEDIATE');
      let result: T;
      try {
        result = await work(tx);
        await this.driver.execute('COMMIT');
      } catch (error) {
        await this.driver.execute('ROLLBACK');
        throw error;
      }
      if (touched.size > 0) this.listeners.forEach((listener) => listener(touched));
      return result;
    });
  }

  /** Runs a raw statement outside the query builder (maintenance, backup, tests). */
  executeRaw(sql: string, params: readonly SqlValue[] = []): Promise<SqlRow[]> {
    return this.queue.run(() => this.driver.execute(sql, params));
  }

  /** Subscribes to committed changes. Returns the unsubscribe function. */
  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Tells listeners that tables changed outside `write` (e.g. after restoring a backup). */
  notify(tables: readonly TableName[]): void {
    const changed = new Set(tables);
    this.listeners.forEach((listener) => listener(changed));
  }

  close(): Promise<void> {
    return this.queue.run(() => this.driver.close());
  }
}
