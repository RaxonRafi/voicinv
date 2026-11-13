import { Contact, ContactField, requestPermissionsAsync } from 'expo-contacts';

import { cleanName, nameKey } from '@/core/utils';

import { type ContactToImport } from './types';

export type ContactsResult =
  { status: 'denied' } | { status: 'granted'; contacts: ContactToImport[] };

/**
 * Reads names and phone numbers from the phone's address book, after asking for permission.
 * Device-only. The contacts are used to create customers locally and are never uploaded.
 */
export async function readPhoneContacts(): Promise<ContactsResult> {
  const permission = await requestPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };

  const details = await Contact.getAllDetails([ContactField.FULL_NAME, ContactField.PHONES]);
  const seen = new Set<string>();
  const contacts: ContactToImport[] = [];
  for (const detail of details) {
    const name = cleanName(detail.fullName ?? '');
    const key = nameKey(name);
    if (name === '' || seen.has(key)) continue;
    seen.add(key);
    contacts.push({ name, phone: detail.phones[0]?.number });
  }
  contacts.sort((a, b) => a.name.localeCompare(b.name));
  return { status: 'granted', contacts };
}
