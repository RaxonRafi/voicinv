import { type Session, type SessionStore } from './client';

/** A session store held in memory: for tests, and for builds without a keystore. */
export function memorySessionStore(initial: Session | null = null): SessionStore {
  let session = initial;
  return {
    load: () => Promise.resolve(session),
    save: (next) => {
      session = next;
      return Promise.resolve();
    },
    clear: () => {
      session = null;
      return Promise.resolve();
    },
  };
}
