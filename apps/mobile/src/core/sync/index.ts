// Public API of the sync engine (AGENTS.md §8.5). Optional: active only with an account.
export { AutoSync, CHANGE_DELAY_MS, PERIODIC_SYNC_MS } from './auto-sync';
export {
  applyRemoteChanges,
  collectDirty,
  hasLocalChanges,
  type SyncDeps,
  syncNow,
  type SyncResult,
} from './engine';
export { SYNC_SETTINGS } from './settings';
export {
  INITIAL_SYNC_STATE,
  loadSyncState,
  runSync,
  type SyncState,
  useSyncStore,
} from './sync-store';
