/** Device-local sync state kept in the encrypted database (`kv`). */
export const SYNC_SETTINGS = {
  /** Server cursor after the last applied pull or push. */
  cursor: 'sync.cursor',
  /** Epoch ms of the last sync that completed. */
  lastSyncedAt: 'sync.last-synced-at',
  /** The phone number or email of the signed-in account, for display. */
  accountIdentifier: 'account.identifier',
} as const;
