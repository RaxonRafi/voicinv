import {
  isAppendOnlyTable,
  SYNC_TABLE_NAMES,
  type SyncChanges,
  type SyncTableName,
} from '../../shared/index.js';
import { type SyncRecordWrite } from './sync.repository.js';

// Pure decision logic of a sync push (AGENTS.md §8.5): no database, no clock of its own.

/** A synced record as plain JSON. Every table's records carry these common columns. */
export type RecordData = Record<string, unknown> & { id: string; shopId: string };

/** What the server currently stores for a record. */
export interface StoredVersion {
  data: Record<string, unknown>;
  deleted: boolean;
  /** Device that pushed the stored version. */
  deviceId: string;
  serverSeq: number;
}

export type PushRejection =
  | { reason: 'FOREIGN_SHOP'; table: SyncTableName; id: string }
  | { reason: 'APPEND_ONLY'; table: SyncTableName; id?: string }
  | { reason: 'SHOP_DELETE' };

/** A cancelled invoice stays cancelled: its REVERSAL ledger entry can never be taken back. */
function isCancelledInvoice(table: SyncTableName, data: Record<string, unknown>): boolean {
  return table === 'invoices' && data.status === 'CANCELLED';
}

function entries(changes: SyncChanges, table: SyncTableName) {
  const entry = changes[table];
  return {
    created: (entry?.created ?? []) as RecordData[],
    updated: (entry?.updated ?? []) as RecordData[],
    deleted: entry?.deleted ?? [],
  };
}

/**
 * Checks the parts of a push that do not depend on stored data. Returns the first problem,
 * or null when the push may be applied:
 *
 * - every record must belong to the caller's shop (a client-sent `shopId` is never trusted),
 *   and the only shop record a caller may send is its own;
 * - append-only tables accept inserts only;
 * - a shop cannot be deleted through sync.
 */
export function findPushRejection(changes: SyncChanges, shopId: string): PushRejection | null {
  for (const table of SYNC_TABLE_NAMES) {
    const { created, updated, deleted } = entries(changes, table);
    for (const record of [...created, ...updated]) {
      if (record.shopId !== shopId || (table === 'shops' && record.id !== shopId)) {
        return { reason: 'FOREIGN_SHOP', table, id: record.id };
      }
      if (table === 'shops' && record.deletedAt != null) return { reason: 'SHOP_DELETE' };
    }
    if (isAppendOnlyTable(table) && (updated.length > 0 || deleted.length > 0)) {
      return { reason: 'APPEND_ONLY', table };
    }
    if (table === 'shops' && deleted.length > 0) return { reason: 'SHOP_DELETE' };
  }
  return null;
}

/** IDs of every record a push mentions for one table. */
export function mentionedIds(changes: SyncChanges, table: SyncTableName): string[] {
  const { created, updated, deleted } = entries(changes, table);
  return [...new Set([...created, ...updated].map((record) => record.id).concat(deleted))];
}

/** True when two JSON records have the same fields with the same values. */
export function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

export interface TablePlan {
  /** Versions to store, each with its newly assigned sequence number. */
  writes: SyncRecordWrite[];
  /** Records of this table to report back as conflicts. */
  conflicts: { updated: RecordData[]; deleted: string[] };
  /** The last sequence number used. */
  seq: number;
  /** Set when the push must be refused as a whole; nothing in the plan may then be applied. */
  rejection: PushRejection | null;
}

export interface PlanInput {
  table: SyncTableName;
  changes: SyncChanges;
  stored: ReadonlyMap<string, StoredVersion>;
  /** The pushing device and the cursor of its last pull. */
  deviceId: string;
  lastPulledCursor: number;
  /** Last sequence number already used; new versions continue from here. */
  seq: number;
  /** Server time in epoch milliseconds, used to stamp deletes sent as bare IDs. */
  now: number;
}

/**
 * Decides what a push changes in one table.
 *
 * - A record the server has not seen is stored.
 * - A record that is already stored unchanged is skipped, which makes re-pushing a no-op.
 * - Append-only records are never replaced. Re-sending one unchanged is a no-op; sending it
 *   with different content is an update and rejects the push.
 * - A changed mutable record replaces the stored one (last write wins by receive order). If
 *   the stored version came from another device after this device's last pull, the pushed
 *   version is also reported as a conflict, so the client knows it overwrote an unseen change.
 * - Exception: a cancelled invoice is never brought back by a stale active copy. The stored
 *   version wins and is returned as the conflict, so the device adopts it.
 * - A delete sent as a bare ID soft-deletes the stored record.
 */
export function planTable(input: PlanInput): TablePlan {
  const { table, stored, deviceId, lastPulledCursor, now } = input;
  const { created, updated, deleted } = entries(input.changes, table);
  const appendOnly = isAppendOnlyTable(table);
  const plan: TablePlan = {
    writes: [],
    conflicts: { updated: [], deleted: [] },
    seq: input.seq,
    rejection: null,
  };

  const overwritesUnseenChange = (existing: StoredVersion): boolean =>
    existing.serverSeq > lastPulledCursor && existing.deviceId !== deviceId;

  // When a push mentions a record twice, the last mention is the one that counts.
  const incoming = new Map<string, RecordData>();
  for (const record of [...created, ...updated]) incoming.set(record.id, record);

  for (const record of incoming.values()) {
    const existing = stored.get(record.id);
    if (existing && sameRecord(existing.data, record)) continue;
    if (existing && appendOnly) {
      return { ...plan, writes: [], rejection: { reason: 'APPEND_ONLY', table, id: record.id } };
    }
    if (
      existing &&
      isCancelledInvoice(table, existing.data) &&
      !isCancelledInvoice(table, record)
    ) {
      plan.conflicts.updated.push(existing.data as RecordData);
      continue;
    }

    plan.seq += 1;
    plan.writes.push({
      tableName: table,
      id: record.id,
      data: record,
      deleted: !appendOnly && record.deletedAt != null,
      serverSeq: plan.seq,
    });
    if (existing && overwritesUnseenChange(existing)) plan.conflicts.updated.push(record);
  }

  for (const id of new Set(deleted)) {
    const existing = stored.get(id);
    if (incoming.has(id) || !existing || existing.deleted) continue;

    plan.seq += 1;
    plan.writes.push({
      tableName: table,
      id,
      data: { ...existing.data, deletedAt: now, updatedAt: now, deviceId },
      deleted: true,
      serverSeq: plan.seq,
    });
    if (overwritesUnseenChange(existing)) plan.conflicts.deleted.push(id);
  }

  return plan;
}
