import { z } from 'zod';

import { type RunExclusive, type Session, type SessionStore } from './client';

// Browser pieces of the API client: where the session lives and how tabs take turns.
//
// Only the session tokens and a few device-local settings are kept in the browser's storage.
// The shop's records never are: they stay in memory and come from the server on every visit.

/** The slice of `localStorage` the web app uses, so tests can pass an in-memory stand-in. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Storage that forgets everything on reload; used when the browser blocks `localStorage`. */
export function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

/** `localStorage` when the browser allows it (private modes may not), otherwise memory. */
export function browserStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    const probe = 'vl.probe';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return memoryStorage();
  }
}

export const SESSION_KEY = 'vl.session';

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessExpiresAt: z.number(),
});

export function storedSessions(storage: KeyValueStorage): SessionStore {
  return {
    load(): Session | null {
      const raw = storage.getItem(SESSION_KEY);
      if (raw === null) return null;
      try {
        const parsed = sessionSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    save: (session) => storage.setItem(SESSION_KEY, JSON.stringify(session)),
    clear: () => storage.removeItem(SESSION_KEY),
  };
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Cross-tab mutual exclusion through the Web Locks API; a plain call where it is missing. */
export const exclusiveAcrossTabs: RunExclusive = (work) => {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  return locks ? locks.request('vl.session.refresh', work) : work();
};
