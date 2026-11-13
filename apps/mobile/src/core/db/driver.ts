/** Values SQLite can store and return. */
export type SqlValue = string | number | null | Uint8Array;

/** One result row: column values in the order of the SELECT list. */
export type SqlRow = SqlValue[];

/**
 * The single seam between the app and SQLite. On the device it is backed by op-sqlite with
 * SQLCipher; in tests by Node's built-in SQLite, so repositories and use cases run for real.
 */
export interface SqlDriver {
  /** Runs one statement and returns its rows (empty for statements without a result). */
  execute(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>;
  close(): Promise<void>;
}
