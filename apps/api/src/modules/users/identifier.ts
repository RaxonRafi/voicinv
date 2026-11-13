/** An account identifier, split into the column it is stored in. */
export interface Identifier {
  kind: 'email' | 'phone';
  value: string;
}

const PHONE = /^\+?[0-9]{7,15}$/;
// Deliberately simple: one "@", no spaces, a dot in the domain. DTOs validate more strictly.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalizes what the user typed into a canonical identifier, or returns null when it is
 * neither a phone number nor an email address. Emails are lowercased; phone numbers lose
 * spaces, dashes, dots and brackets. Pure, so sign-up and sign-in always agree.
 */
export function parseIdentifier(raw: string): Identifier | null {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    const email = trimmed.toLowerCase();
    return EMAIL.test(email) && email.length <= 254 ? { kind: 'email', value: email } : null;
  }
  const phone = trimmed.replace(/[\s\-().]/g, '');
  return PHONE.test(phone) ? { kind: 'phone', value: phone } : null;
}
