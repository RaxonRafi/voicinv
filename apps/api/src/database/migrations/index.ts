import { CreateWaitlistEntries1794355200000 } from './1794355200000-create-waitlist-entries.js';
import { CreateCoreTables1794355300000 } from './1794355300000-create-core-tables.js';
import { CreateSyncAndBackups1794355400000 } from './1794355400000-create-sync-and-backups.js';

/**
 * Every migration, oldest first. Listed explicitly (no file globs) so the same list works in
 * the compiled app, the migration CLI and the tests. Add new migrations to the end.
 */
export const migrations = [
  CreateWaitlistEntries1794355200000,
  CreateCoreTables1794355300000,
  CreateSyncAndBackups1794355400000,
];
