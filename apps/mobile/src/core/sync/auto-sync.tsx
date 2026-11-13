import { useEffect } from 'react';

import { type TableName } from '@/core/db';
import { getCurrentAppState, onAppStateChange } from '@/core/platform';
import { useServices } from '@/core/services';

import { hasLocalChanges } from './engine';
import { loadSyncState, runSync, useSyncStore } from './sync-store';

/** Wait after a local change, so a burst of edits is sent in one push. */
export const CHANGE_DELAY_MS = 5_000;
/** How often to look for other devices' changes while the app is open. */
export const PERIODIC_SYNC_MS = 5 * 60_000;

/** Tables whose changes never need syncing (device-local). */
const LOCAL_ONLY: ReadonlySet<TableName> = new Set(['kv', 'corrections']);

/**
 * Keeps a signed-in device in sync in the background: at startup, when the app comes back to
 * the foreground, shortly after local changes, and every few minutes while it is open. Does
 * nothing for users without an account, and never blocks the interface.
 */
export function AutoSync(): null {
  const services = useServices();

  useEffect(() => {
    if (!services.api.configured) {
      useSyncStore.setState({ signedIn: false });
      return undefined;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const schedule = (delay: number, onlyIfChanged = false) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (stopped || !useSyncStore.getState().signedIn) return;
        void (async () => {
          if (onlyIfChanged && !(await hasLocalChanges(services.db))) return;
          await runSync(services);
        })();
      }, delay);
    };

    void loadSyncState(services).then(() => schedule(0));
    const unsubscribeDb = services.db.subscribe((tables) => {
      if ([...tables].some((table) => !LOCAL_ONLY.has(table))) schedule(CHANGE_DELAY_MS, true);
    });
    const unsubscribeApp = onAppStateChange((state) => {
      if (state === 'active') schedule(0);
    });
    const interval = setInterval(() => {
      if (getCurrentAppState() === 'active') schedule(0);
    }, PERIODIC_SYNC_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      unsubscribeDb();
      unsubscribeApp();
    };
  }, [services]);

  return null;
}
