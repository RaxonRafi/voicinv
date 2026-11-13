import { eq } from 'drizzle-orm';

import { type Orm, type Tx } from './database';
import { kv } from './schema';

// Device-local key/value storage inside the encrypted database: device identity, the invoice
// sequence, the sync cursor, cached entitlement and similar small state.

export async function getValue(orm: Orm, key: string): Promise<string | null> {
  const rows = await orm.select({ value: kv.value }).from(kv).where(eq(kv.key, key));
  return rows[0]?.value ?? null;
}

export async function setValue(tx: Tx, key: string, value: string): Promise<void> {
  await tx.orm
    .insert(kv)
    .values({ key, value })
    .onConflictDoUpdate({ target: kv.key, set: { value } });
  tx.touch('kv');
}

export async function deleteValue(tx: Tx, key: string): Promise<void> {
  await tx.orm.delete(kv).where(eq(kv.key, key));
  tx.touch('kv');
}

/** Reads an integer counter; missing or malformed values count as zero. */
export async function getCounter(orm: Orm, key: string): Promise<number> {
  const value = await getValue(orm, key);
  const parsed = value === null ? 0 : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
