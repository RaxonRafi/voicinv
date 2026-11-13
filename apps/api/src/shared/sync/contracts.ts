import { z } from 'zod';

import { idSchema } from '../schemas/common.js';
import {
  customerAliasSchema,
  customerSchema,
  invoiceItemSchema,
  invoiceRevisionSchema,
  invoiceSchema,
  ledgerEntrySchema,
  paymentSchema,
  productAliasSchema,
  productSchema,
  shopSchema,
} from '../schemas/entities.js';

// Sync contracts used by both the mobile sync engine and the API (AGENTS.md §8.5).

/**
 * Every synced table, in dependency order (parents before children), with its record schema.
 *
 * - `mutable`: last write wins by server receive order; deletes are soft (`deletedAt`).
 * - `appendOnly`: the server accepts inserts only; updates and deletes are rejected.
 */
export const SYNC_TABLES = {
  shops: { mode: 'mutable', schema: shopSchema },
  customers: { mode: 'mutable', schema: customerSchema },
  customerAliases: { mode: 'mutable', schema: customerAliasSchema },
  products: { mode: 'mutable', schema: productSchema },
  productAliases: { mode: 'mutable', schema: productAliasSchema },
  invoices: { mode: 'mutable', schema: invoiceSchema },
  invoiceItems: { mode: 'mutable', schema: invoiceItemSchema },
  payments: { mode: 'appendOnly', schema: paymentSchema },
  ledgerEntries: { mode: 'appendOnly', schema: ledgerEntrySchema },
  invoiceRevisions: { mode: 'appendOnly', schema: invoiceRevisionSchema },
} as const;

export type SyncTableName = keyof typeof SYNC_TABLES;
export type SyncMode = 'mutable' | 'appendOnly';

export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES) as SyncTableName[];

export type SyncRecord<T extends SyncTableName = SyncTableName> = z.infer<
  (typeof SYNC_TABLES)[T]['schema']
>;

export function isAppendOnlyTable(table: SyncTableName): boolean {
  return SYNC_TABLES[table].mode === 'appendOnly';
}

function tableChanges<T extends z.ZodType>(schema: T) {
  return z.strictObject({
    created: z.array(schema).default([]),
    updated: z.array(schema).default([]),
    /** IDs of soft-deleted records. Always empty for append-only tables. */
    deleted: z.array(idSchema).default([]),
  });
}

/** Changes grouped by table: `{ created, updated, deleted }`. Tables without changes are omitted. */
export const syncChangesSchema = z.strictObject({
  shops: tableChanges(shopSchema).optional(),
  customers: tableChanges(customerSchema).optional(),
  customerAliases: tableChanges(customerAliasSchema).optional(),
  products: tableChanges(productSchema).optional(),
  productAliases: tableChanges(productAliasSchema).optional(),
  invoices: tableChanges(invoiceSchema).optional(),
  invoiceItems: tableChanges(invoiceItemSchema).optional(),
  payments: tableChanges(paymentSchema).optional(),
  ledgerEntries: tableChanges(ledgerEntrySchema).optional(),
  invoiceRevisions: tableChanges(invoiceRevisionSchema).optional(),
});
export type SyncChanges = z.infer<typeof syncChangesSchema>;

/**
 * Sync position. Assigned by the server (never a client clock) and opaque to the client; sent
 * as a decimal string because it is a 64-bit sequence number.
 */
export const syncCursorSchema = z.string().regex(/^\d{1,19}$/);
export const INITIAL_SYNC_CURSOR = '0';

/** Records returned per pull page; the client keeps pulling while `hasMore` is true. */
export const SYNC_PULL_PAGE_SIZE = 500;
/** Records accepted in a single push. */
export const SYNC_PUSH_MAX_RECORDS = 1000;

export const syncPullQuerySchema = z.strictObject({ cursor: syncCursorSchema });
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

export const syncPullResponseSchema = z.strictObject({
  changes: syncChangesSchema,
  cursor: syncCursorSchema,
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

export const syncPushRequestSchema = z.strictObject({
  /** The registered device sending the changes. */
  deviceId: idSchema,
  /** Cursor of the device's last successful pull; used to report overwritten remote changes. */
  lastPulledCursor: syncCursorSchema,
  changes: syncChangesSchema,
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncPushResponseSchema = z.strictObject({
  /** Records that changed server state. Re-pushing the same records yields 0. */
  applied: z.int().min(0),
  /**
   * Winning versions of mutable records whose stored version was written by another device
   * after this device's last pull. The pushed version wins (last write wins by receive order)
   * and is echoed back here so the client knows it replaced a change it had not seen.
   */
  conflicts: syncChangesSchema,
  cursor: syncCursorSchema,
});
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

/** Number of records in a change set, across all tables. */
export function countSyncRecords(changes: SyncChanges): number {
  let count = 0;
  for (const table of SYNC_TABLE_NAMES) {
    const entry = changes[table];
    if (entry) count += entry.created.length + entry.updated.length + entry.deleted.length;
  }
  return count;
}
