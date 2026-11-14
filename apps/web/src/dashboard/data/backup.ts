import { z } from 'zod';

import {
  BACKUP_HEADER_LENGTH,
  BACKUP_KDF_ITERATIONS,
  BACKUP_NONCE_LENGTH,
  BACKUP_SALT_LENGTH,
  BACKUP_TAG_LENGTH,
  decodeBackupHeader,
  encodeBackupHeader,
  SYNC_TABLE_NAMES,
  SYNC_TABLES,
  type SyncChanges,
} from '@/domain';

import { ChangeSet, type ShopData } from './shop-data';

// Encrypted backup files (AGENTS.md §1 rule 9), in the same `VLBK` container and JSON payload
// as the phone app, so a file made here restores on a phone and the other way round. The key
// comes from the backup password (PBKDF2-SHA-256); encryption is AES-256-GCM with the header
// as additional data. Everything happens in the browser with WebCrypto.

/** Shortest backup password accepted. */
export const BACKUP_PASSWORD_MIN_LENGTH = 8;
export const BACKUP_FILE_EXTENSION = '.vlbk';

export type BackupErrorCode =
  'NOT_A_BACKUP' | 'WRONG_PASSWORD' | 'PASSWORD_TOO_SHORT' | 'OTHER_SHOP';

export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(`Backup error: ${code}`);
    this.name = 'BackupError';
  }
}

/** Tables a backup holds. `corrections` is device-local voice learning; the web keeps none. */
const BACKUP_TABLES = [...SYNC_TABLE_NAMES, 'corrections'] as const;

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptOptions {
  /** Defaults to the current recommendation. Lower values exist for fast tests only. */
  iterations?: number;
}

export async function encryptBackup(
  plaintext: Uint8Array,
  password: string,
  { iterations = BACKUP_KDF_ITERATIONS }: EncryptOptions = {},
): Promise<Uint8Array> {
  if (password.length < BACKUP_PASSWORD_MIN_LENGTH) throw new BackupError('PASSWORD_TOO_SHORT');
  const salt = crypto.getRandomValues(new Uint8Array(BACKUP_SALT_LENGTH));
  const nonce = crypto.getRandomValues(new Uint8Array(BACKUP_NONCE_LENGTH));
  const header = encodeBackupHeader({ iterations, salt, nonce });
  const key = await deriveKey(password, salt, iterations);
  // WebCrypto appends the tag to the ciphertext: exactly the container's body layout.
  const body = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: new Uint8Array(header),
        tagLength: BACKUP_TAG_LENGTH * 8,
      },
      key,
      new Uint8Array(plaintext),
    ),
  );
  const file = new Uint8Array(header.length + body.length);
  file.set(header);
  file.set(body, header.length);
  return file;
}

/** Opens a container. A wrong password and an altered file look the same, by design. */
export async function decryptBackup(file: Uint8Array, password: string): Promise<Uint8Array> {
  const header = decodeBackupHeader(file);
  if (!header) throw new BackupError('NOT_A_BACKUP');
  const key = await deriveKey(password, header.salt, header.iterations);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(header.nonce),
          additionalData: new Uint8Array(file.subarray(0, BACKUP_HEADER_LENGTH)),
          tagLength: BACKUP_TAG_LENGTH * 8,
        },
        key,
        new Uint8Array(file.subarray(BACKUP_HEADER_LENGTH)),
      ),
    );
  } catch {
    throw new BackupError('WRONG_PASSWORD');
  }
}

/** The JSON inside a backup: every record of one shop, in the phone app's table layout. */
export function backupPayload(data: ShopData, shopId: string, deviceId: string, now: number) {
  const tables: Record<string, unknown[]> = { corrections: [] };
  for (const table of SYNC_TABLE_NAMES) tables[table] = [...data[table].values()];
  return { version: 1 as const, exportedAt: now, shopId, deviceId, tables };
}

export async function createBackupFile(
  data: ShopData,
  shopId: string,
  deviceId: string,
  password: string,
  now: number,
  options?: EncryptOptions,
): Promise<Uint8Array> {
  const json = JSON.stringify(backupPayload(data, shopId, deviceId, now));
  return encryptBackup(new TextEncoder().encode(json), password, options);
}

const rowsSchema = z.array(z.looseObject({ id: z.string() }));
const payloadSchema = z.object({
  version: z.literal(1),
  exportedAt: z.int().min(0),
  shopId: z.uuid(),
  deviceId: z.uuid(),
  tables: z.object(
    Object.fromEntries(BACKUP_TABLES.map((name) => [name, rowsSchema])) as Record<
      (typeof BACKUP_TABLES)[number],
      typeof rowsSchema
    >,
  ),
});

/**
 * What restoring a backup adds to the account: records of the file that the server does not
 * have yet. Nothing that exists is changed or removed, so restoring can never undo work done
 * since the backup was made. Rows the sync contract does not accept are skipped.
 */
export function restoreChanges(data: ShopData, shopId: string, decrypted: Uint8Array): SyncChanges {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decrypted));
  } catch {
    throw new BackupError('NOT_A_BACKUP');
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) throw new BackupError('NOT_A_BACKUP');
  if (parsed.data.shopId !== shopId) throw new BackupError('OTHER_SHOP');

  const changes = new ChangeSet();
  for (const table of SYNC_TABLE_NAMES) {
    const existing = data[table] as ReadonlyMap<string, unknown>;
    for (const row of parsed.data.tables[table]) {
      if (existing.has(row.id)) continue;
      // The phone stores a local `isDirty` flag next to each record; it is not synced.
      const { isDirty: _isDirty, ...record } = row;
      const valid = SYNC_TABLES[table].schema.safeParse(record);
      if (!valid.success || valid.data.shopId !== shopId) continue;
      changes.put(table, valid.data as never);
    }
  }
  return changes.build();
}
