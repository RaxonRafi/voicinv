import { create } from 'zustand';

import { ApiError, CLIENT_ERROR } from '@/core/api';
import { getValue, setValue } from '@/core/db';
import { type AppServices, findCurrentShop } from '@/core/services';

import { type SyncResult, syncNow } from './engine';
import { SYNC_SETTINGS } from './settings';

export interface SyncState {
  /** Null until known. */
  signedIn: boolean | null;
  /** The account's phone number or email, for display. */
  identifier: string | null;
  status: 'idle' | 'syncing' | 'error';
  /** Epoch ms of the last completed sync. */
  lastSyncedAt: number | null;
  /** Code of the last failure (`NETWORK`, `SIGNED_OUT`, a server code …). */
  errorCode: string | null;
  /** Local records that cannot be sent because they fail validation. */
  invalid: number;
}

export const INITIAL_SYNC_STATE: SyncState = {
  signedIn: null,
  identifier: null,
  status: 'idle',
  lastSyncedAt: null,
  errorCode: null,
  invalid: 0,
};

export const useSyncStore = create<SyncState>(() => INITIAL_SYNC_STATE);

/** Reads the account and last-sync state at startup. */
export async function loadSyncState(services: AppServices): Promise<void> {
  const [signedIn, identifier, lastSyncedAt] = await Promise.all([
    services.api.configured ? services.api.hasSession() : Promise.resolve(false),
    getValue(services.db.orm, SYNC_SETTINGS.accountIdentifier),
    getValue(services.db.orm, SYNC_SETTINGS.lastSyncedAt),
  ]);
  useSyncStore.setState({
    signedIn,
    identifier,
    lastSyncedAt: lastSyncedAt ? Number(lastSyncedAt) : null,
  });
}

/**
 * Runs one sync if the user is signed in, recording the outcome for the interface. Never
 * throws: a failed sync is shown and retried later, it never blocks the user.
 */
export async function runSync(services: AppServices): Promise<SyncResult | null> {
  const { api, db } = services;
  if (!api.configured || !(await api.hasSession())) {
    useSyncStore.setState({ signedIn: false });
    return null;
  }
  const shop = await findCurrentShop(db.orm);
  if (!shop) return null;

  useSyncStore.setState({ status: 'syncing' });
  try {
    const result = await syncNow({
      db,
      api,
      shopId: shop.id,
      deviceId: services.device.deviceId,
    });
    const now = services.now();
    await db.write((tx) => setValue(tx, SYNC_SETTINGS.lastSyncedAt, String(now)));
    useSyncStore.setState({
      signedIn: true,
      status: 'idle',
      lastSyncedAt: now,
      errorCode: null,
      invalid: result.invalid,
    });
    return result;
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'UNKNOWN';
    useSyncStore.setState({
      status: 'error',
      errorCode: code,
      ...(code === CLIENT_ERROR.SIGNED_OUT ? { signedIn: false } : {}),
    });
    return null;
  }
}
