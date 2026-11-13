import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';

import { type Session, type SessionStore } from './client';

// The account session lives in the platform keystore (Android Keystore / iOS Keychain), next to
// the database key, never in the database or plain storage (AGENTS.md §4, expo-secure-store).

const KEY = 'voiceledger.session.v1';

const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessExpiresAt: z.int(),
});

export const secureSessionStore: SessionStore = {
  async load(): Promise<Session | null> {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return null;
    try {
      const parsed = sessionSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  async save(session: Session): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY);
  },
};
