// Public API of the local database module.
//
// The device driver (./device/open-device-database) is imported directly by the app bootstrap
// only, so that nothing else pulls native modules into Node tests.
export { type ChangeListener, Database, type Orm, type Tx } from './database';
export { type SqlDriver, type SqlRow, type SqlValue } from './driver';
export { deleteValue, getCounter, getValue, setValue } from './kv';
export { migrate, type Migration } from './migrator';
export { MIGRATIONS } from './migrations';
export { DatabaseProvider, type LiveQueryState, useDatabase, useLiveQuery } from './react';
export {
  changedColumns,
  deletedColumns,
  newAppendOnlyColumns,
  newMutableColumns,
  type WriteContext,
} from './records';
export * from './schema';
