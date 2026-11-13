import { open } from '@op-engineering/op-sqlite';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { Database } from '../database';
import { type SqlDriver, type SqlRow, type SqlValue } from '../driver';
import { migrate } from '../migrator';
import { MIGRATIONS } from '../migrations';

// Device-only code: opens the SQLCipher-encrypted database with op-sqlite. Nothing in this
// file runs in Jest; the same Database class is exercised there through node:sqlite.

export const DATABASE_NAME = 'voiceledger.db';
const KEY_ALIAS = 'voiceledger.db-key.v1';

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The database key: 256 random bits created on first launch and kept in the platform keystore
 * (Android Keystore / iOS Keychain). It never leaves the device and is not included in backups.
 */
export async function getOrCreateDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_ALIAS);
  if (existing) return existing;
  const key = toHex(getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_ALIAS, key, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  return key;
}

function toSqlValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new TypeError(`Unexpected SQLite value of type ${typeof value}`);
}

function createOpSqliteDriver(encryptionKey: string): SqlDriver {
  const connection = open({ name: DATABASE_NAME, encryptionKey });
  return {
    async execute(sql: string, params: readonly SqlValue[] = []): Promise<SqlRow[]> {
      const result = await connection.executeRaw(sql, [...params]);
      return result.rawRows.map((row) => row.map(toSqlValue));
    },
    close(): Promise<void> {
      connection.close();
      return Promise.resolve();
    },
  };
}

/** Opens the encrypted database, applies pending migrations and returns it ready to use. */
export async function openDeviceDatabase(): Promise<Database> {
  const driver = createOpSqliteDriver(await getOrCreateDatabaseKey());
  // WAL keeps reads fast while a write is in progress and survives sudden power loss.
  await driver.execute('PRAGMA journal_mode = WAL');
  await migrate(driver, MIGRATIONS);
  return new Database(driver);
}
