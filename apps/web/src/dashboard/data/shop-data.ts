import {
  isAppendOnlyTable,
  SYNC_TABLE_NAMES,
  type SyncChanges,
  type SyncRecord,
  type SyncTableName,
} from '@/domain';

// The shop's records as the web app holds them: in memory only, exactly as the server sent
// them. Nothing is written to browser storage, so signing out (or closing the tab) leaves no
// business data behind. The server stays the source of truth for the web (AGENTS.md M12b).

export type TableMap<T extends SyncTableName> = ReadonlyMap<string, SyncRecord<T>>;

/** Every synced table, keyed by record ID. Treated as immutable: changes produce a new value. */
export type ShopData = { readonly [T in SyncTableName]: TableMap<T> };

interface AnyRecord {
  id: string;
  shopId: string;
}

export function emptyShopData(): ShopData {
  const tables = Object.fromEntries(SYNC_TABLE_NAMES.map((name) => [name, new Map()]));
  return tables as unknown as ShopData;
}

/**
 * Stores a change set (a pull page, or a push that the server accepted). Records of another
 * shop are ignored. Append-only records are only ever added; mutable records are replaced by
 * the incoming version, including soft-deleted ones (they carry `deletedAt`).
 */
export function applyChanges(data: ShopData, changes: SyncChanges, shopId: string): ShopData {
  let next: Record<string, ReadonlyMap<string, AnyRecord>> | null = null;
  for (const table of SYNC_TABLE_NAMES) {
    const entry = changes[table];
    if (!entry) continue;
    const records = ([...entry.created, ...entry.updated] as AnyRecord[]).filter(
      (record) => record.shopId === shopId,
    );
    if (records.length === 0) continue;

    const appendOnly = isAppendOnlyTable(table);
    const map = new Map<string, AnyRecord>(data[table] as ReadonlyMap<string, AnyRecord>);
    for (const record of records) {
      if (appendOnly && map.has(record.id)) continue;
      map.set(record.id, record);
    }
    next ??= { ...data };
    next[table] = map;
  }
  return next === null ? data : (next as unknown as ShopData);
}

/** Collects records into the `{ created, updated }` shape a sync push expects. */
export class ChangeSet {
  private readonly entries = new Map<SyncTableName, AnyRecord[]>();

  /** Adds a new or changed record. The last version put for an ID is the one that counts. */
  put<T extends SyncTableName>(table: T, record: SyncRecord<T>): this {
    const list = this.entries.get(table) ?? [];
    const index = list.findIndex((existing) => existing.id === record.id);
    if (index >= 0) list[index] = record;
    else list.push(record);
    this.entries.set(table, list);
    return this;
  }

  get size(): number {
    let count = 0;
    for (const list of this.entries.values()) count += list.length;
    return count;
  }

  /**
   * Append-only records may only be sent as new; mutable ones (soft deletes included) as
   * updates. The server treats both as "store this version".
   */
  build(): SyncChanges {
    const changes: Record<string, { created: AnyRecord[]; updated: AnyRecord[]; deleted: [] }> = {};
    for (const table of SYNC_TABLE_NAMES) {
      const list = this.entries.get(table);
      if (!list || list.length === 0) continue;
      changes[table] = isAppendOnlyTable(table)
        ? { created: list, updated: [], deleted: [] }
        : { created: [], updated: list, deleted: [] };
    }
    return changes as SyncChanges;
  }
}

/** What a use case needs to create records: identity of the shop and device, a clock, IDs. */
export interface WriteContext {
  shopId: string;
  deviceId: string;
  /** Current time in epoch milliseconds. */
  now: () => number;
  /** New UUIDv7. */
  newId: () => string;
}

export function newMutableColumns(ctx: WriteContext) {
  const timestamp = ctx.now();
  return {
    id: ctx.newId(),
    shopId: ctx.shopId,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    deviceId: ctx.deviceId,
  };
}

export function newAppendOnlyColumns(ctx: WriteContext) {
  return { id: ctx.newId(), shopId: ctx.shopId, createdAt: ctx.now(), deviceId: ctx.deviceId };
}

/** Columns to set whenever a mutable record changes. */
export function changedColumns(ctx: WriteContext) {
  return { updatedAt: ctx.now(), deviceId: ctx.deviceId };
}

/** Columns to set for a soft delete. */
export function deletedColumns(ctx: WriteContext) {
  const timestamp = ctx.now();
  return { deletedAt: timestamp, updatedAt: timestamp, deviceId: ctx.deviceId };
}

/**
 * A business rule was violated (duplicate name, walk-in sale left unpaid, …). `code` is stable
 * and is what screens translate; `field` names the form field at fault, when there is one.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly field?: string,
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
