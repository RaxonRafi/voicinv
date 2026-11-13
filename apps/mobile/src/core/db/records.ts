import { type Database } from './database';

/**
 * Everything a use case needs to write records: the database, a clock, an ID generator and the
 * identity of the shop and device the records belong to. Passed in explicitly so use cases stay
 * platform-free and tests can control time and IDs.
 */
export interface WriteContext {
  db: Database;
  /** Current time in epoch milliseconds. */
  now: () => number;
  /** New UUIDv7. */
  newId: () => string;
  shopId: string;
  deviceId: string;
}

/** Common columns of a new mutable record. */
export function newMutableColumns(ctx: WriteContext) {
  const timestamp = ctx.now();
  return {
    id: ctx.newId(),
    shopId: ctx.shopId,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    deviceId: ctx.deviceId,
    isDirty: true,
  };
}

/** Common columns of a new append-only record. */
export function newAppendOnlyColumns(ctx: WriteContext) {
  return {
    id: ctx.newId(),
    shopId: ctx.shopId,
    createdAt: ctx.now(),
    deviceId: ctx.deviceId,
    isDirty: true,
  };
}

/** Columns to set whenever a mutable record changes, so the change is picked up by sync. */
export function changedColumns(ctx: WriteContext) {
  return { updatedAt: ctx.now(), deviceId: ctx.deviceId, isDirty: true };
}

/** Columns to set for a soft delete. */
export function deletedColumns(ctx: WriteContext) {
  const timestamp = ctx.now();
  return { deletedAt: timestamp, updatedAt: timestamp, deviceId: ctx.deviceId, isDirty: true };
}
