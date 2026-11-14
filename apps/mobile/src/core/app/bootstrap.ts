import { getRandomBytes } from 'expo-crypto';
import { getLocales } from 'expo-localization';

import { ApiClient, configuredBaseUrl } from '@/core/api';
import { secureSessionStore } from '@/core/api/secure-session-store';
import { getValue } from '@/core/db';
import { openDeviceDatabase } from '@/core/db/device/open-device-database';
import { initI18n, resolveLanguage } from '@/core/i18n';
import { downloadBytes } from '@/core/platform';
import { type AppServices, loadOrCreateDevice, SETTINGS } from '@/core/services';
import { applyAppearance, isAppearance } from '@/core/theme';
import { createUuidV7Generator } from '@/shared';

/**
 * Starts the app: language, encrypted database (with migrations), device identity, appearance.
 * Everything here works offline; nothing in startup touches the network (AGENTS.md §1).
 */
export async function bootstrap(): Promise<AppServices> {
  const deviceLanguages = getLocales().map((locale) => locale.languageCode);
  // Translations first, so that even a startup failure can be explained in the user's language.
  await initI18n(resolveLanguage(null, deviceLanguages));

  const db = await openDeviceDatabase();
  const newId = createUuidV7Generator({ randomBytes: getRandomBytes });
  const device = await loadOrCreateDevice(db, newId);

  const savedLanguage = await getValue(db.orm, SETTINGS.language);
  await initI18n(resolveLanguage(savedLanguage, deviceLanguages));

  // Light, dark or follow the phone (the default until the user chooses).
  const savedAppearance = await getValue(db.orm, SETTINGS.appearance);
  if (isAppearance(savedAppearance)) applyAppearance(savedAppearance);

  // Created now, used only once the user signs in to the optional account.
  const api = new ApiClient({
    baseUrl: configuredBaseUrl(process.env.EXPO_PUBLIC_API_URL),
    sessions: secureSessionStore,
    downloadBytes,
  });

  return { db, now: Date.now, newId, device, api };
}
