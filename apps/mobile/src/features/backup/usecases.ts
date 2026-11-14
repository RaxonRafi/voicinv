import { z } from 'zod';

import { type Database, type Orm } from '@/core/db';
import { shareFile, writeCacheBytes } from '@/core/platform';

import {
  decodeUtf8,
  decryptBackup,
  encodeUtf8,
  encryptBackup,
  type EncryptOptions,
} from './crypto';
import { exportDatabaseDump, restoreDatabaseDump } from './repository';
import { BackupError, type BackupPayload, type BackupTableData } from './types';

/** File extension of encrypted backups (the shared `VLBK` container). */
export const BACKUP_FILE_EXTENSION = '.vlbk';
const BACKUP_MIME_TYPE = 'application/octet-stream';

/** Builds the encrypted backup file of the whole local database and writes it to the cache. */
export async function createBackupFile(
  orm: Orm,
  shopId: string,
  deviceId: string,
  password: string,
  now = Date.now(),
  options: EncryptOptions = {},
): Promise<{ bytes: Uint8Array; uri: string }> {
  const dump = await exportDatabaseDump(orm, shopId, deviceId, now);
  const bytes = await encryptBackup(encodeUtf8(JSON.stringify(dump)), password, options);
  const uri = await writeCacheBytes(`voiceledger-${now}${BACKUP_FILE_EXTENSION}`, bytes);
  return { bytes, uri };
}

/** Creates an encrypted backup and opens the share sheet so the user can keep it somewhere safe. */
export async function exportAndShareBackup(
  orm: Orm,
  shopId: string,
  deviceId: string,
  password: string,
  title: string,
  now = Date.now(),
): Promise<string> {
  const { uri } = await createBackupFile(orm, shopId, deviceId, password, now);
  await shareFile(uri, BACKUP_MIME_TYPE, title);
  return uri;
}

const TABLE_NAMES = [
  'shops',
  'customers',
  'customerAliases',
  'products',
  'productAliases',
  'invoices',
  'invoiceItems',
  'invoiceRevisions',
  'payments',
  'ledgerEntries',
  'corrections',
] as const satisfies readonly (keyof BackupTableData)[];

const rowsSchema = z.array(z.looseObject({ id: z.unknown() }));

const payloadSchema = z.strictObject({
  version: z.literal(1),
  exportedAt: z.int().min(0),
  shopId: z.uuid(),
  deviceId: z.uuid(),
  tables: z.strictObject(
    Object.fromEntries(TABLE_NAMES.map((name) => [name, rowsSchema])) as Record<
      (typeof TABLE_NAMES)[number],
      typeof rowsSchema
    >,
  ),
});

/**
 * Checks the decrypted content before anything is replaced. A backup holds exactly one shop,
 * and every record that names a shop names that one; anything else is refused.
 */
export function parseBackupPayload(json: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupError('NOT_A_BACKUP');
  }
  const result = payloadSchema.safeParse(raw);
  if (!result.success) throw new BackupError('NOT_A_BACKUP');
  const { shopId, tables } = result.data;

  const [shop, ...otherShops] = tables.shops;
  if (!shop || otherShops.length > 0 || shop.id !== shopId) throw new BackupError('NOT_A_BACKUP');
  for (const name of TABLE_NAMES) {
    for (const row of tables[name]) {
      if ('shopId' in row && row.shopId !== shopId) throw new BackupError('NOT_A_BACKUP');
    }
  }
  // The rows have the shape of the local tables; the database rejects any that do not.
  return result.data as unknown as BackupPayload;
}

/**
 * Replaces every local record with the content of an encrypted backup file, in one
 * transaction: if anything fails, nothing is changed.
 */
export async function restoreFromBackupFile(
  db: Database,
  file: Uint8Array,
  password: string,
): Promise<BackupPayload> {
  const payload = parseBackupPayload(decodeUtf8(await decryptBackup(file, password)));
  await db.write(async (tx) => {
    await restoreDatabaseDump(tx, payload);
  });
  return payload;
}
