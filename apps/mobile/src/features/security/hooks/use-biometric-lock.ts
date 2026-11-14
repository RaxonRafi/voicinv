import { useCallback, useEffect, useMemo, useRef } from 'react';

import { getCurrentAppState, onAppStateChange } from '@/core/platform';
import { useServices } from '@/core/services';

import {
  applyLockSetting,
  type AuthPrompt,
  handleAppStateChange,
  unlock as unlockApp,
  useLockStore,
} from '../lock-store';
import { getSecurityLockEnabled } from '../service';

/**
 * App lock for the root layout. Reads the setting once, locks when the app goes to the
 * background, and shows the system prompt by itself once per lock (when the app is in the
 * foreground). If the user dismisses that prompt, the lock screen's button tries again.
 */
export function useBiometricLock(prompt: string, fallbackLabel: string) {
  const services = useServices();
  const enabled = useLockStore((state) => state.enabled);
  const locked = useLockStore((state) => state.locked);
  const authPrompt = useMemo<AuthPrompt>(
    () => ({ prompt, fallbackLabel }),
    [prompt, fallbackLabel],
  );
  /** The current lock already showed its automatic prompt. */
  const prompted = useRef(false);

  useEffect(() => {
    let mounted = true;
    void getSecurityLockEnabled(services.db)
      .then((value) => {
        if (mounted) applyLockSetting(value);
      })
      // If the setting cannot be read, the app opens without the lock rather than shutting
      // the user out of their records with no way to reach the setting.
      .catch(() => {
        if (mounted) applyLockSetting(false);
      });
    return () => {
      mounted = false;
    };
  }, [services.db]);

  const unlock = useCallback(() => unlockApp(authPrompt), [authPrompt]);

  const promptOnce = useCallback(() => {
    if (prompted.current) return;
    prompted.current = true;
    void unlock();
  }, [unlock]);

  useEffect(() => {
    if (!locked) {
      prompted.current = false;
      return;
    }
    if (enabled && getCurrentAppState() === 'active') promptOnce();
  }, [enabled, locked, promptOnce]);

  useEffect(
    () =>
      onAppStateChange((next) => {
        handleAppStateChange(next);
        const state = useLockStore.getState();
        if (next === 'active' && state.enabled && state.locked) promptOnce();
      }),
    [promptOnce],
  );

  return {
    /** The setting has been read; before that the app stays covered. */
    ready: enabled !== null,
    isLocked: enabled !== false && locked,
    isLockEnabled: enabled === true,
    unlock,
  };
}
