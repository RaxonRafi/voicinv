import { getRandomBytes } from 'expo-crypto';
import { getLocales } from 'expo-localization';

import { getValue } from '@/core/db';
import { openDeviceDatabase } from '@/core/db/device/open-device-database';
import { initI18n, resolveLanguage } from '@/core/i18n';
import { type AppServices, loadOrCreateDevice, SETTINGS } from '@/core/services';
import { createUuidV7Generator } from '@/shared';

/**
 * Starts the app: language, encrypted database (with migrations) and device identity.
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

  return { db, now: Date.now, newId, device };
}
