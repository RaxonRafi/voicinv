import { create } from 'zustand';

import { type AppLifecycleState } from '@/core/platform';

import { authenticateWithBiometrics } from './service';

// App lock state, shared by the lock overlay and the security settings (one source of truth,
// so turning the lock on or off takes effect at once).
//
// Rules:
// - The app locks when it goes to the background, never when it comes back. The system
//   unlock prompt (and especially the device PIN screen) itself sends the app to the
//   background and back; locking on return would re-lock right after every unlock.
// - While a system prompt is open, app state changes are ignored for the same reason.
// - Until the setting is read the app counts as locked, so records never flash on screen.

export interface LockState {
  /** Whether the user turned the lock on. Null until read from the database. */
  enabled: boolean | null;
  locked: boolean;
  /** A system authentication prompt is open. */
  authenticating: boolean;
}

export const INITIAL_LOCK_STATE: LockState = { enabled: null, locked: true, authenticating: false };

export const useLockStore = create<LockState>(() => INITIAL_LOCK_STATE);

/** Applies the stored setting. Called once at start-up: an enabled lock starts locked. */
export function applyLockSetting(enabled: boolean): void {
  useLockStore.setState({ enabled, locked: enabled });
}

/** The user changed the setting in this session; the app stays open either way. */
export function changeLockSetting(enabled: boolean): void {
  useLockStore.setState({ enabled, locked: false });
}

export function handleAppStateChange(next: AppLifecycleState): void {
  const { enabled, authenticating } = useLockStore.getState();
  if (next === 'background' && enabled && !authenticating) useLockStore.setState({ locked: true });
}

export interface AuthPrompt {
  prompt: string;
  fallbackLabel: string;
}

/**
 * Shows the system authentication prompt. Only one prompt at a time; a second call while one
 * is open returns false without showing another.
 */
export async function authenticate(
  { prompt, fallbackLabel }: AuthPrompt,
  run = authenticateWithBiometrics,
): Promise<boolean> {
  if (useLockStore.getState().authenticating) return false;
  useLockStore.setState({ authenticating: true });
  try {
    return await run(prompt, fallbackLabel);
  } finally {
    useLockStore.setState({ authenticating: false });
  }
}

/** Asks the user to authenticate and opens the app when they do. */
export async function unlock(
  prompt: AuthPrompt,
  run = authenticateWithBiometrics,
): Promise<boolean> {
  const success = await authenticate(prompt, run);
  if (success) useLockStore.setState({ locked: false });
  return success;
}
