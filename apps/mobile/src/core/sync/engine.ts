import { and, eq, inArray } from 'drizzle-orm';

import { type ApiClient } from '@/core/api';
import { customers, type Database, getValue, payments, setValue, TABLES, type Tx } from '@/core/db';
import {
  INITIAL_SYNC_CURSOR,
  isAppendOnlyTable,
  SYNC_PUSH_MAX_RECORDS,
  SYNC_TABLE_NAMES,
  SYNC_TABLES,
  type SyncChanges,
  syncPullResponseSchema,
  syncPushResponseSchema,
  type SyncTableName,
} from '@/shared';

import { SYNC_SETTINGS } from './settings';

// The sync engine (AGENTS.md §8.5). Runs only when the user has an account; the app never waits
// for it. One run = push every dirty local row, then pull every change since the cursor.
//
// - Push before pull, so local edits reach the server before remote ones are applied.
// - A pushed row is marked clean only if it did not change while the push was in flight.
// - A pull never overwrites a row with unpushed local edits: that edit is pushed next and,
//   being the later write the server receives, wins there too (last write wins).
// - Append-only rows (payments, ledger entries, revisions) are only ever inserted.
// - A row that fails the shared schema stays dirty and is reported, instead of blocking every
//   other record behind it.

export interface SyncDeps {
  db: Database;
  api: ApiClient;
  shopId: string;
  deviceId: string;
}

export interface SyncResult {
  /** Records the server stored from this device. */
  pushed: number;
  /** Records received from other devices (or the web) and applied here. */
  pulled: number;
  /** Local records that do not pass the shared schema and so cannot be sent. */
  invalid: number;
}

/** Guards against a server that keeps saying `hasMore`. */
const MAX_PULL_PAGES = 1000;

type LocalRow = Record<string, unknown> & { id: string };

// Drizzle cannot type a query over "one of ten tables", so each table is viewed through one
// representative of its kind. The columns used here (`id`, `isDirty`, `updatedAt` for mutable
// tables) exist on every table of that kind; the record values are validated separately.
const mutableTable = (name: SyncTableName) => TABLES[name] as unknown as typeof customers;
const appendOnlyTable = (name: SyncTableName) => TABLES[name] as unknown as typeof payments;

interface DirtyRecord {
  table: SyncTableName;
  record: LocalRow;
  /** `updatedAt` of the pushed version (mutable tables), to detect edits during the push. */
  updatedAt: number | null;
}

function withoutLocalColumns(row: LocalRow): LocalRow {
  const { isDirty: _isDirty, ...record } = row;
  return record as LocalRow;
}

/** Every dirty row that passes its shared schema, and the number that do not. */
export async function collectDirty(
  db: Database,
): Promise<{ records: DirtyRecord[]; invalid: number }> {
  const records: DirtyRecord[] = [];
  let invalid = 0;
  for (const table of SYNC_TABLE_NAMES) {
    const local = mutableTable(table);
    const rows = (await db.orm.select().from(local).where(eq(local.isDirty, true))) as LocalRow[];
    for (const row of rows) {
      const parsed = SYNC_TABLES[table].schema.safeParse(withoutLocalColumns(row));
      if (!parsed.success) {
        invalid += 1;
        continue;
      }
      const record = parsed.data as LocalRow;
      records.push({
        table,
        record,
        updatedAt: isAppendOnlyTable(table) ? null : Number(row.updatedAt),
      });
    }
  }
  return { records, invalid };
}

function toChanges(batch: readonly DirtyRecord[]): SyncChanges {
  const changes: Record<string, { created: LocalRow[]; updated: LocalRow[]; deleted: string[] }> =
    {};
  for (const { table, record } of batch) {
    const entry = (changes[table] ??= { created: [], updated: [], deleted: [] });
    // Append-only records may only be sent as new; mutable ones (including soft deletes,
    // which carry `deletedAt`) as updates. The server treats both as "store this version".
    (isAppendOnlyTable(table) ? entry.created : entry.updated).push(record);
  }
  return changes as SyncChanges;
}

async function markClean(tx: Tx, batch: readonly DirtyRecord[]): Promise<void> {
  for (const { table, record, updatedAt } of batch) {
    if (updatedAt === null) {
      const local = appendOnlyTable(table);
      await tx.orm.update(local).set({ isDirty: false }).where(eq(local.id, record.id));
    } else {
      const local = mutableTable(table);
      await tx.orm
        .update(local)
        .set({ isDirty: false })
        .where(and(eq(local.id, record.id), eq(local.updatedAt, updatedAt)));
    }
  }
}

/**
 * Stores records received from the server. Returns how many were applied. Records of another
 * shop are ignored; rows with unpushed local edits are left alone.
 */
export async function applyRemoteChanges(
  tx: Tx,
  changes: SyncChanges,
  shopId: string,
): Promise<number> {
  let applied = 0;
  for (const table of SYNC_TABLE_NAMES) {
    const entry = changes[table];
    if (!entry) continue;
    const records = [...entry.created, ...entry.updated].filter(
      (record) => record.shopId === shopId,
    ) as LocalRow[];
    if (records.length === 0) continue;

    if (isAppendOnlyTable(table)) {
      const local = appendOnlyTable(table);
      for (const record of records) {
        const row = { ...record, isDirty: false } as typeof local.$inferInsert;
        await tx.orm.insert(local).values(row).onConflictDoNothing();
      }
    } else {
      const local = mutableTable(table);
      const ids = records.map((record) => record.id);
      const dirty = new Set(
        (
          await tx.orm
            .select({ id: local.id })
            .from(local)
            .where(and(inArray(local.id, ids), eq(local.isDirty, true)))
        ).map((row) => row.id),
      );
      for (const record of records) {
        if (dirty.has(record.id)) continue;
        const row = { ...record, isDirty: false } as typeof local.$inferInsert;
        await tx.orm.insert(local).values(row).onConflictDoUpdate({ target: local.id, set: row });
      }
    }
    applied += records.length;
    tx.touch(table);
  }
  return applied;
}

async function readCursor(db: Database): Promise<string> {
  return (await getValue(db.orm, SYNC_SETTINGS.cursor)) ?? INITIAL_SYNC_CURSOR;
}

async function push(deps: SyncDeps): Promise<{ pushed: number; invalid: number }> {
  const { db, api, shopId, deviceId } = deps;
  const { records, invalid } = await collectDirty(db);
  let pushed = 0;
  for (let start = 0; start < records.length; start += SYNC_PUSH_MAX_RECORDS) {
    const batch = records.slice(start, start + SYNC_PUSH_MAX_RECORDS);
    const response = await api.request(syncPushResponseSchema, {
      method: 'POST',
      path: '/sync/push',
      json: { deviceId, lastPulledCursor: await readCursor(db), changes: toChanges(batch) },
    });
    await db.write(async (tx) => {
      await markClean(tx, batch);
      // Winning versions of records this push overwrote, or kept (a cancelled invoice).
      await applyRemoteChanges(tx, response.conflicts, shopId);
      await setValue(tx, SYNC_SETTINGS.cursor, response.cursor);
    });
    pushed += response.applied;
  }
  return { pushed, invalid };
}

async function pull(deps: SyncDeps): Promise<number> {
  const { db, api, shopId } = deps;
  let pulled = 0;
  for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
    const cursor = await readCursor(db);
    const response = await api.request(syncPullResponseSchema, {
      method: 'GET',
      path: '/sync/pull',
      query: { cursor },
    });
    // The page and the cursor that follows it are stored together, or not at all.
    await db.write(async (tx) => {
      pulled += await applyRemoteChanges(tx, response.changes, shopId);
      await setValue(tx, SYNC_SETTINGS.cursor, response.cursor);
    });
    if (!response.hasMore) break;
  }
  return pulled;
}

const running = new WeakMap<Database, Promise<SyncResult>>();

/** Pushes local changes, then pulls remote ones. Concurrent calls share one run. */
export function syncNow(deps: SyncDeps): Promise<SyncResult> {
  const current = running.get(deps.db);
  if (current) return current;
  const run = (async (): Promise<SyncResult> => {
    const { pushed, invalid } = await push(deps);
    const pulled = await pull(deps);
    return { pushed, pulled, invalid };
  })().finally(() => running.delete(deps.db));
  running.set(deps.db, run);
  return run;
}

/** True when there are local changes the server has not received yet. */
export async function hasLocalChanges(db: Database): Promise<boolean> {
  for (const table of SYNC_TABLE_NAMES) {
    const local = mutableTable(table);
    const rows = await db.orm
      .select({ id: local.id })
      .from(local)
      .where(eq(local.isDirty, true))
      .limit(1);
    if (rows.length > 0) return true;
  }
  return false;
}
